import ByteUtil, { GetSectionOwnerByte } from "../Util/ByteUtil";
import * as Converter from "../Util/Converter";
import * as NLog from "../Util/NLog";
import CMD from "./CMD";
import CONST from "./Const";
import { deflateAsync } from "../Util/compression";

import { FirmwareStatusType, ProfileType, SettingType } from "../API/PenMessageType";
import { PenController } from "..";

type DefaultConfig = {
  SupportedProtocolVersion: string;
  PEN_PROFILE_SUPPORT_PROTOCOL_VERSION: number;
  DEFAULT_PASSWORD: string;
};

export default class PenRequestV2 {
  penController: PenController;
  defaultConfig: DefaultConfig;
  state: any;

  constructor(penController: PenController) {
    this.penController = penController;
    this.defaultConfig = Object.freeze({
      SupportedProtocolVersion: "2.18",
      PEN_PROFILE_SUPPORT_PROTOCOL_VERSION: 2.18,
      DEFAULT_PASSWORD: "0000",
    });

    this.state = {
      isFwCompress: false,
      fwPacketSize: 0,
      fwFile: null,
    };
  }

  //
  // Request
  //
  /**
   * Builds and sends a request buffer to fetch the pen version/info.
   * - First step after a successful pen connection.
   */
  ReqVersion() {
    let bf = new ByteUtil();

    // TODO 정상적으로 넘어오는지 확인이 필요하다.
    let StrAppVersion = Converter.toUTF8Array("0.0.0.0");
    let StrProtocolVersion = Converter.toUTF8Array(this.defaultConfig.SupportedProtocolVersion);

    bf.Put(CONST.PK_STX, false)
      .Put(CMD.VERSION_REQUEST)
      .PutShort(42)
      .PutNull(16)
      // .Put(0x12)
      .Put(0xf0)
      .Put(0x01)
      .PutArray(StrAppVersion, 16)
      .PutArray(StrProtocolVersion, 8)
      .Put(CONST.PK_ETX, false);

    this.Send(bf);
  }

  // NOTE: SendPen
  ReqVersionTask() {
    // TODO: make thread for try 3times
    setTimeout(() => this.ReqVersion(), 500);
  }

  //
  // Password
  //
  /**
   * Builds and sends a request buffer to change the password set on the pen.
   * @param {string} oldPassword
   * @param {string} newPassword
   * @returns
   */
  ReqSetUpPassword(oldPassword: string, newPassword = "") {
    if (!oldPassword) return false;
    NLog.log("ReqSetUpPassword", oldPassword, newPassword);
    // if (oldPassword === this.defaultConfig.DEFAULT_PASSWORD) return false;
    if (newPassword === this.defaultConfig.DEFAULT_PASSWORD) return false;

    let oPassByte = Converter.toUTF8Array(oldPassword);
    let nPassByte = Converter.toUTF8Array(newPassword);

    let bf = new ByteUtil();

    bf.Put(CONST.PK_STX, false)
      .Put(CMD.PASSWORD_CHANGE_REQUEST)
      .PutShort(33)
      .Put(newPassword === "" ? 0 : 1)
      .PutArray(oPassByte, 16)
      .PutArray(nPassByte, 16)
      .Put(CONST.PK_ETX, false);

    return this.Send(bf);
  }

  /**
   * Builds and sends a password input buffer to the pen.
   * @param {string} password
   * @returns
   */
  ReqInputPassword(password: string) {
    if (!password) return false;
    if (password === this.defaultConfig.DEFAULT_PASSWORD) return false;

    let bStrByte = Converter.toUTF8Array(password);

    let bf = new ByteUtil();
    bf.Put(CONST.PK_STX, false).Put(CMD.PASSWORD_REQUEST).PutShort(16).PutArray(bStrByte, 16).Put(CONST.PK_ETX, false);

    return this.Send(bf);
  }

