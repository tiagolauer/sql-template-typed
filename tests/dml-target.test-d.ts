import type { Query, Params } from '../src/index.js';

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

export type Assertions = [
  SchemaQualifiedInsertResolvesReturning,
  QuotedInsertTargetResolvesReturning,
  QualifiedAndQuotedInsertTargetResolves,
  SchemaQualifiedUpdateResolvesReturning,
  SchemaQualifiedDeleteResolvesReturning,
  SchemaQualifiedInsertParamsResolve,
  UnquotedInsertStillWorks,
];
