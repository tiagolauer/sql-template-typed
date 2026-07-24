#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import type { Dialect } from './types.js';
import { runGenerate } from './generate.js';

const DIALECTS: Dialect[] = ['postgres', 'mysql', 'sqlite', 'mssql'];

const USAGE = `Usage: owlsql generate --url <connection-string> [options]

Options:
  --url <string>       Connection string, or a path to a SQLite database file (required)
  --out <file>         Output file (default: ./schema.ts)
  --dialect <name>     ${DIALECTS.join(' | ')} (auto-detected from the URL)
  --schema <name>      Schema/database to introspect
  --table <a,b>        Only include the listed tables
  --exclude <a,b>      Skip the listed tables
  --check              Check --out is up to date instead of writing it; exits 1
                        if it has drifted. --table/--exclude/--schema still apply.
  --help               Show this help
  --version            Print the version
`;

const BOOLEAN_FLAGS = new Set(['help', 'version', 'check']);

const VALUE_FLAGS = new Set(['url', 'out', 'dialect', 'schema', 'table', 'exclude']);

export function parseFlags(args: string[]): Map<string, string> {
  const flags = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }

    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument "${arg}". Flags start with --, e.g. --url.`);
    }

    const body = arg.slice(2);
    const equalsIndex = body.indexOf('=');
    const name = equalsIndex === -1 ? body : body.slice(0, equalsIndex);

    if (!BOOLEAN_FLAGS.has(name) && !VALUE_FLAGS.has(name)) {
      throw new Error(`Unknown flag --${name}. Run owlsql --help for the list of flags.`);
    }

    if (flags.has(name)) {
      throw new Error(`Duplicate flag --${name}.`);
    }

    if (BOOLEAN_FLAGS.has(name)) {
      flags.set(name, '');
      continue;
    }

    if (equalsIndex !== -1) {
      flags.set(name, body.slice(equalsIndex + 1));
      continue;
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${name}`);
    }

    flags.set(name, value);
    index += 1;
  }

  return flags;
}

function parseDialect(raw: string | undefined): Dialect | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (!DIALECTS.includes(raw as Dialect)) {
    throw new Error(`Unknown --dialect "${raw}". Expected one of: ${DIALECTS.join(', ')}`);
  }

  return raw as Dialect;
}

function parseTableList(raw: string | undefined): string[] | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const names = raw
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  return names.length > 0 ? names : undefined;
}

function readVersion(): string {
  const packageJsonUrl = new URL('../../package.json', import.meta.url);
  const parsed: unknown = JSON.parse(readFileSync(packageJsonUrl, 'utf8'));
  if (parsed && typeof parsed === 'object' && 'version' in parsed) {
    return String((parsed as { version: unknown }).version);
  }
  return 'unknown';
}

export function formatCliError(error: unknown): string {
  if (error instanceof AggregateError) {
    const first = error.errors.find(
      (inner): inner is Error => inner instanceof Error && inner.message.length > 0,
    );
    if (first) {
      return first.message;
    }
    return error.message.length > 0 ? error.message : 'Connection failed.';
  }

  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === undefined || command === '--help' || command === '-h') {
    process.stdout.write(USAGE);
    return;
  }

  if (command === '--version' || command === '-v') {
    process.stdout.write(`${readVersion()}\n`);
    return;
  }

  if (command !== 'generate') {
    process.stderr.write(USAGE);
    process.exitCode = 1;
    return;
  }

  const flags = parseFlags(rest);

  if (flags.has('help')) {
    process.stdout.write(USAGE);
    return;
  }

  if (flags.has('version')) {
    process.stdout.write(`${readVersion()}\n`);
    return;
  }

  const url = flags.get('url');
  if (!url) {
    throw new Error('--url is required, e.g. --url postgres://user:pass@host/db');
  }

  const out = flags.get('out') ?? './schema.ts';

  const result = await runGenerate({
    url,
    out,
    dialect: parseDialect(flags.get('dialect')),
    schema: flags.get('schema'),
    tables: parseTableList(flags.get('table')),
    exclude: parseTableList(flags.get('exclude')),
    check: flags.has('check'),
  });

  if (result.kind === 'written') {
    process.stdout.write(`Wrote ${out}\n`);
    return;
  }

  if (result.kind === 'upToDate') {
    process.stdout.write(`${out} is up to date.\n`);
    return;
  }

  process.stderr.write(`${out} is out of date - run generate to update it: ${result.summary}\n`);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`Error: ${formatCliError(error)}\n`);
  process.exitCode = 1;
});
