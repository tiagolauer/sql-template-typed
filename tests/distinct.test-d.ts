import type { Query, StrictRow } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: {
    id: number;
    name: string;
    team_id: number;
  };
}

type DistinctColumnsResolve = Expect<
  Equal<
    Query<DB, 'select distinct id, name from users'>,
    { id: number; name: string }[]
  >
>;

type DistinctUppercaseResolves = Expect<
  Equal<Query<DB, 'SELECT DISTINCT id FROM users'>, { id: number }[]>
>;

type AllKeywordStripped = Expect<
  Equal<Query<DB, 'select all id from users'>, { id: number }[]>
>;

type DistinctOnGroupStripped = Expect<
  Equal<
    Query<DB, 'select distinct on (team_id) id, name from users'>,
    { id: number; name: string }[]
  >
>;

type DistinctCombinesWithTop = Expect<
  Equal<Query<DB, 'select distinct top 5 id from users'>, { id: number }[]>
>;

type DistinctStar = Expect<
  Equal<
    Query<DB, 'select distinct * from users'>,
    { id: number; name: string; team_id: number }[]
  >
>;

type StrictDistinctResolves = Expect<
  Equal<StrictRow<DB, 'select distinct id from users'>, { id: number }>
>;

export type Assertions = [
  DistinctColumnsResolve,
  DistinctUppercaseResolves,
  AllKeywordStripped,
  DistinctOnGroupStripped,
  DistinctCombinesWithTop,
  DistinctStar,
  StrictDistinctResolves,
];
