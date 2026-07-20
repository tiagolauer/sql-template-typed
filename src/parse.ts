import type {
  Normalize,
  Trim,
  FirstWord,
  DropFirstWord,
  StripQualifier,
  Qualifier,
  IsKeyword,
  Unquote,
  ExtractParenGroup,
  ApplyParenDelta,
  SplitColumnList,
} from './string.js';
import type {
  IsFunctionCall,
  FunctionOutputName,
  FunctionReturnType,
} from './functions.js';
import type { Source, ParseFromClause } from './from.js';
import type { IsCaseExpression, SplitCaseExpression, CaseExpressionType } from './case.js';
import type { ParseWithClause, BuildCteMap } from './cte.js';

export type Schema = Record<string, Record<string, unknown>>;

export type SchemaLike = object;

export type { Source } from './from.js';

export type QueryTypeError<Message extends string> = {
  readonly __sqlTypeError: Message;
};

type StatementAfterSelect<S extends string> = S extends `${infer Keyword} ${infer Rest}`
  ? IsKeyword<Keyword, 'select'> extends true
    ? Rest
    : never
  : never;

type StripTopCount<S extends string> = Trim<S> extends `(${infer AfterOpen}`
  ? ExtractParenGroup<AfterOpen> extends { rest: infer Rest extends string }
    ? Trim<Rest>
    : Trim<S>
  : DropFirstWord<Trim<S>>;

type StripWithTies<S extends string> = IsKeyword<FirstWord<S>, 'with'> extends true
  ? IsKeyword<FirstWord<DropFirstWord<S>>, 'ties'> extends true
    ? Trim<DropFirstWord<DropFirstWord<S>>>
    : S
  : S;

type StripTopClause<S extends string> = IsKeyword<FirstWord<Trim<S>>, 'top'> extends true
  ? StripTopCount<DropFirstWord<Trim<S>>> extends infer AfterCount extends string
    ? IsKeyword<FirstWord<AfterCount>, 'percent'> extends true
      ? StripWithTies<Trim<DropFirstWord<AfterCount>>>
      : StripWithTies<AfterCount>
    : S
  : S;

type StripDistinctOn<S extends string> = IsKeyword<FirstWord<S>, 'on'> extends true
  ? Trim<DropFirstWord<S>> extends `(${infer AfterOpen}`
    ? ExtractParenGroup<AfterOpen> extends { rest: infer Rest extends string }
      ? Trim<Rest>
      : S
    : S
  : S;

type StripDistinctClause<S extends string> = IsKeyword<FirstWord<Trim<S>>, 'distinct'> extends true
  ? StripDistinctOn<Trim<DropFirstWord<Trim<S>>>>
  : IsKeyword<FirstWord<Trim<S>>, 'all'> extends true
    ? Trim<DropFirstWord<Trim<S>>>
    : S;

type ColumnsBeforeFrom<
  S extends string,
  Depth extends unknown[] = [],
  Accumulated extends string = '',
> = S extends `${infer Head} ${infer Tail}`
  ? Depth extends []
    ? IsKeyword<Head, 'from'> extends true
      ? { columns: Trim<Accumulated>; afterFrom: Tail }
      : ColumnsBeforeFrom<Tail, ApplyParenDelta<Depth, Head>, Accumulated extends '' ? Head : `${Accumulated} ${Head}`>
    : ColumnsBeforeFrom<Tail, ApplyParenDelta<Depth, Head>, Accumulated extends '' ? Head : `${Accumulated} ${Head}`>
  : Depth extends []
    ? IsKeyword<S, 'from'> extends true
      ? { columns: Trim<Accumulated>; afterFrom: '' }
      : { columns: Trim<Accumulated extends '' ? S : `${Accumulated} ${S}`>; afterFrom: null }
    : { columns: Trim<Accumulated extends '' ? S : `${Accumulated} ${S}`>; afterFrom: null };

export type AfterKeyword<S extends string, Keyword extends string> =
  S extends `${infer Head} ${infer Tail}`
    ? IsKeyword<Head, Keyword> extends true
      ? Tail
      : AfterKeyword<Tail, Keyword>
    : never;

type WordAfterKeyword<S extends string, Keyword extends string> =
  AfterKeyword<S, Keyword> extends infer Rest
    ? Rest extends string
      ? FirstWord<Rest>
      : ''
    : '';

