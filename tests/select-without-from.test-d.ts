import type { Query, StrictQuery, QueryTypeError } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string };
}

type LiteralAliasResolvesKey = Expect<
  Equal<Query<DB, 'select 1 as one'>, { one: unknown }[]>
>;

type FunctionCallWithNoFromResolvesKey = Expect<
  Equal<Query<DB, 'select random_seed() as seed'>, { seed: unknown }[]>
>;

type StrictModeReportsNoFromClauseInsteadOfEmptyTableName = Expect<
  Equal<
    StrictQuery<DB, 'select 1 as one'>,
    QueryTypeError<'no FROM clause: cannot resolve column "1"'>[]
  >
>;

type OrdinaryFromQueryIsUnaffected = Expect<
  Equal<Query<DB, 'select id, name from users'>, { id: number; name: string }[]>
>;

type OrdinaryFromQueryStrictModeIsUnaffected = Expect<
  Equal<StrictQuery<DB, 'select id, name from users'>, { id: number; name: string }[]>
>;

export type BehaviorLock = [
  LiteralAliasResolvesKey,
  FunctionCallWithNoFromResolvesKey,
  StrictModeReportsNoFromClauseInsteadOfEmptyTableName,
  OrdinaryFromQueryIsUnaffected,
  OrdinaryFromQueryStrictModeIsUnaffected,
];
