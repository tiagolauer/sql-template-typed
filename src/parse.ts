import type {
  Normalize,
  Trim,
  FirstWord,
  StripQualifier,
  Qualifier,
  IsKeyword,
  Unquote,
} from './string.js';
import type {
  IsFunctionCall,
  FunctionOutputName,
  FunctionReturnType,
} from './functions.js';
import type { Source, ParseFromClause } from './from.js';

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

type ColumnsBeforeFrom<
  S extends string,
  Accumulated extends string = '',
> = S extends `${infer Head} ${infer Tail}`
  ? IsKeyword<Head, 'from'> extends true
    ? { columns: Trim<Accumulated>; afterFrom: Tail }
    : ColumnsBeforeFrom<Tail, Accumulated extends '' ? Head : `${Accumulated} ${Head}`>
  : IsKeyword<S, 'from'> extends true
    ? { columns: Trim<Accumulated>; afterFrom: '' }
    : never;

type AfterKeyword<S extends string, Keyword extends string> =
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

type SingleSource<Table extends string> = [{ table: Table; alias: Table; nullable: false }];

export interface ParsedStatement {
  columns: string;
  sources: Source[];
}

type ParseSelectBody<S extends string> = StatementAfterSelect<S> extends infer Body
  ? Body extends string
    ? ColumnsBeforeFrom<Body> extends {
        columns: infer Columns extends string;
        afterFrom: infer AfterFrom extends string;
      }
      ? { columns: Columns; sources: ParseFromClause<AfterFrom> }
      : never
    : never
  : never;

type ParseStatementNormalized<S extends string> = FirstWord<S> extends infer Keyword extends string
  ? IsKeyword<Keyword, 'select'> extends true
    ? ParseSelectBody<S>
    : IsKeyword<Keyword, 'insert'> extends true
      ? { columns: ReturningColumns<S>; sources: SingleSource<WordAfterKeyword<S, 'into'>> }
      : IsKeyword<Keyword, 'update'> extends true
        ? { columns: ReturningColumns<S>; sources: SingleSource<WordAfterKeyword<S, 'update'>> }
        : IsKeyword<Keyword, 'delete'> extends true
          ? { columns: ReturningColumns<S>; sources: SingleSource<WordAfterKeyword<S, 'from'>> }
          : never
  : never;

export type ParseStatement<S extends string> = ParseStatementNormalized<Normalize<S>>;

export type ParseSelect<S extends string> = ParseSelectBody<Normalize<S>>;

type SplitColumnList<S extends string> = S extends `${infer Head},${infer Tail}`
  ? [Trim<Head>, ...SplitColumnList<Tail>]
  : [Trim<S>];

type OutputName<Expression extends string> = IsFunctionCall<Expression> extends true
  ? FunctionOutputName<Expression>
  : Unquote<StripQualifier<Expression>>;

type ParseColumnEntry<Entry extends string> =
  Entry extends `${infer Expression} ${infer Middle} ${infer Alias}`
    ? IsKeyword<Middle, 'as'> extends true
      ? [Unquote<Trim<Alias>>, Trim<Expression>]
      : [OutputName<Entry>, Entry]
    : Entry extends `${infer Expression} ${infer Alias}`
      ? [Unquote<Trim<Alias>>, Trim<Expression>]
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
      ? AnyKnownTable<DB, Sources> extends true
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

type ResolveColumnType<
  DB extends SchemaLike,
  Sources extends Source[],
  Expression extends string,
  Strict extends boolean,
> = IsFunctionCall<Expression> extends true
  ? FunctionReturnType<Expression>
  : Qualifier<Expression> extends ''
    ? BareColumnType<DB, Sources, Unquote<StripQualifier<Expression>>, Strict>
    : QualifiedColumnType<
        DB,
        Sources,
        Unquote<Qualifier<Expression>>,
        Unquote<StripQualifier<Expression>>,
        Strict
      >;

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

type Flatten<T> = { [Key in keyof T]: T[Key] };

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

type InferRowWith<
  DB extends SchemaLike,
  Q extends string,
  Strict extends boolean,
> = ParseStatement<Q> extends {
  columns: infer Columns extends string;
  sources: infer Sources extends Source[];
}
  ? Trim<Columns> extends ''
    ? EmptyRow
    : IsSelectAll<Columns> extends true
      ? StarRow<DB, Sources, Strict>
      : BuildSelection<
          DB,
          Sources,
          ParseColumnEntries<SplitColumnList<Columns>> extends [string, string][]
            ? ParseColumnEntries<SplitColumnList<Columns>>
            : [],
          Strict
        >
  : never;

export type InferRow<DB extends SchemaLike, Q extends string> = InferRowWith<DB, Q, false>;

export type InferRowStrict<DB extends SchemaLike, Q extends string> = InferRowWith<DB, Q, true>;

export type InferResult<DB extends SchemaLike, Q extends string> = InferRow<DB, Q>[];

export type InferResultStrict<DB extends SchemaLike, Q extends string> = InferRowStrict<DB, Q>[];
