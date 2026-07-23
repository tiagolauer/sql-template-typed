import type { Query, Params, StrictQuery, QueryTypeError } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: {
    id: number;
    name: string;
  };
  accounts: {
    id: number;
    user_id: number;
    balance: number;
  };
}

type SchemaQualifiedInsertResolvesReturning = Expect<
  Equal<
    Query<DB, 'insert into public.users (name) values ($1) returning id'>,
    { id: number }[]
  >
>;

type QuotedInsertTargetResolvesReturning = Expect<
  Equal<
    Query<DB, 'insert into "users" (name) values ($1) returning id'>,
    { id: number }[]
  >
>;

type QualifiedAndQuotedInsertTargetResolves = Expect<
  Equal<
    Query<DB, 'insert into "public"."users" (name) values ($1) returning id'>,
    { id: number }[]
  >
>;

type SchemaQualifiedUpdateResolvesReturning = Expect<
  Equal<
    Query<DB, 'update public.users set name = $1 where id = $2 returning id, name'>,
    { id: number; name: string }[]
  >
>;

type SchemaQualifiedDeleteResolvesReturning = Expect<
  Equal<
    Query<DB, 'delete from "public".users where id = $1 returning name'>,
    { name: string }[]
  >
>;

type SchemaQualifiedInsertParamsResolve = Expect<
  Equal<Params<DB, 'insert into public.users (name) values ($1)'>, [string]>
>;

type UnquotedInsertStillWorks = Expect<
  Equal<
    Query<DB, 'insert into users (name) values ($1) returning id'>,
    { id: number }[]
  >
>;

type UpdateFromRegistersTheExtraTableAsASource = Expect<
  Equal<
    StrictQuery<
      DB,
      'update users set name = name from accounts where accounts.user_id = users.id and accounts.balance > 100 returning users.id'
    >,
    { id: number }[]
  >
>;

type DeleteUsingRegistersTheExtraTableAsASource = Expect<
  Equal<
    StrictQuery<
      DB,
      'delete from users using accounts where accounts.user_id = users.id and accounts.balance < 0 returning users.id'
    >,
    { id: number }[]
  >
>;

type UpdateFromStillRejectsATrulyUnknownAlias = Expect<
  Equal<
    StrictQuery<
      DB,
      'update users set name = name from accounts where ghosts.id = users.id returning users.id'
    >,
    QueryTypeError<'unknown alias: ghosts'>[]
  >
>;

type UpdateWithoutFromIsUnaffected = Expect<
  Equal<Query<DB, 'update users set name = $1 where id = $2'>, Record<string, never>[]>
>;

export type Assertions = [
  SchemaQualifiedInsertResolvesReturning,
  QuotedInsertTargetResolvesReturning,
  QualifiedAndQuotedInsertTargetResolves,
  SchemaQualifiedUpdateResolvesReturning,
  SchemaQualifiedDeleteResolvesReturning,
  SchemaQualifiedInsertParamsResolve,
  UnquotedInsertStillWorks,
  UpdateFromRegistersTheExtraTableAsASource,
  DeleteUsingRegistersTheExtraTableAsASource,
  UpdateFromStillRejectsATrulyUnknownAlias,
  UpdateWithoutFromIsUnaffected,
];