  /**
   * Builds and sends a request buffer to query pen settings.
   * @returns
   */
  ReqPenStatus() {
    let bf = new ByteUtil();

    bf.Put(CONST.PK_STX, false).Put(CMD.SETTING_INFO_REQUEST).PutShort(0).Put(CONST.PK_ETX, false);

    return this.Send(bf);
  }

  /**
   * Builds and sends a request buffer to change a pen setting.
   * @param {number} stype - SettingType, setting to change
   * @param {any} value
   * @returns
   */
  RequestChangeSetting(stype: number, value: any) {
    let bf = new ByteUtil();

    bf.Put(CONST.PK_STX, false).Put(CMD.SETTING_CHANGE_REQUEST);

    switch (stype) {
      case SettingType.TimeStamp:
        bf.PutShort(9).Put(stype).PutLong(value);
        break;

      case SettingType.AutoPowerOffTime:
        bf.PutShort(3).Put(stype).PutShort(value);
        break;

      case SettingType.LedColor:
        let b = Converter.intToByteArray(value);
        let nBytes = new Uint8Array([b[3], b[2], b[1], b[0]]);
        bf.PutShort(5).Put(stype).PutArray(nBytes, 4);

        //bf.PutShort(5).Put((byte)stype).PutInt((int)value);
        break;

      case SettingType.PenCapOff:
      case SettingType.AutoPowerOn:
      case SettingType.Beep:
      case SettingType.Hover:
      case SettingType.OfflineData:
      case SettingType.DownSampling:
        bf.PutShort(2)
          .Put(stype)
          .Put(value ? 1 : 0);
        break;
      case SettingType.Sensitivity:
        bf.PutShort(2).Put(stype).Put(value);
        break;
      case SettingType.UsbMode:
        bf.PutShort(2).Put(stype).Put(value);
        break;
      case SettingType.BtLocalName:
        let StrByte = Converter.toUTF8Array(value);
        bf.PutShort(18).Put(stype).Put(16).PutArray(StrByte, 16);
        break;
      case SettingType.FscSensitivity:
        bf.PutShort(2).Put(stype).PutShort(value);
        break;
      case SettingType.DataTransmissionType:
        bf.PutShort(2).Put(stype).Put(value);
        break;
      case SettingType.BeepAndLight:
        bf.PutShort(2).Put(stype).Put(0x00);
        break;
      case SettingType.InitDisk:
        bf.PutShort(5).Put(stype).PutInt(0x4f1c0b42);
        break;
      default:
        NLog.log("undefined setting type");
    }

    bf.Put(CONST.PK_ETX, false);
    // NLog.log("RequestChangeSetting", bf)
    return this.Send(bf);
  }

  /**
   * Requests to update the pen timestamp to the current time.
   * - Milliseconds since Jan 1, 1970.
   * @returns
   */
  ReqSetupTime() {
    let timetick = Date.now();
    // NLog.log("Setup Time", timetick, new Date(timetick));
    return this.RequestChangeSetting(SettingType.TimeStamp, timetick);
  }

  /**
   * Requests to update the auto shutdown time.
   * In minutes (v2.17 = 5 ~ 3600 // v2.18 = 1 ~ 3600).
   * @param {number} minute
   * @returns
   */
  ReqSetupPenAutoShutdownTime(minute: number) {
    return this.RequestChangeSetting(SettingType.AutoPowerOffTime, minute);
  }

  /**
   * Requests to enable/disable power-off when the pen cap is closed.
   * @param {boolean} enable - on / off
   * @returns
   */
  ReqSetupPenCapPower(enable: boolean) {
    return this.RequestChangeSetting(SettingType.PenCapOff, enable);
  }

  /**
   * Requests to enable/disable auto power-on when opening the cap or starting to write.
   * @param {boolean} enable - on / off
   * @returns
   */
  ReqSetupPenAutoPowerOn(enable: boolean) {
    return this.RequestChangeSetting(SettingType.AutoPowerOn, enable);
  }