type ReturningColumns<S extends string> = AfterKeyword<S, 'returning'> extends infer Rest
  ? Rest extends string
    ? Rest
    : ''
  : '';

type AccumulateUntil<
  S extends string,
  StopKeyword extends string,
  Accumulated extends string = '',
> = S extends `${infer Head} ${infer Tail}`
  ? IsKeyword<Head, StopKeyword> extends true
    ? Trim<Accumulated>
    : AccumulateUntil<Tail, StopKeyword, Accumulated extends '' ? Head : `${Accumulated} ${Head}`>
  : IsKeyword<S, StopKeyword> extends true
    ? Trim<Accumulated>
    : Trim<Accumulated extends '' ? S : `${Accumulated} ${S}`>;

type OutputClauseColumns<S extends string, StopKeyword extends string> = AfterKeyword<
  S,
  'output'
> extends infer Rest
  ? Rest extends string
    ? AccumulateUntil<Rest, StopKeyword>
    : ''
  : '';

type StripPseudoTableEntry<Entry extends string> = Lowercase<
  Qualifier<Trim<Entry>>
> extends 'inserted' | 'deleted'
  ? StripQualifier<Trim<Entry>>
  : Entry;

type StripPseudoTableQualifiers<S extends string> = S extends `${infer Head},${infer Tail}`
  ? `${StripPseudoTableEntry<Head>},${StripPseudoTableQualifiers<Tail>}`
  : StripPseudoTableEntry<S>;

type ReturningOrOutputColumns<S extends string, StopKeyword extends string> = ReturningColumns<S> extends ''
  ? StripPseudoTableQualifiers<OutputClauseColumns<S, StopKeyword>>
  : ReturningColumns<S>;

type CleanTargetIdentifier<Raw extends string> = Unquote<StripQualifier<Raw>>;

type SingleSource<Table extends string> = [
  { table: CleanTargetIdentifier<Table>; alias: CleanTargetIdentifier<Table>; nullable: false },
];

export interface ParsedStatement {
  columns: string;
  sources: Source[];
}

type ParseSelectBody<S extends string> = StatementAfterSelect<S> extends infer Body
  ? Body extends string
    ? ColumnsBeforeFrom<StripTopClause<StripDistinctClause<Body>>> extends {
        columns: infer Columns extends string;
        afterFrom: infer AfterFrom;
      }
      ? AfterFrom extends string
        ? { columns: Columns; sources: ParseFromClause<AfterFrom> }
        : { columns: Columns; sources: [] }
      : never
    : never
  : never;

type ParseStatementNormalized<S extends string> = FirstWord<S> extends infer Keyword extends string
  ? IsKeyword<Keyword, 'select'> extends true
    ? ParseSelectBody<S>
    : IsKeyword<Keyword, 'insert'> extends true
      ? { columns: ReturningOrOutputColumns<S, 'values'>; sources: SingleSource<WordAfterKeyword<S, 'into'>> }
      : IsKeyword<Keyword, 'update'> extends true
        ? { columns: ReturningOrOutputColumns<S, 'where'>; sources: SingleSource<WordAfterKeyword<S, 'update'>> }
        : IsKeyword<Keyword, 'delete'> extends true
          ? { columns: ReturningOrOutputColumns<S, 'where'>; sources: SingleSource<WordAfterKeyword<S, 'from'>> }
          : never
  : never;

export type ParseStatement<S extends string> = ParseStatementNormalized<Normalize<S>>;

export type ParseSelect<S extends string> = ParseSelectBody<Normalize<S>>;

export type { SplitColumnList } from './string.js';

type OutputName<Expression extends string> = IsFunctionCall<Expression> extends true
  ? FunctionOutputName<Expression>
  : Unquote<StripQualifier<Expression>>;

type OverAttachedParen<Token extends string> = Token extends `${infer Word}(${infer AfterOpen}`
  ? IsKeyword<Word, 'over'> extends true
    ? AfterOpen
    : never
  : never;

