import { existsSync } from 'node:fs';
import type { ConnectionInfo, TableSchema } from '../types.js';

export function mapSqliteType(declaredType: string): string {
  const type = declaredType.toUpperCase().trim();

  if (type === 'BOOLEAN') {
    return '0 | 1';
  }

  if (type === 'DATE' || type === 'DATETIME' || type === 'TIMESTAMP') {
    return 'string';
  }

  if (type.includes('INT')) {
    return 'number';
  }

  if (type.includes('CHAR') || type.includes('CLOB') || type.includes('TEXT')) {
    return 'string';
  }

  if (type.includes('BLOB') || type === '') {
    return 'Buffer';
  }

  if (type.includes('REAL') || type.includes('FLOA') || type.includes('DOUB')) {
    return 'number';
  }

  return 'number';
}

interface SqliteTableInfoRow {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

function isRowidAlias(column: SqliteTableInfoRow, primaryKeyCount: number): boolean {
  return (
    column.pk > 0 && primaryKeyCount === 1 && column.type.toUpperCase().trim() === 'INTEGER'
  );
}

export async function introspectSqlite(connection: ConnectionInfo): Promise<TableSchema[]> {
  let DatabaseSyncCtor: typeof import('node:sqlite').DatabaseSync;
  try {
    ({ DatabaseSync: DatabaseSyncCtor } = await import('node:sqlite'));
  } catch {
    throw new Error(
      "'node:sqlite' is not available in this Node.js version. Upgrade to Node >=22.5, or use better-sqlite3 and edit the generated schema by hand.",
    );
  }

  if (connection.url !== ':memory:' && !existsSync(connection.url)) {
    throw new Error(`SQLite database file not found: "${connection.url}".`);
  }

  const db = new DatabaseSyncCtor(connection.url);

  try {
    const tableRows = db
      .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")
      .all() as { name: string }[];

    return tableRows.map((tableRow) => {
      const columns = db
        .prepare(`PRAGMA table_info(${quoteIdentifier(tableRow.name)})`)
        .all() as unknown as SqliteTableInfoRow[];

      const primaryKeyCount = columns.filter((column) => column.pk > 0).length;

      return {
        name: tableRow.name,
        columns: columns.map((column) => ({
          name: column.name,
          tsType: mapSqliteType(column.type),
          nullable: column.notnull === 0 && !isRowidAlias(column, primaryKeyCount),
        })),
      };
    });
  } finally {
    db.close();
  }
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
