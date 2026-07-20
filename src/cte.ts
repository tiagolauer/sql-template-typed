import type { Trim, FirstWord, DropFirstWord, IsKeyword, ExtractParenGroup } from './string.js';
import type { SchemaLike, Flatten } from './parse.js';
import type { InferRowWith } from './parse.js';

type CteEntry = [name: string, query: string];

type CteNameAndRest<S extends string> = S extends `${infer NamePart}(${infer AfterOpen}`
  ? NamePart extends `${string} ${string}`
    ? { name: FirstWord<S>; rest: Trim<DropFirstWord<S>> }
    : ExtractParenGroup<AfterOpen> extends { rest: infer Rest extends string }
      ? { name: NamePart; rest: Trim<Rest> }
      : never
  : { name: FirstWord<S>; rest: Trim<DropFirstWord<S>> };

type ParseCteEntry<S extends string> = CteNameAndRest<Trim<S>> extends {
  name: infer Name extends string;
  rest: infer Rest extends string;
}
  ? IsKeyword<FirstWord<Rest>, 'as'> extends true
    ? Trim<DropFirstWord<Rest>> extends `(${infer AfterOpen}`
      ? ExtractParenGroup<AfterOpen> extends { inner: infer SubQuery extends string; rest: infer AfterQuery extends string }
        ? { name: Name; query: Trim<SubQuery>; rest: Trim<AfterQuery> }
        : never
      : never
    : never
  : never;

type ParseCteList<S extends string, Accumulated extends CteEntry[] = []> =
  ParseCteEntry<S> extends {
    name: infer Name extends string;
    query: infer Query extends string;
    rest: infer Rest extends string;
  }
    ? Rest extends `,${infer After}`
      ? ParseCteList<Trim<After>, [...Accumulated, [Name, Query]]>
      : { ctes: [...Accumulated, [Name, Query]]; rest: Rest }
    : never;

type SkipRecursiveKeyword<S extends string> = IsKeyword<FirstWord<S>, 'recursive'> extends true
  ? Trim<DropFirstWord<S>>
  : S;

export type ParseWithClause<S extends string> = IsKeyword<FirstWord<S>, 'with'> extends true
  ? ParseCteList<SkipRecursiveKeyword<Trim<DropFirstWord<S>>>> extends {
      ctes: infer Ctes extends CteEntry[];
      rest: infer Rest extends string;
    }
    ? { ctes: Ctes; rest: Rest }
    : never
  : never;

export type BuildCteMap<
  DB extends SchemaLike,
  Ctes extends CteEntry[],
  Strict extends boolean,
  Accumulated extends Record<string, unknown> = Record<never, never>,
> = Ctes extends [infer Head extends CteEntry, ...infer Tail extends CteEntry[]]
  ? BuildCteMap<
      DB,
      Tail,
      Strict,
      Accumulated & { [Key in Head[0]]: Flatten<InferRowWith<DB & Accumulated, Head[1], Strict>> }
    >
  : Accumulated;
