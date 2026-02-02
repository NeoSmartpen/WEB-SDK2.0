import ByteUtil, { GetSectionOwner } from "../Util/ByteUtil";
import { Packet, PacketBuilder } from "./Packet";
import * as Converter from "../Util/Converter";
import * as NLog from "../Util/NLog";
import Dot from "../API/Dot";
import CMD from "./CMD";
import CONST from "./Const";
import * as Res from "../Model/Response";
import PenMessageType, { SettingType, PenTipType, ErrorType, FirmwareStatusType } from "../API/PenMessageType";
import PenController from "./PenController";
import DotFilter from "../Util/DotFilter";
import { VersionInfo, SettingInfo, Paper } from "../Util/type";
import PUIController, { isPUI, isPUIOnPage } from "../API/PUIController";
import { unzipAsync } from "../Util/compression";

type IPenState = {
  first: boolean;
  mPenTipType: number;
  mPenTipColor: number;
  isStartWithDown: boolean;
  mDotCount: number;
  reCheckPassword: boolean;
  newPassword: string | null;
  mPrevDot: any;
  isBeforeMiddle: boolean;
  isStartWithPaperInfo: boolean;
  SessionTs: number;
  EventCount: number;
  isPUI: boolean;
  cmdCheck: boolean;
};

export default class PenClientParserV2 {
  penController: PenController;
  penVersionInfo: VersionInfo;
  penSettingInfo: SettingInfo;
  current: Paper;
  state: IPenState;
  mBuffer: ByteUtil;
  IsEscape: boolean;
  offline: any;
  IsUploading: boolean;

  constructor(penController: PenController) {
    this.penController = penController;

    this.penVersionInfo = {} as VersionInfo; // ref) Response.VersionInfo
    this.penSettingInfo = {} as SettingInfo; // ref) Response.SettingInfo

    this.current = {
      section: -1,
      owner: -1,
      note: -1,
      page: -1,
      Time: -1,
      TimeDiff: 0,
    };

    this.state = {
      first: true,
      mPenTipType: 0,
      mPenTipColor: -1,
      isStartWithDown: false,
      mDotCount: -1,
      reCheckPassword: false,
      newPassword: null,
      mPrevDot: null,
      isBeforeMiddle: false,
      isStartWithPaperInfo: false,
      SessionTs: -1,
      EventCount: -1,
      isPUI: false,
      cmdCheck: false,
    };

    this.mBuffer = null;
    this.IsEscape = false;

    this.offline = {
      mTotalOfflineStroke: -1,
      mReceivedOfflineStroke: 0,
      mTotalOfflineDataSize: -1,
    };

    this.IsUploading = true;
  }

