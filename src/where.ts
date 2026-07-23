import type { Trim, FirstWord, DropFirstWord, IsKeyword, ExtractParenGroup } from './string.js';
import type { TakeUntilClauseBoundary } from './from.js';
import type { AfterKeyword, SchemaLike, Source, ResolveColumnType, QueryTypeError } from './parse.js';
import type { IsPlaceholder, CleanColumnToken } from './params.js';

export type ExtractSelectWhereText<AfterFromRest extends string> = Trim<AfterFromRest> extends ''
  ? ''
  : IsKeyword<FirstWord<Trim<AfterFromRest>>, 'where'> extends true
    ? TakeUntilClauseBoundary<DropFirstWord<Trim<AfterFromRest>>>
    : '';

export type ExtractUpdateDeleteWhereText<S extends string> = [AfterKeyword<S, 'where'>] extends [never]
  ? ''
  : AfterKeyword<S, 'where'> extends infer Rest extends string
    ? TakeUntilClauseBoundary<Rest>
    : '';

type IsSymbolTriggerOperator<Token extends string> = Token extends
  | '='
  | '<>'
  | '!='
  | '<'
  | '>'
  | '<='
  | '>='
  ? true
  : false;

type IsWordTriggerOperator<Token extends string> = Lowercase<Token> extends
  | 'like'
  | 'ilike'
  | 'in'
  | 'between'
  | 'is'
  ? true
  : false;

type IsTriggerOperator<Token extends string> = IsSymbolTriggerOperator<Token> extends true
  ? true
  : IsWordTriggerOperator<Token>;

// Mirrors `IsTransparentToken` in params.ts (which lists `not`): `not` must not
// overwrite `Prev`, otherwise it clobbers the real column just before a word
// operator (`like`/`in`/`between`/`ilike`) fires, so the validator checks the
// literal word `not` instead of the column (`NOT LIKE` / `NOT IN` / `NOT BETWEEN`).
type IsTransparentToken<Token extends string> = Lowercase<Token> extends 'not' ? true : false;

type DropOneOpenParen<S extends string> = S extends `(${infer Rest}` ? Rest : S;

type HeadStartsSubquery<Head extends string, Tail extends string> = Head extends `(${string}`
  ? DropOneOpenParen<Head> extends ''
    ? IsKeyword<FirstWord<Trim<Tail>>, 'select'> extends true
      ? true
      : false
    : IsKeyword<FirstWord<Trim<DropOneOpenParen<Head>>>, 'select'> extends true
      ? true
      : false
  : false;

type ValidateWhereOperand<
  DB extends SchemaLike,
  Sources extends Source[],
  Operand extends string,
> = Operand extends '' ? never : IsPlaceholder<Operand> extends true ? never : ResolveColumnType<
  DB,
  Sources,
  Operand,
  true
> extends QueryTypeError<infer Message>
  ? QueryTypeError<Message>
  : never;

type WhereScan<
  DB extends SchemaLike,
  Sources extends Source[],
  S extends string,
  Prev extends string = '',
> = S extends `${infer Head} ${infer Tail}`
  ? HeadStartsSubquery<Head, Tail> extends true
    ? ExtractParenGroup<`${DropOneOpenParen<Head>} ${Tail}`> extends { rest: infer Rest extends string }
      ? WhereScan<DB, Sources, Trim<Rest>>
      : never
    : IsTriggerOperator<Head> extends true
      ? ValidateWhereOperand<DB, Sources, Prev> extends infer Error
        ? [Error] extends [never]
          ? WhereScan<DB, Sources, Tail, CleanColumnToken<Head>>
          : Error
        : never
      : IsTransparentToken<Head> extends true
        ? WhereScan<DB, Sources, Tail, Prev>
        : WhereScan<DB, Sources, Tail, CleanColumnToken<Head>>
  : never;

export type WhereClauseError<
  DB extends SchemaLike,
  Sources extends Source[],
  WhereText extends string,
> = WhereScan<DB, Sources, Trim<WhereText>>;
