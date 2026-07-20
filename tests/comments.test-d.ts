import type { Query, StrictRow, Params } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: {
    id: number;
    name: string;
    note: string;
  };
}

type LineCommentInsideSelectList = Expect<
  Equal<
    Query<
      DB,
      `select id, -- pick id
name from users`
    >,
    { id: number; name: string }[]
  >
>;

type LineCommentWithCommaDoesNotSplit = Expect<
  Equal<
    Query<
      DB,
      `select id, -- a, b
name from users`
    >,
    { id: number; name: string }[]
  >
>;

type TrailingLineCommentAfterTableIsNotAlias = Expect<
  Equal<
    Query<
      DB,
      `select u.id from users u -- note
`
    >,
    { id: number }[]
  >
>;

type BlockCommentStripped = Expect<
  Equal<Query<DB, 'select /* pick */ id from users'>, { id: number }[]>
>;

type BlockCommentWithQuoteStripped = Expect<
  Equal<Query<DB, "select id /* don't */ from users">, { id: number }[]>
>;

type LineCommentWithQuoteStripped = Expect<
  Equal<
    Query<
      DB,
      `select id -- don't pick more
from users`
    >,
    { id: number }[]
  >
>;

type LiteralContainingCommentMarkersSurvives = Expect<
  Equal<Query<DB, "select id from users where note = '-- /* x */'">, { id: number }[]>
>;

type PlaceholderInsideCommentIgnored = Expect<
  Equal<
    Params<
      DB,
      `select id from users where id = $1 -- and name = $2
`
    >,
    [number]
  >
>;

type StrictModeUnaffectedByComments = Expect<
  Equal<
    StrictRow<
      DB,
      `select id, /* keep */ name from users`
    >,
    { id: number; name: string }
  >
>;

export type Assertions = [
  LineCommentInsideSelectList,
  LineCommentWithCommaDoesNotSplit,
  TrailingLineCommentAfterTableIsNotAlias,
  BlockCommentStripped,
  BlockCommentWithQuoteStripped,
  LineCommentWithQuoteStripped,
  LiteralContainingCommentMarkersSurvives,
  PlaceholderInsideCommentIgnored,
  StrictModeUnaffectedByComments,
];
