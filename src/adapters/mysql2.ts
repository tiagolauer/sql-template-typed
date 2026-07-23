import type { Pool, Connection } from 'mysql2/promise';
import type { ExecuteValues } from 'mysql2';
import type { DialectExecutor, QueryMeta } from '../index.js';

export type Mysql2Queryable = Pool | Connection;

function writeMeta(header: { affectedRows?: number; insertId?: number }): QueryMeta {
  const meta: QueryMeta = {};
  if (typeof header.affectedRows === 'number') {
    meta.rowCount = header.affectedRows;
  }
  if (typeof header.insertId === 'number' && header.insertId !== 0) {
    meta.lastInsertRowid = header.insertId;
  }
  return meta;
}

export function createMysql2Executor(connection: Mysql2Queryable): DialectExecutor<'question'> {
  return async (sql, params) => {
    // mysql2 throws on a raw undefined parameter ("Bind parameters must not
    // contain undefined") - normalize to null, matching
    // mssql.ts/node-sqlite.ts.
    const values = params.map((value) => value ?? null);
    const [rows] = await connection.execute(sql, values as ExecuteValues);
    if (Array.isArray(rows)) {
      return rows;
    }
    return { rows: [], meta: writeMeta(rows as { affectedRows?: number; insertId?: number }) };
  };
}
