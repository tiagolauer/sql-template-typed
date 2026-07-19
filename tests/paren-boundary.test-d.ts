import type { Query } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string; created_at: Date };
  orders: { id: number; user_id: number; price: number };
}

type ScalarSubqueryKeepsSiblingColumns = Expect<
  Equal<
    Query<DB, 'select (select max(id) from orders) as m, name from users'>,
    { m: unknown; name: string }[]
  >
>;

type ScalarSubqueryNoAliasFallsBackToRawText = Expect<
  Equal<
    Query<DB, 'select (select max(id) from orders), name from users'>,
    { '(select max(id) from orders)': unknown; name: string }[]
  >
>;

type ParenthesizedArithmeticGroupResolvesAlias = Expect<
  Equal<
    Query<DB, 'select (price * 2) as total, id from orders'>,
    { total: unknown; id: number }[]
  >
>;

type FunctionArgWithFromKeywordResolvesAlias = Expect<
  Equal<
    Query<DB, 'select extract(year from created_at) as y, id from users'>,
    { y: unknown; id: number }[]
  >
>;

export type BehaviorLock = [
  ScalarSubqueryKeepsSiblingColumns,
  ScalarSubqueryNoAliasFallsBackToRawText,
  ParenthesizedArithmeticGroupResolvesAlias,
  FunctionArgWithFromKeywordResolvesAlias,
];
