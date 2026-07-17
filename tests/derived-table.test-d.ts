import type { Query } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string };
  posts: { id: number; user_id: number; title: string; views: number };
  comments: { id: number; post_id: number; body: string };
}

type SimpleDerivedTable = Expect<
  Equal<Query<DB, 'select id, title from (select id, title from posts) p'>, { id: number; title: string }[]>
>;

type DerivedTableWithWhereClauseInside = Expect<
  Equal<
    Query<DB, 'select id, title from (select id, title from posts where views > 100) p'>,
    { id: number; title: string }[]
  >
>;

type DerivedTableJoinedWithRealTable = Expect<
  Equal<
    Query<
      DB,
      'select u.name, p.title from users u join (select id, user_id, title from posts where views > 100) p on u.id = p.user_id'
    >,
    { name: string; title: string }[]
  >
>;

type DerivedTableContainingItsOwnJoin = Expect<
  Equal<
    Query<
      DB,
      'select title, body from (select p.title, c.body from posts p join comments c on p.id = c.post_id) merged'
    >,
    { title: string; body: string }[]
  >
>;

export type DerivedTableLock = [
  SimpleDerivedTable,
  DerivedTableWithWhereClauseInside,
  DerivedTableJoinedWithRealTable,
  DerivedTableContainingItsOwnJoin,
];
