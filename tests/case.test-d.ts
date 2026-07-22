import type { Query } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string; active: boolean; age: number };
}

type CaseWithLiterals = Expect<
  Equal<
    Query<DB, "select case when active then 'yes' else 'no' end as status from users">,
    { status: string }[]
  >
>;

type CaseWithoutElseIsNullable = Expect<
  Equal<
    Query<DB, "select case when active then 'yes' end as status from users">,
    { status: string | null }[]
  >
>;

type CaseWithMultipleWhen = Expect<
  Equal<
    Query<
      DB,
      "select case when age < 18 then 'minor' when age < 65 then 'adult' else 'senior' end as bracket from users"
    >,
    { bracket: string }[]
  >
>;

type CaseWithColumnBranch = Expect<
  Equal<
    Query<DB, 'select case when active then name else id end as label from users'>,
    { label: string | number }[]
  >
>;

type CaseWithoutAliasDefaultsToCase = Expect<
  Equal<
    Query<DB, "select case when active then 'yes' else 'no' end from users">,
    { case: string }[]
  >
>;

type CaseWithUnknownColumnFallsBackToUnknown = Expect<
  Equal<
    Query<DB, "select case when active then nope else 'no' end as status from users">,
    { status: unknown }[]
  >
>;

type NestedCase = Expect<
  Equal<
    Query<
      DB,
      "select case when active then case when age < 18 then 'minor' else 'adult' end else 'inactive' end as status from users"
    >,
    { status: string }[]
  >
>;

type NestedCaseFollowedByOuterElse = Expect<
  Equal<
    Query<
      DB,
      "select case when active then 'yes' end as flag, case when age < 18 then case when name = 'x' then 1 else 2 end else 3 end as bracket from users"
    >,
    { flag: string | null; bracket: number }[]
  >
>;

export type CaseLock = [
  CaseWithLiterals,
  CaseWithoutElseIsNullable,
  CaseWithMultipleWhen,
  CaseWithColumnBranch,
  CaseWithoutAliasDefaultsToCase,
  CaseWithUnknownColumnFallsBackToUnknown,
  NestedCase,
  NestedCaseFollowedByOuterElse,
];
