# Playground

A minimal, self-contained project for exploring OwlSQL (`@owlsql/core`) in
your browser — no local install, no database.

**[Open in StackBlitz →](https://stackblitz.com/github/tiagolauer/OwlSQL/tree/master/examples/playground?file=index.ts)**

What's here:

- [`schema.ts`](schema.ts) — a small `DB` type (`users`/`posts`), same shape
  as the [README tutorial](../../README.md#1-describe-your-schema).
- [`index.ts`](index.ts) — hover over the `^?` markers to see inferred
  types, uncomment the `StrictQuery` line to see a compile-time error for a
  typo'd column name, and edit the queries to see completions/errors update
  live.

No database connection is used — the example client's executor just logs
what it would run and returns an empty array, so everything here is about
the *types*, not actually running SQL.

To open locally instead of on StackBlitz:

```bash
cd examples/playground
npm install
npm run typecheck
```
