import type {
  Trim,
  FirstWord,
  DropFirstWord,
  IsKeyword,
  Unquote,
  StripQualifier,
} from './string.js';

export interface Source {
  table: string;
  alias: string;
  nullable: boolean;
}

type ClauseBoundary =
  | 'where'
  | 'group'
  | 'order'
  | 'limit'
  | 'having'
  | 'offset'
  | 'fetch'
  | 'window'
  | 'union'
  | 'except'
  | 'intersect'
  | 'for';

type IsBoundary<Word extends string> = Lowercase<Word> extends ClauseBoundary
  ? true
  : false;

type TakeFromClause<S extends string, Accumulated extends string = ''> =
  S extends `${infer Head} ${infer Tail}`
    ? IsBoundary<Head> extends true
      ? Trim<Accumulated>
      : TakeFromClause<Tail, Accumulated extends '' ? Head : `${Accumulated} ${Head}`>
    : IsBoundary<S> extends true
      ? Trim<Accumulated>
      : Trim<Accumulated extends '' ? S : `${Accumulated} ${S}`>;

type JoinAfterOuter<
  Tail extends string,
  Joined extends boolean,
  Prev extends boolean,
> = IsKeyword<FirstWord<Tail>, 'join'> extends true
  ? { joined: Joined; prev: Prev; rest: DropFirstWord<Tail> }
  : IsKeyword<FirstWord<Tail>, 'outer'> extends true
    ? IsKeyword<FirstWord<DropFirstWord<Tail>>, 'join'> extends true
      ? { joined: Joined; prev: Prev; rest: DropFirstWord<DropFirstWord<Tail>> }
      : never
    : never;

type JoinPhrase<Head extends string, Tail extends string> =
  IsKeyword<Head, 'join'> extends true
    ? { joined: false; prev: false; rest: Tail }
    : IsKeyword<Head, 'inner'> extends true
      ? IsKeyword<FirstWord<Tail>, 'join'> extends true
        ? { joined: false; prev: false; rest: DropFirstWord<Tail> }
        : never
      : IsKeyword<Head, 'cross'> extends true
        ? IsKeyword<FirstWord<Tail>, 'join'> extends true
          ? { joined: false; prev: false; rest: DropFirstWord<Tail> }
          : never
        : IsKeyword<Head, 'left'> extends true
          ? JoinAfterOuter<Tail, true, false>
          : IsKeyword<Head, 'right'> extends true
            ? JoinAfterOuter<Tail, false, true>
            : IsKeyword<Head, 'full'> extends true
              ? JoinAfterOuter<Tail, true, true>
              : never;

type SplitAtFirstJoin<S extends string, Accumulated extends string = ''> =
  S extends `${infer Head} ${infer Tail}`
    ? JoinPhrase<Head, Tail> extends infer Phrase
      ? [Phrase] extends [never]
        ? SplitAtFirstJoin<Tail, Accumulated extends '' ? Head : `${Accumulated} ${Head}`>
        : Phrase extends {
              joined: infer Joined extends boolean;
              prev: infer Prev extends boolean;
              rest: infer Rest extends string;
            }
          ? { before: Trim<Accumulated>; joined: Joined; prev: Prev; after: Rest }
          : never
      : never
    : never;

type AliasOf<Segment extends string, Table extends string> =
  DropFirstWord<Segment> extends ''
    ? Table
    : FirstWord<DropFirstWord<Segment>> extends infer Next extends string
      ? IsKeyword<Next, 'on'> extends true
        ? Table
        : IsKeyword<Next, 'as'> extends true
          ? FirstWord<DropFirstWord<DropFirstWord<Segment>>> extends infer Aliased extends string
            ? Aliased extends ''
              ? Table
              : Aliased
            : Table
          : Next
      : Table;

type CleanIdentifier<Raw extends string> = Unquote<StripQualifier<Raw>>;

type SegmentToSource<Segment extends string, Nullable extends boolean> =
  CleanIdentifier<FirstWord<Segment>> extends infer Table extends string
    ? {
        table: Table;
        alias: Unquote<AliasOf<Segment, Table>>;
        nullable: Nullable;
      }
    : never;

type MarkNullable<Sources extends Source[]> = {
  [Index in keyof Sources]: {
    table: Sources[Index]['table'];
    alias: Sources[Index]['alias'];
    nullable: true;
  };
};

type CollectSources<
  S extends string,
  Nullable extends boolean,
  Accumulated extends Source[] = [],
> = SplitAtFirstJoin<S> extends infer Split
  ? [Split] extends [never]
    ? [...Accumulated, SegmentToSource<S, Nullable>]
    : Split extends {
          before: infer Before extends string;
          joined: infer Joined extends boolean;
          prev: infer Prev extends boolean;
          after: infer After extends string;
        }
      ? Prev extends true
        ? CollectSources<
            After,
            Joined,
            [...MarkNullable<Accumulated>, SegmentToSource<Before, true>]
          >
        : CollectSources<After, Joined, [...Accumulated, SegmentToSource<Before, Nullable>]>
      : [...Accumulated, SegmentToSource<S, Nullable>]
  : never;

export type ParseFromClause<AfterFrom extends string> = CollectSources<
  TakeFromClause<AfterFrom>,
  false
>;