  // MARK: ParsePacket
  /**
   * Checks the command byte of the given packet and routes it to the appropriate handler.
   * - Second stage of packet parsing; ProtocolParse must be performed before calling this method.
   * @param {Packet} packet
   * @returns
   */
  ParsePacket(packet: Packet) {
    let cmd = packet.Cmd;
    NLog.log("ParsePacket", cmd, "0x" + cmd.toString(16));
    NLog.log("ParsePacket", packet.Data);

    if (packet.Result > 0) {
      NLog.log("packet result failed", packet);
      return;
    }

    switch (cmd) {
      case CMD.VERSION_RESPONSE:
        let versionInfo = Res.VersionInfo(packet);
        this.penVersionInfo = versionInfo;
        this.penController.info = versionInfo;
        this.IsUploading = false;
        this.state.EventCount = 0;
        NLog.log("ParsePacket Version Info", versionInfo);
        this.penController.onMessage!(this.penController, PenMessageType.PEN_CONNECTION_SUCCESS, null);
        this.ReqPenStatus();
        break;

      case CMD.SHUTDOWN_EVENT:
        let shutdownReason = packet.GetByte();
        NLog.log("ParsePacket power off", shutdownReason);
        this.penController.onMessage!(this.penController, PenMessageType.EVENT_POWER_OFF, {
          shutdownReason,
        });
        break;

      case CMD.LOW_BATTERY_EVENT:
        let battery = packet.GetByte();
        this.penController.onMessage!(this.penController, PenMessageType.EVENT_LOW_BATTERY, {
          Battery: battery,
        });
        break;

      // MARK: CMD Up & Down New
      case CMD.ONLINE_NEW_PEN_DOWN_EVENT:
        this.NewPenDown(packet);
        break;

      case CMD.ONLINE_NEW_PEN_UP_EVENT:
        this.NewPenUp(packet);
        break;

      // MARK: CMD Up & Down Old
      case CMD.ONLINE_PEN_UPDOWN_EVENT:
        this.PenUpDown(packet);
        break;

      // MARK: CMD Dot
      case CMD.ONLINE_PEN_DOT_EVENT:
      case CMD.ONLINE_NEW_PEN_DOT_EVENT:
        this.PenDotEvent(cmd, packet);
        break;

      case CMD.ONLINE_PEN_HOVER_EVENT:
        this.PenHoverEvent(packet);
        break;

      case CMD.ONLINE_PAPER_INFO_EVENT:
      case CMD.ONLINE_NEW_PAPER_INFO_EVENT:
        this.PaperInfoEvent(cmd, packet);
        break;

      case CMD.ONLINE_PEN_ERROR_EVENT:
      case CMD.ONLINE_NEW_PEN_ERROR_EVENT:
        this.PenErrorDot(cmd, packet);
        break;

      case CMD.SETTING_INFO_RESPONSE:
        let settingInfo = Res.SettingInfo(packet);
        this.penSettingInfo = settingInfo;
        NLog.log("ParsePacket SETTING_INFO_RESPONSE", settingInfo, "first Connection?", this.state.first);

        // 최초 연결시
        if (this.state.first) {
          this.state.first = false;
          this.penController.onMessage!(this.penController, PenMessageType.PEN_SETTING_INFO, settingInfo);

          if (settingInfo.Locked) {
            this.penController.onMessage!(this.penController, PenMessageType.PEN_PASSWORD_REQUEST, {
              RetryCount: settingInfo.RetryCount,
              ResetCount: settingInfo.ResetCount,
            });
          } else {
            this.penController.onMessage!(this.penController, PenMessageType.PEN_AUTHORIZED, null);
          }
        } else {
          this.penController.onMessage!(this.penController, PenMessageType.PEN_SETTING_INFO, settingInfo);
        }
        break;

      case CMD.SETTING_CHANGE_RESPONSE:
        let settingChangeResult = Res.SettingChange(packet);
        if (settingChangeResult.result) {
          this.penController.onMessage!(this.penController, PenMessageType.PEN_SETUP_SUCCESS, settingChangeResult);
        } else {
          this.penController.onMessage!(this.penController, PenMessageType.PEN_SETUP_FAILURE, settingChangeResult);
        }
        break;

      // password
      case CMD.PASSWORD_RESPONSE:
        let password = Res.Password(packet);
        NLog.log("ParsePacket PASSWORD_RESPONSE", password);
        if (password.status === 1) {
          if (this.state.reCheckPassword) {
            this.penController.onMessage!(this.penController, PenMessageType.PASSWORD_SETUP_SUCCESS, {
              UsingPassword: true,
            });
            this.state.reCheckPassword = false;
            break;
          }
          this.penController.onMessage!(this.penController, PenMessageType.PEN_AUTHORIZED, null);
        } else {
          if (this.state.reCheckPassword) {
            this.penController.onMessage!(this.penController, PenMessageType.PASSWORD_SETUP_FAILURE, null);
            this.state.reCheckPassword = false;
          } else {
            this.penController.onMessage!(this.penController, PenMessageType.PEN_PASSWORD_REQUEST, password);
          }
        }
        break;
      case CMD.PASSWORD_CHANGE_RESPONSE:
        let passwordChange = Res.PasswordChange(packet);

        if (passwordChange.status === 0) {
          this.state.reCheckPassword = true;
          this.penController.InputPassword(this.state.newPassword);
          if (!this.state.newPassword) {
            //패스워드 사용 안함 설정 성공시
            this.penController.onMessage!(this.penController, PenMessageType.PASSWORD_SETUP_SUCCESS, {
              UsingPassword: false,
            });
          }
        } else {
          this.state.newPassword = "";
          this.penController.onMessage!(this.penController, PenMessageType.PASSWORD_SETUP_FAILURE, passwordChange);
        }
        break;

      // MARK: CMD Offline
      case CMD.OFFLINE_NOTE_LIST_RESPONSE:
        {
          let noteList = Res.NoteList(packet);
          this.penController.onMessage!(this.penController, PenMessageType.OFFLINE_DATA_NOTE_LIST, noteList);
        }
        break;
      case CMD.OFFLINE_PAGE_LIST_RESPONSE:
        {
          let pageList = Res.PageList(packet);
          this.penController.onMessage!(this.penController, PenMessageType.OFFLINE_DATA_PAGE_LIST, pageList);
        }
        break;
      case CMD.OFFLINE_DATA_RESPONSE:
        {
          this.offline.mTotalOfflineStroke = packet.GetInt();
          this.offline.mReceivedOfflineStroke = 0;
          this.offline.mTotalOfflineDataSize = packet.GetInt();

          let offlineInfo = {
            isCompressed: packet.GetByte() === 1,
            stroke: this.offline.mTotalOfflineStroke,
            bytes: this.offline.mTotalOfflineDataSize,
          };
          NLog.log("OFFLINE_DATA_RESPONSE ", offlineInfo);
          if (this.offline.mTotalOfflineDataSize > 0) {
            this.penController.onMessage!(this.penController, PenMessageType.OFFLINE_DATA_SEND_START, null);
          } else {
            this.penController.onMessage!(this.penController, PenMessageType.OFFLINE_DATA_SEND_FAILURE, null);
          }
          if (packet.Result !== 0x00) {
            this.penController.onMessage!(this.penController, PenMessageType.OFFLINE_DATA_SEND_FAILURE, null);
          }
        }
        break;

      case CMD.OFFLINE_PACKET_REQUEST:
        this.ResOfflineData(packet);
        break;

      case CMD.OFFLINE_DATA_DELETE_RESPONSE:
        // NLog.log("OFFLINE_DATA_DELETE_RESPONSE", packet);
        this.penController.onMessage!(this.penController, PenMessageType.OFFLINE_DATA_DELETE_RESPONSE, {
          Result: packet.Result === 0x00,
        });
        break;

      // MARK: CMD Firmware Response
      case CMD.FIRMWARE_UPLOAD_RESPONSE:
        const status = packet.GetByte(); // 0: 전송받음 / 1: firmwareVersion 동일 / 2: 펜 디스크 공간 부족 / 3: 실패 / 4: 압축지원 안함
        if (packet.Result !== 0 || status !== 0) {
          this.IsUploading = false;
          this.penController.onMessage!(this.penController, PenMessageType.PEN_FW_UPGRADE_FAILURE, status);
        } else if (status === 0) {
          // NLog.log( "ResPenFWUpgrade status : " + status );
          this.penController.onMessage!(this.penController, PenMessageType.PEN_FW_UPGRADE_STATUS, 0);
        }
        break;

      case CMD.FIRMWARE_PACKET_REQUEST:
        {
          let firmwareRes = {
            status: packet.GetByte(),
            offset: packet.GetInt(),
          };

          this.ResponseChunkRequest(firmwareRes.offset, firmwareRes.status);
        }
        break;

      case CMD.ONLINE_DATA_RESPONSE:
        NLog.log("Using Note Set", packet.Result);
        // this.penController.SetHoverEnable(true);
        this.penController.onMessage!(this.penController, PenMessageType.PEN_USING_NOTE_SET_RESULT, {
          Result: packet.Result === 0x00,
        });
        break;

      case CMD.RES_PDS:
        let pds = Res.PDS(packet);
        this.penController.onMessage!(this.penController, PenMessageType.RES_PDS, pds);
        break;

      case CMD.PEN_PROFILE_RESPONSE:
        const profile = Res.ProfileData(packet);
        this.penController.onMessage!(this.penController, PenMessageType.PEN_PROFILE, profile);
        break;

      default:
        NLog.log("ParsePacket: not implemented yet", packet);
        break;
    }
  }

