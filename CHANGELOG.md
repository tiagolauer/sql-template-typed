# Changelog

Notable changes to this project, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This log starts at 0.1.8; earlier history lives in git and the GitHub releases page.

## [0.1.8] - 2026-07-24

### Added

- `MERGE` statement support for SQL Server: types the target table and the `OUTPUT` clause, including the `$action` pseudo-column.
- Per-adapter transaction helpers (`createPgTransaction`, `createMysql2Transaction`, `createPostgresJsTransaction`, `createMssqlTransaction`) that pin a single connection and handle begin/commit/rollback for you.
- Editor diagnostics for simple `WHERE`-clause column references: unknown column, unknown table, unknown alias, ambiguous column.
- Table-name completions after `FROM`/`JOIN` in the editor plugin.
- `owlsql generate --check` for catching schema drift in CI without writing the file.

### Fixed

- `UPDATE ... FROM` and `DELETE ... USING` now register the extra table as a source instead of ignoring it.
- Postgres array columns map to more accurate JS types instead of assuming every array becomes `T[]`.
- SQLite `BLOB` columns map to `Uint8Array`, matching what `node:sqlite` actually returns.
- The `pg`, `postgres.js`, and `mysql2` adapters all normalize `undefined` parameters to `null` the same way.
- Corrected the Kysely adapter docs: placeholder-style checking already works there, it just needs `{ placeholders: ... }` passed explicitly.
- Editor plugin no longer treats a backslash-escaped quote (`\'`) as the end of a string literal.
- Editor plugin schema lookups now handle optional table keys and `Record<string, ...>` schemas.
- Editor plugin detects `TypedDb` even when it's wrapped in an interface or a generic type parameter.
- Nested `CASE` expressions wrapped in parentheses parse correctly.
- Function call output columns keep the casing you wrote instead of being lowercased.
- `JOIN LATERAL` subqueries resolve correctly instead of being misread.
- A CTE that reuses a real table's name now shadows it instead of leaking the original table's columns.
- Editor plugin recognizes `WITH` queries instead of losing completions for the whole statement.
- Documented that `count`/`sum`/`avg` come back as strings from `pg` by default, the same caveat already noted for `min`/`max`.
