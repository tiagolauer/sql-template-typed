import type { Query } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface Wide {
  c01: number;
  c02: number;
  c03: number;
  c04: number;
  c05: number;
  c06: number;
  c07: number;
  c08: number;
  c09: number;
  c10: number;
  c11: number;
  c12: number;
  c13: number;
  c14: number;
  c15: number;
  c16: number;
  c17: number;
  c18: number;
  c19: number;
  c20: string;
}

interface DB {
  wide: Wide;
  users: { id: number };
}

type WideRows = Query<
  DB,
  'select c01, c02, c03, c04, c05, c06, c07, c08, c09, c10, c11, c12, c13, c14, c15, c16, c17, c18, c19, c20 from wide'
>;

type WideQueryResolvesEveryColumn = Expect<Equal<WideRows, Wide[]>>;

type DeepColumnTypeResolves = Expect<Equal<WideRows[number]['c20'], string>>;

type HundredColumnRows = Query<DB, 'select id as c001, id as c002, id as c003, id as c004, id as c005, id as c006, id as c007, id as c008, id as c009, id as c010, id as c011, id as c012, id as c013, id as c014, id as c015, id as c016, id as c017, id as c018, id as c019, id as c020, id as c021, id as c022, id as c023, id as c024, id as c025, id as c026, id as c027, id as c028, id as c029, id as c030, id as c031, id as c032, id as c033, id as c034, id as c035, id as c036, id as c037, id as c038, id as c039, id as c040, id as c041, id as c042, id as c043, id as c044, id as c045, id as c046, id as c047, id as c048, id as c049, id as c050, id as c051, id as c052, id as c053, id as c054, id as c055, id as c056, id as c057, id as c058, id as c059, id as c060, id as c061, id as c062, id as c063, id as c064, id as c065, id as c066, id as c067, id as c068, id as c069, id as c070, id as c071, id as c072, id as c073, id as c074, id as c075, id as c076, id as c077, id as c078, id as c079, id as c080, id as c081, id as c082, id as c083, id as c084, id as c085, id as c086, id as c087, id as c088, id as c089, id as c090, id as c091, id as c092, id as c093, id as c094, id as c095, id as c096, id as c097, id as c098, id as c099, id as c100 from users'>;

type HundredColumnQueryResolves = Expect<
  Equal<HundredColumnRows, { c001: number; c002: number; c003: number; c004: number; c005: number; c006: number; c007: number; c008: number; c009: number; c010: number; c011: number; c012: number; c013: number; c014: number; c015: number; c016: number; c017: number; c018: number; c019: number; c020: number; c021: number; c022: number; c023: number; c024: number; c025: number; c026: number; c027: number; c028: number; c029: number; c030: number; c031: number; c032: number; c033: number; c034: number; c035: number; c036: number; c037: number; c038: number; c039: number; c040: number; c041: number; c042: number; c043: number; c044: number; c045: number; c046: number; c047: number; c048: number; c049: number; c050: number; c051: number; c052: number; c053: number; c054: number; c055: number; c056: number; c057: number; c058: number; c059: number; c060: number; c061: number; c062: number; c063: number; c064: number; c065: number; c066: number; c067: number; c068: number; c069: number; c070: number; c071: number; c072: number; c073: number; c074: number; c075: number; c076: number; c077: number; c078: number; c079: number; c080: number; c081: number; c082: number; c083: number; c084: number; c085: number; c086: number; c087: number; c088: number; c089: number; c090: number; c091: number; c092: number; c093: number; c094: number; c095: number; c096: number; c097: number; c098: number; c099: number; c100: number }[]>
>;

export type DepthLock = [
  WideQueryResolvesEveryColumn,
  DeepColumnTypeResolves,
  HundredColumnQueryResolves,
];
