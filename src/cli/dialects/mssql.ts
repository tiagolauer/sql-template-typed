import type { ConnectionInfo, TableSchema } from '../types.js';

const MSSQL_SCALAR_TYPES: Record<string, string> = {
  int: 'number',
  smallint: 'number',
  tinyint: 'number',
  float: 'number',
  real: 'number',
  bigint: 'string',
  decimal: 'number',
  numeric: 'number',
  money: 'number',
  smallmoney: 'number',
  bit: 'boolean',
  char: 'string',
  varchar: 'string',
  nchar: 'string',
  nvarchar: 'string',
  text: 'string',
  ntext: 'string',
  uniqueidentifier: 'string',
  xml: 'string',
  date: 'Date',
  datetime: 'Date',
  datetime2: 'Date',
  smalldatetime: 'Date',
  time: 'Date',
  datetimeoffset: 'Date',
  binary: 'Buffer',
  varbinary: 'Buffer',
  image: 'Buffer',
};

export function mapMssqlType(typeName: string): string {
  return MSSQL_SCALAR_TYPES[typeName.toLowerCase()] ?? 'unknown';
}

interface MssqlColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: boolean;
}

export interface MssqlConnectionConfig {
  server: string;
  user?: string;
  password?: string;
  database?: string;
  port?: number;
  options: {
    encrypt: boolean;
    trustServerCertificate: boolean;
  };
}

const MSSQL_URL_PATTERN = /^(mssql|sqlserver):\/\//i;

export function mssqlUrlToConfig(url: string): MssqlConnectionConfig {
  const parsed = new URL(url);
  const flags = parsed.searchParams;

  const config: MssqlConnectionConfig = {
    server: decodeURIComponent(parsed.hostname),
    options: {
      encrypt: flags.get('encrypt') !== 'false',
      trustServerCertificate: flags.get('trustServerCertificate') === 'true',
    },
  };

  if (parsed.username) {
    config.user = decodeURIComponent(parsed.username);
  }
  if (parsed.password) {
    config.password = decodeURIComponent(parsed.password);
  }
  const database = parsed.pathname.replace(/^\//, '');
  if (database) {
    config.database = decodeURIComponent(database);
  }
  if (parsed.port) {
    config.port = Number(parsed.port);
  }

  return config;
}

export async function introspectMssql(connection: ConnectionInfo): Promise<TableSchema[]> {
  let connect: typeof import('mssql').connect;
  try {
    ({ connect } = await import('mssql'));
  } catch {
    throw new Error(
      "The 'mssql' package is required to introspect SQL Server. Install it with: npm install mssql",
    );
  }

  const pool = MSSQL_URL_PATTERN.test(connection.url)
    ? await connect(mssqlUrlToConfig(connection.url) as import('mssql').config)
    : await connect(connection.url);
  const schema = connection.schema ?? 'dbo';

  try {
    const result = await pool
      .request()
      .input('schema', schema)
      .query<MssqlColumnRow>(
        `select t.name as table_name, c.name as column_name, ty.name as data_type,
                c.is_nullable as is_nullable
         from sys.tables t
         join sys.columns c on c.object_id = t.object_id
         join sys.types ty on ty.user_type_id = c.user_type_id
         where schema_name(t.schema_id) = @schema
         order by t.name, c.column_id`,
      );

    return groupColumns(result.recordset);
  } finally {
    await pool.close();
  }
}

function groupColumns(rows: MssqlColumnRow[]): TableSchema[] {
  const tables = new Map<string, TableSchema>();

  for (const row of rows) {
    const table = tables.get(row.table_name) ?? { name: row.table_name, columns: [] };
    table.columns.push({
      name: row.column_name,
      tsType: mapMssqlType(row.data_type),
      nullable: row.is_nullable,
    });
    tables.set(row.table_name, table);
  }

  return [...tables.values()];
}
