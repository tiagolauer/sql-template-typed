import type { Query } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string; email: string };
  posts: { id: number; title: string; user_id: number };
}

type QuotedColumns = Expect<
  Equal<Query<DB, 'select "id", "name" from users'>, { id: number; name: string }[]>
>;

type QuotedAlias = Expect<
  Equal<Query<DB, 'select "name" as "label" from users'>, { label: string }[]>
>;

type QuotedTable = Expect<
  Equal<Query<DB, 'select id from "users"'>, { id: number }[]>
>;

type SchemaQualifiedTable = Expect<
  Equal<Query<DB, 'select id, name from public.users'>, { id: number; name: string }[]>
>;

type TrailingSemicolon = Expect<
  Equal<Query<DB, 'select id, name from users;'>, { id: number; name: string }[]>
>;

type RightJoinNullsLeftSide = Expect<
  Equal<
    Query<DB, 'select u.name, p.title from users u right join posts p on u.id = p.user_id'>,
    { name: string | null; title: string }[]
  >
>;

type FullJoinNullsBothSides = Expect<
  Equal<
    Query<DB, 'select u.name, p.title from users u full join posts p on u.id = p.user_id'>,
    { name: string | null; title: string | null }[]
  >
>;

type QualifiedStar = Expect<
  Equal<
    Query<DB, 'select u.*, p.title from users u join posts p on u.id = p.user_id'>,
    { id: number; name: string; email: string; title: string }[]
  >
>;

type StarPlusColumn = Expect<
  Equal<
    Query<DB, 'select *, name from users'>,
    { id: number; name: string; email: string }[]
  >
>;

export type Tier3Lock = [
  QuotedColumns,
  QuotedAlias,
  QuotedTable,
  SchemaQualifiedTable,
  TrailingSemicolon,
  RightJoinNullsLeftSide,
  FullJoinNullsBothSides,
  QualifiedStar,
  StarPlusColumn,
];
