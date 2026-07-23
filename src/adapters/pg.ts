import type { Pool, Client, PoolClient } from 'pg';
import type { DialectExecutor } from '../index.js';

export type PgQueryable = Pool | Client | PoolClient;

export function createPgExecutor(client: PgQueryable): DialectExecutor<'dollar'> {
  return async (sql, params) => {
    const result =
      params.length === 0
        ? await client.query(sql)
        : // pg already treats undefined the same as null on its own, so this
          // is a no-op for pg specifically - normalized anyway for
          // consistency with every other adapter (mssql.ts and
          // node-sqlite.ts already do this explicitly; postgres.js and
          // mysql2 throw on a raw undefined without it).
          await client.query(sql, params.map((value) => value ?? null) as unknown[]);

    return {
      rows: result.rows,
      meta: result.rowCount === null ? {} : { rowCount: result.rowCount },
    };
  };
}
