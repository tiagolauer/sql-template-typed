# Contributing

Maintainer notes for developing and releasing `@owlsql/core` (OwlSQL).

## Development

```bash
npm install
npm test              # types + runtime
npm run test:types    # tsc --noEmit over src + tests — type assertions
npm run test:runtime  # vitest — exercises the client, Result, and error paths
npm run build         # emit dist/ with .d.ts
```

Two layers of tests:

- **Type tests** (`tests/*.test-d.ts`) are pure type assertions — if they
  compile, the inference is correct. They cover projection/aliases
  (`types.test-d.ts`), failing-query expectations via `@ts-expect-error`
  (`negative.test-d.ts`), permissive-inference behavior locks
  (`inference-edge.test-d.ts`), and deep-recursion stress (`depth.test-d.ts`).
- **Runtime tests** (`tests/runtime.test.ts`) run under vitest and cover the
  success path, param forwarding, the empty-query guard, and executor failure.

CI (`.github/workflows/ci.yml`) runs the type tests against a matrix of
TypeScript versions (5.0, 5.3, 5.6, latest) plus the runtime tests, so a
template-literal behavior change in a new TypeScript release is caught early.

## Publishing

The package ships compiled JavaScript + declarations from `dist/`. The build is
wired into `prepublishOnly`, so a normal publish compiles for you:

```bash
npm version <patch|minor|major>
npm publish            # runs test:types, then build, then publishes dist/
```

Before the first registry publish, the package is still usable via a local path
(`npm i file:../owlsql`), a tarball (`npm pack`), a workspace
protocol, or a git URL.
