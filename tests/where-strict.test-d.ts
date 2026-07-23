import type { Query, StrictQuery, QueryTypeError } from '../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string; age: number; deleted_at: string | null };
  orders: { id: number; user_id: number; price: number };
}

type ValidWhereStillResolves = Expect<
  Equal<StrictQuery<DB, 'select id from users where name = $1'>, { id: number }[]>
>;

type UnknownColumnOnComparisonLhs = Expect<
  Equal<
    StrictQuery<DB, "select id from users where naem = 'x'">,
    QueryTypeError<'unknown column: naem'>[]
  >
>;

type UnknownColumnOnLike = Expect<
  Equal<
    StrictQuery<DB, "select id from users where naem like 'x%'">,
    QueryTypeError<'unknown column: naem'>[]
  >
>;

type UnknownColumnOnIn = Expect<
  Equal<
    StrictQuery<DB, 'select id from users where naem in (1, 2)'>,
    QueryTypeError<'unknown column: naem'>[]
  >
>;

type UnknownColumnOnBetween = Expect<
  Equal<
    StrictQuery<DB, 'select id from users where naem between 1 and 2'>,
    QueryTypeError<'unknown column: naem'>[]
  >
>;

type UnknownColumnOnIsNull = Expect<
  Equal<
    StrictQuery<DB, 'select id from users where naem is null'>,
    QueryTypeError<'unknown column: naem'>[]
  >
>;

type UnknownColumnOnIsNotNull = Expect<
  Equal<
    StrictQuery<DB, 'select id from users where naem is not null'>,
    QueryTypeError<'unknown column: naem'>[]
  >
>;

type UnknownColumnOnIsDistinctFrom = Expect<
  Equal<
    StrictQuery<DB, "select id from users where naem is distinct from 'x'">,
    QueryTypeError<'unknown column: naem'>[]
  >
>;

type NotLikeResolvesColumn = Expect<
  Equal<StrictQuery<DB, "select id from users where name not like 'x%'">, { id: number }[]>
>;

type NotInResolvesColumn = Expect<
  Equal<StrictQuery<DB, 'select id from users where id not in (1, 2)'>, { id: number }[]>
>;

type NotBetweenResolvesColumn = Expect<
  Equal<StrictQuery<DB, 'select id from users where age not between 1 and 2'>, { id: number }[]>
>;

type NotIlikeResolvesColumn = Expect<
  Equal<StrictQuery<DB, "select id from users where name not ilike 'x%'">, { id: number }[]>
>;

type UnknownColumnOnNotLikeStillValidated = Expect<
  Equal<
    StrictQuery<DB, "select id from users where naem not like 'x%'">,
    QueryTypeError<'unknown column: naem'>[]
  >
>;

type FunctionCallOperandResolves = Expect<
  Equal<StrictQuery<DB, "select id from users where upper(name) = 'X'">, { id: number }[]>
>;

type LengthFunctionCallOperandResolves = Expect<
  Equal<StrictQuery<DB, 'select id from users where length(name) > 3'>, { id: number }[]>
>;

type UnknownAliasInWhere = Expect<
  Equal<
    StrictQuery<
      DB,
      "select u.id from users u join orders o on u.id = o.user_id where z.name = 'x'"
    >,
    QueryTypeError<'unknown alias: z'>[]
  >
>;

type AmbiguousUnqualifiedColumnInWhere = Expect<
  Equal<
    StrictQuery<DB, 'select u.name from users u join orders o on u.id = o.user_id where id = 1'>,
    QueryTypeError<'ambiguous column: id'>[]
  >
>;

type QualifiedColumnInWhereIsNotAmbiguous = Expect<
  Equal<
    StrictQuery<
      DB,
      'select u.name from users u join orders o on u.id = o.user_id where u.id = 1'
    >,
    { name: string }[]
  >
>;

type SubqueryInWhereIsSkippedNotValidated = Expect<
  Equal<
    StrictQuery<
      DB,
      'select id from users where id in (select user_id from orders where price > 100)'
    >,
    { id: number }[]
  >
>;

type WhereErrorInsideDerivedTable = Expect<
  Equal<
    StrictQuery<DB, "select x.id from (select id from users where naem = 'x') x">,
    QueryTypeError<'unknown column: id'>[]
  >
>;

type WhereErrorInsideCte = Expect<
  Equal<
    StrictQuery<DB, "with u as (select id from users where naem = 'x') select id from u">,
    QueryTypeError<'unknown column: id'>[]
  >
>;

