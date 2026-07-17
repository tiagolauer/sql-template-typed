import type { Normalize, FirstWord, IsKeyword } from './string.js';
import type {
  Source,
  SchemaLike,
  ParseStatement,
  ResolveColumnLoose,
} from './parse.js';

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

export type InferParams<DB extends SchemaLike, Q extends string> =
  IsKeyword<FirstWord<Normalize<Q>>, 'insert'> extends true
    ? unknown[]
    : [ParseStatement<Q>] extends [never]
      ? unknown[]
      : ParseStatement<Q> extends { sources: infer Sources extends Source[] }
        ? ScanParams<Normalize<Q>, DB, Sources>
        : unknown[];
