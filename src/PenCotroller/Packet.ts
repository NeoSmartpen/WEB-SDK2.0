import * as Converter from "../Util/Converter";
import * as NLog from "../Util/NLog";

class Packet {
  Cmd: number;
  Result: number;
  mIndex: number;
  Data: Uint8Array;
  length: number;

  constructor() {
    this.Cmd = 0;
    this.Result = 0;
    this.mIndex = 0;
    this.Data = new Uint8Array(0);
    this.length = 0;
  }

  GetChecksum() {
    if (this.Data.length === 0) {
      return 0;
    }
    let length = 0;
    if (arguments.length === 0) {
      length = this.Data.length - this.mIndex;
    } else {
      length = arguments[0];
    }
    let bytes = this.Data.slice(this.mIndex, this.mIndex + length);
    let checkSum = 0;
    bytes.forEach((b) => (checkSum += b & 0xff));
    // for (var b in bytes) {
    //     checkSum += (b & 0xFF);
    // }
    return checkSum & 0xff;
    // return (byte)(checkSum)
  }

  CheckMoreData() {
    return this.Data.length > this.mIndex;
  }

  Move(size: number) {
    this.mIndex += size;
  }

  /**
   * Reads a 1-byte value from the packet.
   * @returns
   */
  GetByte() {
    return this.GetBytes(1)[0];
  }

  /**
   * Reads bytes from the packet and advances the read index.
   * @param {(number | null)} arg
   * @returns
   */
  GetBytes(arg: number | null) {
    let size = 0;
    if (arg) {
      size = arg;
    } else {
      size = this.Data.length - this.mIndex;
    }
    let result = this.Data.slice(this.mIndex, this.mIndex + size);
    if (result.length === 0) {
      NLog.log("zero data");
    }
    this.Move(size);
    return result;
  }

  /**
   * Reads a 4-byte integer value from the packet.
   * @returns
   */
  GetInt() {
    return Converter.byteArrayToInt(this.GetBytes(4));
  }

  /**
   * Reads a 2-byte integer value from the packet.
   * @returns
   */
  GetShort() {
    let u8 = this.GetBytes(2);
    let v = Converter.byteArrayToShort(u8);
    return v;
  }

  /**
   * Reads an 8-byte integer value from the packet.
   * @returns
   */
  GetLong() {
    return Converter.byteArrayToLong(this.GetBytes(8));
  }

  /**
   * Reads a fixed-length string from the packet.
   * @param {number} length
   * @returns
   */
  GetString(length: number) {
    let bytes = this.GetBytes(length);
    const filteru8 = bytes.filter((byte) => byte !== 0x00);
    return new TextDecoder().decode(filteru8);
  }
}

class PacketBuilder {
  mPacket: Packet;

  constructor() {
    this.mPacket = new Packet();
  }

  cmd(cmd: number) {
    this.mPacket.Cmd = cmd;
    return this;
  }

  result(code: number) {
    this.mPacket.Result = code;
    return this;
  }

  data(data: Uint8Array) {
    this.mPacket.Data = data;
    return this;
  }

  length(length: number) {
    this.mPacket.length = length;
    return this;
  }

  Build() {
    return this.mPacket;
  }
}
export default Packet;
export { Packet, PacketBuilder };