  /**
   * Requests to enable/disable beep sound.
   * @param {boolean} enable - on / off
   * @returns
   */
  ReqSetupPenBeep(enable: boolean) {
    return this.RequestChangeSetting(SettingType.Beep, enable);
  }

  /**
   * Requests to enable/disable hover mode.
   * - Hover mode displays visual dots to preview the pen position before pen-down.
   * @param {boolean} enable - on / off
   * @returns
   */
  ReqSetupHoverMode(enable: boolean) {
    return this.RequestChangeSetting(SettingType.Hover, enable);
  }

  /**
   * Requests to enable/disable offline data storage.
   * @param {boolean} enable - on / off
   * @returns
   */
  ReqSetupOfflineData(enable: boolean) {
    return this.RequestChangeSetting(SettingType.OfflineData, enable);
  }

  /**
   * Requests to change the pen LED color.
   * @param {number} color - argb
   * @returns
   */
  ReqSetupPenColor(color: number) {
    return this.RequestChangeSetting(SettingType.LedColor, color);
  }

  /**
   * Requests to change pen pressure sensitivity.
   * - Available only on models with an FSR pressure sensor.
   * @param {number} step - 0 ~ 4 (0 is most sensitive)
   * @returns
   */
  ReqSetupPenSensitivity(step: number) {
    return this.RequestChangeSetting(SettingType.Sensitivity, step);
  }

  /**
   * Requests to change the USB mode setting.
   * @param {number} mode - 0 or 1
   * @returns
   */
  ReqSetupUsbMode(mode: number) {
    return this.RequestChangeSetting(SettingType.UsbMode, mode);
  }

  /**
   * Requests to enable/disable down sampling.
   * @param {boolean} enable - on / off
   * @returns
   */
  ReqSetupDownSampling(enable: boolean) {
    return this.RequestChangeSetting(SettingType.DownSampling, enable);
  }

  /**
   * Requests to change the Bluetooth local name.
   * @param {string} btLocalName
   * @returns
   */
  ReqSetupBtLocalName(btLocalName: string) {
    return this.RequestChangeSetting(SettingType.BtLocalName, btLocalName);
  }

  /**
   * Requests to change pen pressure sensitivity (FSC).
   * - Available only on models with an FSC pressure sensor.
   * @param {number} step - 0 ~ 4 (0 is most sensitive)
   * @returns
   */
  ReqSetupPenFscSensitivity(step: number) {
    return this.RequestChangeSetting(SettingType.FscSensitivity, step);
  }

  /**
   * Requests to change the pen data transmission type.
   * - Currently unused.
   * @param {number} type - 0 or 1
   * @returns
   */
  ReqSetupDataTransmissionType(type: number) {
    return this.RequestChangeSetting(SettingType.DataTransmissionType, type);
  }

  /**
   * Requests to change the pen beep and LED settings.
   * For F90 pens only.
   * @returns
   */
  ReqBeepAndLight() {
    return this.RequestChangeSetting(SettingType.BeepAndLight, null);
  }

  /**
   * Requests to initialize the pen disk.
   * @returns
   */
  ReqInitPenDisk() {
    return this.RequestChangeSetting(SettingType.InitDisk, null);
  }

  /**
   * Checks whether the connected pen supports profiles by comparing protocol versions.
   * @returns
   */
  IsSupportPenProfile() {
    let temp = this.penController.mParserV2.penVersionInfo.ProtocolVersion.split(".");
    let tempVer = "";
    if (temp.length === 1) tempVer += temp[0];
    else if (temp.length >= 2) tempVer += temp[0] + "." + temp[1];

    let ver = parseFloat(tempVer);

    return ver >= this.defaultConfig.PEN_PROFILE_SUPPORT_PROTOCOL_VERSION;
  }

