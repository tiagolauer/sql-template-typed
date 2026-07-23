import type { Query, StrictRow, QueryTypeError } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string };
}

type SingleTrailingSemicolonIsFine = Expect<
  Equal<StrictRow<DB, 'select id from users;'>, { id: number }>
>;

type TrailingSemicolonWithSpaceIsFine = Expect<
  Equal<StrictRow<DB, 'select id from users; '>, { id: number }>
>;

type NoSemicolonIsFine = Expect<
  Equal<StrictRow<DB, 'select id from users'>, { id: number }>
>;

type SemicolonInsideLiteralIsFine = Expect<
  Equal<StrictRow<DB, "select id from users where name = 'a;b'">, { id: number }>
>;

type SemicolonInsideCommentIsFine = Expect<
  Equal<
    StrictRow<
      DB,
      `select id from users -- old query: select name from users;
`
    >,
    { id: number }
  >
>;

type NonTrailingSemicolonIsRejectedInStrictMode = Expect<
  Equal<
    StrictRow<DB, 'select id from users; select name from users'>,
    QueryTypeError<'multiple statements are not supported: found a semicolon before the end of the query'>
  >
>;

type NonStrictModeStillMergesNonTrailingSemicolon = Expect<
  Equal<Query<DB, 'select id from users; select name from users'>, { id: number }[]>
>;

export type Assertions = [
  SingleTrailingSemicolonIsFine,
  TrailingSemicolonWithSpaceIsFine,
  NoSemicolonIsFine,
  SemicolonInsideLiteralIsFine,
  SemicolonInsideCommentIsFine,
  NonTrailingSemicolonIsRejectedInStrictMode,
  NonStrictModeStillMergesNonTrailingSemicolon,
];
