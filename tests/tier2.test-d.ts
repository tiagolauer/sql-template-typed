import type { Query } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: {
    id: number;
    name: string;
    bio: string | null;
    age: number;
  };
}

type CountStar = Expect<
  Equal<Query<DB, 'select count(*) from users'>, { count: number }[]>
>;

type CountAliased = Expect<
  Equal<Query<DB, 'select count(*) as total from users'>, { total: number }[]>
>;

type ScalarFunction = Expect<
  Equal<Query<DB, 'select lower(name) from users'>, { lower: string }[]>
>;

type AggregateAliased = Expect<
  Equal<Query<DB, 'select max(age) as oldest from users'>, { oldest: number }[]>
>;

type MixedColumnsAndFunctions = Expect<
  Equal<
    Query<DB, 'select id, upper(name) as shout from users'>,
    { id: number; shout: string }[]
  >
>;

type NullableColumn = Expect<
  Equal<Query<DB, 'select bio from users'>, { bio: string | null }[]>
>;

type NullableAliased = Expect<
  Equal<Query<DB, 'select bio as about from users'>, { about: string | null }[]>
>;

type InsertReturning = Expect<
  Equal<
    Query<DB, 'insert into users (name) values ($1) returning id, name'>,
    { id: number; name: string }[]
  >
>;

type UpdateReturningStar = Expect<
  Equal<
    Query<DB, 'update users set name = $1 where id = $2 returning *'>,
    { id: number; name: string; bio: string | null; age: number }[]
  >
>;

type DeleteReturning = Expect<
  Equal<Query<DB, 'delete from users where id = $1 returning id'>, { id: number }[]>
>;

type InsertWithoutReturning = Expect<
  Equal<Query<DB, 'insert into users (name) values ($1)'>, Record<string, never>[]>
>;

type NowIsDate = Expect<
  Equal<Query<DB, 'select now() as created'>, { created: Date }[]>
>;

type CurrentTimestampIsDate = Expect<
  Equal<Query<DB, 'select current_timestamp() as created'>, { created: Date }[]>
>;

type CurrentDateIsDate = Expect<
  Equal<Query<DB, 'select current_date() as today'>, { today: Date }[]>
>;

type NullifIsUnknown = Expect<
  Equal<Query<DB, 'select nullif(age) as age from users'>, { age: unknown }[]>
>;

type GreatestAndLeastAreNumber = Expect<
  Equal<
    Query<DB, 'select greatest(age) as hi, least(age) as lo from users'>,
    { hi: number; lo: number }[]
  >
>;

type PowerAndModAreNumber = Expect<
  Equal<
    Query<DB, 'select power(age) as squared, mod(age) as remainder from users'>,
    { squared: number; remainder: number }[]
  >
>;

export type Tier2Lock = [
  CountStar,
  CountAliased,
  ScalarFunction,
  AggregateAliased,
  MixedColumnsAndFunctions,
  NullableColumn,
  NullableAliased,
  InsertReturning,
  UpdateReturningStar,
  DeleteReturning,
  InsertWithoutReturning,
  NowIsDate,
  CurrentTimestampIsDate,
  CurrentDateIsDate,
  NullifIsUnknown,
  GreatestAndLeastAreNumber,
  PowerAndModAreNumber,
];