  /**
   * Builds and sends a request buffer to enable real-time stroke data transmission.
   * @param {array} sectionIds
   * @param {array} ownerIds
   * @param {(array | null)} noteIds - if null, do not filter by note
   * @returns {boolean}
   */
  ReqAddUsingNotes(sectionIds: number[], ownerIds: number[], noteIds: number[] | null) {
    let bf = new ByteUtil();
    bf.Put(CONST.PK_STX, false).Put(CMD.ONLINE_DATA_REQUEST);

    if (noteIds) {
      let length = 2 + noteIds.length * 8;

      bf.PutShort(length).PutShort(noteIds.length);
      noteIds.forEach((item, index) => {
        bf.PutArray(GetSectionOwnerByte(sectionIds[index], ownerIds[index]), 4).PutInt(item);
      });
    } else if (sectionIds && ownerIds) {
      bf.PutShort(2 + 8 * sectionIds.length).PutShort(sectionIds.length);
      sectionIds.forEach((section, index) => {
        bf.PutArray(GetSectionOwnerByte(section, ownerIds[index]), 4).PutInt(0xffffffff);
      });
    } else {
      bf.PutShort(2).Put(0xff).Put(0xff);
    }

    bf.Put(CONST.PK_ETX, false);
    return this.Send(bf);
  }

  //
  // MARK: Offline Data
  //
  /**
   * Builds and sends a request buffer to fetch offline note info stored on the pen.
   * - If both section and owner are 0, requests all stored note IDs (max 64).
   * @param {number} section
   * @param {number} owner
   * @returns
   */
  ReqOfflineNoteList(section: number = 0, owner: number = 0) {
    let pInfo = new Uint8Array([0xff, 0xff, 0xff, 0xff]);

    if (section > 0 && owner > 0) {
      pInfo = GetSectionOwnerByte(section, owner);
    }

    let bf = new ByteUtil();

    bf.Put(CONST.PK_STX, false)
      .Put(CMD.OFFLINE_NOTE_LIST_REQUEST)
      .PutShort(4)
      .PutArray(pInfo, 4)
      .Put(CONST.PK_ETX, false);
    return this.Send(bf);
  }

  /**
   * Builds and sends a request buffer to fetch offline page info stored on the pen.
   * - Requests page IDs (max 128) for the note matching section, owner, and note.
   * @param {number} section
   * @param {number} owner
   * @param {number} note
   * @returns
   */
  ReqOfflinePageList(section: number, owner: number, note: number) {
    // NLog.log("ReqOfflinePageList", section, owner, note)
    let bf = new ByteUtil();

    bf.Put(CONST.PK_STX, false)
      .Put(CMD.OFFLINE_PAGE_LIST_REQUEST)
      .PutShort(8)
      .PutArray(GetSectionOwnerByte(section, owner), 4)
      .PutInt(note)
      .Put(CONST.PK_ETX, false);
    // NLog.log("Packet Info", bf)
    return this.Send(bf);
  }

  /**
   * Builds and sends a request buffer to fetch offline stroke data by note ID or multiple page IDs.
   * @param {number} section
   * @param {number} owner
   * @param {number} note
   * @param {boolean} deleteOnFinished - true to delete transmitted data, false to keep it
   * @param {array} pages - if empty array, requests all pages in the note
   * @returns
   */
  ReqOfflineData(section: number, owner: number, note: number, deleteOnFinished = true, pages: number[] = []) {
    let length = 14 + pages.length * 4;
    let bf = new ByteUtil();
    // NLog.log("ReqOfflineData", length)
    bf.Put(CONST.PK_STX, false)
      .Put(CMD.OFFLINE_DATA_REQUEST)
      .PutShort(length)
      .Put(deleteOnFinished ? 1 : 2)
      .Put(0x01)
      .PutArray(GetSectionOwnerByte(section, owner), 4)
      .PutInt(note)
      .PutInt(pages == null ? 0 : pages.length);

    if (pages.length > 0) {
      pages.forEach((page: number) => {
        bf.PutInt(page);
      });
    }

    bf.Put(CONST.PK_ETX, false);
    // NLog.log("ReqOfflineData", bf);
    return this.Send(bf);
  }

