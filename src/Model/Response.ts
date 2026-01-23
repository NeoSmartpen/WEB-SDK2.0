import { ProfileType } from "../API/PenMessageType";
import { Packet } from "../PenCotroller/Packet";
import { toHexString, GetSectionOwner } from "../Util/ByteUtil";

/**
 * Parses a device version/info packet returned from the pen.
 * @param {Packet} packet
 * @returns
 */
export function VersionInfo(packet: Packet) {
  const DeviceName = packet.GetString(16);
  const FirmwareVersion = packet.GetString(16);
  const ProtocolVersion = packet.GetString(8);
  const SubName = packet.GetString(16);
  const DeviceType = packet.GetShort();
  const MacAddress = toHexString(packet.GetBytes(6));
  const PressureSensorType = packet.GetByte();
  const CompanyCode = packet.GetShort();
  const ProductCode = packet.GetByte();
  const ColorCode = packet.GetByte();

  let IsSupportCompress = false;
  if (parseFloat(ProtocolVersion) >= parseFloat("2.22")) {
    IsSupportCompress = packet.GetByte() === 1 ? true : false;
  }

  const versionInfo = {
    DeviceName,
    FirmwareVersion,
    ProtocolVersion,
    SubName,
    DeviceType,
    MacAddress,
    PressureSensorType,
    CompanyCode,
    ProductCode,
    ColorCode,
    IsSupportCompress,
  };
  return versionInfo;
}

/**
 * Parses a pen setting info packet returned from the pen.
 * @param {Packet} packet
 * @returns
 */
export function SettingInfo(packet: Packet) {
  // 비밀번호 사용 여부
  let lockyn = packet.GetByte() === 1;
  // 비밀번호 입력 최대 시도 횟수
  let pwdMaxRetryCount = packet.GetByte();
  // 비밀번호 입력 시도 횟수
  let pwdRetryCount = packet.GetByte();
  // 1970년 1월 1일부터 millisecond tick
  let time = packet.GetLong();
  // 사용하지 않을때 자동으로 전원이 종료되는 시간 (단위:분)
  let autoPowerOffTime = packet.GetShort();
  // 최대 필압
  let maxForce = packet.GetShort();
  // 현재 메모리 사용량
  let usedStorage = packet.GetByte();
  // 펜의 뚜껑을 닫아서 펜의 전원을 차단하는 기능 사용 여부
  let penCapOff = packet.GetByte() === 1;
  // 전원이 꺼진 펜에 필기를 시작하면 자동으로 펜의 켜지는 옵션 사용 여부
  let autoPowerON = packet.GetByte() === 1;
  // 사운드 사용여부
  let beep = packet.GetByte() === 1;
  // 호버기능 사용여부
  let hover = packet.GetByte() === 1;
  // 남은 배터리 수치
  let batteryLeft = packet.GetByte();
  // 오프라인 데이터 저장 기능 사용 여부
  let useOffline = packet.GetByte() === 1;
  // 필압 단계 설정 (0~4) 0이 가장 민감
  let fsrStep = packet.GetByte();

  let settingInfo = {
    Locked: lockyn,
    ResetCount: pwdMaxRetryCount,
    RetryCount: pwdRetryCount,
    TimeStamp: time,
    AutoShutdownTime: autoPowerOffTime,
    MaxForce: maxForce,
    Battery: batteryLeft,
    UsedMem: usedStorage,
    UseOfflineData: useOffline,
    AutoPowerOn: autoPowerON,
    PenCapPower: penCapOff,
    HoverMode: hover,
    Beep: beep,
    PenSensitivity: fsrStep,
  };

  return settingInfo;
}

/**
 * Parses the result of a pen setting change response returned from the pen.
 * @param {Packet} packet
 * @returns {{number, boolean}}
 */
export function SettingChange(packet: Packet) {
  let SettingType = packet.GetByte();
  let result = packet.GetByte() === 0;
  return { SettingType, result };
}

/**
 * Parses a password response packet returned from the pen.
 * @param {Packet} packet
 * @returns {{number, number, number}} - status: 0 = password required / 1 = no password required or password accepted / 2 = retry limit exceeded (reset) / 3 = error
 */
export function Password(packet: Packet) {
  let status = packet.GetByte();
  let RetryCount = packet.GetByte();
  let ResetCount = packet.GetByte();
  return { status, RetryCount, ResetCount };
}

