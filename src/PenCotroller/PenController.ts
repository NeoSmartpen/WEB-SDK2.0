import PenClientParserV2 from "./PenClientParserV2";
import * as Error from "../Model/SDKError";
import PenMessageType from "../API/PenMessageType";
import PenRequestV2 from "./PenRequestV2";
import Dot from "../API/Dot";
import { DotErrorInfo, VersionInfo } from "../Util/type";

type OnDot = (pencontroller: PenController, dot: Dot) => void;
type OnMessage = (pencontroller: PenController, msgType: number, args: any) => void;
type HandleWrite = (u8: Uint8Array) => void;

export default class PenController {
  mParserV2: PenClientParserV2;
  mClientV2: PenRequestV2;
  mClientV1: any;
  onDot: OnDot | null;
  onMessage: OnMessage | null;
  handleWrite: HandleWrite | null;
  Protocol: number;
  info: VersionInfo;
  device: any;

  constructor() {
    this.mParserV2 = new PenClientParserV2(this);
    this.mClientV2 = new PenRequestV2(this);
    this.onDot = null;
    this.onMessage = null;
    this.Protocol = 2;
    this.handleWrite = null;
    this.info = {} as VersionInfo;
  }

  /**
   *
   *
   * @param {callback} handledot
   * @param {callback} handlemessage
   * @memberof PenController
   */
  addCallback(handledot: OnDot, handlemessage: OnMessage) {
    this.onDot = handledot;
    this.onMessage = handlemessage;
  }

  // MARK: Step2 Add Write Pipe
  addWrite(handlewrite: HandleWrite) {
    this.handleWrite = handlewrite;
  }

  /**
   * Step3 Send Data from Pen
   * @param {array} buff - uint8array
   */
  putData(buff: Uint8Array) {
    if (this.Protocol === 1) {
      // this.mClientV1.ProtocolParse(buff, buff.Length);
    } else {
      this.mParserV2.ProtocolParse(buff);
    }
  }

  // Error process
  /**
   * Emits an error message when a dot error is detected.
   * - onMessage must be implemented for this method to take effect.
   * @param {any} args
   */
  onErrorDetected(args: DotErrorInfo) {
    this.onMessage!(this, PenMessageType.EVENT_DOT_ERROR, args);
  }

  //SDK Local logic
  // step1
  localprocessSetRTCTime() {
    this.SetRtcTime();
  }

  // Step2
  localProcessPenSettingInfo() {
    this.RequestPenStatus();
  }

  /**
   * Routes a request to the appropriate implementation based on the protocol version.
   * @param {any} requestV1
   * @param {any} requestV2
   * @returns
   */
  Request(requestV1: any, requestV2: any) {
    // if ( PenClient === null || !PenClient.Alive || Protocol === -1 ) {
    if (this.Protocol === -1) {
      throw new Error.SDKError("RequestIsUnreached");
    }

    if (this.Protocol === 1) {
      if (!requestV1) throw new Error.SDKError("UnaavailableRequest");
      return requestV1();
    } else {
      if (!requestV2) throw new Error.SDKError("UnaavailableRequest");
      return requestV2();
    }
  }

  // MARK: Request
  //Request Version Info
  /**
   * Returns the latest parsed version info.
   * @returns
   */
  RequestVersionInfo() {
    return this.mParserV2.penVersionInfo;
  }

  // Request
  /**
   * Requests a password change on the pen.
   * @param {string} oldone
   * @param {string} [newone=""]
   * @memberof PenController
   */
  SetPassword(oldone: string, newone = "") {
    if (newone === this.mClientV2.defaultConfig.DEFAULT_PASSWORD) {
      this.onMessage!(this, PenMessageType.PEN_ILLEGAL_PASSWORD_0000, null);
      return;
    } else {
      this.mParserV2.state.newPassword = newone;
    }
    this.Request(
      () => {},
      () => {
        this.mClientV2.ReqSetUpPassword(oldone, newone);
      }
    );
  }

  /**
   * Sends a password to the pen.
   * @param {string} password
   */
  InputPassword(password: string) {
    this.Request(
      () => this.mClientV1.ReqInputPassword(password),
      () => this.mClientV2.ReqInputPassword(password)
    );
  }

  /**
   * Requests pen setting information.
   */
  RequestPenStatus() {
    this.Request(
      () => this.mClientV1.ReqPenStatus(),
      () => this.mClientV2.ReqPenStatus()
    );
  }

  /**
   * Requests to update the pen's timestamp.
   * - Milliseconds since Jan 1, 1970 (currently sets to the current time).
   */
  SetRtcTime() {
    this.Request(null, () => this.mClientV2.ReqSetupTime());
  }

