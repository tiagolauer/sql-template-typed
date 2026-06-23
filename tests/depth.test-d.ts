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
}

type WideRows = Query<
  DB,
  'select c01, c02, c03, c04, c05, c06, c07, c08, c09, c10, c11, c12, c13, c14, c15, c16, c17, c18, c19, c20 from wide'
>;

type WideQueryResolvesEveryColumn = Expect<Equal<WideRows, Wide[]>>;

type DeepColumnTypeResolves = Expect<Equal<WideRows[number]['c20'], string>>;

export type DepthLock = [WideQueryResolvesEveryColumn, DeepColumnTypeResolves];
