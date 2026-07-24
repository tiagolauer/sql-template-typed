import type { Pool, Connection } from 'mysql2/promise';
import type { ExecuteValues } from 'mysql2';
import type { DialectExecutor, QueryMeta, SchemaLike, TypedDb, TypedDbOptions } from '../index.js';
import { createTypedDb } from '../index.js';

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

// A BEGIN/COMMIT run through an executor bound to the pool is a footgun -
// each query() may check out a different pooled connection, leaving an open
// transaction (and its locks) on a connection later handed to another
// caller. This pins one PoolConnection for the whole callback, exactly the
// pattern already documented by hand in the README's transactions section.
//
// Curried on DB, same as createPgTransaction - see the comment there for why
// a single combined call would silently break inference of the callback's
// return type.
export function createMysql2Transaction<DB extends SchemaLike>(pool: Pool) {
  return async function runMysql2Transaction<
    const Options extends Omit<TypedDbOptions, 'placeholders'> = TypedDbOptions,
    T = unknown,
  >(
    fn: (
      tx: TypedDb<DB, Options extends { strict: true } ? true : false, 'question'>,
    ) => Promise<T>,
    options?: Options,
  ): Promise<T> {
    const connection = await pool.getConnection();
    const tx = createTypedDb<DB, Options & { placeholders: 'question' }>(
      createMysql2Executor(connection),
      { ...options, placeholders: 'question' } as Options & { placeholders: 'question' },
    );

    try {
      await connection.beginTransaction();
      const result = await fn(tx);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  };
}