  /**
   * Builds and sends a request buffer to delete offline data stored on the pen.
   * - Deletes by note ID, up to 64 notes.
   * @param {number} section
   * @param {number} owner
   * @param {array} notes
   * @returns
   */
  ReqOfflineDelete(section: number, owner: number, notes: number[]) {
    let bf = new ByteUtil();

    bf.Put(CONST.PK_STX, false).Put(CMD.OFFLINE_DATA_DELETE_REQUEST);

    let length = 5 + notes.length * 4;

    bf.PutShort(length).PutArray(GetSectionOwnerByte(section, owner), 4).Put(notes.length);

    notes.forEach((noteId) => {
      bf.PutInt(noteId);
    });

    bf.Put(CONST.PK_ETX, false);
    // NLog.log("ReqOfflineDelete", bf);
    return this.Send(bf);
  }

  /**
   * Builds and sends a request buffer to initiate a firmware upgrade.
   * @param {File} file
   * @param {string} version
   * @param {boolean} isCompressed
   * @returns
   */
  async ReqPenSwUpgrade(file: File, version: string, isCompressed: boolean) {
    const bf = new ByteUtil();

    const deviceName = this.penController.info.DeviceName;
    const deviceProtocolVersion = this.penController.info.ProtocolVersion;

    const fwdeviceName = Converter.toUTF8Array(deviceName);
    const fwVersion = Converter.toUTF8Array(version);

    const fileSize = file.size;

    const fwBf = new ByteUtil();

    const fwBuf = (await this.ReadFileAsync(file)) as ArrayBuffer;
    const fwBufView = new Uint8Array(fwBuf);
    fwBf.PutArray(fwBufView, fwBufView.length);

    let packetSize = 256;
    if (
      deviceName === "NSP-D100" ||
      deviceName === "NSP-D101" ||
      deviceName === "NSP-C200" ||
      deviceName === "NWP-F121" ||
      deviceName === "NWP-F121C"
    ) {
      packetSize = 64;
    }

    let isCompress = 0;
    // 24/11/07 FW팀 요청으로 모든 펜은 압축 없이 펌웨어 업데이트하도록 변경
    // if (parseFloat(deviceProtocolVersion) < 2.22) {
    //   if (isCompressed) {
    //     if (
    //       deviceName === 'NWP-F151' ||
    //       deviceName === 'NWP-F63' ||
    //       deviceName === 'NWP-F53MG' ||
    //       deviceName === 'NWP-F45' ||
    //       deviceName === 'NEP-E100' ||
    //       deviceName === 'NEP-E101' ||
    //       deviceName === 'NSP-D100' ||
    //       deviceName === 'NSP-D101' ||
    //       deviceName === 'NSP-C200' ||
    //       deviceName === 'NPP-P201'
    //     ) {
    //       isCompress = 0;
    //     } else {
    //       isCompress = 1;
    //     }
    //   }
    // } else {
    //   if (isCompressed) {
    //     if (!this.penController.info.IsSupportCompress) {
    //       isCompress = 0;
    //     } else {
    //       isCompress = 1;
    //     }
    //   }
    // }
    this.state.isFwCompress = !!isCompress;
    this.state.fwPacketSize = packetSize;
    this.state.fwFile = fwBf;

    bf.Put(CONST.PK_STX, false).Put(CMD.FIRMWARE_UPLOAD_REQUEST);

    bf.PutShort(42)
      .PutArray(fwdeviceName, 16)
      .PutArray(fwVersion, 16)
      .PutInt(fileSize)
      .PutInt(packetSize)
      .Put(isCompress) //패킷 압축 여부, 1이면 압축, 0이면 압축 X, response로 4가 뜰 경우, 압축지원하지않음.
      .Put(fwBf.GetCheckSumBF()); //압축 안된 파일의 전체 checkSum

    bf.Put(CONST.PK_ETX, false);
    NLog.log("ReqPenSwUpgrade", bf);
    return this.Send(bf);
  }

