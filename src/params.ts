import type { Normalize, FirstWord, DropFirstWord, Trim, IsKeyword, ExtractParenGroup } from './string.js';
import type {
  Source,
  SchemaLike,
  ParseStatement,
  ResolveColumnLoose,
  ResolveCteContext,
  ResolveKey,
  AfterKeyword,
  SplitColumnList,
} from './parse.js';
import type { ParseWithClause } from './cte.js';

type Operator = '=' | '<>' | '!=' | '<' | '>' | '<=' | '>=';

type WordOperator = 'like' | 'ilike' | 'in' | 'between' | 'distinct';

type ForcedNumberKeyword = 'limit' | 'offset';

type IsOperator<Token extends string> = Token extends Operator
  ? true
  : Lowercase<Token> extends WordOperator
    ? true
    : false;

type IsTransparentToken<Token extends string> = Token extends '(' | ')' | ','
  ? true
  : Lowercase<Token> extends 'and' | 'or' | 'not' | 'is' | 'from'
    ? true
    : false;

type StripLeadingParens<S extends string> = S extends `(${infer Rest}`
  ? StripLeadingParens<Rest>
  : S;

type StripTrailingListPunctuation<S extends string> = S extends `${infer Rest})`
  ? StripTrailingListPunctuation<Rest>
  : S extends `${infer Rest},`
    ? StripTrailingListPunctuation<Rest>
    : S;

export type CleanScanToken<S extends string> = StripTrailingListPunctuation<StripLeadingParens<S>>;

export type CleanColumnToken<S extends string> = StripLeadingParens<S> extends infer Stripped extends string
  ? Stripped extends `${string}(${string}`
    ? Stripped
    : StripTrailingListPunctuation<Stripped>
  : never;

export type IsPlaceholder<Token extends string> = CleanScanToken<Token> extends '?'
  ? true
  : CleanScanToken<Token> extends `$$${string}` | `@@${string}` | '$' | '@'
    ? false
    : CleanScanToken<Token> extends `$${string}`
      ? true
      : CleanScanToken<Token> extends `@${string}`
        ? true
        : false;

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

interface DigitCounters {
  '0': [];
  '1': [unknown];
  '2': [unknown, unknown];
  '3': [unknown, unknown, unknown];
  '4': [unknown, unknown, unknown, unknown];
  '5': [unknown, unknown, unknown, unknown, unknown];
  '6': [unknown, unknown, unknown, unknown, unknown, unknown];
  '7': [unknown, unknown, unknown, unknown, unknown, unknown, unknown];
  '8': [unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown];
  '9': [unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown];
}

type TimesTen<Counter extends unknown[]> = [
  ...Counter,
  ...Counter,
  ...Counter,
  ...Counter,
  ...Counter,
  ...Counter,
  ...Counter,
  ...Counter,
  ...Counter,
  ...Counter,
];

type DigitsToCounter<S extends string, Accumulated extends unknown[] = []> =
  S extends `${infer Head}${infer Rest}`
    ? Head extends Digit
      ? DigitsToCounter<Rest, [...TimesTen<Accumulated>, ...DigitCounters[Head & keyof DigitCounters]]>
      : never
    : Accumulated;

type PlaceholderPosition<Token extends string> =
  CleanScanToken<Token> extends `$${infer Digits}`
    ? DigitsToCounter<Digits> extends [unknown, ...infer Position extends unknown[]]
      ? Position
      : never
    : never;

type SetSlot<
  Tuple extends unknown[],
  Position extends unknown[],
  Type,
> = Position extends [unknown, ...infer PositionRest extends unknown[]]
  ? Tuple extends [infer Head, ...infer TupleRest extends unknown[]]
    ? [Head, ...SetSlot<TupleRest, PositionRest, Type>]
    : [unknown, ...SetSlot<[], PositionRest, Type>]
  : Tuple extends [infer Head, ...infer TupleRest extends unknown[]]
    ? [Head & Type, ...TupleRest]
    : [Type];

type ParamType<
  DB extends SchemaLike,
  Sources extends Source[],
  Column extends string,
  Op extends string,
> = Lowercase<Op> extends ForcedNumberKeyword
  ? number
  : IsOperator<Op> extends true
    ? ResolveColumnLoose<DB, Sources, Column>
    : unknown;

type AddParam<
  Token extends string,
  Type,
  Indexed extends unknown[],
  Sequential extends unknown[],
> = PlaceholderPosition<Token> extends infer Position
  ? [Position] extends [never]
    ? { indexed: Indexed; sequential: [...Sequential, Type] }
    : Position extends unknown[]
      ? { indexed: SetSlot<Indexed, Position, Type>; sequential: Sequential }
      : never
  : never;

