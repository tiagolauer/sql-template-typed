import type {
  Schema,
  SchemaLike,
  InferResult,
  InferRow,
  InferResultStrict,
  InferRowStrict,
  QueryTypeError,
} from './parse.js';
import type { InferParams, UsedPlaceholderStyles } from './params.js';
import { type Result, type QueryMeta, ok, err } from './result.js';

export type {
  Schema,
  SchemaLike,
  InferResult,
  InferRow,
  InferResultStrict,
  InferRowStrict,
  QueryTypeError,
} from './parse.js';
export type { ParseSelect, ParseStatement, ParsedStatement, Source } from './parse.js';
export type { FunctionReturnTypes } from './functions.js';
export type { InferParams } from './params.js';
export type { Result, Ok, Err, QueryMeta } from './result.js';
export { ResultStatus, ok, err, isOk, isErr } from './result.js';

export type Query<DB extends SchemaLike, Q extends string> = InferResult<DB, Q>;

export type Row<DB extends SchemaLike, Q extends string> = InferRow<DB, Q>;

export type StrictQuery<DB extends SchemaLike, Q extends string> = InferResultStrict<DB, Q>;

export type StrictRow<DB extends SchemaLike, Q extends string> = InferRowStrict<DB, Q>;

export type Params<DB extends SchemaLike, Q extends string> = InferParams<DB, Q>;

export enum QueryErrorKind {
  EmptyQuery = 'EMPTY_QUERY',
  ExecutorFailed = 'EXECUTOR_FAILED',
}

export interface QueryError {
  kind: QueryErrorKind;
  message: string;
  cause?: unknown;
}

export type ExecutorResult = unknown[] | { rows: unknown[]; meta?: QueryMeta };

export type Executor = (sql: string, params: readonly unknown[]) => Promise<ExecutorResult>;

export type PlaceholderStyle = 'dollar' | 'question' | 'at';

export type DialectExecutor<Style extends PlaceholderStyle = PlaceholderStyle> = Executor & {
  readonly __placeholderStyle?: Style;
};

type ValidatePlaceholderStyle<
  Q extends string,
  Style extends PlaceholderStyle,
> = PlaceholderStyle extends Style
  ? unknown
  : [UsedPlaceholderStyles<Q>] extends [never]
    ? unknown
    : [UsedPlaceholderStyles<Q>] extends [Style]
      ? unknown
      : QueryTypeError<'the query placeholder style does not match the executor dialect'>;

export interface TypedDbOptions {
  strict?: boolean;
  placeholders?: PlaceholderStyle;
}

type OptionsStyle<Options> = Options extends { placeholders: infer Style extends PlaceholderStyle }
  ? Style
  : PlaceholderStyle;

export interface TypedDb<
  DB extends SchemaLike,
  Strict extends boolean = false,
  Style extends PlaceholderStyle = PlaceholderStyle,
> {
  readonly __owlsqlTypedDb?: true;
  query<Q extends string>(
    sql: Q & ValidatePlaceholderStyle<Q, Style>,
    ...params: InferParams<DB, Q>
  ): Promise<
    Result<Strict extends true ? InferResultStrict<DB, Q> : InferResult<DB, Q>, QueryError>
  >;
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message;
  }
  return String(cause);
}

export function createTypedDb<DB extends SchemaLike>(
  executor: Executor,
): TypedDb<DB, false, PlaceholderStyle>;
export function createTypedDb<DB extends SchemaLike, const Options extends TypedDbOptions>(
  executor: Executor,
  options?: Options,
): TypedDb<DB, Options extends { strict: true } ? true : false, OptionsStyle<Options>>;
export function createTypedDb<
  DB extends SchemaLike,
  const Options extends TypedDbOptions = TypedDbOptions,
>(
  executor: Executor,
  options?: Options,
): TypedDb<DB, Options extends { strict: true } ? true : false, OptionsStyle<Options>> {
  void options;
  return {
    async query(sql, ...params) {
      if (!sql.trim()) {
        return err({
          kind: QueryErrorKind.EmptyQuery,
          message: 'SQL query string is empty.',
        });
      }

      try {
        const executed = await executor(sql, params);
        const rows = Array.isArray(executed) ? executed : executed.rows;
        const meta = Array.isArray(executed) ? undefined : executed.meta;
        return ok(rows as never, meta);
      } catch (cause) {
        return err({
          kind: QueryErrorKind.ExecutorFailed,
          message: `The executor threw while running the query: ${describeCause(cause)}`,
          cause,
        });
      }
    },
  };
}

export function defineSchema<const DB extends Schema>(schema: DB): DB {
  return schema;
}
