// Defines
const CONST = {
  /** Packet start value (STX). */
  PK_STX: 0xc0,
  /** Packet end value (ETX). */
  PK_ETX: 0xc1,
  /** Escape value (DLE) used when STX/ETX appears in the packet payload. */
  PK_DLE: 0x7d,

  PK_POS_CMD: 1,
  PK_POS_RESULT: 2,
  PK_POS_LENG1: 2,
  PK_POS_LENG2: 3,

  PK_HEADER_SIZE: 3,

  DEF_LIMIT: 1000,
  DEF_GROWTH: 1000,
};

export default CONST;