  /**
   * Requests to update the auto power-off time.
   * In minutes (v2.17 = 5 ~ 3600 // v2.18 = 1 ~ 3600).
   * @param {number} minute
   */
  SetAutoPowerOffTime(minute: number) {
    this.Request(
      () => this.mClientV1.ReqSetupPenAutoShutdownTime(minute),
      () => this.mClientV2.ReqSetupPenAutoShutdownTime(minute)
    );
  }

  /**
   * Requests to enable/disable power-off when the pen cap is closed.
   * @param {boolean} enable - on / off
   */
  SetPenCapPowerOnOffEnable(enable: boolean) {
    this.Request(null, () => this.mClientV2.ReqSetupPenCapPower(enable));
  }

  /**
   * Requests to enable/disable auto power-on when opening the cap or starting to write.
   * @param {boolean} enable - on / off
   */
  SetAutoPowerOnEnable(enable: boolean) {
    this.Request(
      () => this.mClientV1.ReqSetupPenAutoPowerOn(enable),
      () => this.mClientV2.ReqSetupPenAutoPowerOn(enable)
    );
  }

  /**
   * Requests to enable/disable beep sound.
   * @param {boolean} enable - on / off
   */
  SetBeepSoundEnable(enable: boolean) {
    this.Request(
      () => this.mClientV1.ReqSetupPenBeep(enable),
      () => this.mClientV2.ReqSetupPenBeep(enable)
    );
  }

  /**
   * Requests to enable/disable hover mode.
   * - Hover mode displays visual dots to preview the pen position before pen-down.
   * @param {boolean} enable - on / off
   */
  SetHoverEnable(enable: boolean) {
    this.Request(
      () => this.mClientV1.SetHoverEnable(enable),
      () => this.mClientV2.ReqSetupHoverMode(enable)
    );
  }

  /**
   * Requests to enable/disable offline data storage.
   * @param {boolean} enable - on / off
   */
  SetOfflineDataEnable(enable: boolean) {
    this.Request(null, () => this.mClientV2.ReqSetupOfflineData(enable));
  }

  /**
   * Requests to change the pen LED color.
   * @param {number} color - argb
   */
  SetColor(color: number) {
    this.Request(
      () => this.mClientV1.ReqSetupPenColor(color),
      () => this.mClientV2.ReqSetupPenColor(color)
    );
  }

  /**
   * Requests to change pen pressure sensitivity.
   * - Available only on models with an FSR pressure sensor.
   * @param {number} step - 0 ~ 4 (0 is most sensitive)
   */
  SetSensitivity(step: number) {
    this.Request(
      () => this.mClientV1.ReqSetupPenSensitivity(step),
      () => this.mClientV2.ReqSetupPenSensitivity(step)
    );
  }

  /**
   * Requests to initialize the pen disk.
   */
  RequestInitPenDisk() {
    this.Request(
      () => this.mClientV1.ReqInitPenDisk(),
      () => this.mClientV2.ReqInitPenDisk()
    );
  }

  /**
   * Requests real-time stroke data transmission for the specified notes.
   * @param {array} sections
   * @param {array} owners
   * @param {(array | null)}notes - if null, do not filter by note
   */
  RequestAvailableNotes(sections: number[], owners: number[], notes: number[] | null) {
    this.Request(
      () => this.mClientV1.ReqAddUsingNotes(sections, owners, notes),
      () => this.mClientV2.ReqAddUsingNotes(sections, owners, notes)
    );
  }

  // Offline List
  // setion or owner  = null : All Note
  /**
   * Requests the offline note list stored on the pen.
   * - If both section and owner are 0, requests all stored note IDs (max 64).
   * @param {number} section
   * @param {number} owner
   */
  RequestOfflineNoteList(section: number, owner: number) {
    this.Request(
      () => this.mClientV1.ReqOfflineDataList(),
      () => this.mClientV2.ReqOfflineNoteList(section, owner)
    );
  }

  /**
   * Requests the offline page list stored on the pen.
   * - Requests page IDs (max 128) for the note matching section, owner, and note.
   * @param {number} section
   * @param {number} owner
   * @param {number} note
   */
  RequestOfflinePageList(section: number, owner: number, note: number) {
    this.Request(
      () => this.mClientV1.ReqOfflineDataList(),
      () => this.mClientV2.ReqOfflinePageList(section, owner, note)
    );
  }

  // Offline Data
  /**
   * Requests offline stroke data by note ID or multiple page IDs.
   * @param {number} section
   * @param {number} owner
   * @param {number} note
   * @param {boolean} deleteOnFinished - true to delete transmitted data, false to keep it
   * @param {array} pages - if empty array, requests all pages in the note
   * @returns
   */
  RequestOfflineData(section: number, owner: number, note: number, deleteOnFinished: boolean = true, pages: any = []) {
    return this.Request(
      () => this.mClientV1.ReqOfflineData(),
      () => {
        return this.mClientV2.ReqOfflineData(section, owner, note, deleteOnFinished, pages);
      }
    );
  }

