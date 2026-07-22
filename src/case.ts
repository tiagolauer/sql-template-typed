import type { Trim, FirstWord, DropFirstWord, IsKeyword, Unquote } from './string.js';
import type { SchemaLike, Source, ResolveColumnType } from './parse.js';

export type IsCaseExpression<Expr extends string> = IsKeyword<FirstWord<Trim<Expr>>, 'case'>;

type FindEnd<
  S extends string,
  Depth extends unknown[] = [],
  Accumulated extends string = '',
> = S extends `${infer Head} ${infer Tail}`
  ? IsKeyword<Head, 'case'> extends true
    ? FindEnd<Tail, [...Depth, unknown], Accumulated extends '' ? Head : `${Accumulated} ${Head}`>
    : IsKeyword<Head, 'end'> extends true
      ? Depth extends [unknown, ...infer DepthRest extends unknown[]]
        ? FindEnd<Tail, DepthRest, Accumulated extends '' ? Head : `${Accumulated} ${Head}`>
        : { body: Trim<Accumulated>; rest: Trim<Tail> }
      : FindEnd<Tail, Depth, Accumulated extends '' ? Head : `${Accumulated} ${Head}`>
  : IsKeyword<S, 'end'> extends true
    ? Depth extends []
      ? { body: Trim<Accumulated>; rest: '' }
      : never
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
  Depth extends unknown[] = [],
> = S extends `${infer Head} ${infer Tail}`
  ? IsKeyword<Head, 'case'> extends true
    ? ScanCaseSegments<Tail, CurrentKind, CurrentText extends '' ? Head : `${CurrentText} ${Head}`, Accumulated, [...Depth, unknown]>
    : IsKeyword<Head, 'end'> extends true
      ? Depth extends [unknown, ...infer DepthRest extends unknown[]]
        ? ScanCaseSegments<Tail, CurrentKind, CurrentText extends '' ? Head : `${CurrentText} ${Head}`, Accumulated, DepthRest>
        : ScanCaseSegments<Tail, CurrentKind, CurrentText extends '' ? Head : `${CurrentText} ${Head}`, Accumulated, Depth>
      : Depth extends []
        ? IsKeyword<Head, 'when'> extends true
          ? ScanCaseSegments<Tail, 'when', '', [...Accumulated, { kind: CurrentKind; text: Trim<CurrentText> }], Depth>
          : IsKeyword<Head, 'then'> extends true
            ? ScanCaseSegments<Tail, 'then', '', [...Accumulated, { kind: CurrentKind; text: Trim<CurrentText> }], Depth>
            : IsKeyword<Head, 'else'> extends true
              ? ScanCaseSegments<Tail, 'else', '', [...Accumulated, { kind: CurrentKind; text: Trim<CurrentText> }], Depth>
              : ScanCaseSegments<Tail, CurrentKind, CurrentText extends '' ? Head : `${CurrentText} ${Head}`, Accumulated, Depth>
        : ScanCaseSegments<Tail, CurrentKind, CurrentText extends '' ? Head : `${CurrentText} ${Head}`, Accumulated, Depth>
  : [...Accumulated, { kind: CurrentKind; text: Trim<CurrentText extends '' ? S : `${CurrentText} ${S}`> }];

type HasElseBranch<Segments extends CaseSegment[]> = Segments extends [
  infer Head extends CaseSegment,
  ...infer Tail extends CaseSegment[],
]
  ? Head['kind'] extends 'else'
    ? true
    : HasElseBranch<Tail>
  : false;

type BranchUnion<
  DB extends SchemaLike,
  Sources extends Source[],
  Segments extends CaseSegment[],
  Strict extends boolean,
> = Segments extends [infer Head extends CaseSegment, ...infer Tail extends CaseSegment[]]
  ? Head['kind'] extends 'then' | 'else'
    ? ResolveColumnType<DB, Sources, Trim<Head['text']>, Strict> | BranchUnion<DB, Sources, Tail, Strict>
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
