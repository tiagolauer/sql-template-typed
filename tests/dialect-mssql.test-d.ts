import type { Query, Params } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string; email: string };
}

type NamedParamSingle = Expect<
  Equal<Params<DB, 'select id from users where id = @id'>, [number]>
>;

type NamedParamMultiple = Expect<
  Equal<
    Params<DB, 'select id from users where id = @p1 and name = @p2'>,
    [number, string]
  >
>;

type NamedParamLike = Expect<
  Equal<Params<DB, 'select id from users where name like @name'>, [string]>
>;

type BracketIdentifiers = Expect<
  Equal<Query<DB, 'select [id], [name] from [users]'>, { id: number; name: string }[]>
>;

type TopClause = Expect<
  Equal<Query<DB, 'select top 10 id, name from users'>, { id: number; name: string }[]>
>;

type TopClauseWithParens = Expect<
  Equal<Query<DB, 'select top (5) id from users'>, { id: number }[]>
>;

type TopClauseWithPercent = Expect<
  Equal<Query<DB, 'select top 10 percent id from users'>, { id: number }[]>
>;

type InsertOutputClause = Expect<
  Equal<
    Query<DB, 'insert into users (name) output inserted.id values (@name)'>,
    { id: number }[]
  >
>;

type UpdateOutputClause = Expect<
  Equal<
    Query<DB, 'update users set name = @name output inserted.id where id = @id'>,
    { id: number }[]
  >
>;

type DeleteOutputClause = Expect<
  Equal<
    Query<DB, 'delete from users output deleted.id where id = @id'>,
    { id: number }[]
  >
>;

type NoOutputClauseIsEmptyRow = Expect<
  Equal<Query<DB, 'insert into users (name) values (@name)'>, Record<string, never>[]>
>;

export type MssqlLock = [
  NamedParamSingle,
  NamedParamMultiple,
  NamedParamLike,
  BracketIdentifiers,
  TopClause,
  TopClauseWithParens,
  TopClauseWithPercent,
  InsertOutputClause,
  UpdateOutputClause,
  DeleteOutputClause,
  NoOutputClauseIsEmptyRow,
];