type FindOverKeyword<S extends string, Accumulated extends string = ''> =
  S extends `${infer Head} ${infer Tail}`
    ? IsKeyword<Head, 'over'> extends true
      ? IsFunctionCall<Trim<Accumulated>> extends true
        ? { expr: Trim<Accumulated>; rest: Tail }
        : FindOverKeyword<Tail, Accumulated extends '' ? Head : `${Accumulated} ${Head}`>
      : OverAttachedParen<Head> extends infer AfterOpen extends string
        ? [AfterOpen] extends [never]
          ? FindOverKeyword<Tail, Accumulated extends '' ? Head : `${Accumulated} ${Head}`>
          : IsFunctionCall<Trim<Accumulated>> extends true
            ? { expr: Trim<Accumulated>; rest: `(${AfterOpen} ${Tail}` }
            : FindOverKeyword<Tail, Accumulated extends '' ? Head : `${Accumulated} ${Head}`>
        : never
    : OverAttachedParen<S> extends infer AfterOpen extends string
      ? [AfterOpen] extends [never]
        ? never
        : IsFunctionCall<Trim<Accumulated>> extends true
          ? { expr: Trim<Accumulated>; rest: `(${AfterOpen}` }
          : never
      : never;

type StripLeadingOpenParen<S extends string> = Trim<S> extends `(${infer Rest}` ? Rest : never;

type SplitWindowExpression<Entry extends string> = FindOverKeyword<Entry> extends {
  expr: infer Expr extends string;
  rest: infer Rest extends string;
}
  ? StripLeadingOpenParen<Rest> extends infer AfterOpen extends string
    ? [AfterOpen] extends [never]
      ? never
      : ExtractParenGroup<AfterOpen> extends { rest: infer AfterClose extends string }
        ? { expr: Expr; after: Trim<AfterClose> }
        : never
    : never
  : never;

type IsWindowExpression<Entry extends string> = [SplitWindowExpression<Entry>] extends [never]
  ? false
  : true;

type SplitParenthesizedEntry<Entry extends string> = StripLeadingOpenParen<Entry> extends infer AfterOpen extends string
  ? [AfterOpen] extends [never]
    ? never
    : ExtractParenGroup<AfterOpen> extends { inner: infer Inner extends string; rest: infer AfterClose extends string }
      ? { expr: `(${Inner})`; after: Trim<AfterClose> }
      : never
  : never;

type IsParenthesizedEntry<Entry extends string> = [SplitParenthesizedEntry<Entry>] extends [never]
  ? false
  : true;

type FindTopLevelAsKeyword<
  S extends string,
  Depth extends unknown[] = [],
  Accumulated extends string = '',
> = S extends `${infer Head} ${infer Tail}`
  ? Depth extends []
    ? IsKeyword<Head, 'as'> extends true
      ? { expr: Trim<Accumulated>; alias: Tail }
      : FindTopLevelAsKeyword<Tail, ApplyParenDelta<Depth, Head>, Accumulated extends '' ? Head : `${Accumulated} ${Head}`>
    : FindTopLevelAsKeyword<Tail, ApplyParenDelta<Depth, Head>, Accumulated extends '' ? Head : `${Accumulated} ${Head}`>
  : never;

type ParseColumnEntry<Entry extends string> = IsCaseExpression<Entry> extends true
  ? SplitCaseExpression<Entry> extends { body: infer Body extends string; alias: infer Alias extends string }
    ? [Alias, `case ${Body} end`]
    : [OutputName<Trim<Entry>>, Trim<Entry>]
  : IsWindowExpression<Entry> extends true
    ? SplitWindowExpression<Entry> extends { expr: infer Expr extends string; after: infer After extends string }
      ? After extends ''
        ? [OutputName<Expr>, Expr]
        : IsKeyword<FirstWord<After>, 'as'> extends true
          ? [Unquote<Trim<DropFirstWord<After>>>, Expr]
          : [Unquote<Trim<After>>, Expr]
      : [OutputName<Trim<Entry>>, Trim<Entry>]
    : IsParenthesizedEntry<Entry> extends true
      ? SplitParenthesizedEntry<Entry> extends { expr: infer Expr extends string; after: infer After extends string }
        ? After extends ''
          ? [Trim<Entry>, Expr]
          : IsKeyword<FirstWord<After>, 'as'> extends true
            ? [Unquote<Trim<DropFirstWord<After>>>, Expr]
            : [Unquote<Trim<After>>, Expr]
        : [Trim<Entry>, Trim<Entry>]
      : [FindTopLevelAsKeyword<Entry>] extends [never]
      ? Entry extends `${infer Expression} ${infer Alias}`
        ? IsOperatorExpression<Alias> extends true
          ? [Trim<Entry>, Trim<Entry>]
          : [Unquote<Trim<Alias>>, Trim<Expression>]
        : [OutputName<Trim<Entry>>, Trim<Entry>]
      : FindTopLevelAsKeyword<Entry> extends { expr: infer Expr extends string; alias: infer Alias extends string }
        ? [Unquote<Trim<Alias>>, Expr]
        : [OutputName<Trim<Entry>>, Trim<Entry>];