  /**
   * Requests deletion of offline data stored on the pen.
   * - Deletes by note ID, up to 64 notes.
   * @param {number} section
   * @param {number} owner
   * @param {array} notes
   */
  RequestOfflineDelete(section: number, owner: number, notes: number[]) {
    this.Request(
      () => this.mClientV1.ReqOfflineDelete(),
      () => {
        this.mClientV2.ReqOfflineDelete(section, owner, notes);
      }
    );
  }

  // Firmware Update
  /**
   * Initiates a firmware update by querying the pen.
   * @param {File} file
   * @param {string} version
   * @param {boolean} isCompressed
   */
  RequestFirmwareInstallation(file: File, version: string, isCompressed: boolean) {
    this.Request(
      () => this.mClientV1.ReqPenSwUpgrade(file),
      () => {
        this.mClientV2.ReqPenSwUpgrade(file, version, isCompressed);
      }
    );
  }

  /**
   * Uploads firmware data to the pen.
   * @param {number} offset
   * @param {Uint8Array} data
   * @param {number} status
   */
  RequestFirmwareUpload(offset: number, data: Uint8Array, status: number) {
    this.Request(
      () => this.mClientV1.ReqPenSwUpload(),
      () => this.mClientV2.ReqPenSwUpload(offset, data, status)
    );
  }

  /**
   * Requests profile creation on the pen.
   * - Profiles require authorization via Neolab; currently uses fixed values.
   * @param {string} name
   * @param {string} password
   */
  RequestProfileCreate = (name: string, password: string) => {
    this.Request(
      () => this.mClientV1.ReqProfileCreate(name, password),
      () => this.mClientV2.ReqProfileCreate(name, password)
    );
  };

  /**
   * Requests profile deletion on the pen.
   * - Profiles require authorization via Neolab; currently uses fixed values.
   * @param {string} name
   * @param {string} password
   */
  RequestProfileDelete = (name: string, password: string) => {
    this.Request(
      () => this.mClientV1.ReqProfileDelete(name, password),
      () => this.mClientV2.ReqProfileDelete(name, password)
    );
  };

  /**
   * Requests profile information from the pen.
   * - Profiles require authorization via Neolab; currently uses fixed values.
   * @param {string} name
   */
  RequestProfileInfo = (name: string) => {
    this.Request(
      () => this.mClientV1.ReqProfileInfo(name),
      () => this.mClientV2.ReqProfileInfo(name)
    );
  };

  /**
   * Requests writing profile data on the pen.
   * - Profiles require authorization via Neolab; currently uses fixed values.
   * @param {string} name
   * @param {string} password
   * @param {Array} keys
   * @param {Array} data
   */
  RequestProfileWriteValue = (name: string, password: string, data: { [key: string]: any }) => {
    // this.ReqProfileWriteValue("test","test",{
    //   "test": 123
    // })

    this.Request(
      () => this.mClientV1.ReqProfileWriteValue(name, password, data),
      () => this.mClientV2.ReqProfileWriteValue(name, password, data)
    );
  };

  /**
   * Requests reading profile data from the pen.
   * - Profiles require authorization via Neolab; currently uses fixed values.
   * @param {string} name
   * @param {Array} keys
   */
  RequestProfileReadValue = (name: string, keys: string[]) => {
    this.Request(
      () => this.mClientV1.ReqProfileReadValue(name, keys),
      () => this.mClientV2.ReqProfileReadValue(name, keys)
    );
  };

  /**
   * Requests deletion of profile data on the pen.
   * - Profiles require authorization via Neolab; currently uses fixed values.
   * @param {string} name
   * @param {string} password
   * @param {Array} keys
   */
  RequestProfileDeleteValue = (name: string, password: string, keys: string[]) => {
    this.Request(
      () => this.mClientV1.ReqProfileDeleteValue(name, password, keys),
      () => this.mClientV2.ReqProfileDeleteValue(name, password, keys)
    );
  };

  OnConnected() {
    if (this.Protocol !== 1) {
      this.mParserV2.state.first = true;
      this.mClientV2.ReqVersionTask();
    }
  }

  OnDisconnected() {
    if (this.Protocol === 1) this.mClientV1.OnDisconnected();
    else this.mClientV2.OnDisconnected();
    this.mParserV2.OnDisconnected();
    this.onMessage!(this, PenMessageType.PEN_DISCONNECTED, null);
  }
}
