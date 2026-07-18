import type { ConnectionInfo, TableSchema } from '../types.js';

const POSTGRES_SCALAR_TYPES: Record<string, string> = {
  int2: 'number',
  int4: 'number',
  float4: 'number',
  float8: 'number',
  int8: 'string',
  numeric: 'string',
  money: 'string',
  bool: 'boolean',
  text: 'string',
  varchar: 'string',
  bpchar: 'string',
  char: 'string',
  uuid: 'string',
  citext: 'string',
  name: 'string',
  xml: 'string',
  json: 'unknown',
  jsonb: 'unknown',
  bytea: 'Buffer',
  timestamp: 'Date',
  timestamptz: 'Date',
  date: 'Date',
  time: 'string',
  timetz: 'string',
};

export function mapPostgresType(udtName: string): string {
  const isArray = udtName.startsWith('_');
  const base = isArray ? udtName.slice(1) : udtName;
  const scalar = POSTGRES_SCALAR_TYPES[base] ?? 'unknown';
  return isArray ? `${scalar}[]` : scalar;
}

interface PgColumnRow {
  table_name: string;
  column_name: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
}

export async function introspectPostgres(connection: ConnectionInfo): Promise<TableSchema[]> {
  let PoolCtor: typeof import('pg').Pool;
  try {
    ({ Pool: PoolCtor } = await import('pg'));
  } catch {
    throw new Error(
      "The 'pg' package is required to introspect PostgreSQL. Install it with: npm install pg",
    );
  }

  const pool = new PoolCtor({ connectionString: connection.url });
  const schema = connection.schema ?? 'public';

  try {
    const result = await pool.query<PgColumnRow>(
      `select c.table_name, c.column_name, c.udt_name, c.is_nullable
       from information_schema.columns c
       join information_schema.tables t
         on t.table_schema = c.table_schema and t.table_name = c.table_name
       where c.table_schema = $1 and t.table_type = 'BASE TABLE'
       order by c.table_name, c.ordinal_position`,
      [schema],
    );

    return groupColumns(result.rows);
  } finally {
    await pool.end();
  }
}

function groupColumns(rows: PgColumnRow[]): TableSchema[] {
  const tables = new Map<string, TableSchema>();

  for (const row of rows) {
    const table = tables.get(row.table_name) ?? { name: row.table_name, columns: [] };
    table.columns.push({
      name: row.column_name,
      tsType: mapPostgresType(row.udt_name),
      nullable: row.is_nullable === 'YES',
    });
    tables.set(row.table_name, table);
  }

  return [...tables.values()];
}
