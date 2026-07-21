import { defineSchema } from '../src/index.js';
import type { Row, StrictRow, FunctionReturnTypes, Query } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string };
}

type RowInfersSingleObject = Expect<
  Equal<Row<DB, 'select id, name from users'>, { id: number; name: string }>
>;

type RowMatchesQueryElement = Expect<
  Equal<Row<DB, 'select id from users'>, Query<DB, 'select id from users'>[number]>
>;

type StrictRowInfersSingleObject = Expect<
  Equal<StrictRow<DB, 'select id from users'>, { id: number }>
>;

type FunctionRegistryTypesCount = Expect<Equal<FunctionReturnTypes['count'], number>>;

type FunctionRegistryTypesLower = Expect<Equal<FunctionReturnTypes['lower'], string>>;

const inlineSchema = defineSchema({ users: { id: 0 as number, name: '' as string } });

type DefineSchemaPreservesShape = Expect<
  Equal<
    typeof inlineSchema,
    { readonly users: { readonly id: number; readonly name: string } }
  >
>;

export type Assertions = [
  RowInfersSingleObject,
  RowMatchesQueryElement,
  StrictRowInfersSingleObject,
  FunctionRegistryTypesCount,
  FunctionRegistryTypesLower,
  DefineSchemaPreservesShape,
];
