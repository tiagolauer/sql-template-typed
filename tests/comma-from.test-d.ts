import type { Query, StrictQuery, QueryTypeError } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string };
  posts: { title: string; user_id: number };
  tags: { label: string };
}

type CommaJoinResolvesBothTables = Expect<
  Equal<
    Query<DB, 'select name, title from users, posts'>,
    { name: string; title: string }[]
  >
>;

type CommaJoinWithAliasesResolves = Expect<
  Equal<
    Query<DB, 'select u.name, p.title from users u, posts p'>,
    { name: string; title: string }[]
  >
>;

type ThreeTableCommaListResolves = Expect<
  Equal<
    Query<DB, 'select u.name, p.title, t.label from users u, posts p, tags t'>,
    { name: string; title: string; label: string }[]
  >
>;

type CommaListMixedWithJoinResolves = Expect<
  Equal<
    Query<
      DB,
      'select u.name, p.title, t.label from users u, posts p join tags t on t.label = p.title'
    >,
    { name: string; title: string; label: string }[]
  >
>;

type CommaJoinStarMergesAllTables = Expect<
  Equal<
    Query<DB, 'select * from users, tags'>,
    { id: number; name: string; label: string }[]
  >
>;

type StrictUnknownTableInCommaListSurfaces = Expect<
  Equal<
    StrictQuery<DB, 'select * from users, ghosts'>,
    QueryTypeError<'unknown table: ghosts'>[]
  >
>;

export type Assertions = [
  CommaJoinResolvesBothTables,
  CommaJoinWithAliasesResolves,
  ThreeTableCommaListResolves,
  CommaListMixedWithJoinResolves,
  CommaJoinStarMergesAllTables,
  StrictUnknownTableInCommaListSurfaces,
];
