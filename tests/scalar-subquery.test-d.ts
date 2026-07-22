import type { Query, StrictQuery, QueryTypeError } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string };
  posts: { id: number; user_id: number; views: number };
}

type ScalarSubqueryFromTheIssueExample = Expect<
  Equal<
    Query<
      DB,
      'select (select count(*) from posts where posts.user_id = users.id) as post_count from users'
    >,
    { post_count: number }[]
  >
>;

type ScalarSubqueryAliasedColumnFromInnerTable = Expect<
  Equal<
    Query<DB, 'select id, (select views from posts) as v from users'>,
    { id: number; v: number | null }[]
  >
>;

type ScalarSubqueryNoAliasKeysByRawText = Expect<
  Equal<
    Query<DB, 'select (select count(*) from posts) from users'>,
    { '(select count(*) from posts)': number }[]
  >
>;

type MultiColumnSubqueryFallsBackToUnknown = Expect<
  Equal<
    Query<DB, 'select (select id, views from posts) as bad from users'>,
    { bad: unknown }[]
  >
>;

type StrictModeSurfacesTheInnerColumnError = Expect<
  Equal<
    StrictQuery<DB, 'select (select nope from posts) as x from users'>,
    QueryTypeError<'unknown column: nope'>[]
  >
>;

type PlainParenthesizedExpressionIsUnaffected = Expect<
  Equal<Query<DB, 'select (views * 2) as total, id from posts'>, { total: unknown; id: number }[]>
>;

type StrictModeRejectsMultiColumnSubquery = Expect<
  Equal<
    StrictQuery<DB, 'select (select id, views from posts) as bad from users'>,
    QueryTypeError<'scalar subquery must select exactly one column'>[]
  >
>;

export type ScalarSubqueryLock = [
  ScalarSubqueryFromTheIssueExample,
  ScalarSubqueryAliasedColumnFromInnerTable,
  ScalarSubqueryNoAliasKeysByRawText,
  MultiColumnSubqueryFallsBackToUnknown,
  StrictModeSurfacesTheInnerColumnError,
  PlainParenthesizedExpressionIsUnaffected,
  StrictModeRejectsMultiColumnSubquery,
];
