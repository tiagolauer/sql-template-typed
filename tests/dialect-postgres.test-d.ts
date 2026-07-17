import type { Query, Params } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string; email: string };
}

type NumberedParams = Expect<
  Equal<Params<DB, 'select id from users where id = $1 and name = $2'>, [number, string]>
>;

type DoubleQuotedIdentifiers = Expect<
  Equal<Query<DB, 'select "id", "name" from "users"'>, { id: number; name: string }[]>
>;

type ReturningClause = Expect<
  Equal<
    Query<DB, 'insert into users (name) values ($1) returning id, name'>,
    { id: number; name: string }[]
  >
>;

type IlikeOperator = Expect<
  Equal<Params<DB, 'select id from users where name ilike $1'>, [string]>
>;

export type PostgresLock = [
  NumberedParams,
  DoubleQuotedIdentifiers,
  ReturningClause,
  IlikeOperator,
];