/**
 * Parses a password change response packet returned from the pen.
 * @param {Packet} packet
 * @returns {{number, number, number}} - status: 0 = success / 1 = current password mismatch / 2 = retry limit exceeded (reset) / 3 = error
 */
export function PasswordChange(packet: Packet) {
  let RetryCount = packet.GetByte();
  let ResetCount = packet.GetByte();
  let status = packet.GetByte();
  return { RetryCount, ResetCount, status };
}

/**
 * Parses coordinate data for PDS.
 * @param {Packet} packet
 * @returns
 */
export function PDS(packet: Packet) {
  let owner = packet.GetInt();
  let section = packet.GetInt();
  let note = packet.GetInt();
  let page = packet.GetInt();
  let x = packet.GetInt();
  let y = packet.GetInt();
  let fx = packet.GetShort();
  let fy = packet.GetShort();
  return { section, owner, note, page, x, y, fx, fy };
}

/**
 * Parses a list of offline note info (section, owner, note) returned from the pen.
 * @param {Packet} packet
 * @returns {array}
 */
export function NoteList(packet: Packet) {
  let length = packet.GetShort();
  let result = [];
  for (var i = 0; i < length; i++) {
    let rb = packet.GetBytes(4);
    let [section, owner] = GetSectionOwner(rb);
    let note = packet.GetInt();

    result.push({ Section: section, Owner: owner, Note: note });
  }
  return result;
}

/**
 * Parses a list of offline page info returned from the pen.
 * @param {Packet} packet
 * @returns {array}
 */
export function PageList(packet: Packet) {
  let rb = packet.GetBytes(4);
  let [section, owner] = GetSectionOwner(rb);
  let note = packet.GetInt();
  let length = packet.GetShort();
  let pages = [];

  for (let i = 0; i < length; i++) {
    pages.push(packet.GetInt());
  }

  let result = {
    Section: section,
    Owner: owner,
    Note: note,
    Pages: pages,
  };
  return result;
}

/**
 * Parses profile data returned from the pen.
 * @param {Packet} packet
 * @returns - status: 0 = success / 1 = failure / 10 = profile already exists / 11 = profile not found / 21 = key not found in profile / 30 = unauthorized (wrong password) / 40 = invalid buffer size
 */
export const ProfileData = (packet: Packet) => {
  const profileName = packet.GetString(8);
  const ptype = packet.GetByte();

  let status = 0;
  let keyCount = 0;
  let key = "";
  let values = [];
  let result: any = {
    profileName: profileName,
    type: "0x" + ptype.toString(16),
  };

  switch (ptype) {
    case ProfileType.CreateProfile:
      status = packet.GetByte();

      result.status = "0x" + status.toString(16);
      break;
    case ProfileType.DeleteProfile:
      status = packet.GetByte();

      result.status = "0x" + status.toString(16);
      break;
    case ProfileType.InfoProfile:
      status = packet.GetByte();
      const allSectorCount = packet.GetShort();
      const sectorSize = packet.GetShort();
      const usedSectorCount = packet.GetShort();
      const usedKeySectorCount = packet.GetShort();

      result.status = "0x" + status.toString(16);
      (result.allSectorCount = allSectorCount),
        (result.sectorSize = sectorSize),
        (result.usedSectorCount = usedSectorCount),
        (result.usedKeySectorCount = usedKeySectorCount);
      break;
    case ProfileType.WriteProfileValue:
      keyCount = packet.GetByte();

      for (let i = 0; i < keyCount; i++) {
        key = packet.GetString(16);
        status = packet.GetByte();
        values.push({ key: key, status: "0x" + status.toString(16) });
      }

      (result.keyCount = keyCount), (result.values = values);
      break;
    case ProfileType.ReadProfileValue:
      keyCount = packet.GetByte();

      for (let i = 0; i < keyCount; i++) {
        key = packet.GetString(16);
        status = packet.GetByte();
        const dataLength = packet.GetShort();
        const data = packet.GetBytes(dataLength);
        const str = String.fromCharCode(...data);
        values.push({ key: key, status: "0x" + status.toString(16), dataLength: dataLength, data: str });
      }

      (result.keyCount = keyCount), (result.values = values);
      break;
    case ProfileType.DeleteProfileValue:
      keyCount = packet.GetByte();

      for (let i = 0; i < keyCount; i++) {
        key = packet.GetString(16);
        status = packet.GetByte();
        values.push({ key: key, status: "0x" + status.toString(16) });
      }

      (result.keyCount = keyCount), (result.values = values);
      break;
  }

  return result;
};