  /**
   * Validates that the event counter is received in sequential order.
   * @param {number} ecount
   */
  CheckEventCount(ecount: number) {
    //Debug.WriteLine("COUNT : " + ecount + ", " + EventCount);

    if (ecount - this.state.EventCount !== 1 && (ecount !== 0 || this.state.EventCount !== 255)) {
      let errorDot = null;

      if (this.state.mPrevDot != null) {
        errorDot = this.state.mPrevDot.Clone();
        errorDot.dotType = Dot.DotTypes.PEN_ERROR;
      }

      if (ecount - this.state.EventCount > 1) {
        let extraData = "missed event count " + (this.state.EventCount + 1) + "-" + (ecount - 1);
        this.penController.onErrorDetected({
          ErrorType: ErrorType.InvalidEventCount,
          Dot: errorDot,
          TimeStamp: this.state.SessionTs,
          ExtraData: extraData,
        });
      } else if (ecount < this.state.EventCount) {
        let extraData = "invalid event count " + this.state.EventCount + "," + ecount;
        this.penController.onErrorDetected({
          ErrorType: ErrorType.InvalidEventCount,
          Dot: errorDot,
          TimeStamp: this.state.SessionTs,
          ExtraData: extraData,
        });
      }
    }

    this.state.EventCount = ecount;
  }
  // MARK: Parse (Up & Down)
  /**
   * On a real-time pen DOWN event, parses the timestamp, pen tip type, and pen tip color from the packet and resets pen event state.
   * - Final stage of packet parsing; ParsePacket must be performed before calling this method.
   * @param {Packet} pk
   */
  NewPenDown(pk: Packet) {
    if (this.state.isStartWithDown && this.state.isBeforeMiddle && this.state.mPrevDot !== null) {
      this.MakeUpDot();
    }
    let ecount = pk.GetByte();
    this.CheckEventCount(ecount);
    this.state.isStartWithDown = true;
    this.current.Time = pk.GetLong();
    this.state.SessionTs = this.current.Time;
    this.state.isBeforeMiddle = false;
    this.state.isStartWithPaperInfo = false;
    this.state.isPUI = false;
    this.state.mDotCount = 0;
    this.state.mPenTipType = pk.GetByte() === 0x00 ? PenTipType.Normal : PenTipType.Eraser;
    this.state.mPenTipColor = pk.GetInt();
    this.state.mPrevDot = null;

    const x = -1;
    const y = -1;
    const f = 0;
    const Ddot = Dot.MakeDot(
      this.current,
      x,
      y,
      f,
      Dot.DotTypes.PEN_DOWN,
      this.state.mPenTipType,
      this.state.mPenTipColor,
      { tx: 0, ty: 0, twist: 0 }
    );
    this.ProcessDot(Ddot);
  }

