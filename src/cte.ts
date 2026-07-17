import type { Trim, FirstWord, DropFirstWord, IsKeyword, ExtractParenGroup } from './string.js';
import type { SchemaLike, Flatten } from './parse.js';
import type { InferRowWith } from './parse.js';

type CteEntry = [name: string, query: string];

type ParseCteEntry<S extends string> = Trim<S> extends `${infer NameWord} ${infer AfterName}`
  ? IsKeyword<FirstWord<Trim<AfterName>>, 'as'> extends true
    ? Trim<DropFirstWord<Trim<AfterName>>> extends `(${infer AfterOpen}`
      ? ExtractParenGroup<AfterOpen> extends { inner: infer SubQuery extends string; rest: infer Rest extends string }
        ? { name: Trim<NameWord>; query: Trim<SubQuery>; rest: Trim<Rest> }
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

export type ParseWithClause<S extends string> = IsKeyword<FirstWord<S>, 'with'> extends true
  ? ParseCteList<Trim<DropFirstWord<S>>> extends {
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
