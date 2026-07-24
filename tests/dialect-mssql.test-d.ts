import type { Query, Params, StrictQuery, QueryTypeError } from '../src/index.js';

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

type TopClauseWithTies = Expect<
  Equal<
    Query<DB, 'select top 10 with ties id, name from users order by name desc'>,
    { id: number; name: string }[]
  >
>;

type TopClauseWithPercentAndTies = Expect<
  Equal<
    Query<DB, 'select top 10 percent with ties id from users order by name desc'>,
    { id: number }[]
  >
>;

type TopClauseWithParensAndTies = Expect<
  Equal<
    Query<DB, 'select top (10) with ties id from users order by name desc'>,
    { id: number }[]
  >
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

type MergeOutputClause = Expect<
  Equal<
    Query<
      DB,
      'merge into users as target using (values (@id, @name)) as source (id, name) on target.id = source.id when matched then update set target.name = source.name when not matched then insert (id, name) values (source.id, source.name) output inserted.id, inserted.name'
    >,
    { id: number; name: string }[]
  >
>;

type MergeActionPseudoColumn = Expect<
  Equal<
    Query<
      DB,
      'merge into users as target using (values (@id, @name)) as source (id, name) on target.id = source.id when matched then update set target.name = source.name output $action, inserted.id'
    >,
    { $action: 'INSERT' | 'UPDATE' | 'DELETE'; id: number }[]
  >
>;

type MergeWithoutTargetAlias = Expect<
  Equal<
    Query<
      DB,
      'merge into users using (values (@id)) as source (id) on users.id = source.id when not matched then insert (id) values (source.id) output inserted.id'
    >,
    { id: number }[]
  >
>;

type MergeNoOutputClauseIsEmptyRow = Expect<
  Equal<
    Query<
      DB,
      'merge into users as target using (values (@id, @name)) as source (id, name) on target.id = source.id when matched then update set target.name = source.name'
    >,
    Record<string, never>[]
  >
>;

type MergeStrictRejectsUnknownOutputColumn = Expect<
  Equal<
    StrictQuery<
      DB,
      'merge into users as target using (values (@id)) as source (id) on target.id = source.id when not matched then insert (id) values (source.id) output inserted.bogus'
    >,
    QueryTypeError<'unknown column: bogus'>[]
  >
>;

type MergeStrictRejectsUnknownTargetTable = Expect<
  Equal<
    StrictQuery<
      DB,
      'merge into ghosts as target using (values (@id)) as source (id) on target.id = source.id when not matched then insert (id) values (source.id) output inserted.id'
    >,
    QueryTypeError<'unknown table: ghosts'>[]
  >
>;

type MergeKeywordIsCaseInsensitive = Expect<
  Equal<
    Query<
      DB,
      'MERGE INTO users AS target USING (values (@id, @name)) AS source (id, name) ON target.id = source.id WHEN MATCHED THEN UPDATE SET target.name = source.name OUTPUT inserted.id'
    >,
    { id: number }[]
  >
>;

export type MssqlLock = [
  NamedParamSingle,
  NamedParamMultiple,
  NamedParamLike,
  BracketIdentifiers,
  TopClause,
  TopClauseWithParens,
  TopClauseWithPercent,
  TopClauseWithTies,
  TopClauseWithPercentAndTies,
  TopClauseWithParensAndTies,
  InsertOutputClause,
  UpdateOutputClause,
  DeleteOutputClause,
  NoOutputClauseIsEmptyRow,
  MergeOutputClause,
  MergeActionPseudoColumn,
  MergeWithoutTargetAlias,
  MergeNoOutputClauseIsEmptyRow,
  MergeStrictRejectsUnknownOutputColumn,
  MergeStrictRejectsUnknownTargetTable,
  MergeKeywordIsCaseInsensitive,
];