type ParseColumnEntries<Columns extends string[]> = {
  [Index in keyof Columns]: ParseColumnEntry<Columns[Index]>;
};

type ApplyNull<T, Nullable extends boolean> = Nullable extends true ? T | null : T;

type SourceColumnType<
  DB extends SchemaLike,
  S extends Source,
  Column extends string,
> = S['table'] extends keyof DB
  ? Column extends keyof DB[S['table']]
    ? ApplyNull<DB[S['table']][Column], S['nullable']>
    : never
  : never;

type ResolveBareAcross<
  DB extends SchemaLike,
  Sources extends Source[],
  Column extends string,
> = Sources extends [infer Head extends Source, ...infer Tail extends Source[]]
  ? SourceColumnType<DB, Head, Column> extends infer Type
    ? [Type] extends [never]
      ? ResolveBareAcross<DB, Tail, Column>
      : Type
    : never
  : never;

type AnyKnownTable<DB extends SchemaLike, Sources extends Source[]> =
  Sources extends [infer Head extends Source, ...infer Tail extends Source[]]
    ? Head['table'] extends keyof DB
      ? true
      : AnyKnownTable<DB, Tail>
    : false;

type FirstUnknownTable<DB extends SchemaLike, Sources extends Source[]> =
  Sources extends [infer Head extends Source, ...infer Tail extends Source[]]
    ? Head['table'] extends keyof DB
      ? FirstUnknownTable<DB, Tail>
      : Head['table']
    : '';

type FirstSourceTable<Sources extends Source[]> = Sources extends [
  infer Head extends Source,
  ...Source[],
]
  ? Head['table']
  : '';

type BareColumnType<
  DB extends SchemaLike,
  Sources extends Source[],
  Column extends string,
  Strict extends boolean,
> = ResolveBareAcross<DB, Sources, Column> extends infer Type
  ? [Type] extends [never]
    ? Strict extends true
      ? Sources extends []
        ? QueryTypeError<`no FROM clause: cannot resolve column "${Column}"`>
        : AnyKnownTable<DB, Sources> extends true
          ? QueryTypeError<`unknown column: ${Column}`>
          : QueryTypeError<`unknown table: ${FirstSourceTable<Sources>}`>
      : unknown
    : Type
  : never;

type FindSourceByName<Sources extends Source[], Name extends string> =
  Sources extends [infer Head extends Source, ...infer Tail extends Source[]]
    ? IsKeyword<Head['alias'], Name> extends true
      ? Head
      : IsKeyword<Head['table'], Name> extends true
        ? Head
        : FindSourceByName<Tail, Name>
    : never;

type QualifiedColumnType<
  DB extends SchemaLike,
  Sources extends Source[],
  Name extends string,
  Column extends string,
  Strict extends boolean,
> = FindSourceByName<Sources, Name> extends infer Found
  ? [Found] extends [never]
    ? Strict extends true
      ? QueryTypeError<`unknown alias: ${Name}`>
      : unknown
    : Found extends Source
      ? Found['table'] extends keyof DB
        ? Column extends keyof DB[Found['table']]
          ? ApplyNull<DB[Found['table']][Column], Found['nullable']>
          : Strict extends true
            ? QueryTypeError<`unknown column: ${Column}`>
            : unknown
        : Strict extends true
          ? QueryTypeError<`unknown table: ${Found['table']}`>
          : unknown
      : never
  : never;

type OperatorChar = '*' | '+' | '-' | '/' | '%' | '|' | '<' | '>' | '=' | '^';

type ContainsOperatorChar<S extends string> = S extends `${string}${OperatorChar}${string}`
  ? true
  : false;

type IsOperatorExpression<S extends string> = S extends
  | `${string}"${string}`
  | `${string}[${string}`
  | `${string}\`${string}`
  ? false
  : ContainsOperatorChar<S>;

