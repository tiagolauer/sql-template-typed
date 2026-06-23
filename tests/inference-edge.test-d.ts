import type { Query } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string };
}

type UnknownColumnResolvesToUnknown = Expect<
  Equal<Query<DB, 'select missing from users'>, { missing: unknown }[]>
>;

type UnknownTableColumnsResolveToUnknown = Expect<
  Equal<Query<DB, 'select id, name from ghosts'>, { id: unknown; name: unknown }[]>
>;

export type BehaviorLock = [
  UnknownColumnResolvesToUnknown,
  UnknownTableColumnsResolveToUnknown,
];
