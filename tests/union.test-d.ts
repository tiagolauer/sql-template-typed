import type { Query } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  active_users: { id: number; name: string };
  archived_users: { id: number; name: string };
}

type UnionUsesFirstBranchShape = Expect<
  Equal<
    Query<DB, 'select id, name from active_users union select id, name from archived_users'>,
    { id: number; name: string }[]
  >
>;

type UnionAllUsesFirstBranchShape = Expect<
  Equal<
    Query<
      DB,
      'select id, name from active_users union all select id, name from archived_users'
    >,
    { id: number; name: string }[]
  >
>;

export type UnionLock = [UnionUsesFirstBranchShape, UnionAllUsesFirstBranchShape];