export type LiteralType<Expression extends string> = Trim<Expression> extends `'${string}'`
  ? string
  : Trim<Expression> extends `${number}`
    ? number
    : Lowercase<Trim<Expression>> extends 'true' | 'false'
      ? boolean
      : Lowercase<Trim<Expression>> extends 'null'
        ? null
        : never;

type ScalarSubqueryInner<Expression extends string> = Trim<Expression> extends `(${infer AfterOpen}`
  ? ExtractParenGroup<AfterOpen> extends { inner: infer Inner extends string; rest: infer Rest extends string }
    ? Trim<Rest> extends ''
      ? IsKeyword<FirstWord<Trim<Inner>>, 'select'> extends true
        ? Trim<Inner>
        : never
      : never
    : never
  : never;

type IsUnion<T, U = T> = T extends U ? ([U] extends [T] ? false : true) : never;

type ScalarSubqueryType<
  DB extends SchemaLike,
  Q extends string,
  Strict extends boolean,
> = InferRowWith<DB, Q, Strict> extends infer Row
  ? [Row] extends [never]
    ? unknown
    : Row extends QueryTypeError<string>
      ? Row
      : IsUnion<keyof Row> extends true
        ? unknown
        : Row[keyof Row]
  : unknown;

export type ResolveColumnType<
  DB extends SchemaLike,
  Sources extends Source[],
  Expression extends string,
  Strict extends boolean,
> = IsCaseExpression<Expression> extends true
  ? SplitCaseExpression<Expression> extends { body: infer Body extends string }
    ? CaseExpressionType<DB, Sources, Body, Strict>
    : unknown
  : [ScalarSubqueryInner<Expression>] extends [never]
    ? IsFunctionCall<Expression> extends true
      ? FunctionReturnType<Expression>
      : [LiteralType<Expression>] extends [never]
        ? IsOperatorExpression<Expression> extends true
          ? unknown
          : Qualifier<Expression> extends ''
            ? BareColumnType<DB, Sources, Unquote<StripQualifier<Expression>>, Strict>
            : QualifiedColumnType<
                DB,
                Sources,
                Unquote<Qualifier<Expression>>,
                Unquote<StripQualifier<Expression>>,
                Strict
              >
        : LiteralType<Expression>
    : ScalarSubqueryType<DB, ScalarSubqueryInner<Expression>, Strict>;

export type ResolveColumnLoose<
  DB extends SchemaLike,
  Sources extends Source[],
  Expression extends string,
> = ResolveColumnType<DB, Sources, Expression, false>;

type CollectRowErrors<Row> = {
  [Key in keyof Row]: Row[Key] extends QueryTypeError<infer Message>
    ? QueryTypeError<Message>
    : never;
}[keyof Row];

type SurfaceErrors<Row> = [CollectRowErrors<Row>] extends [never] ? Row : CollectRowErrors<Row>;

type MergeSourceColumns<DB extends SchemaLike, S extends Source> = S['table'] extends keyof DB
  ? { [Column in keyof DB[S['table']]]: ApplyNull<DB[S['table']][Column], S['nullable']> }
  : unknown;

type MergedStarColumns<DB extends SchemaLike, Sources extends Source[]> = Sources extends [
  infer Head extends Source,
  ...infer Tail extends Source[],
]
  ? MergeSourceColumns<DB, Head> & MergedStarColumns<DB, Tail>
  : unknown;

export type Flatten<T> = { [Key in keyof T]: T[Key] };

type AllKnownTables<DB extends SchemaLike, Sources extends Source[]> = Sources extends [
  infer Head extends Source,
  ...infer Tail extends Source[],
]
  ? Head['table'] extends keyof DB
    ? AllKnownTables<DB, Tail>
    : false
  : true;

type StarRow<
  DB extends SchemaLike,
  Sources extends Source[],
  Strict extends boolean,
> = Strict extends true
  ? AllKnownTables<DB, Sources> extends true
    ? Flatten<MergedStarColumns<DB, Sources>>
    : QueryTypeError<`unknown table: ${FirstUnknownTable<DB, Sources>}`>
  : AnyKnownTable<DB, Sources> extends true
    ? Flatten<MergedStarColumns<DB, Sources>>
    : unknown;

