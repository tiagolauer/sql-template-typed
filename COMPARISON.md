# Comparison: OwlSQL vs Prisma, Kysely, pgTyped, Zapatos

This is **not** a runtime-speed benchmark — query execution speed is
dominated by your database and driver, not the layer on top of it, and
publishing "queries/sec" numbers for tools with fundamentally different
architectures (full ORM vs query builder vs SQL-in-files vs type-level
parser) tends to compare apples to oranges. This compares the four things
that actually differ structurally between these tools:

- **Zero build step** — do you need a separate command (codegen, `generate`,
  a watcher) before your types are correct, or does a normal `tsc`/editor
  save do it?
- **Zero runtime parser** — does anything parse SQL, compile a query builder
  chain, or run a query engine *at request time*, or is the string you wrote
  sent to the driver completely unmodified?
- **Bundle size** — how much JS ships to your server/edge function.
- **DX** — what it feels like day to day: what you write, what breaks your
  flow, what the error messages look like.

Every number below is cited. Tools change fast (Prisma's architecture in
particular changed substantially in late 2025) — if something here is stale,
check the source link and open an issue.

## At a glance

| | OwlSQL | Prisma | Kysely | pgTyped | Zapatos |
| --- | --- | --- | --- | --- | --- |
| Approach | Type-level SQL parser | Schema DSL → generated ORM client | TypeScript query builder | SQL files/tags → generated wrapper functions | Generated schema + typed SQL helpers |
| You write | Raw SQL strings | Prisma's own query API | Builder method chains | Raw SQL (in `.sql` files or tags) | Builder-ish helpers or raw SQL via `db.sql` |
| Build step required? | No (opt-in `generate` for schema only) | **Yes** — `prisma generate` | No (optional `kysely-codegen` for schema) | **Yes** — CLI codegen against a live DB | No (opt-in schema generation) |
| Runtime SQL/query engine? | None — string passed through verbatim | Yes — TS query compiler (was a Rust binary) | Yes — compiles the builder chain to SQL every call | Minimal — executes an already-known, pre-extracted query | Yes — builds SQL from helper calls |
| Bundle size (npm, min/gzip) | No dependencies; ~130 lines of runtime glue (`createTypedDb` + `Result` helpers) — erased type-level parser costs 0 bytes | ~1.6 MB / ~600 KB gzip (post-Rust, v6.16+/v7); was ~14 MB / ~7 MB gzip with the Rust engine | 189 KB / 38.7 KB gzip ([bundlephobia](https://bundlephobia.com/package/kysely)) | 399 KB / 85 KB gzip ([bundlephobia](https://bundlephobia.com/package/@pgtyped/runtime)) | Not resolvable on bundlephobia (build-tool/library hybrid); no bundled query engine beyond thin SQL-building helpers |

## Prisma

- **Build step**: mandatory. You write a `.prisma` schema file, run
  `prisma generate`, and the generated client is what you actually import.
  Skip it and nothing type-checks — CI must run it too.
  [Source](https://www.prisma.io/docs/orm/v6/prisma-client/setup-and-configuration/generating-prisma-client)
- **Runtime**: historically a Rust query engine binary shipped alongside
  your code — a well-known pain point for serverless cold starts (one
  reported case: ~7.5 MB of generated client in a Lambda bundle, ~2.5s cold
  starts vs ~600ms without Prisma).
  [Source](https://github.com/prisma/prisma/issues/10724). As of Prisma
  6.16 (GA) and the default in Prisma 7 (Nov 2025), the Rust binary is gone
  in favor of a TypeScript query compiler — roughly 14 MB/7 MB gzip down to
  ~1.6 MB/600 KB gzip, about an 85–90% reduction.
  [Source](https://www.prisma.io/blog/from-rust-to-typescript-a-new-chapter-for-prisma-orm)
  It's real progress, but it's still a runtime query engine translating
  Prisma's own API into SQL on every call — not a passthrough.
- **DX**: the most abstracted of the four — you don't write SQL at all
  under normal use (there's an escape hatch, `$queryRaw`, but it's not the
  primary API). That buys a lot (migrations, a full schema DSL, relation
  loading) at the cost of a mandatory generate step and a query API that
  isn't SQL — if you already know SQL, there's a second API to learn.

## Kysely

- **Build step**: none required. Kysely is a plain TypeScript library — the
  query builder's types come from a `Database` interface you either hand-write
  or generate once with the optional `kysely-codegen` (same "opt-in, not
  required" shape as this library's own `generate`).
  [Source](https://github.com/RobinBlomberg/kysely-codegen)
- **Runtime**: every `.selectFrom().select().where()...execute()` call
  builds an internal query representation and **compiles it to a SQL string
  at call time**. It's fast and well-optimized, but it is a real runtime
  compiler, not a passthrough — the SQL you get is Kysely's SQL, not
  literally the string you typed (there is no string; you never typed SQL).
- **Bundle**: 189 KB minified / 38.7 KB gzipped.
  [Source](https://bundlephobia.com/package/kysely)
- **DX**: closest in spirit to this library — "no magic," full type
  inference, SQL-shaped mental model. The difference is what you're typing:
  Kysely's fluent builder API vs SQL text. If you want to paste a query from
  `psql`/a DBA/a migration file and have it just work, that's raw SQL, which
  is this library's whole premise — Kysely's builder needs translating.

## pgTyped

- **Build step**: mandatory. The CLI parses your `.sql` files or SQL tags,
  connects to a **live PostgreSQL instance** to resolve types, and writes
  generated `.ts` wrapper files. Runs in watch mode during dev and must run
  in CI. [Source](https://github.com/adelsz/pgtyped)
- **Runtime**: once generated, executing a query runs the pre-built
  `PreparedQuery` wrapper via `@pgtyped/runtime` — the SQL text itself was
  already fully known at generate time, so there's no live parsing at
  request time, closer in spirit to this library's zero-runtime-parsing
  goal. The trade-off is upstream: you need a real database connection
  available just to type-check.
- **Bundle**: `@pgtyped/runtime` measures at 399 KB / 85 KB gzip on
  bundlephobia — larger than you'd expect for "just execute a known query,"
  worth checking against your own setup before assuming it's negligible.
  [Source](https://bundlephobia.com/package/@pgtyped/runtime)
- **DX**: you write real SQL (a genuine strength, same as this library) but
  in separate `.sql` files or specially-tagged blocks, and nothing type-checks
  until the generator has run against a reachable database — friction that's
  invisible in a tutorial and very visible the first time your DB is down
  and your editor starts red-squiggling files you didn't touch. Postgres-only.

## Zapatos

- **Build step**: none required for queries. A CLI command
  (`npx zapatos`) introspects your Postgres database once and writes a
  `schema.d.ts` — the same "regenerate when your schema changes" shape as
  this library's `generate` or Kysely's `kysely-codegen`, not a per-build
  requirement. [Source](https://jawj.github.io/zapatos/)
- **Runtime**: Zapatos ships both shorthand builder-style helpers
  (`db.select`, `db.insert`, etc., typed against the generated schema) and a
  tagged-template `db.sql` escape hatch for raw SQL with typed parameters.
  The shorthand helpers build SQL at call time (a small query builder, not a
  parser); the `db.sql` path is closer to a passthrough.
- **Bundle**: not resolvable on bundlephobia in this pass (it packages as a
  combined CLI + library, which bundlephobia's static analysis doesn't
  always handle) — check your own build output rather than trusting a
  single number here.
- **DX**: PostgreSQL-only, and genuinely close to "just write SQL" once the
  schema exists, particularly via `db.sql`. The generated schema file is the
  same one-time step this library's own `generate` CLI produces — the
  difference is Zapatos also gives you typed query helpers on top, where
  this library stops at typing whatever SQL you hand it directly.

## OwlSQL

- **Build step**: none, ever, for queries — `Query<DB, 'select ...'>` is
  resolved by the same `tsc`/tsserver pass that already type-checks the rest
  of your file. The optional `generate` CLI ([README](README.md#editor-autocomplete))
  only produces the `DB` schema type, once, on demand — you can also just
  write that type by hand and never run it.
- **Runtime**: the SQL string you write is handed to your executor
  **completely unmodified** — nothing in this library parses, rewrites, or
  compiles it. There's no query engine because there's no query construction
  happening in JS at all; the entire "parser" is TypeScript's own
  template-literal-type inference, which costs nothing at runtime because
  types don't exist at runtime.
- **Bundle**: zero runtime dependencies (`package.json` has no
  `dependencies` field), and the runtime surface is `createTypedDb`,
  `defineSchema`, and the `Result` helpers — about 130 lines of source
  across [`src/index.ts`](src/index.ts) and [`src/result.ts`](src/result.ts)
  combined, most of which is type declarations erased at compile time. The
  parser itself (~2,500 lines across `src/parse.ts`/`src/from.ts`/etc.) is
  100% types — it ships zero bytes to any runtime.
- **DX trade-off, stated plainly**: this is the smallest surface area of
  the five because it does the least. No migrations, no relation loading, no
  query builder ergonomics (autocomplete for chained methods) — you write
  SQL, you get a type back. If you want an ORM's feature set, this isn't
  one; see the [Supported SQL subset](README.md#supported-sql-subset) and
  [Limitations](README.md#limitations) for exactly where the parser's
  coverage ends.

## Methodology notes

- Bundle sizes are from bundlephobia's public API, fetched while writing
  this document — they change as packages release new versions; the cited
  links are more durable than the numbers.
- "Build step" is evaluated strictly: does *type-checking a query* require a
  side-effecting command to have run first, beyond the editor/`tsc` you
  already run. Schema-only generation that's optional and one-shot (this
  library's `generate`, `kysely-codegen`, Zapatos's CLI) is called out as
  such, not counted the same as Prisma's/pgTyped's mandatory-every-schema-change
  codegen.
- This document doesn't cover correctness, SQL feature coverage, migrations,
  connection pooling, or ecosystem size — those are real, important
  differences this comparison intentionally leaves out because they're
  orthogonal to the four axes above.
