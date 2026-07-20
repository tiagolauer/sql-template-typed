import type { Params } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string; active: boolean };
}

type ParenthesizedWhereGroupResolvesColumns = Expect<
  Equal<
    Params<DB, 'select id from users where (id = $1 or name = $2)'>,
    [number, string]
  >
>;

type NestedParenGroupsResolveColumns = Expect<
  Equal<
    Params<DB, 'select id from users where ((id = $1) and (name = $2))'>,
    [number, string]
  >
>;

type OnConflictUpdatePlaceholderTyped = Expect<
  Equal<
    Params<
      DB,
      'insert into users (name) values ($1) on conflict (name) do update set name = $2'
    >,
    [string, string]
  >
>;

type MultiRowValuesAllTyped = Expect<
  Equal<
    Params<DB, 'insert into users (id, name) values ($1, $2), ($3, $4)'>,
    [number, string, number, string]
  >
>;

type MultiRowValuesOutOfOrderBindByIndex = Expect<
  Equal<
    Params<DB, 'insert into users (id, name) values ($3, $4), ($1, $2)'>,
    [number, string, number, string]
  >
>;

type MultiRowSequentialPlaceholders = Expect<
  Equal<
    Params<DB, 'insert into users (id, name) values (?, ?), (?, ?)'>,
    [number, string, number, string]
  >
>;

type SingleGroupControlUnchanged = Expect<
  Equal<Params<DB, 'insert into users (name) values ($1) returning id'>, [string]>
>;

type MixedLiteralAndPlaceholderRows = Expect<
  Equal<
    Params<DB, "insert into users (id, name) values (1, $1), (2, $2)">,
    [string, string]
  >
>;

export type Assertions = [
  ParenthesizedWhereGroupResolvesColumns,
  NestedParenGroupsResolveColumns,
  OnConflictUpdatePlaceholderTyped,
  MultiRowValuesAllTyped,
  MultiRowValuesOutOfOrderBindByIndex,
  MultiRowSequentialPlaceholders,
  SingleGroupControlUnchanged,
  MixedLiteralAndPlaceholderRows,
];