type StarColumnsForAlias<
  DB extends SchemaLike,
  Sources extends Source[],
  Name extends string,
> = FindSourceByName<Sources, Name> extends infer Found
  ? [Found] extends [never]
    ? unknown
    : Found extends Source
      ? MergeSourceColumns<DB, Found>
      : unknown
  : unknown;

type EntryContribution<
  DB extends SchemaLike,
  Sources extends Source[],
  Entry extends [string, string],
  Strict extends boolean,
> = Entry[1] extends '*'
  ? MergedStarColumns<DB, Sources>
  : StripQualifier<Entry[1]> extends '*'
    ? StarColumnsForAlias<DB, Sources, Unquote<Qualifier<Entry[1]>>>
    : { [Key in Entry[0]]: ResolveColumnType<DB, Sources, Entry[1], Strict> };

type BuildMixed<
  DB extends SchemaLike,
  Sources extends Source[],
  Entries extends [string, string][],
  Strict extends boolean,
> = Entries extends [infer Head extends [string, string], ...infer Tail extends [string, string][]]
  ? EntryContribution<DB, Sources, Head, Strict> & BuildMixed<DB, Sources, Tail, Strict>
  : unknown;

type BuildSelection<
  DB extends SchemaLike,
  Sources extends Source[],
  Entries extends [string, string][],
  Strict extends boolean,
> = Strict extends true
  ? SurfaceErrors<Flatten<BuildMixed<DB, Sources, Entries, true>>>
  : Flatten<BuildMixed<DB, Sources, Entries, false>>;

type IsSelectAll<Columns extends string> = Trim<Columns> extends '*' ? true : false;

type EmptyRow = Record<string, never>;

export type ResolveCteContext<
  DB extends SchemaLike,
  Q extends string,
  Strict extends boolean,
> = [ParseWithClause<Normalize<Q>>] extends [never]
  ? { db: DB; query: Normalize<Q> }
  : ParseWithClause<Normalize<Q>> extends {
        ctes: infer Ctes extends [string, string][];
        rest: infer Rest extends string;
      }
    ? { db: DB & BuildCteMap<DB, Ctes, Strict>; query: Rest }
    : { db: DB; query: Normalize<Q> };

type BuildDerivedSourceMap<
  DB extends SchemaLike,
  Sources extends Source[],
  Strict extends boolean,
  Accumulated extends Record<string, unknown> = Record<never, never>,
> = Sources extends [infer Head extends Source, ...infer Tail extends Source[]]
  ? Head extends { derivedQuery: infer Q extends string }
    ? BuildDerivedSourceMap<
        DB,
        Tail,
        Strict,
        Accumulated & { [Key in Head['alias']]: Flatten<InferRowWith<DB, Q, Strict>> }
      >
    : BuildDerivedSourceMap<DB, Tail, Strict, Accumulated>
  : Accumulated;

export type InferRowWith<
  DB extends SchemaLike,
  Q extends string,
  Strict extends boolean,
> = ResolveCteContext<DB, Q, Strict> extends {
  db: infer CteDB extends SchemaLike;
  query: infer EffectiveQuery extends string;
}
  ? ParseStatementNormalized<EffectiveQuery> extends {
      columns: infer Columns extends string;
      sources: infer Sources extends Source[];
    }
    ? (CteDB & BuildDerivedSourceMap<CteDB, Sources, Strict>) extends infer EffectiveDB extends SchemaLike
      ? Trim<Columns> extends ''
        ? EmptyRow
        : IsSelectAll<Columns> extends true
          ? StarRow<EffectiveDB, Sources, Strict>
          : BuildSelection<
              EffectiveDB,
              Sources,
              ParseColumnEntries<SplitColumnList<Columns>> extends [string, string][]
                ? ParseColumnEntries<SplitColumnList<Columns>>
                : [],
              Strict
            >
      : never
    : never
  : never;

export type InferRow<DB extends SchemaLike, Q extends string> = InferRowWith<DB, Q, false>;

export type InferRowStrict<DB extends SchemaLike, Q extends string> = InferRowWith<DB, Q, true>;

export type InferResult<DB extends SchemaLike, Q extends string> = InferRow<DB, Q>[];

export type InferResultStrict<DB extends SchemaLike, Q extends string> = InferRowStrict<DB, Q>[];
