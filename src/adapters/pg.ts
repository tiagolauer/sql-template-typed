import type { Pool, Client, PoolClient } from 'pg';
import type { DialectExecutor, SchemaLike, TypedDb, TypedDbOptions } from '../index.js';
import { createTypedDb } from '../index.js';

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

// A BEGIN/COMMIT run through an executor bound to the pool is a footgun -
// each query() may check out a different pooled connection, leaving an open
// transaction (and its locks) on a connection later handed to another
// caller. This pins one PoolClient for the whole callback, exactly the
// pattern already documented by hand in the README's transactions section.
//
// Curried on DB: TypeScript can't partially infer type arguments, so once DB
// is given explicitly (it always must be - nothing about `pool` carries
// schema information), a single combined call would silently stop inferring
// the callback's return type T too, defaulting it to unknown. Splitting DB
// into its own call keeps the second call argument-only, so Options (via the
// optional options object) and T (via the callback's return type) both infer
// normally.
export function createPgTransaction<DB extends SchemaLike>(pool: Pool) {
  return async function runPgTransaction<
    const Options extends Omit<TypedDbOptions, 'placeholders'> = TypedDbOptions,
    T = unknown,
  >(
    fn: (tx: TypedDb<DB, Options extends { strict: true } ? true : false, 'dollar'>) => Promise<T>,
    options?: Options,
  ): Promise<T> {
    const client = await pool.connect();
    const tx = createTypedDb<DB, Options & { placeholders: 'dollar' }>(createPgExecutor(client), {
      ...options,
      placeholders: 'dollar',
    } as Options & { placeholders: 'dollar' });

    try {
      await client.query('begin');
      const result = await fn(tx);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  };
}
