import type { Query, StrictQuery, Params, QueryTypeError } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string };
}

type UppercaseTableAndColumnResolve = Expect<
  Equal<Query<DB, 'SELECT ID FROM USERS'>, { ID: number }[]>
>;

type MixedCaseTableResolves = Expect<
  Equal<Query<DB, 'select id, NAME from Users'>, { id: number; NAME: string }[]>
>;

type MixedCaseCteResolves = Expect<
  Equal<
    Query<DB, 'with Totals as (select id from users) select id from totals'>,
    { id: number }[]
  >
>;

type QualifiedUppercaseColumnResolves = Expect<
  Equal<Query<DB, 'select U.ID from users U'>, { ID: number }[]>
>;

type StarOnUppercaseTableUsesSchemaKeys = Expect<
  Equal<Query<DB, 'select * from USERS'>, { id: number; name: string }[]>
>;

type StrictUppercaseResolves = Expect<
  Equal<StrictQuery<DB, 'SELECT ID FROM USERS'>, { ID: number }[]>
>;

type StrictStillRejectsTrulyUnknownColumn = Expect<
  Equal<
    StrictQuery<DB, 'SELECT MISSING FROM USERS'>,
    QueryTypeError<'unknown column: MISSING'>[]
  >
>;

type UppercaseParamColumnResolves = Expect<
  Equal<Params<DB, 'select id from USERS where ID = $1'>, [number]>
>;

type UppercaseInsertParamsResolve = Expect<
  Equal<Params<DB, 'INSERT INTO USERS (NAME) VALUES ($1)'>, [string]>
>;

export type Assertions = [
  UppercaseTableAndColumnResolve,
  MixedCaseTableResolves,
  MixedCaseCteResolves,
  QualifiedUppercaseColumnResolves,
  StarOnUppercaseTableUsesSchemaKeys,
  StrictUppercaseResolves,
  StrictStillRejectsTrulyUnknownColumn,
  UppercaseParamColumnResolves,
  UppercaseInsertParamsResolve,
];
