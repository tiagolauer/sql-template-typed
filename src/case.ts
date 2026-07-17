import type { Trim, FirstWord, DropFirstWord, IsKeyword, Unquote } from './string.js';
import type { SchemaLike, Source, ResolveColumnType } from './parse.js';

export type IsCaseExpression<Expr extends string> = IsKeyword<FirstWord<Trim<Expr>>, 'case'>;

type FindEnd<S extends string, Accumulated extends string = ''> = S extends `${infer Head} ${infer Tail}`
  ? IsKeyword<Head, 'end'> extends true
    ? { body: Trim<Accumulated>; rest: Trim<Tail> }
    : FindEnd<Tail, Accumulated extends '' ? Head : `${Accumulated} ${Head}`>
  : IsKeyword<S, 'end'> extends true
    ? { body: Trim<Accumulated>; rest: '' }
    : never;

export type SplitCaseExpression<Expr extends string> = DropFirstWord<Trim<Expr>> extends infer AfterCase extends string
  ? FindEnd<AfterCase> extends { body: infer Body extends string; rest: infer Rest extends string }
    ? Rest extends ''
      ? { body: Body; alias: 'case' }
      : IsKeyword<FirstWord<Rest>, 'as'> extends true
        ? { body: Body; alias: Unquote<Trim<DropFirstWord<Rest>>> }
        : { body: Body; alias: Unquote<Trim<Rest>> }
    : never
  : never;

interface CaseSegment {
  kind: 'when' | 'then' | 'else';
  text: string;
}

type ScanCaseSegments<
  S extends string,
  CurrentKind extends 'when' | 'then' | 'else',
  CurrentText extends string,
  Accumulated extends CaseSegment[],
> = S extends `${infer Head} ${infer Tail}`
  ? IsKeyword<Head, 'when'> extends true
    ? ScanCaseSegments<Tail, 'when', '', [...Accumulated, { kind: CurrentKind; text: Trim<CurrentText> }]>
    : IsKeyword<Head, 'then'> extends true
      ? ScanCaseSegments<Tail, 'then', '', [...Accumulated, { kind: CurrentKind; text: Trim<CurrentText> }]>
      : IsKeyword<Head, 'else'> extends true
        ? ScanCaseSegments<Tail, 'else', '', [...Accumulated, { kind: CurrentKind; text: Trim<CurrentText> }]>
        : ScanCaseSegments<Tail, CurrentKind, CurrentText extends '' ? Head : `${CurrentText} ${Head}`, Accumulated>
  : [...Accumulated, { kind: CurrentKind; text: Trim<CurrentText extends '' ? S : `${CurrentText} ${S}`> }];

type HasElseBranch<Segments extends CaseSegment[]> = Segments extends [
  infer Head extends CaseSegment,
  ...infer Tail extends CaseSegment[],
]
  ? Head['kind'] extends 'else'
    ? true
    : HasElseBranch<Tail>
  : false;

type LiteralType<Expr extends string> = Trim<Expr> extends `'${string}'`
  ? string
  : Trim<Expr> extends `${number}`
    ? number
    : Lowercase<Trim<Expr>> extends 'true' | 'false'
      ? boolean
      : Lowercase<Trim<Expr>> extends 'null'
        ? null
        : never;

type BranchValueType<
  DB extends SchemaLike,
  Sources extends Source[],
  Expr extends string,
  Strict extends boolean,
> = LiteralType<Expr> extends infer Literal
  ? [Literal] extends [never]
    ? ResolveColumnType<DB, Sources, Trim<Expr>, Strict>
    : Literal
  : never;

type BranchUnion<
  DB extends SchemaLike,
  Sources extends Source[],
  Segments extends CaseSegment[],
  Strict extends boolean,
> = Segments extends [infer Head extends CaseSegment, ...infer Tail extends CaseSegment[]]
  ? Head['kind'] extends 'then' | 'else'
    ? BranchValueType<DB, Sources, Head['text'], Strict> | BranchUnion<DB, Sources, Tail, Strict>
    : BranchUnion<DB, Sources, Tail, Strict>
  : never;

export type CaseExpressionType<
  DB extends SchemaLike,
  Sources extends Source[],
  Body extends string,
  Strict extends boolean,
> = ScanCaseSegments<DropFirstWord<Trim<Body>>, 'when', '', []> extends infer Segments extends CaseSegment[]
  ? BranchUnion<DB, Sources, Segments, Strict> extends infer Union
    ? HasElseBranch<Segments> extends true
      ? Union
      : Union | null
    : never
  : never;
