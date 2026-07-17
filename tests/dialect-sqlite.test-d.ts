import type { Query, Params } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string; email: string };
}

type PositionalParams = Expect<
  Equal<Params<DB, 'select id from users where id = ? and name = ?'>, [number, string]>
>;

type DoubleQuotedIdentifiers = Expect<
  Equal<Query<DB, 'select "id", "name" from "users"'>, { id: number; name: string }[]>
>;

type ReturningClause = Expect<
  Equal<
    Query<DB, 'insert into users (name) values (?) returning id, name'>,
    { id: number; name: string }[]
  >
>;

type LimitOffset = Expect<
  Equal<Query<DB, 'select id from users limit 10 offset 5'>, { id: number }[]>
>;

export type SqliteLock = [
  PositionalParams,
  DoubleQuotedIdentifiers,
  ReturningClause,
  LimitOffset,
];
