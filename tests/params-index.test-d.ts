import type { Params } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string; parent_id: number };
}

type OutOfOrderPlaceholdersBindByIndex = Expect<
  Equal<
    Params<DB, 'select id from users where name = $2 and id = $1'>,
    [number, string]
  >
>;

type RepeatedPlaceholderOccupiesOneSlot = Expect<
  Equal<
    Params<DB, 'select id from users where id = $1 or parent_id = $1'>,
    [number]
  >
>;

type GapLeavesUnknownSlot = Expect<
  Equal<Params<DB, 'select id from users where name = $2'>, [unknown, string]>
>;

type DoubleDigitIndexResolves = Expect<
  Equal<
    Params<
      DB,
      'select id from users where id = $10 and name = $1'
    >['length'],
    10
  >
>;

type QuestionMarksStaySequential = Expect<
  Equal<
    Params<DB, 'select id from users where id = ? and name = ?'>,
    [number, string]
  >
>;

type NamedAtParamsStaySequential = Expect<
  Equal<
    Params<DB, 'select id from users where id = @id and name = @name'>,
    [number, string]
  >
>;

type SystemVariableIsNotPlaceholder = Expect<
  Equal<Params<DB, 'select id from users where id = @@rowcount'>, []>
>;

type InsertOutOfOrderPlaceholdersBindByIndex = Expect<
  Equal<
    Params<DB, 'insert into users (id, name) values ($2, $1)'>,
    [string, number]
  >
>;

type InsertInOrderStillWorks = Expect<
  Equal<
    Params<DB, 'insert into users (id, name) values ($1, $2)'>,
    [number, string]
  >
>;

export type Assertions = [
  OutOfOrderPlaceholdersBindByIndex,
  RepeatedPlaceholderOccupiesOneSlot,
  GapLeavesUnknownSlot,
  DoubleDigitIndexResolves,
  QuestionMarksStaySequential,
  NamedAtParamsStaySequential,
  SystemVariableIsNotPlaceholder,
  InsertOutOfOrderPlaceholdersBindByIndex,
  InsertInOrderStillWorks,
];
