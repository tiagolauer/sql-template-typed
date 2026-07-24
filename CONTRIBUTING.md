# Contributing

Thanks for looking into this. OwlSQL is a small, opinionated library, so contributions of any size are welcome, from a typo fix to a new dialect feature. Please be kind in issues and reviews 🦉

## AI and open source

Using an LLM to write code or draft a PR description is fine. Treat it as a pair programmer, not a replacement for understanding the change you're proposing.

A few things that matter here specifically:

- Don't paste raw LLM output into an issue or PR description. Summarize the problem or the change in your own words; link to logs or a repro instead of pasting walls of generated text.
- Commits and PRs should read like a person wrote them. No `Co-Authored-By` trailers for AI tools, no "Generated with [assistant]" lines.
- If a bot helped you find a bug, say so briefly. Don't dress up an AI-generated bug report as your own detailed investigation if it isn't.

None of this is about gatekeeping tools. It's about keeping the history readable for the next person who has to `git blame` a line at 2am.

## Issues

A good bug report has three things: what you ran, what you expected, and what happened instead. A minimal repro (a schema + a query string) is worth more than a paragraph of description.

For feature requests, explain the use case before the API. "I need X because Y" is more useful than a fully-formed proposal, since the shape of the fix often changes once the actual constraint is clear.

## Pull requests

Keep a PR to one fix or one feature. A PR that touches three unrelated things is harder to review and harder to revert if something breaks. Reference the issue it closes in the description.

Every behavior change needs a test that would fail without the fix. If you're touching `src/parse.ts`, `src/where.ts`, or another type-level file, that usually means a `.test-d.ts` case with `@ts-expect-error` or an `Equal<>` assertion; runtime behavior (adapters, the CLI, the ts-plugin) gets a `.test.ts` case instead. A PR without a regression test is a PR someone else will eventually re-break by accident.

## Developing

### Environment

You'll need Node 20 or later. The `node:sqlite` adapter and the CLI's SQLite introspection need Node 22.5+, since `node:sqlite` is newer than the rest of the runtime surface this library targets. TypeScript 5.4 through 7 is accepted as a peer dependency; the ts-plugin currently only loads on the classic (pre-7) compiler API.

```bash
npm install
npm test              # types + runtime
npm run test:types    # tsc --noEmit over src + tests
npm run test:runtime  # vitest
npm run build         # emit dist/ with .d.ts
```

### Fixing a bug

Start from a failing case, not from the code. Write the query string and the schema that trigger the bug as a test first, confirm it fails for the reason you think it fails, then fix it. If you can, revert your own fix locally with the new test still in place and check that the test actually goes red. A test that passes either way isn't testing your fix.

### Adding a feature

Open an issue before writing the implementation if the feature touches the public API or the SQL subset the parser accepts. The type-level parser is recursive template literal types; a change that looks small in the type signature can be a large change in how deeply TypeScript has to recurse, so it's worth discussing the shape before committing to one.

### Design preferences

- No runtime SQL parsing, ever. If a change needs to inspect the query string at runtime to work, it probably belongs in the ts-plugin (which already does its own lightweight runtime scanning for editor support), not in the core library.
- Adapters (`src/adapters/*.ts`) import the driver's types only, never the driver package itself as a value. This keeps `@owlsql/core/pg` usable without `pg` actually being installed, for anyone who only imports a different adapter.
- If you extend the SQL subset the parser accepts, update the "Supported SQL subset" and "Limitations" sections in the README in the same PR. A parser change nobody can discover from the docs is half a feature.
- Prefer a documented scope boundary over a half-correct implementation. Several existing features (LATERAL correlation, WHERE-clause diagnostics with parens) deliberately do less than a full SQL engine would, and say so in the README, rather than guessing.

## Testing

Two layers, and they test different things:

- **Type tests** (`tests/*.test-d.ts`) are pure type assertions. If they compile, the inference is correct; there's no runtime assertion to run. They cover column/alias projection, `@ts-expect-error` cases for queries that should fail to type, permissive-inference locks, and deep-recursion stress.
- **Runtime tests** (`tests/*.test.ts`) run under vitest and cover the executor/`Result` contract, adapter parameter handling, the CLI, and the ts-plugin's runtime scanners.

CI runs the type tests against a matrix of TypeScript versions, since a template-literal-type change that works on one TypeScript release can silently stop working (or start working differently) on another.

## Publishing

The package ships compiled JavaScript and declarations from `dist/`, wired into `prepublishOnly`:

```bash
npm version <patch|minor|major>
npm publish            # runs test:types, then build, then publishes dist/
```

Before the first registry publish, the package is still usable via a local path (`npm i file:../owlsql`), a tarball (`npm pack`), a workspace protocol, or a git URL.