  /**
   * Builds and sends a request buffer to upload firmware data according to the pen-approved upgrade flow.
   * @param {number} offset
   * @param {Uint8Array} data
   * @param {number} status
   * @returns
   */
  async ReqPenSwUpload(offset: number, data: Uint8Array, status: number) {
    const bf = new ByteUtil();

    bf.Put(CONST.PK_STX, false).Put(CMD.FIRMWARE_PACKET_RESPONSE);

    if (status === FirmwareStatusType.STATUS_ERROR) {
      bf.Put(1);
    } else {
      const beforeCompressSize = data.length;
      let afterCompressSize = 0;
      let compressData: any;

      if (this.state.isFwCompress) {
        compressData = await this.Compress(data);
        afterCompressSize = compressData.length;
      } else {
        compressData = data;
        afterCompressSize = 0;
      }

      bf.Put(0) //ErrorCode ( 0 = 정상 )
        .PutShort(14 + compressData.length)
        .Put(0) //전송여부 0 : 1            //STATUS_END 이면 1로 바꾸는 것이 좋을까?
        .PutInt(offset)
        .Put(bf.GetCheckSumData(data))
        .PutInt(beforeCompressSize)
        .PutInt(afterCompressSize)
        .PutArray(compressData, compressData.length); //파일
    }

    bf.Put(CONST.PK_ETX, false);
    // NLog.log("ReqPenSwUpload", bf);
    return this.Send(bf);
  }

  /**
   * Builds and sends a request buffer to create a profile on the pen.
   * - Profiles require authorization via Neolab; currently uses fixed values.
   * @param {string} name
   * @param {string} password
   * @returns
   */
  ReqProfileCreate = (name: string, password: string) => {
    const bf = new ByteUtil();

    const profileName = Converter.toUTF8Array(name);
    const profilePassword = Converter.toUTF8Array(password);

    //프로파일 고정값
    const neoStudioProfileName = "neonote2";
    const neoStudioProfilePassword = [0xd3, 0x69, 0xde, 0xcd, 0xb6, 0xa, 0x96, 0x1f];
    const neoNoteProfileName = "neolab";
    const neoNoteProfilePassword = [0x6b, 0xca, 0x6b, 0x50, 0x5d, 0xec, 0xa7, 0x8c];
    const nameNeo = Converter.toUTF8Array(neoNoteProfileName);
    const passwordNeo = new Uint8Array(neoNoteProfilePassword);

    bf.Put(CONST.PK_STX, false).Put(CMD.PEN_PROFILE_REQUEST);

    bf.PutShort(21)
      .PutArray(nameNeo, 8)
      .Put(ProfileType.CreateProfile)
      .PutArray(passwordNeo, 8)
      .PutShort(Math.pow(2, 5)) //sector 크기
      .PutShort(Math.pow(2, 7)); //sector 개수

    bf.Put(CONST.PK_ETX, false);
    // NLog.log("ReqProfileCreate", bf);
    return this.Send(bf);
  };

  /**
   * Builds and sends a request buffer to delete a profile from the pen.
   * - Profiles require authorization via Neolab; currently uses fixed values.
   * @param {string} name
   * @param {string} password
   * @returns
   */
  ReqProfileDelete = (name: string, password: string) => {
    const bf = new ByteUtil();

    const profileName = Converter.toUTF8Array(name);
    const profilePassword = Converter.toUTF8Array(password);

    //프로파일 고정값
    const neoStudioProfileName = "neonote2";
    const neoStudioProfilePassword = [0xd3, 0x69, 0xde, 0xcd, 0xb6, 0xa, 0x96, 0x1f];
    const neoNoteProfileName = "neolab";
    const neoNoteProfilePassword = [0x6b, 0xca, 0x6b, 0x50, 0x5d, 0xec, 0xa7, 0x8c];
    const nameNeo = Converter.toUTF8Array(neoNoteProfileName);
    const passwordNeo = new Uint8Array(neoNoteProfilePassword);

    bf.Put(CONST.PK_STX, false).Put(CMD.PEN_PROFILE_REQUEST);

    bf.PutShort(17).PutArray(nameNeo, 8).Put(ProfileType.DeleteProfile).PutArray(passwordNeo, 8);

    bf.Put(CONST.PK_ETX, false);
    // NLog.log("ReqProfileDelete", bf);
    return this.Send(bf);
  };