type ScanParamsRaw<
  S extends string,
  DB extends SchemaLike,
  Sources extends Source[],
  PrevPrev extends string = '',
  Prev extends string = '',
  Indexed extends unknown[] = [],
  Sequential extends unknown[] = [],
> = S extends `${infer Head} ${infer Tail}`
  ? IsPlaceholder<Head> extends true
    ? AddParam<Head, ParamType<DB, Sources, PrevPrev, Prev>, Indexed, Sequential> extends {
        indexed: infer NextIndexed extends unknown[];
        sequential: infer NextSequential extends unknown[];
      }
      ? ScanParamsRaw<Tail, DB, Sources, PrevPrev, Prev, NextIndexed, NextSequential>
      : never
    : IsTransparentToken<Head> extends true
      ? ScanParamsRaw<Tail, DB, Sources, PrevPrev, Prev, Indexed, Sequential>
      : ScanParamsRaw<Tail, DB, Sources, Prev, CleanColumnToken<Head>, Indexed, Sequential>
  : S extends ''
    ? { indexed: Indexed; sequential: Sequential }
    : IsPlaceholder<S> extends true
      ? AddParam<S, ParamType<DB, Sources, PrevPrev, Prev>, Indexed, Sequential>
      : { indexed: Indexed; sequential: Sequential };

type ScanParams<
  S extends string,
  DB extends SchemaLike,
  Sources extends Source[],
  PrevPrev extends string = '',
  Prev extends string = '',
  Indexed extends unknown[] = [],
  Sequential extends unknown[] = [],
> = ScanParamsRaw<S, DB, Sources, PrevPrev, Prev, Indexed, Sequential> extends {
  indexed: infer FinalIndexed extends unknown[];
  sequential: infer FinalSequential extends unknown[];
}
  ? [...FinalIndexed, ...FinalSequential]
  : never;

type ZipIntersectIndexed<A extends unknown[], B extends unknown[]> = A extends [
  infer AHead,
  ...infer ATail extends unknown[],
]
  ? B extends [infer BHead, ...infer BTail extends unknown[]]
    ? [AHead & BHead, ...ZipIntersectIndexed<ATail, BTail>]
    : A
  : B;

type InsertColumnList<S extends string> = AfterKeyword<S, 'into'> extends infer AfterInto extends string
  ? Trim<DropFirstWord<AfterInto>> extends `(${infer AfterOpen}`
    ? ExtractParenGroup<AfterOpen> extends { inner: infer Cols extends string; rest: infer Rest extends string }
      ? { columns: SplitColumnList<Cols>; rest: Trim<Rest> }
      : never
    : never
  : never;

type ColumnTypeAt<DB extends SchemaLike, Table extends string, Column extends string> = [
  ResolveKey<DB, Table>,
] extends [never]
  ? unknown
  : ResolveKey<DB, Table> extends infer TableKey extends keyof DB
    ? [ResolveKey<DB[TableKey], Column>] extends [never]
      ? unknown
      : ResolveKey<DB[TableKey], Column> extends infer ColumnKey extends keyof DB[TableKey]
        ? DB[TableKey][ColumnKey]
        : unknown
    : unknown;

type MatchInsertValues<
  DB extends SchemaLike,
  Table extends string,
  Columns extends string[],
  Values extends string[],
  Indexed extends unknown[],
  Sequential extends unknown[],
> = Values extends [infer Head extends string, ...infer ValuesTail extends string[]]
  ? Columns extends [infer ColumnHead extends string, ...infer ColumnsTail extends string[]]
    ? IsPlaceholder<Trim<Head>> extends true
      ? AddParam<Trim<Head>, ColumnTypeAt<DB, Table, ColumnHead>, Indexed, Sequential> extends {
          indexed: infer NextIndexed extends unknown[];
          sequential: infer NextSequential extends unknown[];
        }
        ? MatchInsertValues<DB, Table, ColumnsTail, ValuesTail, NextIndexed, NextSequential>
        : never
      : MatchInsertValues<DB, Table, ColumnsTail, ValuesTail, Indexed, Sequential>
    : { indexed: Indexed; sequential: Sequential }
  : { indexed: Indexed; sequential: Sequential };

type ScanValuesGroups<
  S extends string,
  DB extends SchemaLike,
  Table extends string,
  Columns extends string[],
  Indexed extends unknown[],
  Sequential extends unknown[],
