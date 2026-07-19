import type { Query } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  orders: { id: number; user_id: number; price: number };
}

type MultiWordArithmeticExpressionResolvesAlias = Expect<
  Equal<Query<DB, 'select price * 2 as total from orders'>, { total: unknown }[]>
>;

type CastInsideAsKeywordDoesNotConfuseTheAliasBoundary = Expect<
  Equal<Query<DB, 'select cast(price as int) as p from orders'>, { p: unknown }[]>
>;

type SingleWordAliasStillWorks = Expect<
  Equal<Query<DB, 'select price as total from orders'>, { total: number }[]>
>;

type FunctionCallAliasStillWorks = Expect<
  Equal<Query<DB, 'select count(*) as total from orders'>, { total: number }[]>
>;

type BareAliasWithoutAsStillWorks = Expect<
  Equal<Query<DB, 'select price total from orders'>, { total: number }[]>
>;

export type BehaviorLock = [
  MultiWordArithmeticExpressionResolvesAlias,
  CastInsideAsKeywordDoesNotConfuseTheAliasBoundary,
  SingleWordAliasStillWorks,
  FunctionCallAliasStillWorks,
  BareAliasWithoutAsStillWorks,
];
