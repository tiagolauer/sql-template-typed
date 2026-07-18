# ts-plugin recording demo

A minimal project for recording a GIF/screenshot of
[`@owlsql/core/ts-plugin`](../../README.md#editor-autocomplete) in
action. This one is meant to be **opened in a real VSCode window and typed
into** — unlike [`examples/playground`](../playground), which is meant for
StackBlitz.

> **⚠️ Not on npm yet.** The project was renamed from `sql-template-typed` to
> `@owlsql/core` and hasn't been published under the new scoped name yet.
> `npm install` in this folder won't give you a working plugin until the
> first `@owlsql/core` publish lands. Until then, build from source and point
> this demo at the local build instead (step 1 below).

## Setup

1. From the repo root: `npm install && npm run build`.
2. In this folder: `npm install ../.. typescript --no-save` (installs the
   local build instead of waiting on npm; `--no-save` keeps this
   directory's `package.json` clean for when the real package catches up).
3. Open **this folder** (`examples/ts-plugin-demo`) in VSCode — not the
   monorepo root, so the workspace TypeScript version resolves correctly.
4. Command Palette → **"TypeScript: Select TypeScript Version" → "Use
   Workspace Version"**. This is the step that's easy to skip and makes the
   plugin silently do nothing.
5. Trust the workspace if prompted (VSCode's Restricted Mode disables
   extensions/plugins in untrusted folders — this tripped up the very first
   attempt at recording this).
6. Open `demo.ts`. Place your cursor right after `na` on the `select id, na`
   line and delete/retype the last couple of characters — completions
   trigger on typing, not just on opening the file.

## Recording

- Windows: Xbox Game Bar (`Win+G`) or ScreenToGif both work for a quick
  screen recording.
- Convert to GIF with ffmpeg if you recorded an `.mp4`:
  ```
  ffmpeg -i recording.mp4 -vf "fps=12,scale=800:-1:flags=lanczos" -loop 0 autocomplete.gif
  ```
- Drop the result in `assets/autocomplete.gif` at the repo root and
  reference it from the README's
  [Editor autocomplete](../../README.md#editor-autocomplete) section.

## Why this isn't already a GIF in the repo

Recording requires actually typing into a real VSCode window. That's not
something that could be automated end-to-end in the environment this repo's
tooling was built in — screen automation there is explicitly restricted from
sending keystrokes to IDEs/terminals (a sensible security boundary, not a
bug). The plugin itself *was* verified in a real, trusted VSCode workspace
(tsserver loaded the project and analyzed `demo.ts` with no errors) — what's
missing is purely the recording of the completion popup, which needs a human
(or a less restricted automation setup) at the keyboard.