type ColumnErrorInSelectListTakesPrecedenceOverWhereError = Expect<
  Equal<
    StrictQuery<DB, "select nope from users where naem = 'x'">,
    QueryTypeError<'unknown column: nope'>[]
  >
>;

type NonStrictModeIsUnaffectedByWhereTypos = Expect<
  Equal<Query<DB, "select id from users where naem = 'x'">, { id: number }[]>
>;

// Regression for #128: the trailing operand of a WHERE clause (the last word,
// with no operator after it to trigger validation) must be validated too.
// Symmetric to UnknownColumnOnComparisonLhs, but with the typo on the RHS.
type UnknownColumnOnComparisonRhs = Expect<
  Equal<
    StrictQuery<DB, 'select id from users where age = naem'>,
    QueryTypeError<'unknown column: naem'>[]
  >
>;

// Lock: a VALID trailing operand (a real column as the final token) still
// passes — the terminal-case validation must not reject good queries.
type ValidTrailingColumnOperandResolves = Expect<
  Equal<StrictQuery<DB, 'select id from users where age = id'>, { id: number }[]>
>;

// Lock: a trailing literal is not a column and must not be flagged.
type ValidTrailingLiteralOperandResolves = Expect<
  Equal<StrictQuery<DB, 'select id from users where age = 5'>, { id: number }[]>
>;

// Regression for #148: the RHS operand of a comparison immediately before
// `and`/`or` (mid-clause, not the trailing token) must be validated too.
// Before the fix this typo passed strict mode because `and` overwrote `Prev`
// without ever validating it.
type UnknownColumnOnRhsBeforeAnd = Expect<
  Equal<
    StrictQuery<DB, 'select id from users where age = naem and id = 1'>,
    QueryTypeError<'unknown column: naem'>[]
  >
>;

// Lock: the same clause with a VALID RHS column before `and` still resolves —
// the boundary validation must not reject good queries.
type ValidRhsBeforeAndResolves = Expect<
  Equal<StrictQuery<DB, 'select id from users where age = id and id = 1'>, { id: number }[]>
>;

// `or` variant of the mid-clause RHS check.
type UnknownColumnOnRhsBeforeOr = Expect<
  Equal<
    StrictQuery<DB, 'select id from users where age = naem or id = 1'>,
    QueryTypeError<'unknown column: naem'>[]
  >
>;

// The LHS operand of the comparison *after* `and`/`or` must still be validated
// by the existing flow (the operator following it triggers the check).
type UnknownColumnOnLhsAfterAnd = Expect<
  Equal<
    StrictQuery<DB, 'select id from users where age = 1 and naem = 2'>,
    QueryTypeError<'unknown column: naem'>[]
  >
>;

// NOT-form interaction: `not like 'x'` validates `age`, the `and` boundary
// validates the string literal `'x'` (harmless) and resets, and the LHS `naem`
// of the next comparison is then validated.
type NotFormComposesWithAndBoundary = Expect<
  Equal<
    StrictQuery<DB, "select id from users where age not like 'x' and naem = 1">,
    QueryTypeError<'unknown column: naem'>[]
  >
>;

export type WhereStrictLock = [
  ValidWhereStillResolves,
  UnknownColumnOnComparisonLhs,
  UnknownColumnOnLike,
  UnknownColumnOnIn,
  UnknownColumnOnBetween,
  UnknownColumnOnIsNull,
  UnknownColumnOnIsNotNull,
  UnknownColumnOnIsDistinctFrom,
  NotLikeResolvesColumn,
  NotInResolvesColumn,
  NotBetweenResolvesColumn,
  NotIlikeResolvesColumn,
  UnknownColumnOnNotLikeStillValidated,
  FunctionCallOperandResolves,
  LengthFunctionCallOperandResolves,
  UnknownAliasInWhere,
  AmbiguousUnqualifiedColumnInWhere,
  QualifiedColumnInWhereIsNotAmbiguous,
  SubqueryInWhereIsSkippedNotValidated,
  WhereErrorInsideDerivedTable,
  WhereErrorInsideCte,
  ColumnErrorInSelectListTakesPrecedenceOverWhereError,
  NonStrictModeIsUnaffectedByWhereTypos,
  UnknownColumnOnComparisonRhs,
  ValidTrailingColumnOperandResolves,
  ValidTrailingLiteralOperandResolves,
  UnknownColumnOnRhsBeforeAnd,
  ValidRhsBeforeAndResolves,
  UnknownColumnOnRhsBeforeOr,
  UnknownColumnOnLhsAfterAnd,
  NotFormComposesWithAndBoundary,
];