  /**
   * Builds and sends a request buffer to request profile information from the pen.
   * - Profiles require authorization via Neolab; currently uses fixed values.
   * @param {string} name
   * @returns
   */
  ReqProfileInfo = (name: string) => {
    const bf = new ByteUtil();

    const profileName = Converter.toUTF8Array(name);

    //프로파일 고정값
    const neoStudioProfileName = "neonote2";
    const neoStudioProfilePassword = [0xd3, 0x69, 0xde, 0xcd, 0xb6, 0xa, 0x96, 0x1f];
    const neoNoteProfileName = "neolab";
    const neoNoteProfilePassword = [0x6b, 0xca, 0x6b, 0x50, 0x5d, 0xec, 0xa7, 0x8c];
    const nameNeo = Converter.toUTF8Array(neoNoteProfileName);
    const passwordNeo = new Uint8Array(neoNoteProfilePassword);

    bf.Put(CONST.PK_STX, false).Put(CMD.PEN_PROFILE_REQUEST);

    bf.PutShort(9).PutArray(nameNeo, 8).Put(ProfileType.InfoProfile);

    bf.Put(CONST.PK_ETX, false);
    // NLog.log("ReqProfileInfo", bf);
    return this.Send(bf);
  };

  /**
   * Builds and sends a request buffer to write profile data on the pen.
   * - Profiles require authorization via Neolab; currently uses fixed values.
   * @param {string} name
   * @param {string} password
   * @param {Array} keys
   * @param {Array} data
   * @returns
   */
  ReqProfileWriteValue = (name: string, password: string, data: { [key: string]: any }) => {
    // this.ReqProfileWriteValue("test","test",{"test": 123})

    const keyArray = [];
    const dataArray = [];
    for (const key in data) {
      const keyValue = Converter.toUTF8Array(key);
      keyArray.push(keyValue);
      const dataValue = Converter.toUTF8Array(data[key]);
      dataArray.push(dataValue);
    }

    const bf = new ByteUtil();

    let dataLength = 0;
    for (let i = 0; i < dataArray.length; i++) {
      dataLength += 16;
      dataLength += 2;
      dataLength += dataArray[i].length;
    }

    const length = 18 + dataLength;

    const profileName = Converter.toUTF8Array(name);
    const profilePassword = Converter.toUTF8Array(password);

    //프로파일 고정값
    const neoStudioProfileName = "neonote2";
    const neoStudioProfilePassword = [0xd3, 0x69, 0xde, 0xcd, 0xb6, 0xa, 0x96, 0x1f];
    const neoNoteProfileName = "neolab";
    const neoNoteProfilePassword = [0x6b, 0xca, 0x6b, 0x50, 0x5d, 0xec, 0xa7, 0x8c];
    const nameNeo = Converter.toUTF8Array(neoNoteProfileName);
    const passwordNeo = new Uint8Array(neoNoteProfilePassword);

    bf.Put(CONST.PK_STX, false).Put(CMD.PEN_PROFILE_REQUEST);

    bf.PutShort(length)
      .PutArray(nameNeo, 8)
      .Put(ProfileType.WriteProfileValue)
      .PutArray(passwordNeo, 8)
      .Put(dataArray.length);

    for (let i = 0; i < keyArray.length; i++) {
      bf.PutArray(keyArray[i], 16).PutShort(dataArray[i].length).PutArray(dataArray[i], dataArray[i].length);
    }

    bf.Put(CONST.PK_ETX, false);
    // NLog.log("ReqProfileWriteValue", bf);
    return this.Send(bf);
  };