> = Trim<S> extends `(${infer AfterOpen}`
  ? ExtractParenGroup<AfterOpen> extends { inner: infer Vals extends string; rest: infer Rest extends string }
    ? MatchInsertValues<DB, Table, Columns, SplitColumnList<Vals>, Indexed, Sequential> extends {
        indexed: infer NextIndexed extends unknown[];
        sequential: infer NextSequential extends unknown[];
      }
      ? Trim<Rest> extends `,${infer NextGroup}`
        ? ScanValuesGroups<NextGroup, DB, Table, Columns, NextIndexed, NextSequential>
        : { indexed: NextIndexed; sequential: NextSequential; rest: Trim<Rest> }
      : never
    : { indexed: Indexed; sequential: Sequential; rest: Trim<S> }
  : { indexed: Indexed; sequential: Sequential; rest: Trim<S> };

type InsertParamTypes<DB extends SchemaLike, Q extends string> = ParseStatement<Q> extends {
  sources: [infer Src extends Source];
}
  ? [InsertColumnList<Q>] extends [never]
    ? unknown[]
    : InsertColumnList<Q> extends { columns: infer Columns extends string[]; rest: infer AfterColumns extends string }
      ? AfterKeyword<AfterColumns, 'values'> extends infer AfterValues
        ? AfterValues extends string
          ? ScanValuesGroups<AfterValues, DB, Src['table'], Columns, [], []> extends {
              indexed: infer Indexed extends unknown[];
              sequential: infer Sequential extends unknown[];
              rest: infer Rest extends string;
            }
            ? ScanParams<Rest, DB, [Src], '', '', Indexed, Sequential>
            : unknown[]
          : unknown[]
        : unknown[]
      : unknown[]
  : unknown[];

type CteScanEntry = [name: string, query: string, columns: string[] | null];

type CteBodyParamScan<DB extends SchemaLike, Ctes extends CteScanEntry[]> = Ctes extends [
  infer Head extends CteScanEntry,
  ...infer Tail extends CteScanEntry[],
]
  ? [ParseStatement<Head[1]>] extends [never]
    ? CteBodyParamScan<DB, Tail>
    : ParseStatement<Head[1]> extends { sources: infer Sources extends Source[] }
      ? ScanParamsRaw<Head[1], DB, Sources> extends {
          indexed: infer HeadIndexed extends unknown[];
          sequential: infer HeadSequential extends unknown[];
        }
        ? CteBodyParamScan<DB, Tail> extends {
            indexed: infer TailIndexed extends unknown[];
            sequential: infer TailSequential extends unknown[];
          }
          ? { indexed: ZipIntersectIndexed<HeadIndexed, TailIndexed>; sequential: [...HeadSequential, ...TailSequential] }
          : never
        : never
      : CteBodyParamScan<DB, Tail>
  : { indexed: []; sequential: [] };

type StripDoubledAt<S extends string> = S extends `${infer Before}@@${infer After}`
  ? StripDoubledAt<`${Before}${After}`>
  : S;

export type UsedPlaceholderStyles<Q extends string> = Normalize<Q> extends infer Text extends string
  ?
      | (Text extends `${string}?${string}` ? 'question' : never)
      | (Text extends `${string}$${string}` ? 'dollar' : never)
      | (StripDoubledAt<Text> extends `${string}@${string}` ? 'at' : never)
  : never;

type OuterAndCteParams<
  DB extends SchemaLike,
  Q extends string,
  CteDB extends SchemaLike,
  EffectiveQuery extends string,
  Sources extends Source[],
> = ScanParamsRaw<EffectiveQuery, CteDB, Sources> extends {
  indexed: infer OuterIndexed extends unknown[];
  sequential: infer OuterSequential extends unknown[];
}
  ? [ParseWithClause<Normalize<Q>>] extends [never]
    ? [...OuterIndexed, ...OuterSequential]
    : ParseWithClause<Normalize<Q>> extends { ctes: infer Ctes extends CteScanEntry[] }
      ? CteBodyParamScan<CteDB, Ctes> extends {
          indexed: infer CteIndexed extends unknown[];
          sequential: infer CteSequential extends unknown[];
        }
        ? [...ZipIntersectIndexed<CteIndexed, OuterIndexed>, ...CteSequential, ...OuterSequential]
        : unknown[]
      : unknown[]
  : unknown[];

export type InferParams<DB extends SchemaLike, Q extends string> =
  IsKeyword<FirstWord<Normalize<Q>>, 'insert'> extends true
    ? InsertParamTypes<DB, Normalize<Q>>
    : ResolveCteContext<DB, Q, false> extends {
          db: infer CteDB extends SchemaLike;
          query: infer EffectiveQuery extends string;
        }
      ? [ParseStatement<EffectiveQuery>] extends [never]
        ? unknown[]
        : ParseStatement<EffectiveQuery> extends { sources: infer Sources extends Source[] }
          ? OuterAndCteParams<DB, Q, CteDB, EffectiveQuery, Sources>
          : unknown[]
      : unknown[];