  /**
   * On a real-time pen UP event, parses the timestamp and counts (dots/images) from the packet and resets pen event state.
   * - If PenDown -> PenMove -> PenUp is performed normally, an UP dot is emitted.
   * - Final stage of packet parsing; ParsePacket must be performed before calling this method.
   * @param {Packet} pk
   */
  NewPenUp(pk: Packet) {
    let ecount = pk.GetByte();
    this.CheckEventCount(ecount);
    let timeStamp = pk.GetLong();
    new Date(timeStamp);
    // NLog.log("ONLINE_NEW_PEN_UP_EVENT timestamp", new Date(timestamp));
    let dotCount = pk.GetShort();
    let totalImageCount = pk.GetShort();
    let procImageCount = pk.GetShort();
    let succImageCount = pk.GetShort();
    let sendImageCount = pk.GetShort();
    if (this.state.isStartWithDown && this.state.isBeforeMiddle && this.state.mPrevDot !== null) {
      let udot = this.state.mPrevDot.Clone();
      udot.dotType = Dot.DotTypes.PEN_UP;
      let imageInfo = null;
      if (this.state.isStartWithPaperInfo) {
        imageInfo = {
          DotCount: dotCount,
          Total: totalImageCount,
          Processed: procImageCount,
          Success: succImageCount,
          Transferred: sendImageCount,
        };
      }
      this.ProcessDot(udot);
    } else if (!this.state.isStartWithDown && !this.state.isBeforeMiddle) {
      // 즉 다운업(무브없이) 혹은 업만 들어올 경우 UP dot을 보내지 않음
      this.penController.onErrorDetected({
        ErrorType: ErrorType.MissingPenDownPenMove,
        TimeStamp: -1,
      });
    } else if (!this.state.isBeforeMiddle) {
      // 무브없이 다운-업만 들어올 경우 UP dot을 보내지 않음
      this.penController.onErrorDetected({
        ErrorType: ErrorType.MissingPenMove,
        TimeStamp: this.state.SessionTs,
      });
    }
    this.current.Time = -1;
    this.current.TimeDiff = 0;
    this.state.SessionTs = -1;
    this.state.isStartWithDown = false;
    this.state.isBeforeMiddle = false;
    this.state.isStartWithPaperInfo = false;
    this.state.isPUI = false;
    this.state.mDotCount = 0;
    this.state.mPrevDot = null;
  }

  /**
   * On a real-time pen UP/DOWN event, parses the timestamp, pen tip type, and pen tip color from the packet and resets pen event state.
   * - Used when pen firmware version is earlier than 2.13.
   * - Final stage of packet parsing; ParsePacket must be performed before calling this method.
   * @param {Packet} pk
   */
  PenUpDown(pk: Packet) {
    let IsDown = pk.GetByte() === 0x00;
    if (IsDown) {
      if (this.state.isStartWithDown && this.state.isBeforeMiddle && this.state.mPrevDot !== null) {
        this.MakeUpDot();
      }
      this.state.isStartWithDown = true;
      this.current.Time = pk.GetLong();
      this.state.SessionTs = this.current.Time;
    } else {
      if (this.state.isStartWithDown && this.state.isBeforeMiddle && this.state.mPrevDot !== null) {
        this.MakeUpDot(false);
      } else if (!this.state.isStartWithDown && !this.state.isBeforeMiddle) {
        // 즉 다운업(무브없이) 혹은 업만 들어올 경우 UP dot을 보내지 않음
        this.penController.onErrorDetected({
          ErrorType: ErrorType.MissingPenDownPenMove,
          TimeStamp: -1,
        });
      } else if (!this.state.isBeforeMiddle) {
        // 무브없이 다운-업만 들어올 경우 UP dot을 보내지 않음
        this.penController.onErrorDetected({
          ErrorType: ErrorType.MissingPenMove,
          TimeStamp: this.state.SessionTs,
        });
      }
      this.state.isStartWithDown = false;
      this.current.Time = -1;
      this.current.TimeDiff = 0;
      this.state.SessionTs = -1;
    }
    this.state.isBeforeMiddle = false;
    this.state.isStartWithPaperInfo = false;
    this.state.mDotCount = 0;
    this.state.mPenTipType = pk.GetByte() === 0x00 ? PenTipType.Normal : PenTipType.Eraser;
    this.state.mPenTipColor = pk.GetInt();
    this.state.mPrevDot = null;
  }

  /**
   * When real-time stroke data transmission fails, parses error context information from the packet.
   * - Final stage of packet parsing; ParsePacket must be performed before calling this method.
   * @param {number} cmd - command used to determine whether the packet includes packetCount
   * @param {Packet} pk
   */
  PenErrorDot(cmd: number, pk: Packet) {
    if (cmd === CMD.ONLINE_NEW_PEN_ERROR_EVENT) {
      let ecount = pk.GetByte();
      this.CheckEventCount(ecount);
    }
    let timeadd = pk.GetByte();
    this.current.Time += timeadd;
    this.current.TimeDiff = timeadd;
    let force = pk.GetShort();
    let brightness = pk.GetByte();
    let exposureTime = pk.GetByte();
    let ndacProcessTime = pk.GetByte();
    let labelCount = pk.GetShort();
    let ndacErrorCode = pk.GetByte();
    let classType = pk.GetByte();
    let errorCount = pk.GetByte();
    let newInfo = {
      TimeStamp: this.current.Time,
      force,
      brightness,
      exposureTime,
      ndacProcessTime,
      labelCount,
      ndacErrorCode,
      classType,
      errorCount,
    };
    let errorDot = null;
    if (this.state.mPrevDot != null) {
      errorDot = this.state.mPrevDot.Clone();
      errorDot.dotType = Dot.DotTypes.PEN_UP;
    }
    this.penController.onErrorDetected({
      ErrorType: ErrorType.ImageProcessingError,
      Dot: errorDot,
      TimeStamp: this.state.SessionTs,
      ImageProcessErrorInfo: newInfo,
    });
  }

