import type { Query, Params } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  posts: { id: number; user_id: number; title: string; views: number };
}

type GroupByKeepsSelectShape = Expect<
  Equal<
    Query<DB, 'select user_id, count(*) from posts group by user_id'>,
    { user_id: number; count: number }[]
  >
>;

type HavingKeepsSelectShape = Expect<
  Equal<
    Query<DB, 'select user_id from posts group by user_id having count(*) > 1'>,
    { user_id: number }[]
  >
>;

type HavingParamIsTypedFromAggregate = Expect<
  Equal<
    Params<DB, 'select user_id from posts group by user_id having count(*) > $1'>,
    [number]
  >
>;

type OrderByKeepsSelectShape = Expect<
  Equal<Query<DB, 'select title from posts order by views desc'>, { title: string }[]>
>;

type LimitOffsetKeepsSelectShape = Expect<
  Equal<Query<DB, 'select id from posts limit 10 offset 5'>, { id: number }[]>
>;

type LimitOffsetParamsAreNumeric = Expect<
  Equal<Params<DB, 'select id from posts limit $1 offset $2'>, [number, number]>
>;

export type ClausesLock = [
  GroupByKeepsSelectShape,
  HavingKeepsSelectShape,
  HavingParamIsTypedFromAggregate,
  OrderByKeepsSelectShape,
  LimitOffsetKeepsSelectShape,
  LimitOffsetParamsAreNumeric,
];
