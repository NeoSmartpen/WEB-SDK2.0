const CMD = {
  /** Requests device version/info (first command after connecting to the pen). */
  VERSION_REQUEST: 0x01,
  /** Response for device version/info. */
  VERSION_RESPONSE: 0x81,

  /** Requests password input (usage depends on the device version/protocol). */
  PASSWORD_REQUEST: 0x02,
  /** Response for password input. */
  PASSWORD_RESPONSE: 0x82,

  /** Requests a password change (only available when connected using a password). */
  PASSWORD_CHANGE_REQUEST: 0x03,
  /** Response for password change. */
  PASSWORD_CHANGE_RESPONSE: 0x83,

  /** Requests pen setting information. */
  SETTING_INFO_REQUEST: 0x04,
  /** Response for pen setting information (see SettingInfo). */
  SETTING_INFO_RESPONSE: 0x84,

  /** Emitted when a low battery event occurs. */
  LOW_BATTERY_EVENT: 0x61,
  /** Emitted when the pen powers off (includes the reason). */
  SHUTDOWN_EVENT: 0x62,

  /** Requests a pen setting change. */
  SETTING_CHANGE_REQUEST: 0x05,
  /** Response for a pen setting change (success/failure). */
  SETTING_CHANGE_RESPONSE: 0x85,

  /** Requests real-time stroke data transmission. */
  ONLINE_DATA_REQUEST: 0x11,
  /** Response for real-time stroke data request. */
  ONLINE_DATA_RESPONSE: 0x91,

  /** Pen UP/DOWN event (timestamp, tip type, tip color). */
  ONLINE_PEN_UPDOWN_EVENT: 0x63,
  /** Paper info event for the currently used paper. */
  ONLINE_PAPER_INFO_EVENT: 0x64,
  /** Dot event (coordinates, tilt, pressure, etc.). */
  ONLINE_PEN_DOT_EVENT: 0x65,
  /** Dot error event (time delta, image brightness/exposure, NADC error code, etc.). */
  ONLINE_PEN_ERROR_EVENT: 0x68,

  /** Pen DOWN event (timestamp, tip type, tip color) with count field. */
  ONLINE_NEW_PEN_DOWN_EVENT: 0x69,
  /** Pen UP event (timestamp, dot/image counts) with count field. */
  ONLINE_NEW_PEN_UP_EVENT: 0x6a,
  /** Paper info event with count field. */
  ONLINE_NEW_PAPER_INFO_EVENT: 0x6b,
  /** Dot event with count field. */
  ONLINE_NEW_PEN_DOT_EVENT: 0x6c,
  /** Dot error event with count field. */
  ONLINE_NEW_PEN_ERROR_EVENT: 0x6d,
  /** Hover dot event (coordinates, tilt, etc.). */
  ONLINE_PEN_HOVER_EVENT: 0x6f,

  /** Requests the offline note list (section, owner, note). */
  OFFLINE_NOTE_LIST_REQUEST: 0x21,
  /** Response for the offline note list (section, owner, note). */
  OFFLINE_NOTE_LIST_RESPONSE: 0xa1,

  /** Requests the offline page list. */
  OFFLINE_PAGE_LIST_REQUEST: 0x22,
  /** Response for the offline page list. */
  OFFLINE_PAGE_LIST_RESPONSE: 0xa2,

  /** Requests offline stroke data transfer. */
  OFFLINE_DATA_REQUEST: 0x23,
  /** Response for offline stroke data request. */
  OFFLINE_DATA_RESPONSE: 0xa3,
  /** Offline stroke data packet (PEN -> APP). */
  OFFLINE_PACKET_REQUEST: 0x24,
  /** Offline packet response (APP -> PEN). */
  OFFLINE_PACKET_RESPONSE: 0xa4,

  /** Requests deletion of offline data (by note). */
  OFFLINE_DATA_DELETE_REQUEST: 0x25,
  /** Response for offline data deletion request. */
  OFFLINE_DATA_DELETE_RESPONSE: 0xa5,

  /** Requests firmware upload/update. */
  FIRMWARE_UPLOAD_REQUEST: 0x31,
  /** Response for firmware upload/update request. */
  FIRMWARE_UPLOAD_RESPONSE: 0xb1,
  /** Firmware packet request (PEN -> APP). */
  FIRMWARE_PACKET_REQUEST: 0x32,
  /** Firmware packet response/upload (APP -> PEN). */
  FIRMWARE_PACKET_RESPONSE: 0xb2,

  /** Requests profile operations (create/delete/info/read/write). */
  PEN_PROFILE_REQUEST: 0x41,
  /** Response for profile operations. */
  PEN_PROFILE_RESPONSE: 0xc1,

  // Only Touch and play
  RES_PDS: 0x73,
  REQ_LOG_INFO: 0x74,
  RES_LOG_INFO: 0xf4,
  REQ_LOG_DATA: 0x75,
  RES_LOG_DATA: 0xf5,
};

export default CMD;
