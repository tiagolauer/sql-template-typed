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
- `@owlsql/core/ts-plugin` — in-editor column-name autocomplete
  (v1: `SELECT`-list completions only).
- [COMPARISON.md](COMPARISON.md) — sourced comparison vs Prisma/Kysely/
  pgTyped/Zapatos on build step, runtime cost, bundle size, and DX.

## In progress / help wanted

Bigger pieces that need real parser or compiler-API design work — not
first-timer-sized, but open if you want to dig in:

- **Scalar subqueries in `SELECT`/`WHERE`** (currently resolve to `unknown`
  by design — see [Limitations](README.md#limitations)). Needs the same
  balanced-paren extraction used for CTEs/derived tables, applied at an
  arbitrary expression position instead of only in `FROM`.
- **`ts-plugin` v2**: hover info (column type on hover), inline diagnostics
  for unknown columns/tables (reusing strict-mode's `QueryTypeError` logic
  but surfaced as a `tsserver` diagnostic instead of a type), and `JOIN`/
  alias-aware completions (right now only the first `FROM <table>` is used
  to scope suggestions).
- **Typed params inside a `WITH` CTE's own subquery body** — a placeholder
  written inside a CTE's own definition still can't be typed; the whole
  query falls back to `unknown[]` rather than mistyping it. (`INSERT ...
  VALUES` params against an explicit column list, and params in a query's
  outer `SELECT` referencing a CTE by name, are both typed now — see
  [README limitations](README.md#limitations).)
- **Nested `CASE`** — the parser currently finds the first top-level `END`
  only.
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
