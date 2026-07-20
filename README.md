# OwlSQL

> Write raw SQL. Get fully-typed results. No codegen, no ORM, no runtime parsing.

OwlSQL (`@owlsql/core`) reads your SQL **inside TypeScript's type system** and
infers the row shape directly from the query string and your schema. The query
`'select id, name from users'` becomes `{ id: number; name: string }[]` — at
edit time, in your IDE, with zero build step.

```ts
const result = await db.query('select id, name from users');

if (result.status === ResultStatus.Ok) {
  result.value;
  //     ^? { id: number; name: string }[]
}
```

**[Try it in your browser →](https://stackblitz.com/github/tiagolauer/OwlSQL/tree/master/examples/playground?file=index.ts)**
No install, no database — see [`examples/playground`](examples/playground).

---

## Table of contents

- [What it does](#what-it-does)
- [Why I built it](#why-i-built-it)
- [How it works](#how-it-works)
- [Install](#install)
- [Tutorial](#tutorial)
  - [1. Describe your schema](#1-describe-your-schema)
  - [2. Create a typed client](#2-create-a-typed-client)
  - [3. Run queries and handle the Result](#3-run-queries-and-handle-the-result)
  - [4. Aliases, `*`, and qualified columns](#4-aliases--and-qualified-columns)
  - [5. Type-only usage (no client)](#5-type-only-usage-no-client)
  - [6. Aggregates and functions](#6-aggregates-and-functions)
  - [7. INSERT / UPDATE / DELETE with RETURNING](#7-insert--update--delete-with-returning)
  - [8. Strict mode — turn typos into type errors](#8-strict-mode--turn-typos-into-type-errors)
  - [9. Joins](#9-joins)
  - [10. Typed parameters](#10-typed-parameters)
- [Driver recipes](#driver-recipes)
- [Database support](#database-support)
- [Editor autocomplete](#editor-autocomplete)
- [API reference](#api-reference)
- [Supported SQL subset](#supported-sql-subset)
- [Limitations](#limitations)
- [FAQ](#faq)
- [Contributing](#contributing)
- [License](#license)

---

## What it does

You give it two things:

1. A **schema** — a TypeScript type mapping each table to its columns and their
   types.
2. A **SQL query** — written as a plain string literal.

It gives you back the **exact result type**, computed by the compiler from the
text of the query:

```ts
type DB = {
  users: { id: number; name: string; email: string; active: boolean };
};

const a = await db.query('select id from users');
//        a.value ^? { id: number }[]

const b = await db.query('select name as handle, active from users');
//        b.value ^? { handle: string; active: boolean }[]

const c = await db.query('select * from users');
//        c.value ^? { id: number; name: string; email: string; active: boolean }[]
```

Rename a column in the SQL, mistype a field, or select something that does not
exist, and the result type changes immediately — before you run a single line.
There is **no generated file to keep in sync** and **no SQL parser shipped to
production**: all the work happens during type checking.

It is **not** an ORM and **not** a query builder. It does not connect to your
database. You keep writing the SQL you already know; this library only layers
compile-time result typing on top of whatever driver you use.

## Why I built it

I was building a TypeScript backend and deliberately chose **raw SQL** over an
ORM — I wanted full control over the queries, predictable performance, and no
magic between my code and the database. That part worked great.

The pain was the **return types**. Every query handed me back `any[]` (or
`unknown[]`), so I hand-wrote an interface for each result:

```ts
interface UserListRow { id: number; name: string }
const rows = (await pool.query('select id, name from users')).rows as UserListRow[];
```

Two problems showed up fast:

1. **They drift.** Someone edits the SQL to also select `email`, but forgets the
   interface. Now the type lies, and the bug only surfaces at runtime — usually
   in production.
2. **They're pure boilerplate.** The interface is just the query restated in
   another syntax. I was typing the same column list twice.

The usual fixes did not fit:

- **ORMs** (Prisma, TypeORM) replace my SQL with their own DSL and runtime — the
  exact thing I was trying to avoid.
- **Codegen tools** (Prisma, `pgtyped`, Kysely-codegen) do give accurate types,
  but they bolt a **generation step** onto the build: a watcher, a CLI, a
  database connection at build time, generated files in version control. More
  moving parts to break in CI.

What I actually wanted was simple: **the query string is already the source of
truth — let the compiler read it.** TypeScript's template literal types are
powerful enough to parse a `SELECT` and map columns to a schema, entirely at
type-check time. So I wrote that. No DSL, no generated files, no build step —
just the SQL I was already writing, now correctly typed.

For a detailed, sourced comparison against Prisma, Kysely, pgTyped, and
Zapatos on build step, runtime cost, bundle size, and DX (not runtime query
speed), see [COMPARISON.md](COMPARISON.md).

## How it works

There is no runtime SQL parser and no build step. The entire parser is written
as recursive [template literal types](https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html)
evaluated by `tsc`:

1. **Normalize** — collapse newlines, tabs, and runs of spaces into a single
   trimmed, single-spaced string.
2. **Parse** — strip the `SELECT` keyword, split on the first case-insensitive
   `FROM`, and separate the column list from the table name.
3. **Resolve** — parse each column into `[outputName, sourceColumn]` (handling
   `AS` aliases and `table.col` qualifiers), then look the column up in your
   schema to get its TypeScript type.
4. **Assemble** — build `{ ...columns }[]`.

The JavaScript that actually ships is a tiny passthrough: it forwards your SQL
to the driver you provide and wraps the rows in a `Result`. All the intelligence
lives in the `.d.ts` types.

## Install

```bash
npm install @owlsql/core
```

`typescript` is a peer dependency (**>= 5.0** — required for template literal
type recursion). You almost certainly already have it.

## Tutorial

### 1. Describe your schema

A schema is just a type: table name → column name → TypeScript type. Use a
`type` or an `interface`, whichever you prefer.

```ts
type DB = {
  users: {
    id: number;
    name: string;
    email: string;
    active: boolean;
  };
  posts: {
    id: number;
    title: string;
    user_id: number;
    published: boolean;
  };
};
```

This type is the single source of truth for what your tables look like. It has
no runtime cost — it is erased during compilation. Mark nullable columns with
`| null` (e.g. `bio: string | null`) and that nullability flows straight into
your query results.

**Optional: generate a starting point with `owlsql generate`.**
Writing that type by hand is fine for a handful of tables, but you can also
have it generated from a real database:

```
npx @owlsql/core generate --url postgres://user:pass@host/db --out schema.ts
```

This connects to your database, introspects the tables/columns/nullability,
and writes a `schema.ts` with `export interface DB { ... }` — the exact shape
from step 1 above. It's a **one-shot generator, not a codegen pipeline**: the
library still parses your queries entirely at the type level with zero
runtime codegen, same as always. The generated file is a normal `.ts` file —
commit it, edit it by hand afterward, rename fields, anything. Running
`generate` again just overwrites it with a fresh snapshot; nothing stays
"synced" automatically.

| Flag | Required | Description |
| ---- | -------- | ----------- |
| `--url` | yes | Connection string (or a file path for SQLite). |
| `--out` | no | Output file. Defaults to `./schema.ts`. |
| `--dialect` | no | `postgres` \| `mysql` \| `sqlite` \| `mssql`. Auto-detected from the URL scheme (`postgres://`/`postgresql://`, `mysql://`, `mssql://`/`sqlserver://`) — falls back to `sqlite` for a bare file path, so it's only needed when that's ambiguous. |
| `--schema` | no | Schema/database name to introspect. Defaults to `public` (Postgres), the connected database (MySQL), or `dbo` (SQL Server). Not used for SQLite. |

`generate` needs the matching driver installed as a real dependency (`pg`,
`mysql2`, or `mssql` — SQLite uses the `node:sqlite` builtin, Node ≥22.5). It
prints a clear error telling you which one to install if it's missing.

**Type mapping is conservative on purpose.** Types where the default driver
behavior can lose precision — `bigint`, `numeric`/`decimal`, `money` — are
generated as `string`, not `number`, because that's what `pg`/`mysql2` (and,
assumed by analogy, `mssql`) actually hand back by default. If your driver is
configured differently (e.g. mysql2's `supportBigNumbers`), just edit the
generated field by hand; it's a plain type after that point.

### 2. Create a typed client

The library never touches your database. You hand `createTypedDb` an
**executor**: a function that takes `(sql, params)`, runs it against your real
driver, and returns the raw rows.

```ts
import { Pool } from 'pg';
import { createTypedDb } from '@owlsql/core';

const pool = new Pool();

const db = createTypedDb<DB>(async (sql, params) => {
  const res = await pool.query(sql, params as unknown[]);
  return res.rows;
});
```

`db` is now bound to your schema. Every query you run through it will be typed
against `DB`.

### 3. Run queries and handle the Result

`query` does not throw on failure. It returns a **`Result`** — a discriminated
union of success or error — so failures are values you handle explicitly.

```ts
import { ResultStatus } from '@owlsql/core';

const result = await db.query('select id, name from users');

if (result.status === ResultStatus.Error) {
  console.error(result.error.kind, result.error.message);
  return;
}

result.value;
//     ^? { id: number; name: string }[]
for (const user of result.value) {
  console.log(user.id, user.name);
}
```

Prefer a helper over the `status` field? `isOk` / `isErr` narrow the same way:

```ts
import { isOk } from '@owlsql/core';

const result = await db.query('select id, email from users');

if (isOk(result)) {
  result.value;
  //     ^? { id: number; email: string }[]
}
```

> ⚠️ **Pass the SQL as a string literal**, not a `string` variable. If the type
> widens to `string`, the compiler can no longer see the query and inference
> falls back to `unknown`. `db.query('select id from users')` ✅ —
> `const q: string = ...; db.query(q)` ❌.

### 4. Aliases, `*`, and qualified columns

```ts
const renamed = await db.query('select id, name as username from users');
//     renamed.value ^? { id: number; username: string }[]

const implicit = await db.query('select name handle from users');
//     implicit.value ^? { handle: string }[]

const qualified = await db.query('select u.id, u.name from users u');
//     qualified.value ^? { id: number; name: string }[]

const everything = await db.query('select * from users');
//     everything.value ^? { id: number; name: string; email: string; active: boolean }[]
```

Trailing clauses are ignored for inference — they do not change the row shape:

```ts
const recent = await db.query(
  'select id, title from posts where published = true order by id limit 10',
);
//     recent.value ^? { id: number; title: string }[]
```

Keywords are case-insensitive and whitespace/newlines are tolerated, so
formatted multi-line queries work as-is:

```ts
const r = await db.query(`
  SELECT id,
         title
  FROM   posts
  WHERE  published = true
`);
//     r.value ^? { id: number; title: string }[]
```

### 5. Type-only usage (no client)

Sometimes you only want the *type* of a query — for an API contract, a DTO, or a
function signature — without running anything. Use the `Query` type directly:

```ts
import type { Query } from '@owlsql/core';

type UserListRow = Query<DB, 'select id, email from users'>;
//   ^? { id: number; email: string }[]

function renderUsers(rows: Query<DB, 'select id, name from users'>) {
  // rows is { id: number; name: string }[]
}
```

`Row<DB, Q>` gives the single-row object (without the surrounding array) if you
need it.

### 6. Aggregates and functions

Common SQL functions resolve to their return type, and the output column is
named after the function (or its alias):

```ts
const stats = await db.query('select count(*) from users');
//     stats.value ^? { count: number }[]

const named = await db.query('select count(*) as total, max(age) as oldest from users');
//     named.value ^? { total: number; oldest: number }[]

const shout = await db.query('select id, upper(name) as name from users');
//     shout.value ^? { id: number; name: string }[]
```

Recognized: `count`, `sum`, `avg`, `min`, `max`, `length`, `char_length`,
`octet_length`, `abs`, `ceil`, `floor`, `round`, `power`, `mod`, `greatest`,
`least` → `number`; `lower`, `upper`, `trim`, `ltrim`, `rtrim`, `concat` →
`string`; `coalesce`, `nullif` → `unknown`; `now`, `current_timestamp`,
`current_date` → `Date`. Anything else resolves to `unknown`.

### 7. INSERT / UPDATE / DELETE with RETURNING

`RETURNING` is typed exactly like a `SELECT` projection against the target
table:

```ts
const created = await db.query(
  'insert into users (name, email) values ($1, $2) returning id, name',
);
//     created.value ^? { id: number; name: string }[]

const updated = await db.query('update users set active = $1 where id = $2 returning *');
//     updated.value ^? { id: number; name: string; email: string; active: boolean }[]
```

A write without `RETURNING` resolves to `Record<string, never>[]` (no row
columns).

### 8. Strict mode — turn typos into type errors

By default an unknown column or table resolves to `unknown` (permissive). Pass
`{ strict: true }` and the result instead becomes a `QueryTypeError` carrying a
human-readable message, so a typo is impossible to ignore:

```ts
const db = createTypedDb<DB>(executor, { strict: true });

const ok = await db.query('select id, name from users');
//     ok.value ^? { id: number; name: string }[]

const typo = await db.query('select naem from users');
//     typo.value ^? QueryTypeError<'unknown column: naem'>[]
```

The error type propagates wherever you use the rows, surfacing the message in
hovers and breaking any code that treats them as real data.

### 9. Joins

`INNER`, `LEFT`, `RIGHT`, `FULL` (with optional `OUTER`), and `CROSS` joins are
supported, with table aliases and any number of joins. Qualified columns
(`alias.column`) resolve to the aliased table; unqualified columns are searched
across every joined table. `alias.*` expands one table; a bare `*` expands all.

```ts
const rows = await db.query(
  'select u.name, p.title from users u join posts p on u.id = p.user_id',
);
//     rows.value ^? { name: string; title: string }[]
```

An outer join makes the optional side's columns nullable: `LEFT` nulls the
right-hand table, `RIGHT` nulls the left-hand table, and `FULL` nulls both.

```ts
const rows = await db.query(
  'select u.name, p.title from users u left join posts p on u.id = p.user_id',
);
//     rows.value ^? { name: string; title: string | null }[]
```

`select *` across a join merges the columns of every table (applying join
nullability). In strict mode, an unknown alias becomes
`QueryTypeError<'unknown alias: x'>`.

### 10. Typed parameters

Placeholders in the query are typed from the column they're compared against, so
`query` checks the **number and types** of the arguments you pass:

```ts
await db.query('select id from users where id = $1', 1);
//                                          ^ inferred [number]

await db.query('select id from users where id = $1 and name = $2', 1, 'ada');
//                                                          inferred [number, string]

// @ts-expect-error wrong type — id is a number
await db.query('select id from users where id = $1', 'oops');

// @ts-expect-error wrong count — one param expected
await db.query('select id from users where id = $1');
```

Both numbered (`$1`, `$2`) and positional (`?`) placeholders work, including
across joins (`where p.views > $1` resolves against the aliased table). Use the
`Params<DB, Q>` type to get the tuple on its own.

For this to work, write the comparison **with spaces around the operator**
(`id = $1`, not `id=$1`) — that is what lets the compiler see the column,
operator, and placeholder as separate tokens.

## Driver recipes

The executor is the only thing that touches your database, so any driver
works. For the most common drivers, OwlSQL ships a ready-made
adapter — import it from its own subpath and pass your existing client
straight in. No dependency is pulled in unless you import that specific
subpath (each driver is an optional peer dependency).

**node-postgres (`pg`)**

```ts
import { Pool } from 'pg';
import { createPgExecutor } from '@owlsql/core/pg';

const db = createTypedDb<DB>(createPgExecutor(new Pool()));
```

**mysql2**

```ts
import { createPool } from 'mysql2/promise';
import { createMysql2Executor } from '@owlsql/core/mysql2';

const db = createTypedDb<DB>(createMysql2Executor(createPool({ /* ... */ })));
```

**postgres.js**

```ts
import postgres from 'postgres';
import { createPostgresJsExecutor } from '@owlsql/core/postgres';

const db = createTypedDb<DB>(createPostgresJsExecutor(postgres()));
```

**node:sqlite** (Node's built-in SQLite module, no dependency to install — Node ≥22.5)

```ts
import { DatabaseSync } from 'node:sqlite';
import { createNodeSqliteExecutor } from '@owlsql/core/node-sqlite';

const db = createTypedDb<DB>(createNodeSqliteExecutor(new DatabaseSync('app.db')));
```

**better-sqlite3** (synchronous driver wrapped in a promise — no dedicated
adapter, the same one-liner works with `node:sqlite`'s adapter since both
expose `prepare(sql).all(...params)`)

```ts
import Database from 'better-sqlite3';
const sqlite = new Database('app.db');
const db = createTypedDb<DB>(async (sql, params) => sqlite.prepare(sql).all(...params));
```

**Kysely**

```ts
import { Kysely, PostgresDialect } from 'kysely';
import { createKyselyExecutor } from '@owlsql/core/kysely';

const kysely = new Kysely<KyselySchema>({ dialect: new PostgresDialect({ /* ... */ }) });
const db = createTypedDb<DB>(createKyselyExecutor(kysely));
```

The adapter runs your query through `CompiledQuery.raw`, so it works
regardless of which Kysely dialect (`PostgresDialect`, `MysqlDialect`,
`SqliteDialect`, ...) you configured.

**Drizzle (raw SQL)**

Drizzle's own `sql.raw()` doesn't take a separate parameters array, so it
can't be wired directly into an `Executor`. Instead, reach through Drizzle to
the underlying driver client with [`db.$client`](https://orm.drizzle.team/docs/connect-overview)
and reuse the matching adapter above — one extra line over the plain driver:

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { createPgExecutor } from '@owlsql/core/pg';

const drizzleDb = drizzle(process.env.DATABASE_URL!);
const db = createTypedDb<DB>(createPgExecutor(drizzleDb.$client));
```

Swap `createPgExecutor` for `createMysql2Executor`/`createPostgresJsExecutor`/
`createNodeSqliteExecutor` depending on which Drizzle driver you're using —
`$client` is always the native driver instance underneath.

**mssql (SQL Server)** (no dedicated adapter — `mssql` binds parameters by
name rather than by position, so the executor needs a couple of extra lines)

```ts
import sql from 'mssql';
const pool = await sql.connect({ /* ... */ });
const db = createTypedDb<DB>(async (query, params) => {
  const request = pool.request();
  params.forEach((value, index) => request.input(`p${index + 1}`, value));
  const result = await request.query(query);
  return result.recordset;
});
```

`mssql` binds named parameters (`request.input('name', value)`), so build the
query with matching `@pN` placeholders — `Params<DB, Q>` still gives you a
positional tuple typed against the query's `@` placeholders, in the order they
appear.

## Database support

The parser accepts the SQL used by each of the four major engines, without any
per-dialect configuration — it stays permissive and recognizes each dialect's
syntax by shape, not by a declared "mode".

| Feature | PostgreSQL | MySQL | SQLite | SQL Server |
| ------- | ---------- | ----- | ------ | ---------- |
| Placeholders | `$1`, `$2`, ... | `?` | `?` | `@name`, `@p1` |
| Quoted identifiers | `"col"` | `` `col` `` | `"col"` | `[col]`, `"col"` |
| Row-returning writes | `RETURNING col` | *(not supported by the engine — `INSERT`/`UPDATE`/`DELETE` type as `Record<string, never>[]`)* | `RETURNING col` | `OUTPUT inserted.col` / `OUTPUT deleted.col` |
| Pagination | `LIMIT n OFFSET m` | `LIMIT n OFFSET m` | `LIMIT n OFFSET m` | `TOP n`, `TOP (n) PERCENT`, or `OFFSET ... FETCH NEXT n ROWS ONLY` |
| `ILIKE` | ✓ | — | — | — |
| Joins, CTEs, `CASE`, window functions, subqueries in `FROM` | ✓ | ✓ | ✓ | ✓ (dialect-agnostic — see [Supported SQL subset](#supported-sql-subset)) |

See [`tests/dialect-postgres.test-d.ts`](tests/dialect-postgres.test-d.ts),
[`tests/dialect-mysql.test-d.ts`](tests/dialect-mysql.test-d.ts),
[`tests/dialect-sqlite.test-d.ts`](tests/dialect-sqlite.test-d.ts), and
[`tests/dialect-mssql.test-d.ts`](tests/dialect-mssql.test-d.ts) for the exact
query shapes each engine is tested against.

## Editor autocomplete

```ts
db.query(`
  select id, na
`)
//              ^ autocomplete suggests `name`
```

Want to see it running for yourself before there's a recorded demo here?
[`examples/ts-plugin-demo`](examples/ts-plugin-demo) is a ready-to-open
VSCode project set up for exactly that.

`@owlsql/core/ts-plugin` is a **TypeScript Language Service Plugin** —
it runs inside `tsserver`, the same process that already powers VSCode's
IntelliSense, and adds column-name completions while you're still typing the
query string. This is a genuinely different mechanism from the rest of the
library: everything else works by *type-checking* a finished query string;
this works by hooking into the editor's completion request for a string
that isn't even valid SQL yet.

**Setup** — add it to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [{ "name": "@owlsql/core/ts-plugin" }]
  }
}
```

Then, in VSCode, open the Command Palette and run **"TypeScript: Select
TypeScript Version" → "Use Workspace Version"**. This step is not optional —
VSCode's *bundled* TypeScript does not load workspace plugins, so skipping it
is the #1 reason this kind of plugin appears to do nothing. Other editors
that talk to `tsserver` (Cursor, some Neovim/Sublime LSP setups) generally
pick up `tsconfig.json` plugins automatically.

**What v1 does:** suggests column names right after `SELECT` or a comma in
the column list, for `db.query(...)` calls made through a client built with
`createTypedDb<DB>`. If a `FROM <table>` is already present anywhere later in
the same string, suggestions are scoped to that table; otherwise you get the
deduplicated union of every table's columns in `DB` — which is exactly what
covers the example above before you've typed `FROM` at all.

**What v1 does not do** (documented scope, not bugs):

- No hover info and no inline diagnostics/squiggles — completions only.
- No `JOIN`/alias awareness — only the first `FROM <table>` in the string is
  used to scope suggestions; a second table from a `JOIN` is not offered.
- Only plain string/template literals with **no interpolation**
  (`` db.query(`select ...`) ``) are recognized — which is the only form the
  library ever expects you to write, since parameters are SQL placeholders
  (`$1`/`?`/`@name`), never JS template interpolation.
- Completions after `WHERE`/`ORDER BY`/etc. aren't offered yet — only the
  `SELECT` column list.
- **Requires TypeScript < 7.** TypeScript 7's native (Go-based) compiler
  removed the classic JS Compiler API (`ts.Node`, `ts.forEachChild`,
  `ts.createProgram`, ...) that this plugin — and, as of this writing, every
  TypeScript language service plugin in the ecosystem — is built on. There is
  no compatibility shim yet. The plugin works on TypeScript 5.x/6.x; on 7.x
  it currently fails to load rather than silently doing nothing.

## API reference

| Export | Kind | Description |
| ------ | ---- | ----------- |
| `createTypedDb<DB>(executor, options?)` | function | Build a schema-bound client. `options.strict` enables [strict mode](#8-strict-mode--turn-typos-into-type-errors). |
| `TypedDb<DB, Strict?>` | interface | The client; has `query<Q>(sql, ...params)`. |
| `TypedDbOptions` | interface | `{ strict?: boolean }`. |
| `Executor` | type | `(sql: string, params: readonly unknown[]) => Promise<unknown[]>`. |
| `Query<DB, Q>` | type | Inferred result array for query `Q`. |
| `Row<DB, Q>` | type | Inferred single-row object for query `Q`. |
| `StrictQuery<DB, Q>` | type | Like `Query`, but unknown columns/tables become a `QueryTypeError`. |
| `StrictRow<DB, Q>` | type | Single-row strict variant. |
| `Params<DB, Q>` | type | Inferred parameter tuple for query `Q`. |
| `QueryTypeError<Message>` | type | Branded compile-time error carrying `Message`. |
| `FunctionReturnTypes` | interface | SQL-function → return-type registry. |
| `Result<T, E>` | type | `Ok<T> \| Err<E>` discriminated union. |
| `ResultStatus` | enum | `Ok` / `Error`. |
| `ok` / `err` | function | Construct a success / error result. |
| `isOk` / `isErr` | function | Type-narrowing guards. |
| `QueryError` | interface | `{ kind, message, cause? }`. |
| `QueryErrorKind` | enum | `EMPTY_QUERY` / `EXECUTOR_FAILED`. |
| `Schema` | type | Ideal schema shape (`table → column → type`). |
| `defineSchema(obj)` | function | Optional identity helper (see below). |

**Driver adapters** (each on its own subpath, so no unused peer dependency is
ever required):

| Export | Subpath | Description |
| ------ | ------- | ----------- |
| `createPgExecutor(pool)` | `@owlsql/core/pg` | `pg.Pool` → `Executor`. |
| `createMysql2Executor(pool)` | `@owlsql/core/mysql2` | `mysql2/promise` `Pool` → `Executor`. |
| `createPostgresJsExecutor(client)` | `@owlsql/core/postgres` | `postgres.Sql` → `Executor`. |
| `createNodeSqliteExecutor(db)` | `@owlsql/core/node-sqlite` | `node:sqlite` `DatabaseSync` → `Executor`. |
| `createKyselyExecutor(db)` | `@owlsql/core/kysely` | `Kysely<DB>` → `Executor`, via `CompiledQuery.raw`. |

**`query` return type.** `query` resolves to
`Result<Query<DB, Q>, QueryError>`. On success, `result.value` holds the typed
rows. On failure, `result.error` is a `QueryError`:

- `EMPTY_QUERY` — the SQL string was empty/whitespace (guarded before the
  executor runs).
- `EXECUTOR_FAILED` — your executor threw; the original error is on
  `error.cause`.

**Optional: `defineSchema`.** An identity helper that returns its argument
typed as a `Schema`, for the rare case where you keep a runtime schema object
and want it validated against the expected shape. The schema is purely
type-level, so **most projects just write `type DB = { ... }` and never need
this.**

## Supported SQL subset

| Feature | Example |
| ------- | ------- |
| Column projection | `select id, name from users` |
| `SELECT *` | `select * from users` |
| Explicit alias | `select name as username from users` |
| Implicit alias | `select name username from users` |
| Qualified columns | `select u.id, u.name from users u` |
| Case-insensitive keywords | `SELECT id FROM users` |
| Newlines / messy whitespace | multi-line queries are normalized |
| Trailing clauses (ignored) | `... where active = true order by id limit 10` |
| Aggregates / functions | `select count(*) as total, lower(name) from users` |
| `RETURNING` | `insert into users (name) values ($1) returning id` |
| Nullable columns | `bio: string \| null` → `{ bio: string \| null }` |
| Joins | `select u.name, p.title from users u join posts p on u.id = p.user_id` |
| `LEFT`/`RIGHT`/`FULL` nullability | outer-joined side(s) become `T \| null` |
| Qualified / mixed star | `select u.*, p.title from ...`, `select *, extra from ...` |
| Quoted / schema-qualified ids | `select "id" from public."users"` |
| Trailing semicolon | `select id from users;` |
| Typed parameters | `where id = $1` → `query(sql, id: number)` |
| Strict mode | `{ strict: true }` → unknown column becomes a `QueryTypeError` |
| `WHERE` operators | `=`, `<>`, comparisons, `LIKE`/`ILIKE`, `IN (...)`, `BETWEEN ... AND ...`, `IS [NOT] NULL`, `AND`/`OR` |
| `GROUP BY` / `HAVING` / `ORDER BY` / `LIMIT` / `OFFSET` | parsed and skipped; output shape follows the `SELECT` list, `HAVING`/`LIMIT`/`OFFSET` placeholders are typed |
| `UNION` / `UNION ALL` | result shape is inferred from the first branch |
| `CASE WHEN ... THEN ... [ELSE ...] END` | branch types are unioned (`\| null` added when there is no `ELSE`) |
| Window functions | `row_number() over (partition by ... order by ...)`, `rank()`, `dense_rank()`, etc. |
| CTEs (`WITH ... AS (...)`) | later CTEs may reference earlier ones; works with strict mode |
| Derived tables | `from (select ...) x`, including subqueries with their own `WHERE`/`JOIN` |
| Named parameters | `where id = @id` (SQL Server style) |
| Backtick identifiers | `` select `id` from `users` `` (MySQL style) |
| `TOP` clause | `select top 10 id from users`, `top (n)`, `top n percent` (SQL Server) |
| `OUTPUT` clause | `insert ... output inserted.id values (...)` (SQL Server) |

## Limitations

This is a focused tool for the common read path, not a full SQL grammar:

- **Scalar subqueries are not typed.** A subquery used as a value inside the
  `SELECT` list or `WHERE` (`select (select count(*) from posts) from users`)
  resolves to `unknown`. Only `WITH` CTEs and derived tables in `FROM` are
  parsed.
- **`CASE` does not support nested `CASE`.** The parser looks for the first
  top-level `END`; a `CASE` nested inside another `CASE`'s branch is not
  supported.
- **Window `OVER (...)` clauses are only used as a boundary**, not parsed for
  their own typing — `PARTITION BY`/`ORDER BY` content inside `OVER (...)` is
  discarded, not validated.
- **Function arguments must not contain spaces.** `count(*)`, `lower(name)`,
  `sum(price)` work; `count(distinct id)` and `concat(a, b)` (space after the
  comma) do not.
- **Aggregates assume numeric output.** `min`/`max` resolve to `number` even
  over a text column; unrecognized functions resolve to `unknown`. `lag`,
  `lead`, `first_value`, `last_value`, `nth_value` resolve to `unknown` (their
  real type depends on the argument, which isn't inspected).
- **`select *` across a join merges columns by name.** When two tables share a
  column name (e.g. both have `id`), the types are intersected rather than kept
  separate. Alias the columns to keep them distinct.
- **Typed parameters need spaced operators.** `where id = $1` is typed;
  `where id=$1` is not. Parameters inside `INSERT ... VALUES` are not typed
  (they fall back to a flexible `unknown[]`), and parameters inside a `WITH`
  query's own CTE bodies are not typed either. Numbered placeholders are
  assumed to appear in ascending order (`$1`, `$2`, ...).
- **Quoted identifiers** use `"..."` (standard), `[...]` (SQL Server), or
  `` `...` `` (MySQL — escape the backtick with `\`` inside the template
  literal). Schema-qualified tables (`public.users`) resolve by their final
  segment (`users`).
- **`TOP` supports a plain count or `TOP N PERCENT`** — `TOP N WITH TIES` is
  not parsed. `OUTPUT` only recognizes the `inserted`/`deleted` pseudo-table
  prefixes (they resolve against the statement's single table); `OUTPUT ...
  INTO @table` is not supported.
- **Unknown columns, tables, or aliases resolve to `unknown`** by default — pass
  `{ strict: true }` to turn them into a `QueryTypeError` instead.

These are deliberate scope choices; the [FAQ](#faq) covers how to work around
them.

## FAQ

**Does this run SQL or connect to a database?** No. It only types the result.
You supply the executor that talks to your driver.

**Is there a build step or codegen?** No. The types are computed by `tsc` during
your normal type check. Nothing is generated and nothing is written to disk.

**My result is typed `unknown[]`.** The query was likely passed as a `string`
variable instead of a string literal, or it selects a column/table not in your
schema. Inline the literal and check the schema.

**How do I handle a `JOIN`?** `JOIN` is inferred natively — see
[section 9](#9-joins). `INNER`/`LEFT`/`RIGHT`/`FULL`/`CROSS` are all
supported, including nullability of the outer-joined side.

**Why a `Result` instead of throwing?** Database calls are expected to fail
sometimes; modelling that as a value (rather than an exception) forces callers
to handle it and keeps error handling explicit and type-checked.

## Contributing

Building, testing, and publishing are documented in
[CONTRIBUTING.md](CONTRIBUTING.md). Not sure where to start? Check
[ROADMAP.md](ROADMAP.md) — it lists what's shipped, what's in progress, and
issues labeled [`good first issue`](https://github.com/tiagolauer/OwlSQL/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

## License

MIT
