import type { Pool, Connection } from 'mysql2/promise';
import type { ExecuteValues } from 'mysql2';
import type { Executor } from '../index.js';

export type Mysql2Queryable = Pool | Connection;

export function createMysql2Executor(connection: Mysql2Queryable): Executor {
  return async (sql, params) => {
    const [rows] = await connection.execute(sql, params as ExecuteValues);
    return Array.isArray(rows) ? rows : [];
  };
}