  // MARK: Parse Paper
  /**
   * During real-time stroke transmission, parses the paper info (section, owner, note, page) from the packet.
   * - Final stage of packet parsing; ParsePacket must be performed before calling this method.
   * @param {number} cmd - command used to determine whether the packet includes packetCount
   * @param {Packet} pk
   */
  PaperInfoEvent(cmd: number, pk: Packet) {
    if (cmd === CMD.ONLINE_NEW_PAPER_INFO_EVENT) {
      let ecount = pk.GetByte();

      this.CheckEventCount(ecount);
    }

    // 미들도트 중에 페이지가 바뀐다면 강제로 펜업을 만들어 준다.
    if (this.state.isStartWithDown && this.state.isBeforeMiddle && this.state.mPrevDot !== null) {
      this.MakeUpDot(false);
    }

    let rb = pk.GetBytes(4);

    const section = rb[3] & 0xff;
    const owner = Converter.byteArrayToInt(new Uint8Array([rb[0], rb[1], rb[2], 0x00]));
    const book = pk.GetInt();
    const page = pk.GetInt();
    this.current.section = section;
    this.current.owner = owner;
    this.current.note = book;
    this.current.page = page;

    this.state.mDotCount = 0;

    this.state.isStartWithPaperInfo = true;

    if (isPUI({ section: section, owner: owner, book: book, page: page })) {
      this.state.isPUI = true;
      this.state.cmdCheck = true;
    }
    const x = -1;
    const y = -1;
    const f = 0;
    const Ddot = Dot.MakeDot(
      this.current,
      x,
      y,
      f,
      Dot.DotTypes.PEN_INFO,
      this.state.mPenTipType,
      this.state.mPenTipColor,
      { tx: 0, ty: 0, twist: 0 }
    );
    this.ProcessDot(Ddot);
  }

  // MARK: Parse Dot
  /**
   * During real-time stroke transmission, parses dot values (coordinates, tilt, pressure, etc.) from the packet.
   * - If PenDown -> PenMove and PageInfo are performed normally, a move dot is emitted.
   * - Final stage of packet parsing; ParsePacket must be performed before calling this method.
   * @param {number} cmd - command used to determine whether the packet includes packetCount
   * @param {Packet} pk
   */
  PenDotEvent(cmd: number, pk: Packet) {
    if (cmd === CMD.ONLINE_NEW_PEN_DOT_EVENT) {
      let ecount = pk.GetByte();

      this.CheckEventCount(ecount);
    }

    let timeadd = pk.GetByte();
    this.current.Time += timeadd;
    this.current.TimeDiff = timeadd;
    let force = pk.GetShort();
    let x = pk.GetShort();
    let y = pk.GetShort();
    let fx = pk.GetByte();
    let fy = pk.GetByte();
    x += fx * 0.01;
    y += fy * 0.01;
    let tx = pk.GetByte();
    let ty = pk.GetByte();
    let twist = pk.GetShort();
    let angel = {
      tx,
      ty,
      twist,
    };
    let dot = null;

    if (this.state.mDotCount === 0 && this.current && isPUIOnPage(this.current, x, y)) {
      this.state.isPUI = true;
      this.state.cmdCheck = true;
    }

    if (this.state.isPUI) {
      if (this.state.mDotCount === 0 && this.state.cmdCheck) {
        const pui = PUIController.getInstance();
        const command = pui.getPuiCommand(this.current, x, y).then((cmd) => {
          if (cmd) {
            this.penController.onMessage!(this.penController, PenMessageType.EVENT_DOT_PUI, { command: cmd });
          }
        });
        this.state.cmdCheck = false;
        return;
      }
    }

    if (!this.penSettingInfo.HoverMode && !this.state.isStartWithDown) {
      if (!this.state.isStartWithPaperInfo) {
        //펜 다운 없이 페이퍼 정보 없고 무브가 오는 현상(다운 - 무브 - 업 - 다운X - 무브)
        this.penController.onErrorDetected({
          ErrorType: ErrorType.MissingPenDown,
          TimeStamp: -1,
        });
      } else {
        this.current.Time = Date.now();

        this.state.SessionTs = this.current.Time;

        let errorDot = Dot.MakeDot(
          this.current,
          x,
          y,
          force,
          Dot.DotTypes.PEN_ERROR,
          this.state.mPenTipType,
          this.state.mPenTipColor,
          angel
        );

        //펜 다운 없이 페이퍼 정보 있고 무브가 오는 현상(다운 - 무브 - 업 - 다운X - 무브)
        this.penController.onErrorDetected({
          ErrorType: ErrorType.MissingPenDown,
          Dot: errorDot,
          TimeStamp: this.state.SessionTs,
        });

        this.state.isStartWithDown = true;
        this.state.isStartWithPaperInfo = true;
      }
    }

    if (this.penSettingInfo.HoverMode && !this.state.isStartWithDown) {
      dot = Dot.MakeDot(
        this.current,
        x,
        y,
        force,
        Dot.DotTypes.PEN_HOVER,
        this.state.mPenTipType,
        this.state.mPenTipColor,
        angel
      );
    } else if (this.state.isStartWithDown) {
      if (this.current.Time < 10000) {
        this.UpDotTimerCallback();
        this.penController.onErrorDetected({
          ErrorType: ErrorType.InvalidTime,
          TimeStamp: this.state.SessionTs,
        });
      }
      if (this.state.isStartWithPaperInfo) {
        dot = Dot.MakeDot(
          this.current,
          x,
          y,
          force,
          // this.state.mDotCount === 0 ? Dot.DotTypes.PEN_DOWN : Dot.DotTypes.PEN_MOVE,
          Dot.DotTypes.PEN_MOVE,
          this.state.mPenTipType,
          this.state.mPenTipColor,
          angel
        );
      } else {
        //펜 다운 이후 페이지 체인지 없이 도트가 들어왔을 경우
        this.penController.onErrorDetected({
          ErrorType: ErrorType.MissingPageChange,
          TimeStamp: this.state.SessionTs,
        });
      }
    }

    if (dot != null) {
      this.ProcessDot(dot);
    }

    this.state.isBeforeMiddle = true;
    this.state.mPrevDot = dot;
    this.state.mDotCount++;
  }

