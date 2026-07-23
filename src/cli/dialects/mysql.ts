import type { ConnectionInfo, TableSchema } from '../types.js';

const MYSQL_SCALAR_TYPES: Record<string, string> = {
  tinyint: 'number',
  smallint: 'number',
  mediumint: 'number',
  int: 'number',
  integer: 'number',
  year: 'number',
  float: 'number',
  double: 'number',
  bigint: 'number',
  decimal: 'string',
  numeric: 'string',
  char: 'string',
  varchar: 'string',
  text: 'string',
  tinytext: 'string',
  mediumtext: 'string',
  longtext: 'string',
  enum: 'string',
  set: 'string',
  time: 'string',
  date: 'Date',
  datetime: 'Date',
  timestamp: 'Date',
  json: 'unknown',
  binary: 'Buffer',
  varbinary: 'Buffer',
  blob: 'Buffer',
  tinyblob: 'Buffer',
  mediumblob: 'Buffer',
  longblob: 'Buffer',
  bit: 'Buffer',
};

export function mapMysqlType(dataType: string): string {
  const type = dataType.toLowerCase();

  // tinyint(1)/bit(1) were previously special-cased to `boolean` here, but
  // mysql2's stock parsers (no custom typeCast, which this library has no
  // way to force onto a connection it doesn't create) never actually
  // produce a boolean for either: TINY decodes to a plain number regardless
  // of display width, and BIT has no dedicated case so it falls through to
  // a raw Buffer. Trusting a `boolean` type here silently mistyped the
  // generated column - and for BIT, a non-empty Buffer is always truthy
  // regardless of the underlying byte, so callers checking `if (row.flag)`
  // treated every row as true. Falling through to the plain type-map
  // entries below matches what the driver actually returns.
  return MYSQL_SCALAR_TYPES[type] ?? 'unknown';
}

type MysqlColumnRow = Record<string, unknown>;

function readField(row: MysqlColumnRow, name: string): string {
  const value = row[name] ?? row[name.toUpperCase()];
  return typeof value === 'string' ? value : '';
}

export async function introspectMysql(connection: ConnectionInfo): Promise<TableSchema[]> {
  let createConnection: typeof import('mysql2/promise').createConnection;
  try {
    ({ createConnection } = await import('mysql2/promise'));
  } catch {
    throw new Error(
      "The 'mysql2' package is required to introspect MySQL. Install it with: npm install mysql2",
    );
  }

  const connectionHandle = await createConnection(connection.url);

  const schemaFilter = connection.schema ? '?' : 'database()';
  const schemaParams = connection.schema ? [connection.schema] : [];

  try {
    const [tableRows] = await connectionHandle.query(
      `select table_name as table_name
       from information_schema.tables
       where table_schema = ${schemaFilter} and table_type = 'BASE TABLE'
       order by table_name`,
      schemaParams,
    );

    const [rows] = await connectionHandle.query(
      `select c.table_name as table_name, c.column_name as column_name, c.data_type as data_type,
              c.is_nullable as is_nullable
       from information_schema.columns c
       join information_schema.tables t
         on t.table_schema = c.table_schema and t.table_name = c.table_name
       where c.table_schema = ${schemaFilter} and t.table_type = 'BASE TABLE'
       order by c.table_name, c.ordinal_position`,
      schemaParams,
    );

    return groupMysqlColumns(
      rows as unknown as MysqlColumnRow[],
      (tableRows as unknown as MysqlColumnRow[]).map((row) => readField(row, 'table_name')),
    );
  } finally {
    await connectionHandle.end().catch(() => undefined);
  }
}

export function groupMysqlColumns(rows: MysqlColumnRow[], tableNames: string[] = []): TableSchema[] {
  const tables = new Map<string, TableSchema>();

  for (const name of tableNames) {
    tables.set(name, { name, columns: [] });
  }

  for (const row of rows) {
    const tableName = readField(row, 'table_name');
    const table = tables.get(tableName) ?? { name: tableName, columns: [] };
    table.columns.push({
      name: readField(row, 'column_name'),
      tsType: mapMysqlType(readField(row, 'data_type')),
      nullable: readField(row, 'is_nullable') === 'YES',
    });
    tables.set(tableName, table);
  }

  return [...tables.values()];
}
