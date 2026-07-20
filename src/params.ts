import type { Normalize, FirstWord, DropFirstWord, Trim, IsKeyword, ExtractParenGroup } from './string.js';
import type {
  Source,
  SchemaLike,
  ParseStatement,
  ResolveColumnLoose,
  ResolveCteContext,
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

type CleanPlaceholderToken<S extends string> = StripTrailingListPunctuation<StripLeadingParens<S>>;

type IsPlaceholder<Token extends string> = CleanPlaceholderToken<Token> extends '?'
  ? true
  : CleanPlaceholderToken<Token> extends `$$${string}` | `@@${string}` | '$' | '@'
    ? false
    : CleanPlaceholderToken<Token> extends `$${string}`
      ? true
      : CleanPlaceholderToken<Token> extends `@${string}`
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
  CleanPlaceholderToken<Token> extends `$${infer Digits}`
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

type ScanParams<
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
      ? ScanParams<Tail, DB, Sources, PrevPrev, Prev, NextIndexed, NextSequential>
      : never
    : IsTransparentToken<Head> extends true
      ? ScanParams<Tail, DB, Sources, PrevPrev, Prev, Indexed, Sequential>
      : ScanParams<Tail, DB, Sources, Prev, Head, Indexed, Sequential>
  : S extends ''
    ? [...Indexed, ...Sequential]
    : IsPlaceholder<S> extends true
      ? AddParam<S, ParamType<DB, Sources, PrevPrev, Prev>, Indexed, Sequential> extends {
          indexed: infer NextIndexed extends unknown[];
          sequential: infer NextSequential extends unknown[];
        }
        ? [...NextIndexed, ...NextSequential]
        : never
      : [...Indexed, ...Sequential];

type InsertColumnList<S extends string> = AfterKeyword<S, 'into'> extends infer AfterInto extends string
  ? Trim<DropFirstWord<AfterInto>> extends `(${infer AfterOpen}`
    ? ExtractParenGroup<AfterOpen> extends { inner: infer Cols extends string; rest: infer Rest extends string }
      ? { columns: SplitColumnList<Cols>; rest: Trim<Rest> }
      : never
    : never
  : never;

type InsertValuesGroup<S extends string> = AfterKeyword<S, 'values'> extends infer AfterValues extends string
  ? Trim<AfterValues> extends `(${infer AfterOpen}`
    ? ExtractParenGroup<AfterOpen> extends { inner: infer Vals extends string }
      ? Vals
      : never
    : never
  : never;

type ColumnTypeAt<DB extends SchemaLike, Table extends string, Column extends string> =
  Table extends keyof DB
    ? Column extends keyof DB[Table]
      ? DB[Table][Column]
      : unknown
    : unknown;

type MatchInsertValueTypes<
  DB extends SchemaLike,
  Table extends string,
  Columns extends string[],
  Values extends string[],
  Indexed extends unknown[] = [],
  Sequential extends unknown[] = [],
> = Values extends [infer Head extends string, ...infer ValuesTail extends string[]]
  ? Columns extends [infer ColumnHead extends string, ...infer ColumnsTail extends string[]]
    ? IsPlaceholder<Trim<Head>> extends true
      ? AddParam<Trim<Head>, ColumnTypeAt<DB, Table, ColumnHead>, Indexed, Sequential> extends {
          indexed: infer NextIndexed extends unknown[];
          sequential: infer NextSequential extends unknown[];
        }
        ? MatchInsertValueTypes<DB, Table, ColumnsTail, ValuesTail, NextIndexed, NextSequential>
        : never
      : MatchInsertValueTypes<DB, Table, ColumnsTail, ValuesTail, Indexed, Sequential>
    : [...Indexed, ...Sequential]
  : [...Indexed, ...Sequential];

type InsertParamTypes<DB extends SchemaLike, Q extends string> = ParseStatement<Q> extends {
  sources: [infer Src extends Source];
}
  ? [InsertColumnList<Q>] extends [never]
    ? unknown[]
    : InsertColumnList<Q> extends { columns: infer Columns extends string[]; rest: infer AfterColumns extends string }
      ? [InsertValuesGroup<AfterColumns>] extends [never]
        ? unknown[]
        : MatchInsertValueTypes<DB, Src['table'], Columns, SplitColumnList<InsertValuesGroup<AfterColumns>>>
      : unknown[]
    : unknown[];

type ContainsPlaceholderLikeChar<S extends string> = S extends
  | `${string}$${string}`
  | `${string}?${string}`
  | `${string}@${string}`
  ? true
  : false;

type AnyCteBodyHasPlaceholder<Ctes extends [string, string][]> = Ctes extends [
  infer Head extends [string, string],
  ...infer Tail extends [string, string][],
]
  ? ContainsPlaceholderLikeChar<Head[1]> extends true
    ? true
    : AnyCteBodyHasPlaceholder<Tail>
  : false;

type CteBodiesHavePlaceholder<Q extends string> = [ParseWithClause<Normalize<Q>>] extends [never]
  ? false
  : ParseWithClause<Normalize<Q>> extends { ctes: infer Ctes extends [string, string][] }
    ? AnyCteBodyHasPlaceholder<Ctes>
    : false;

export type InferParams<DB extends SchemaLike, Q extends string> =
  IsKeyword<FirstWord<Normalize<Q>>, 'insert'> extends true
    ? InsertParamTypes<DB, Normalize<Q>>
    : CteBodiesHavePlaceholder<Q> extends true
      ? unknown[]
      : ResolveCteContext<DB, Q, false> extends {
            db: infer CteDB extends SchemaLike;
            query: infer EffectiveQuery extends string;
          }
        ? [ParseStatement<EffectiveQuery>] extends [never]
          ? unknown[]
          : ParseStatement<EffectiveQuery> extends { sources: infer Sources extends Source[] }
            ? ScanParams<EffectiveQuery, CteDB, Sources>
            : unknown[]
        : unknown[];
