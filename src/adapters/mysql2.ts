import type { Pool } from 'mysql2/promise';
import type { ExecuteValues } from 'mysql2';
import type { Executor } from '../index.js';

export function createMysql2Executor(pool: Pool): Executor {
  return async (sql, params) => {
    const [rows] = await pool.execute(sql, params as ExecuteValues);
    return Array.isArray(rows) ? rows : [];
  };
}
