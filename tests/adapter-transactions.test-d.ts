import type { Pool as PgPool } from 'pg';
import type { Pool as Mysql2Pool } from 'mysql2/promise';
import type postgres from 'postgres';
import type { ConnectionPool } from 'mssql';
import type { Result, QueryError, QueryTypeError } from '../src/index.js';
import { createPgTransaction } from '../src/adapters/pg.js';
import { createPostgresJsTransaction } from '../src/adapters/postgres.js';
import { createMysql2Transaction } from '../src/adapters/mysql2.js';
import { createMssqlTransaction } from '../src/adapters/mssql.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

interface DB {
  users: { id: number; name: string };
}

declare const pgPool: PgPool;
declare const mysqlPool: Mysql2Pool;
declare const postgresJsSql: postgres.Sql;
declare const mssqlPool: ConnectionPool;

export async function transactionPlaceholderStyleCallSites() {
  await createPgTransaction<DB>(pgPool)(async (tx) => {
    await tx.query('select id from users where id = $1', 1);

    // @ts-expect-error a pg transaction's tx rejects ? placeholders
    await tx.query('select id from users where id = ?', 1);
  });

  await createPostgresJsTransaction<DB>(postgresJsSql)(async (tx) => {
    await tx.query('select id from users where id = $1', 1);

    // @ts-expect-error a postgres.js transaction's tx rejects ? placeholders
    await tx.query('select id from users where id = ?', 1);
  });

  await createMysql2Transaction<DB>(mysqlPool)(async (tx) => {
    await tx.query('select id from users where id = ?', 1);

    // @ts-expect-error a mysql2 transaction's tx rejects $n placeholders
    await tx.query('select id from users where id = $1', 1);
  });

  await createMssqlTransaction<DB>(mssqlPool)(async (tx) => {
    await tx.query('select id from users where id = @id', 1);

    // @ts-expect-error an mssql transaction's tx rejects $n placeholders
    await tx.query('select id from users where id = $1', 1);
  });
}

export async function transactionReturnValuePassesThrough() {
  // DB has to be curried into its own call - TypeScript can't partially
  // infer type arguments, so a single combined call (DB explicit, T left to
  // infer) would silently default T to unknown instead of inferring it from
  // the callback's return type.
  const result = await createPgTransaction<DB>(pgPool)(async () => 42);
  const check: number = result;
  void check;
}

export async function strictOptionFlowsThroughToTheCallback() {
  await createPgTransaction<DB>(pgPool)(
    async (tx) => {
      const result = await tx.query('select bogus from users');
      type _StrictOptionProducesAQueryTypeError = Expect<
        Equal<typeof result, Result<QueryTypeError<'unknown column: bogus'>[], QueryError>>
      >;
    },
    { strict: true },
  );
}
