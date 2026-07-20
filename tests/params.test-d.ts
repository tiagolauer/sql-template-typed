import { createTypedDb } from '../src/index.js';
import type { Params } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string; active: boolean };
  posts: { id: number; user_id: number; views: number };
}

type SingleParam = Expect<
  Equal<Params<DB, 'select id from users where id = $1'>, [number]>
>;

type TwoParams = Expect<
  Equal<Params<DB, 'select id from users where id = $1 and name = $2'>, [number, string]>
>;

type PositionalParams = Expect<
  Equal<Params<DB, 'select id from users where id = ? and active = ?'>, [number, boolean]>
>;

type NoParams = Expect<Equal<Params<DB, 'select id, name from users'>, []>>;

type UpdateParams = Expect<
  Equal<Params<DB, 'update users set name = $1 where id = $2'>, [string, number]>
>;

type DeleteParams = Expect<
  Equal<Params<DB, 'delete from users where id = $1'>, [number]>
>;

type JoinQualifiedParam = Expect<
  Equal<
    Params<
      DB,
      'select u.id from users u join posts p on u.id = p.user_id where p.views > $1'
    >,
    [number]
  >
>;

type InsertValuesParamsMatchColumnList = Expect<
  Equal<Params<DB, 'insert into users (name) values ($1)'>, [string]>
>;

type InsertValuesParamsMatchMultipleColumns = Expect<
  Equal<Params<DB, 'insert into users (name, active) values ($1, $2)'>, [string, boolean]>
>;

type InsertWithoutColumnListIsFlexible = Expect<
  Equal<Params<DB, 'insert into users values ($1, $2, $3)'>, unknown[]>
>;

declare const db: ReturnType<typeof createTypedDb<DB>>;

export async function paramCallSites() {
  await db.query('select id from users where id = $1', 1);

  // @ts-expect-error the query expects one numeric param
  await db.query('select id from users where id = $1');

  // @ts-expect-error the param must be a number, not a string
  await db.query('select id from users where id = $1', 'nope');

  // @ts-expect-error only one param is expected
  await db.query('select id from users where id = $1', 1, 2);
}

export type ParamLock = [
  SingleParam,
  TwoParams,
  PositionalParams,
  NoParams,
  UpdateParams,
  DeleteParams,
  JoinQualifiedParam,
  InsertValuesParamsMatchColumnList,
  InsertValuesParamsMatchMultipleColumns,
  InsertWithoutColumnListIsFlexible,
];
