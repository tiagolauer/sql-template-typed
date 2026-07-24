import type postgres from 'postgres';
import type { DialectExecutor, SchemaLike, TypedDb, TypedDbOptions } from '../index.js';
import { createTypedDb } from '../index.js';

type PostgresUnsafeParam = NonNullable<Parameters<postgres.Sql['unsafe']>[1]>[number];

export function createPostgresJsExecutor(
  client: postgres.Sql | postgres.TransactionSql,
): DialectExecutor<'dollar'> {
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

// postgres.js's own sql.begin(...) already pins a single connection and
// handles commit/rollback (rolling back on a thrown error, committing
// otherwise) - this just wraps the transaction-scoped sql it hands the
// callback in a TypedDb, the same way createPostgresJsExecutor wraps the
// top-level sql.
//
// Curried on DB, same as createPgTransaction - see the comment there for why
// a single combined call would silently break inference of the callback's
// return type.
export function createPostgresJsTransaction<DB extends SchemaLike>(sql: postgres.Sql) {
  return function runPostgresJsTransaction<
    const Options extends Omit<TypedDbOptions, 'placeholders'> = TypedDbOptions,
    T = unknown,
  >(
    fn: (tx: TypedDb<DB, Options extends { strict: true } ? true : false, 'dollar'>) => Promise<T>,
    options?: Options,
  ) {
    return sql.begin((transactionSql) =>
      fn(
        createTypedDb<DB, Options & { placeholders: 'dollar' }>(
          createPostgresJsExecutor(transactionSql),
          { ...options, placeholders: 'dollar' } as Options & { placeholders: 'dollar' },
        ),
      ),
    );
  };
}
