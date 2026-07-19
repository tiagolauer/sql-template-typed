#!/usr/bin/env node
import type { Dialect } from './types.js';
import { runGenerate } from './generate.js';

const DIALECTS: Dialect[] = ['postgres', 'mysql', 'sqlite', 'mssql'];

export function parseFlags(args: string[]): Map<string, string> {
  const flags = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith('--')) {
      continue;
    }

    const body = arg.slice(2);
    const equalsIndex = body.indexOf('=');
    if (equalsIndex !== -1) {
      flags.set(body.slice(0, equalsIndex), body.slice(equalsIndex + 1));
      continue;
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${body}`);
    }

    flags.set(body, value);
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

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command !== 'generate') {
    process.stderr.write(
      'Usage: owlsql generate --url <connection-string> [--out ./schema.ts] [--dialect postgres|mysql|sqlite|mssql] [--schema <name>]\n',
    );
    process.exitCode = command === undefined ? 0 : 1;
    return;
  }

  const flags = parseFlags(rest);
  const url = flags.get('url');
  if (!url) {
    throw new Error('--url is required, e.g. --url postgres://user:pass@host/db');
  }

  await runGenerate({
    url,
    out: flags.get('out') ?? './schema.ts',
    dialect: parseDialect(flags.get('dialect')),
    schema: flags.get('schema'),
  });

  process.stdout.write(`Wrote ${flags.get('out') ?? './schema.ts'}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
