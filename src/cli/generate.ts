import { writeFile } from 'node:fs/promises';
import type { ConnectionInfo, Dialect, TableSchema } from './types.js';
import { renderSchema } from './codegen.js';
import { introspectPostgres } from './dialects/postgres.js';
import { introspectMysql } from './dialects/mysql.js';
import { introspectSqlite } from './dialects/sqlite.js';
import { introspectMssql } from './dialects/mssql.js';

export interface GenerateOptions {
  url: string;
  out: string;
  dialect?: Dialect | undefined;
  schema?: string | undefined;
}

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

const CREDENTIALS_PATTERN = /\/\/[^@/]+@/;

export function redactCredentials(url: string): string {
  return url.replace(CREDENTIALS_PATTERN, '//***@');
}

export function detectDialect(url: string): Dialect {
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    return 'postgres';
  }

  if (url.startsWith('mysql://')) {
    return 'mysql';
  }

  if (url.startsWith('mssql://') || url.startsWith('sqlserver://')) {
    return 'mssql';
  }

  if (SCHEME_PATTERN.test(url)) {
    throw new Error(
      `Unrecognized connection URL "${redactCredentials(url)}". Expected postgres://, postgresql://, mysql://, mssql://, sqlserver://, or a path to a SQLite database file.`,
    );
  }

  return 'sqlite';
}

const INTROSPECTORS: Record<Dialect, (connection: ConnectionInfo) => Promise<TableSchema[]>> = {
  postgres: introspectPostgres,
  mysql: introspectMysql,
  sqlite: introspectSqlite,
  mssql: introspectMssql,
};

export async function runGenerate(options: GenerateOptions): Promise<void> {
  const dialect = options.dialect ?? detectDialect(options.url);
  const connection: ConnectionInfo = { url: options.url, schema: options.schema };

  const tables = await INTROSPECTORS[dialect](connection);

  if (tables.length === 0) {
    throw new Error('No tables found. Check the connection URL and --schema, if provided.');
  }

  const source = renderSchema(tables);
  await writeFile(options.out, source, 'utf8');
}
