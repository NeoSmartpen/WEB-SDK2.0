import * as Converter from "./Converter";
import CONST from "../PenCotroller/Const";

export default class ByteUtil {
  mBuffer: number[];
  mPosRead: number;

  constructor() {
    this.mBuffer = [];
    this.mPosRead = 0;
  }

  get Size() {
    return this.mBuffer.length;
  }

  Clear() {
    this.mPosRead = 0;
    this.mBuffer = []; //new Uint8Array(this.mBuffer.length);
  }

  /**
   * Appends a single byte to the buffer.
   * @param {number} input
   */
  PutByte(input: number) {
    this.mBuffer.push(input);
  }

  /**
   * Appends a byte to the buffer and applies escaping when needed.
   * @param {number} input
   * @param {boolean} escapeIfExist - if false, do not escape (used when writing STX/ETX framing bytes)
   * @returns
   */
  Put(input: number, escapeIfExist: boolean = true) {
    if (escapeIfExist) {
      let escDatas = this.Escape(input);

      let length = escDatas.length;
      for (let i = 0; i < length; ++i) {
        this.PutByte(escDatas[i]);
      }
    } else {
      this.PutByte(input);
    }

    return this;
  }

  /**
   * Appends a byte array to the buffer.
   * @param {array} inputs
   * @param {number} length
   * @returns
   */
  PutArray(inputs: Uint8Array, length: number) {
    let result = inputs.slice();
    for (let i = 0; i < length; ++i) {
      this.Put(result[i]);
    }
    return this;
  }

  /**
   * Appends zero bytes of the given length to the buffer.
   * @param {number} length
   * @returns
   */
  PutNull(length: number) {
    for (let i = 0; i < length; ++i) {
      this.Put(0x00);
    }

    return this;
  }

  /**
   * Appends a 4-byte integer value to the buffer.
   * @param {number} input
   * @returns
   */
  PutInt(input: number) {
    let arr = Converter.intToByteArray(input);
    return this.PutArray(arr, arr.length);
  }

  /**
   * Appends an 8-byte integer value to the buffer.
   * @param {number} input
   * @returns
   */
  PutLong(input: number) {
    let arr = Converter.longToByteArray(input);
    // NLog.log("put long", arr)
    return this.PutArray(arr, arr.length);
  }

  /**
   * Appends a 2-byte integer value to the buffer.
   * @param {number} input
   * @returns
   */
  PutShort(input: number) {
    let arr = Converter.shortToByteArray(input);
    return this.PutArray(arr, arr.length);
  }

  //
  // Get
  //
  /**
   * Reads bytes from the buffer and advances the read position.
   * @param {number} size
   * @returns
   */
  GetBytes(size?: number) {
    let length = 0;
    if (size) {
      length = size;
    } else {
      length = this.mBuffer.length - this.mPosRead;
    }
    let result = this.mBuffer.slice(this.mPosRead, this.mPosRead + length);
    this.mPosRead += length;
    const u8 = new Uint8Array(result);
    return u8;
  }

  /**
   * Reads a 1-byte value from the buffer.
   * @returns
   */
  GetByte() {
    return this.GetBytes(1)[0];
  }

  /**
   * Reads a 4-byte integer value from the buffer.
   * @returns
   */
  GetInt() {
    return Converter.byteArrayToInt(this.GetBytes(4));
  }

  /**
   * Reads a 2-byte integer value from the buffer.
   * @returns
   */
  GetShort() {
    return Converter.byteArrayToShort(this.GetBytes(2));
  }

  /**
   * Reads an 8-byte integer value from the buffer.
   * @returns
   */
  GetLong() {
    return Converter.byteArrayToLong(this.GetBytes(8));
  }

  /**
   * Reads a fixed-length string from the buffer.
   * @param {number} length
   * @returns
   */
  GetString(length: number) {
    const arr = Array.from(this.GetBytes(length));
    return String.fromCharCode(...arr).trim();
  }

  /**
   * Reads a byte slice from the given offset without changing the read position.
   * @param {number} offset
   * @param {number} size
   * @returns
   */
  GetBytesWithOffset(offset: number, size: number) {
    let packetSize = 0;
    if (offset + size > this.mBuffer.length) {
      packetSize = this.mBuffer.length - offset;
    } else {
      packetSize = size;
    }

    let result = this.mBuffer.slice(offset, offset + packetSize);

    const u8 = new Uint8Array(result);
    return u8;
  }

  /**
   * Calculates a checksum over the next `length` bytes starting from the current read position.
   * @param {number} length
   * @returns
   */
  GetCheckSum(length: number) {
    let bytes = this.mBuffer.slice(this.mPosRead, this.mPosRead + length);
    let CheckSum = 0;
    let bufSize = bytes.length;
    for (let i = 0; i < bufSize; ++i) {
      CheckSum += bytes[i] & 0xff;
    }

    return CheckSum & 0xff;
  }

  /**
   * Calculates a checksum over the entire buffer.
   * @returns
   */
  GetCheckSumBF() {
    let CheckSum = 0;
    for (let i = 0; i < this.mBuffer.length; i++) {
      CheckSum += this.mBuffer[i] & 0xff;
    }
    return CheckSum & 0xff;
  }

  /**
   * Calculates a checksum over the given data.
   * @param {Uint8Array} data
   * @returns
   */
  GetCheckSumData(data: Uint8Array) {
    let CheckSum = 0;
    for (let i = 0; i < data.length; i++) {
      CheckSum += data[i] & 0xff;
    }
    return CheckSum & 0xff;
  }

  /**
   * Converts the internal buffer to a Uint8Array.
   * @returns {array}
   */
  ToU8Array() {
    let u8 = new Uint8Array(this.mBuffer);
    return u8;
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
}

/**
 * Converts bytes to a hex string.
 * @param {array} bytes
 * @returns
 */
export function toHexString(bytes: Uint8Array) {
  const hex = Array.from(bytes)
    .map((x) => (x as any).toString(16).padStart(2, "0"))
    .join("");
  return hex;
}

/**
 * Converts section/owner into a 4-byte representation.
 * @param {number} section
 * @param {number} owner
 * @returns
 */
export function GetSectionOwnerByte(section: number, owner: number) {
  let ownerByte = Converter.intToByteArray(owner);
  ownerByte[3] = section & 0xff;
  return ownerByte;
}

// 4 byte array
/**
 * Converts a 4-byte value from a packet into section/owner.
 * @param {array} bytes
 * @returns {array}
 */
export function GetSectionOwner(bytes: Uint8Array) {
  let section = bytes[3] & 0xff;
  let owner = bytes[0] + bytes[1] * 256 + bytes[2] * 65536;
  return [section, owner];
}