  /**
   * During real-time stroke transmission, parses hover dot values (coordinates, tilt) from the packet.
   * - Final stage of packet parsing; ParsePacket must be performed before calling this method.
   * @param {Packet} pk
   */
  PenHoverEvent = (pk: Packet) => {
    const timeadd = pk.GetByte();
    this.current.Time += timeadd;
    this.current.TimeDiff = timeadd;
    let x = pk.GetShort();
    let y = pk.GetShort();
    const fx = pk.GetByte();
    const fy = pk.GetByte();
    x += fx * 0.01;
    y += fy * 0.01;
    let dot = null;

    if (this.penSettingInfo.HoverMode && !this.state.isStartWithDown) {
      dot = Dot.MakeDot(
        this.current,
        x,
        y,
        0,
        Dot.DotTypes.PEN_HOVER,
        this.state.mPenTipType,
        this.state.mPenTipColor,
        { tx: 0, ty: 0, twist: 0 }
      );
    }

    if (dot != null) {
      this.ProcessDot(dot);
    }
  };

  /**
   * Resets pen event state when the Bluetooth connection is disconnected.
   */
  OnDisconnected() {
    if (this.state.isStartWithDown && this.state.isBeforeMiddle && this.state.mPrevDot !== null) {
      this.MakeUpDot();
      this.current.Time = -1;
      this.current.TimeDiff = 0;
      this.state.SessionTs = -1;
      this.state.isStartWithDown = false;
      this.state.isBeforeMiddle = false;
      this.state.isStartWithPaperInfo = false;
      this.state.mDotCount = 0;
      this.state.mPrevDot = null;
    }
  }

  /**
   * Resets pen event state when an invalid timestamp is detected after a pen-down event.
   */
  UpDotTimerCallback() {
    if (this.state.isStartWithDown && this.state.isBeforeMiddle && this.state.mPrevDot !== null) {
      this.MakeUpDot();
      this.current.Time = -1;
      this.current.TimeDiff = 0;
      this.state.SessionTs = -1;
      this.state.isStartWithDown = false;
      this.state.isBeforeMiddle = false;
      this.state.isStartWithPaperInfo = false;
      this.state.mDotCount = 0;
      this.state.mPrevDot = null;
    }
  }

  /**
   * Forces a pen-up event; optionally emits an error if isError is true.
   * @param {boolean} isError
   */
  MakeUpDot(isError: boolean = true) {
    if (isError) {
      let errorDot = this.state.mPrevDot.Clone();
      errorDot.dotType = Dot.DotTypes.PEN_ERROR;
      this.penController.onErrorDetected({
        ErrorType: ErrorType.MissingPenUp,
        Dot: errorDot,
        TimeStamp: this.state.SessionTs,
      });
    }

    let audot = this.state.mPrevDot.Clone();
    audot.dotType = Dot.DotTypes.PEN_UP;
    this.ProcessDot(audot);
  }

  // MARK: Parse Offline
  /**
   * During offline stroke transmission, parses offline data from the packet (compression, transfer position, paper info, stroke data, etc.).
   * - Final stage of packet parsing; ParsePacket must be performed before calling this method.
   * @param {Packet} packet
   */
  ResOfflineData(packet: Packet) {
    const packetid = packet.GetShort();
    const isCompressed = packet.GetByte() === 1 ? true : false;
    const beforsize = packet.GetShort();
    const aftersize = packet.GetShort();
    const transPosition = packet.GetByte(); // 0: start, 1: middle, 2: end
    const rb = packet.GetBytes(4);
    const [section, owner] = GetSectionOwner(rb);
    const note = packet.GetInt();
    const strokeCount = packet.GetShort();
    const oDataSize = isCompressed ? aftersize : beforsize;
    const data = packet.GetBytes(oDataSize);
    const Paper = {
      packetid,
      isCompressed,
      beforsize,
      aftersize,
      transPosition,
      section,
      owner,
      note,
      strokeCount,
      dataSize: data.length,
    };
    // NLog.log("offlineData info", offlineInfo);
    if (isCompressed) {
      let u8 = new Uint8Array(data);
      unzipAsync(u8)
        .then((unzipU8) => {
          // NLog.log("Offline zip file received successfully");
          this.ParseSDK2OfflinePenData(unzipU8, Paper);
        })
        .catch((err) => {
          NLog.log("unzip error", err);
        });
    } else {
      // NLog.log("not compressed Offline file received successfully");
      let u8 = new Uint8Array(data);
      this.ParseSDK2OfflinePenData(u8, Paper);
    }

    if (transPosition === 2) {
      // NLog.log("OFFLINE_DATA_RECEIVE_END");
      this.penController.onMessage!(this.penController, PenMessageType.OFFLINE_DATA_SEND_STATUS, 100);
    } else {
      this.offline.mReceivedOfflineStroke += strokeCount;
      // NLog.log("OFFLINE_DATA_RECEIVE", strokeCount, this.offline.mReceivedOfflineStroke);
      this.ReqOfflineData2(packetid, true, false);
      let percent = (this.offline.mReceivedOfflineStroke * 100) / this.offline.mTotalOfflineStroke;
      this.penController.onMessage!(this.penController, PenMessageType.OFFLINE_DATA_SEND_STATUS, percent);
    }
  }

