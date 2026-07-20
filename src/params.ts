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

type WordOperator = 'like' | 'ilike' | 'in' | 'between';

type ForcedNumberKeyword = 'limit' | 'offset';

type IsOperator<Token extends string> = Token extends Operator
  ? true
  : Lowercase<Token> extends WordOperator
    ? true
    : false;

type IsTransparentToken<Token extends string> = Token extends '(' | ')' | ','
  ? true
  : Lowercase<Token> extends 'and' | 'or' | 'not'
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
  : CleanPlaceholderToken<Token> extends `$${string}`
    ? true
    : CleanPlaceholderToken<Token> extends `@${string}`
      ? true
      : false;

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

type ScanParams<
  S extends string,
  DB extends SchemaLike,
  Sources extends Source[],
  PrevPrev extends string = '',
  Prev extends string = '',
  Accumulated extends unknown[] = [],
> = S extends `${infer Head} ${infer Tail}`
  ? IsPlaceholder<Head> extends true
    ? ScanParams<
        Tail,
        DB,
        Sources,
        PrevPrev,
        Prev,
        [...Accumulated, ParamType<DB, Sources, PrevPrev, Prev>]
      >
    : IsTransparentToken<Head> extends true
      ? ScanParams<Tail, DB, Sources, PrevPrev, Prev, Accumulated>
      : ScanParams<Tail, DB, Sources, Prev, Head, Accumulated>
  : S extends ''
    ? Accumulated
    : IsPlaceholder<S> extends true
      ? [...Accumulated, ParamType<DB, Sources, PrevPrev, Prev>]
      : Accumulated;

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
> = Values extends [infer Head extends string, ...infer ValuesTail extends string[]]
  ? Columns extends [infer ColumnHead extends string, ...infer ColumnsTail extends string[]]
    ? IsPlaceholder<Trim<Head>> extends true
      ? [ColumnTypeAt<DB, Table, ColumnHead>, ...MatchInsertValueTypes<DB, Table, ColumnsTail, ValuesTail>]
      : MatchInsertValueTypes<DB, Table, ColumnsTail, ValuesTail>
    : []
  : [];

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
