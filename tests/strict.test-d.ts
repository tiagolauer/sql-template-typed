import { createTypedDb, ResultStatus } from '../src/index.js';
import type { StrictQuery, QueryTypeError, Query } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string };
}

type ValidStrictQueryResolvesRows = Expect<
  Equal<StrictQuery<DB, 'select id, name from users'>, { id: number; name: string }[]>
>;

type UnknownColumnIsTypeError = Expect<
  Equal<
    StrictQuery<DB, 'select missing from users'>,
    QueryTypeError<'unknown column: missing'>[]
  >
>;

type UnknownTableIsTypeError = Expect<
  Equal<
    StrictQuery<DB, 'select id from ghosts'>,
    QueryTypeError<'unknown table: ghosts'>[]
  >
>;

type LooseQueryStaysPermissive = Expect<
  Equal<Query<DB, 'select missing from users'>, { missing: unknown }[]>
>;

declare const strictDb: ReturnType<typeof createTypedDb<DB, { strict: true }>>;
declare const looseDb: ReturnType<typeof createTypedDb<DB, {}>>;

export async function strictClientSurfacesErrors() {
  const good = await strictDb.query('select id, name from users');
  if (good.status === ResultStatus.Ok) {
    type GoodValue = Expect<Equal<typeof good.value, { id: number; name: string }[]>>;
  }

  const bad = await strictDb.query('select missing from users');
  if (bad.status === ResultStatus.Ok) {
    type BadValue = Expect<
      Equal<typeof bad.value, QueryTypeError<'unknown column: missing'>[]>
    >;
  }
}

export async function looseClientStaysPermissive() {
  const result = await looseDb.query('select missing from users');
  if (result.status === ResultStatus.Ok) {
    type Value = Expect<Equal<typeof result.value, { missing: unknown }[]>>;
  }
}

export type StrictLock = [
  ValidStrictQueryResolvesRows,
  UnknownColumnIsTypeError,
  UnknownTableIsTypeError,
  LooseQueryStaysPermissive,
];