  /**
   * Builds and sends a request buffer to read profile data from the pen.
   * - Profiles require authorization via Neolab; currently uses fixed values.
   * @param {string} name
   * @param {Array} keys
   * @returns
   */
  ReqProfileReadValue = (name: string, keys: string[]) => {
    const bf = new ByteUtil();
    const length = 10 + keys.length * 16;

    const profileName = Converter.toUTF8Array(name);

    //프로파일 고정값
    const neoStudioProfileName = "neonote2";
    const neoStudioProfilePassword = [0xd3, 0x69, 0xde, 0xcd, 0xb6, 0xa, 0x96, 0x1f];
    const neoNoteProfileName = "neolab";
    const neoNoteProfilePassword = [0x6b, 0xca, 0x6b, 0x50, 0x5d, 0xec, 0xa7, 0x8c];
    const nameNeo = Converter.toUTF8Array(neoNoteProfileName);
    const passwordNeo = new Uint8Array(neoNoteProfilePassword);

    bf.Put(CONST.PK_STX, false).Put(CMD.PEN_PROFILE_REQUEST);

    bf.PutShort(length).PutArray(nameNeo, 8).Put(ProfileType.ReadProfileValue).Put(keys.length);

    for (let i = 0; i < keys.length; i++) {
      const keyValue = Converter.toUTF8Array(keys[i]);
      bf.PutArray(keyValue, 16);
    }

    bf.Put(CONST.PK_ETX, false);
    // NLog.log("ReqProfileReadValue", bf);
    return this.Send(bf);
  };

  /**
   * Builds and sends a request buffer to delete profile data from the pen.
   * - Profiles require authorization via Neolab; currently uses fixed values.
   * @param {string} name
   * @param {string} password
   * @param {Array} keys
   * @returns
   */
  ReqProfileDeleteValue = (name: string, password: string, keys: string[]) => {
    const bf = new ByteUtil();
    const length = 18 + keys.length * 16;

    const profileName = Converter.toUTF8Array(name);
    const profilePassword = Converter.toUTF8Array(password);

    //프로파일 고정값
    const neoStudioProfileName = "neonote2";
    const neoStudioProfilePassword = [0xd3, 0x69, 0xde, 0xcd, 0xb6, 0xa, 0x96, 0x1f];
    const neoNoteProfileName = "neolab";
    const neoNoteProfilePassword = [0x6b, 0xca, 0x6b, 0x50, 0x5d, 0xec, 0xa7, 0x8c];
    const nameNeo = Converter.toUTF8Array(neoNoteProfileName);
    const passwordNeo = new Uint8Array(neoNoteProfilePassword);

    bf.Put(CONST.PK_STX, false).Put(CMD.PEN_PROFILE_REQUEST);

    bf.PutShort(length)
      .PutArray(nameNeo, 8)
      .Put(ProfileType.DeleteProfileValue)
      .PutArray(passwordNeo, 8)
      .Put(keys.length);

    for (let i = 0; i < keys.length; i++) {
      const keyValue = Converter.toUTF8Array(keys[i]);
      bf.PutArray(keyValue, 16);
    }

    bf.Put(CONST.PK_ETX, false);
    // NLog.log("ReqProfileDeleteValue", bf);
    return this.Send(bf);
  };

  OnDisconnected() {
    // console.log("TODO: Disconnect ")//
  }

  /**
   * Compresses data using zlib.
   * @param {Uint8Array} data
   * @returns
   */
  Compress = async (data: Uint8Array) => {
    const input = new Uint8Array(data);

    try {
      return await deflateAsync(input, 9);
    } catch (err) {
      NLog.log("zip error", err);
      throw err;
    }
  };

  /**
   * Async helper for reading a file (e.g., firmware update file).
   * @param file
   * @returns
   */
  ReadFileAsync = async (file: File) => {
    return new Promise((resolve, reject) => {
      let reader = new FileReader();

      reader.onload = () => {
        resolve(reader.result);
      };

      reader.onerror = reject;

      reader.readAsArrayBuffer(file);
    });
  };

  // MARK: Util
  /**
   * Delivers the built request buffer to the pen controller's handleWrite.
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
