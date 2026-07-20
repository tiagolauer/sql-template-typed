import type { Params } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string; age: number; active: boolean; deleted_at: string | null };
  orders: { id: number; user_id: number; price: number };
}

type LikeParam = Expect<
  Equal<Params<DB, 'select id from users where name like $1'>, [string]>
>;

type NotLikeParam = Expect<
  Equal<Params<DB, 'select id from users where name not like $1'>, [string]>
>;

type IlikeParam = Expect<
  Equal<Params<DB, 'select id from users where name ilike $1'>, [string]>
>;

type InListParams = Expect<
  Equal<Params<DB, 'select id from users where id in ($1, $2)'>, [number, number]>
>;

type NotInListParams = Expect<
  Equal<Params<DB, 'select id from users where id not in ($1, $2)'>, [number, number]>
>;

type BetweenParams = Expect<
  Equal<Params<DB, 'select id from users where age between $1 and $2'>, [number, number]>
>;

type IsDistinctFromParam = Expect<
  Equal<
    Params<DB, 'select id from users where deleted_at is distinct from $1'>,
    [string | null]
  >
>;

type IsNotDistinctFromParam = Expect<
  Equal<
    Params<DB, 'select id from users where deleted_at is not distinct from $1'>,
    [string | null]
  >
>;

type IsDistinctFromCombinedWithAnotherCondition = Expect<
  Equal<
    Params<DB, 'select id from users where deleted_at is distinct from $1 and id = $2'>,
    [string | null, number]
  >
>;

type MakingFromTransparentDoesNotBreakJoinParams = Expect<
  Equal<
    Params<
      DB,
      'select u.name from users u join orders o on u.id = o.user_id where o.price > $1'
    >,
    [number]
  >
>;

type IsNullDoesNotAffectArity = Expect<
  Equal<
    Params<DB, 'select id from users where deleted_at is null and id = $1'>,
    [number]
  >
>;

type IsNotNullDoesNotAffectArity = Expect<
  Equal<
    Params<DB, 'select id from users where deleted_at is not null and id = $1'>,
    [number]
  >
>;

type MultipleAndConditions = Expect<
  Equal<
    Params<DB, 'select id from users where active = $1 and age > $2 and name = $3'>,
    [boolean, number, string]
  >
>;

type OrConditions = Expect<
  Equal<
    Params<DB, 'select id from users where id = $1 or name = $2'>,
    [number, string]
  >
>;

export type WhereLock = [
  LikeParam,
  NotLikeParam,
  IlikeParam,
  InListParams,
  NotInListParams,
  BetweenParams,
  IsDistinctFromParam,
  IsNotDistinctFromParam,
  IsDistinctFromCombinedWithAnotherCondition,
  MakingFromTransparentDoesNotBreakJoinParams,
  IsNullDoesNotAffectArity,
  IsNotNullDoesNotAffectArity,
  MultipleAndConditions,
  OrConditions,
];
