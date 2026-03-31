type PageInfo = {
  section: number;
  owner: number;
  book: number;
  page: number;
};

type PageInfo2 = {
  section: number;
  owner: number;
  note: number;
  page: number;
};

type PaperSize = {
  Xmin: number;
  Xmax: number;
  Ymin: number;
  Ymax: number;
};

type PaperBase = {
  Xmin: number;
  Ymin: number;
};

type Dot = {
  angle: object;
  color: number;
  dotType: number;
  f: number;
  pageInfo: PageInfo;
  penTipType: number;
  timeStamp: number;
  x: number;
  y: number;
};

type ScreenDot = {
  x: number;
  y: number;
};

type View = {
  width: number;
  height: number;
};

type Options = {
  filters: any;
};

type Paper = {
  section: number;
  owner: number;
  note: number;
  page: number;
  Time?: number;
  TimeDiff?: number;
};

type VersionInfo = {
  DeviceName: string;
  FirmwareVersion: string;
  ProtocolVersion: string;
  SubName: string;
  DeviceType: number;
  MacAddress: string;
  PressureSensorType: number;
  CompanyCode: number;
  ProductCode: number;
  ColorCode: number;
  IsSupportCompress: boolean;
};

type SettingInfo = {
  Locked: boolean;
  ResetCount: number;
  RetryCount: number;
  TimeStamp: number;
  AutoShutdownTime: number;
  MaxForce: number;
  Battery: number;
  UsedMem: number;
  UseOfflineData: boolean;
  AutoPowerOn: boolean;
  PenCapPower: boolean;
  HoverMode: boolean;
  Beep: boolean;
  PenSensitivity: number;
};

type DotErrorInfo = {
  ErrorType: number;
  Dot?: Dot;
  TimeStamp: number;
  ExtraData?: string;
  ImageProcessErrorInfo?: any;
};

export type {
  PageInfo,
  PageInfo2,
  PaperSize,
  PaperBase,
  Dot,
  ScreenDot,
  View,
  Options,
  VersionInfo,
  SettingInfo,
  DotErrorInfo,
  Paper,
};
