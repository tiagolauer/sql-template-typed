import type postgres from 'postgres';
import type { DialectExecutor } from '../index.js';

type PostgresUnsafeParam = NonNullable<Parameters<postgres.Sql['unsafe']>[1]>[number];

export function createPostgresJsExecutor(client: postgres.Sql): DialectExecutor<'dollar'> {
  return async (sql, params) => {
    // postgres.js throws on a raw undefined parameter ("Undefined values are
    // not allowed") - normalize to null, matching mssql.ts/node-sqlite.ts.
    const values = params.map((value) => value ?? null);
    const result = await client.unsafe(sql, values as unknown as PostgresUnsafeParam[]);
    return {
      rows: [...result],
      meta: typeof result.count === 'number' ? { rowCount: result.count } : {},
    };
  };
}