  /**
   * During offline stroke transmission, parses stroke data (PenUp/Down timestamp, pen tip type/color, dot count) and dot data
   * (coordinates, tilt, pressure, etc.), and appends dots to each stroke.
   * - Paper ⊃ Stroke ⊃ Dot
   * - ResOfflineData must be performed before calling this method.
   * @param {array} u8
   * @param {any} paper - paper object built from offline data
   */
  ParseSDK2OfflinePenData(u8: Uint8Array, paper: any) {
    // NLog.log("OfflineStrokeParser", u8);
    let strokes = [];
    let packet = new PacketBuilder().data(u8).Build();
    let strokeCount = paper.strokeCount;

    for (let i = 0; i < strokeCount; i++) {
      let page = packet.GetInt();
      let downTime = packet.GetLong();
      packet.GetLong(); // upTime
      let penTipType = packet.GetByte(); // penTipType
      let penTipColor = packet.GetInt();
      let dotCount = packet.GetShort();
      paper.page = page;
      paper.Time = downTime;
      let Dots = [];
      for (let j = 0; j < dotCount; j++) {
        let nTimeDelta = packet.GetByte();
        let force = packet.GetShort();
        let x = packet.GetShort();
        let y = packet.GetShort();
        let fx = packet.GetByte();
        let fy = packet.GetByte();
        x += fx * 0.01;
        y += fy * 0.01;
        let xtilt = packet.GetByte();
        let ytilt = packet.GetByte();
        let twist = packet.GetShort();
        packet.GetShort(); // reserved
        packet.GetByte(); // nCheckSum

        let angel = {
          tx: xtilt,
          ty: ytilt,
          twist: twist,
        };
        paper.Time += nTimeDelta;
        let dottype: number = Dot.DotTypes.PEN_MOVE;
        if (j === 0) dottype = Dot.DotTypes.PEN_DOWN;
        if (j === dotCount - 1) dottype = Dot.DotTypes.PEN_UP;
        let dot = Dot.MakeDot(paper, x, y, force, dottype, penTipType, penTipColor, angel);
        Dots.push(dot);
      }
      let stroke = { Dots };
      strokes.push(stroke);
    }
    // NLog.log(strokes)
    this.penController.onMessage!(this.penController, PenMessageType.OFFLINE_DATA_SEND_SUCCESS, strokes);
  }

  // NOTE: Request(Offline Receive Response)
  /**
   * Sends an offline-receive response back to the pen (continue/stop, success/failure).
   * - ResOfflineData must be performed before calling this method.
   * @param {number} index
   * @param {boolean} isSuccess
   * @param {boolean} end - true to stop transfer, false to continue
   */
  ReqOfflineData2(index: number, isSuccess: boolean = true, end: boolean = false) {
    let bf = new ByteUtil();

    bf.Put(CONST.PK_STX, false)
      .Put(CMD.OFFLINE_PACKET_RESPONSE)
      .Put(isSuccess ? 0 : 1)
      .PutShort(3)
      .PutShort(index)
      .Put(end ? 0 : 1)
      .Put(CONST.PK_ETX, false);
    // NLog.log("ReqOfflineData2", bf);
    this.Send(bf);
  }

  // NOTE: Request(PenStatus)
  /**
   * Requests pen setting information.
   * @returns
   */
  ReqPenStatus() {
    let bf = new ByteUtil();

    bf.Put(CONST.PK_STX, false).Put(CMD.SETTING_INFO_REQUEST).PutShort(0).Put(CONST.PK_ETX, false);

    return this.Send(bf);
  }

  // NOTE: Request(SetupTime)
  /**
   * Requests to update the pen's timestamp to the current time.
   * @returns
   */
  ReqSetupTime() {
    let timetick = Date.now();
    let bf = new ByteUtil();

    bf.Put(CONST.PK_STX, false)
      .Put(CMD.SETTING_CHANGE_REQUEST)
      .PutShort(9)
      .Put(SettingType.TimeStamp)
      .PutLong(timetick)
      .Put(CONST.PK_ETX, false);

    return this.Send(bf);
  }

