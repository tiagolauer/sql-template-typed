# Roadmap

Where OwlSQL is headed, and where it's already been. This is a
living document — it reflects the current state of the type-level parser and
the editor tooling, not a promise of dates.

## Shipped

- Core parser: `SELECT`/`INSERT`/`UPDATE`/`DELETE`, joins (`INNER`/`LEFT`/
  `RIGHT`/`FULL`/`CROSS`), aliases, `*`/qualified star, aggregates/functions,
  `RETURNING`, strict mode, typed parameters.
- `WHERE` operators (`LIKE`/`IN`/`BETWEEN`/`IS NULL`/`AND`/`OR`), `GROUP BY`/
  `HAVING`/`ORDER BY`/`LIMIT`/`OFFSET`, `UNION`/`UNION ALL`, `CASE`, window
  functions, CTEs (`WITH`), derived-table subqueries in `FROM`.
- Official multi-database support: PostgreSQL, MySQL, SQLite, SQL Server
  (named `@params`, backtick identifiers, `TOP`, `OUTPUT`).
- Ready-made driver adapters (`pg`, `mysql2`, `postgres.js`, `node:sqlite`,
  Kysely) and a documented Drizzle recipe.
- `npx @owlsql/core generate` — schema introspection CLI for all four
  databases.
- `@owlsql/core/ts-plugin` — in-editor column-name autocomplete and hover
  info, `JOIN`/alias-aware, plus live diagnostics for unknown columns,
  unknown tables, unknown aliases, and ambiguous unqualified columns in the
  `SELECT` list and `FROM`/`JOIN` clause.
- Scalar subqueries in the `SELECT` list — single-column subqueries are
  typed; a multi-column subquery resolves to `unknown` in normal mode and a
  `QueryTypeError` in strict mode (selecting more than one column from a
  scalar subquery is invalid SQL). See [README limitations](README.md#limitations).
- Typed params inside a `WITH` CTE's own body — a placeholder in a CTE's
  own definition is typed against that CTE's own `FROM` source, in textual
  order alongside `INSERT ... VALUES` params and params in the outer query
  referencing a CTE by name.
- Nested `CASE` — a `CASE` nested inside another `CASE`'s `WHEN`/`THEN`/
  `ELSE` branch is parsed and typed like any other branch expression.
- [COMPARISON.md](COMPARISON.md) — sourced comparison vs Prisma/Kysely/
  pgTyped/Zapatos on build step, runtime cost, bundle size, and DX.

## In progress / help wanted

Bigger pieces that need real parser or compiler-API design work — not
first-timer-sized, but open if you want to dig in:

- **Scalar subqueries in `WHERE`** still resolve to `unknown` — `WHERE`
  isn't part of the typed structure at all right now, only scanned for
  parameter placeholders.
- **`ts-plugin` on TypeScript 7+** — TS 7's native (Go) compiler dropped the
  classic JS Compiler API entirely (no `ts.Node`/`ts.forEachChild`/
  `ts.createProgram` in the package anymore, replaced by a still-`unstable/`-
  prefixed AST API). This isn't unique to this project — it breaks every
  tsserver plugin built the classic way. Blocked on either TypeScript
  shipping a compatibility layer or the new API stabilizing enough to port
  to; not worth chasing while it's explicitly marked unstable upstream.

## Good first issues

Small, self-contained gaps — see issues labeled
[`good first issue`](https://github.com/tiagolauer/OwlSQL/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
on GitHub. Each one names the exact file and the pattern to follow from
neighboring code, so you don't need to understand the whole parser to land
one.

## Not planned

- A query builder API. The whole point is writing SQL directly — a builder
  API would duplicate what Kysely already does well (see
  [COMPARISON.md](COMPARISON.md)).
- Migrations. Out of scope; use a dedicated migration tool alongside this
  library.
- Runtime SQL execution or a bundled driver. The library only infers types;
  you always bring your own driver/executor.
