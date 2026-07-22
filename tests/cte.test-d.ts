import type { Query, StrictQuery, QueryTypeError, Params } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string };
  posts: { id: number; user_id: number; title: string; views: number };
}

type SimpleCte = Expect<
  Equal<
    Query<DB, 'with popular as (select id, title from posts where views > 100) select id, title from popular'>,
    { id: number; title: string }[]
  >
>;

type CteWithJoinAgainstRealTable = Expect<
  Equal<
    Query<
      DB,
      'with popular as (select id, user_id, title from posts where views > 100) select u.name, p.title from users u join popular p on u.id = p.user_id'
    >,
    { name: string; title: string }[]
  >
>;

type MultipleCtesSecondReferencesFirst = Expect<
  Equal<
    Query<
      DB,
      'with popular as (select id, user_id, title from posts where views > 100), popular_titles as (select title from popular) select title from popular_titles'
    >,
    { title: string }[]
  >
>;

type CteStrictUnknownColumnIsTypeError = Expect<
  Equal<
    StrictQuery<DB, 'with bad as (select nope from posts) select nope from bad'>,
    QueryTypeError<'unknown column: nope'>[]
  >
>;

type WithRecursiveIsNotConfusedByTheKeyword = Expect<
  Equal<
    Query<DB, 'with recursive popular as (select id, title from posts) select id, title from popular'>,
    { id: number; title: string }[]
  >
>;

type WithRecursiveResolvesInStrictModeToo = Expect<
  Equal<
    StrictQuery<DB, 'with recursive popular as (select id, title from posts) select id, title from popular'>,
    { id: number; title: string }[]
  >
>;

type CteColumnListRenamesTheColumn = Expect<
  Equal<
    Query<DB, 'with popular(x) as (select id from posts) select x from popular'>,
    { x: number }[]
  >
>;

type CteMultiColumnListRenamesPositionally = Expect<
  Equal<
    Query<DB, 'with popular(x, y) as (select id, title from posts) select x, y from popular'>,
    { x: number; y: string }[]
  >
>;

type ParamAfterCteResolvesAgainstCteShape = Expect<
  Equal<
    Params<DB, 'with popular as (select id, views from posts) select id from popular where views > $1'>,
    [number]
  >
>;

type ParamAfterMultipleCtesStillResolves = Expect<
  Equal<
    Params<
      DB,
      'with popular as (select id, title, views from posts), popular_titles as (select title from popular) select title from popular_titles where title = $1'
    >,
    [string]
  >
>;

type ParamInsideCteBodyIsTypedAgainstItsOwnSource = Expect<
  Equal<
    Params<DB, 'with popular as (select id from posts where views > $1) select id from popular'>,
    [number]
  >
>;

type ParamsInsideAndAfterCteBodyBothTypeInTextualOrder = Expect<
  Equal<
    Params<
      DB,
      'with popular as (select id from posts where views > $1) select id from popular where id = $2'
    >,
    [number, number]
  >
>;

export type CteLock = [
  SimpleCte,
  CteWithJoinAgainstRealTable,
  MultipleCtesSecondReferencesFirst,
  CteStrictUnknownColumnIsTypeError,
  WithRecursiveIsNotConfusedByTheKeyword,
  WithRecursiveResolvesInStrictModeToo,
  CteColumnListRenamesTheColumn,
  CteMultiColumnListRenamesPositionally,
  ParamAfterCteResolvesAgainstCteShape,
  ParamAfterMultipleCtesStillResolves,
  ParamInsideCteBodyIsTypedAgainstItsOwnSource,
  ParamsInsideAndAfterCteBodyBothTypeInTextualOrder,
];