  // MARK: Parse Start(Step 1)
  /**
   * Step3 Send Data from Pen
   * When bytes arrive, creates a buffer, applies escape handling, and frames bytes into packets.
   * - First stage of packet parsing.
   * @param {array} buff - uint8array
   */
  ProtocolParse(buff: Uint8Array) {
    NLog.log("Parssing Process Start", buff);

    let size = buff.length;
    for (let i = 0; i < size; i++) {
      if (buff[i] === CONST.PK_STX) {
        // 패킷 시작
        this.mBuffer = new ByteUtil();

        this.IsEscape = false;
      } else if (buff[i] === CONST.PK_ETX) {
        // 패킷 끝
        let builder = new PacketBuilder();

        let cmd = this.mBuffer.GetByte();

        // event command is 0x6X and PDS 0x73
        let result_size = cmd >> 4 !== 0x6 && cmd !== 0x73 && cmd !== 0x24 && cmd !== 0x32 ? 1 : 0;
        let result = result_size > 0 ? this.mBuffer.GetByte() : -1;

        let length = this.mBuffer.GetShort();

        let data = this.mBuffer.GetBytes();

        builder.cmd(cmd).result(result).data(data).length(length);

        this.mBuffer.Clear();
        this.mBuffer = null;
        const packet = builder.Build();
        this.ParsePacket(packet);

        this.IsEscape = false;
      } else if (buff[i] === CONST.PK_DLE && !this.IsEscape) {
        this.IsEscape = true;
      } else if (this.IsEscape) {
        this.mBuffer.Put(buff[i] ^ 0x20, false);
        this.IsEscape = false;
      } else {
        this.mBuffer.Put(buff[i], false);
      }
    }
  }

  /**
   * For firmware update, processes firmware data based on the status and offset received from the pen and forwards it to a request.
   * @param {number} offset
   * @param {number} status - status: 0 = start / 1 = continue / 2 = end / 3 = error
   */
  ResponseChunkRequest(offset: number, status: number) {
    const fwBf = this.penController.mClientV2.state.fwFile as ByteUtil;
    const packetSize = this.penController.mClientV2.state.fwPacketSize;

    const data = fwBf.GetBytesWithOffset(offset, packetSize);

    if (
      status === FirmwareStatusType.STATUS_START ||
      status === FirmwareStatusType.STATUS_CONTINUE ||
      status === FirmwareStatusType.STATUS_END
    ) {
      this.IsUploading = true;
      NLog.log("[FW] received pen upgrade status : " + status);
    } else if (status === FirmwareStatusType.STATUS_ERROR) {
      this.IsUploading = false;
      this.penController.onMessage!(this.penController, PenMessageType.PEN_FW_UPGRADE_FAILURE, null);
      NLog.log("[FW] received pen upgrade status : FW Error !!");
      this.penController.RequestFirmwareUpload(offset, data, status);
      return;
    } else {
      this.IsUploading = false;
      this.penController.onMessage!(this.penController, PenMessageType.PEN_FW_UPGRADE_FAILURE, null);
      NLog.log("[FW] received pen upgrade status : Unknown");
      return;
    }

    // while(this.IsUploading){
    if (status === FirmwareStatusType.STATUS_END) {
      if (data !== null) {
        this.penController.RequestFirmwareUpload(offset, data, status);
      }
      this.penController.onMessage!(this.penController, PenMessageType.PEN_FW_UPGRADE_STATUS, 100);
      this.penController.onMessage!(this.penController, PenMessageType.PEN_FW_UPGRADE_SUCCESS, null);

      this.IsUploading = false;
      return;
    } else {
      this.penController.RequestFirmwareUpload(offset, data, status);
    }

    let maximum = fwBf.Size;
    if (maximum % packetSize == 0) {
      maximum = maximum / packetSize;
    } else {
      maximum = maximum / packetSize + 1;
    }
    const index = offset / packetSize;
    NLog.log("[FW] send progress => Maximum : " + maximum + ", Current : " + index);

    const percent = (index * 100) / maximum;
    this.penController.onMessage!(this.penController, PenMessageType.PEN_FW_UPGRADE_STATUS, percent);
    // }
  }

  /**
   * Escapes STX/ETX/DLE when they appear in the packet payload.
   * @param {number} input
   * @returns {array}
   */
  Escape(input: number) {
    if (input === CONST.PK_STX || input === CONST.PK_ETX || input === CONST.PK_DLE) {
      return [CONST.PK_DLE, input ^ 0x20];
    } else {
      return [input];
    }
  }

  // Send Dot
  ProcessDot(dot: Dot) {
    if (dot.dotType === Dot.DotTypes.PEN_HOVER) {
      this.SendDotReceiveEvent(dot);
    } else {
      this.dotFilter.put(dot);
    }
  }

  /**
   * Delivers a dot to the pen controller's onDot callback so it can be rendered/consumed.
   * - onDot must be implemented for this method to take effect.
   * @param {Dot} dot
   */
  SendDotReceiveEvent = (dot: Dot) => {
    // NLog.log(dot);
    if (this.penController.onDot) {
      this.penController.onDot(this.penController, dot);
      NLog.log("ParseDot ] X:", dot.x, " Y:", dot.y, " f:", dot.f, " DotType:", dot.dotType, " SOBP: ", dot.pageInfo);
    } else {
      // NLog.log("Need onDot Callback")
    }
  };

  dotFilter = new DotFilter(this.SendDotReceiveEvent);

  // Send to Pen
  /**
   * Sends a built request buffer to the pen controller's handleWrite.
   * - handleWrite must be implemented for this method to take effect.
   * @param {ByteUtil} bf
   * @returns
   */
  Send(bf: ByteUtil) {
    const u8 = bf.ToU8Array();
    this.penController.handleWrite!(u8);
    return true;
  }
}
