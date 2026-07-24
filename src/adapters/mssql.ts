import type { ConnectionPool, Transaction, Request } from 'mssql';
import type { DialectExecutor, QueryMeta, SchemaLike, TypedDb, TypedDbOptions } from '../index.js';
import { createTypedDb } from '../index.js';
import { collectNamedParameters } from './named-params.js';

const MSSQL_PARAM_PREFIXES: ReadonlySet<string> = new Set(['@']);

export type MssqlQueryable = ConnectionPool | Transaction | Request;

function isRequestSource(source: MssqlQueryable): source is ConnectionPool | Transaction {
  return typeof (source as { request?: unknown }).request === 'function';
}

export function createMssqlExecutor(source: MssqlQueryable): DialectExecutor<'at'> {
  return async (sql, params) => {
    // A ConnectionPool or an already-open Transaction each need `.request()`
    // called to get a Request bound to that connection/transaction; a
    // Request passed directly is already bound and used as-is - this is what
    // lets a caller route a query through an open transaction instead of
    // always implicitly starting a new, separately-committed request.
    const request = isRequestSource(source) ? source.request() : source;

    collectNamedParameters(sql, MSSQL_PARAM_PREFIXES).forEach((name, index) => {
      request.input(name.slice(1), params[index] ?? null);
    });

    const result = await request.query(sql);
    const meta: QueryMeta = {};
    if (typeof result.rowsAffected?.[0] === 'number') {
      meta.rowCount = result.rowsAffected[0];
    }
    return { rows: result.recordset ?? [], meta };
  };
}

// A BEGIN TRAN/COMMIT run through an executor bound to the pool is a
// footgun - each query() would implicitly open its own Request against a
// fresh connection, never actually joining the transaction. pool.transaction()
// pins one connection for the whole callback, exactly the pattern already
// documented by hand in the README's transactions section; commit/rollback
// already release that connection back to the pool, no separate release step
// needed.
//
// Curried on DB, same as createPgTransaction - see the comment there for why
// a single combined call would silently break inference of the callback's
// return type.
export function createMssqlTransaction<DB extends SchemaLike>(pool: ConnectionPool) {
  return async function runMssqlTransaction<
    const Options extends Omit<TypedDbOptions, 'placeholders'> = TypedDbOptions,
    T = unknown,
  >(
    fn: (tx: TypedDb<DB, Options extends { strict: true } ? true : false, 'at'>) => Promise<T>,
    options?: Options,
  ): Promise<T> {
    const transaction = pool.transaction();
    const tx = createTypedDb<DB, Options & { placeholders: 'at' }>(
      createMssqlExecutor(transaction),
      { ...options, placeholders: 'at' } as Options & { placeholders: 'at' },
    );

    try {
      await transaction.begin();
      const result = await fn(tx);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };
}
