import type { Pool, Client, PoolClient } from 'pg';
import type { Executor } from '../index.js';

export type PgQueryable = Pool | Client | PoolClient;

export function createPgExecutor(client: PgQueryable): Executor {
  return async (sql, params) => {
    const result = await client.query(sql, params as unknown[]);
    return result.rows;
  };
}
