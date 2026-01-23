import PenController from './PenCotroller/PenController'
import PenHelper from './PenCotroller/PenHelper'
import Dot from './API/Dot'
import NoteServer from './API/NoteServer'
import PenMessageType, {SettingType} from './API/PenMessageType'

// export default PenController
export {PenController, Dot, NoteServer, PenHelper, PenMessageType, SettingType,}

export type {
  PageInfo,
  PageInfo2,
  PaperSize,
  PaperBase,
  ScreenDot,
  View,
  Options,
  VersionInfo,
  SettingInfo,
  DotErrorInfo,
  Paper,
} from './Util/type'
