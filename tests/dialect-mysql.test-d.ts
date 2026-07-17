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

type BacktickIdentifiers = Expect<
  Equal<
    Query<DB, `select \`id\`, \`name\` from \`users\``>,
    { id: number; name: string }[]
  >
>;

type BacktickAlias = Expect<
  Equal<
    Query<DB, `select \`name\` as \`username\` from \`users\``>,
    { username: string }[]
  >
>;

type NoReturningIsEmptyRow = Expect<
  Equal<Query<DB, 'insert into users (name) values (?)'>, Record<string, never>[]>
>;

type LimitClause = Expect<
  Equal<Query<DB, 'select id, name from users limit 10'>, { id: number; name: string }[]>
>;

export type MysqlLock = [
  PositionalParams,
  BacktickIdentifiers,
  BacktickAlias,
  NoReturningIsEmptyRow,
  LimitClause,
];
