import type { Executor } from '../src/index.js';
import type { Pool as PgPool, Client as PgClient, PoolClient as PgPoolClient } from 'pg';
import type { Pool as Mysql2Pool, Connection as Mysql2Connection } from 'mysql2/promise';
import type postgres from 'postgres';
import type { DatabaseSync } from 'node:sqlite';
import type { Kysely } from 'kysely';
import { createPgExecutor } from '../src/adapters/pg.js';
import { createMysql2Executor } from '../src/adapters/mysql2.js';
import { createPostgresJsExecutor } from '../src/adapters/postgres.js';
import { createNodeSqliteExecutor } from '../src/adapters/node-sqlite.js';
import { createKyselyExecutor } from '../src/adapters/kysely.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

type PgExecutorMatchesShape = Expect<
  Equal<ReturnType<typeof createPgExecutor>, Executor>
>;

type Mysql2ExecutorMatchesShape = Expect<
  Equal<ReturnType<typeof createMysql2Executor>, Executor>
>;

type PostgresJsExecutorMatchesShape = Expect<
  Equal<ReturnType<typeof createPostgresJsExecutor>, Executor>
>;

type NodeSqliteExecutorMatchesShape = Expect<
  Equal<ReturnType<typeof createNodeSqliteExecutor>, Executor>
>;

type KyselyExecutorMatchesShape = Expect<
  Equal<ReturnType<typeof createKyselyExecutor<{ users: { id: number } }>>, Executor>
>;

export function adapterCallSites() {
  createPgExecutor({} as PgPool);
  createPgExecutor({} as PgClient);
  createPgExecutor({} as PgPoolClient);
  createMysql2Executor({} as Mysql2Pool);
  createMysql2Executor({} as Mysql2Connection);
  createPostgresJsExecutor({} as postgres.Sql);
  createNodeSqliteExecutor({} as DatabaseSync);
  createKyselyExecutor({} as Kysely<{ users: { id: number } }>);
}

export type AdaptersLock = [
  PgExecutorMatchesShape,
  Mysql2ExecutorMatchesShape,
  PostgresJsExecutorMatchesShape,
  NodeSqliteExecutorMatchesShape,
  KyselyExecutorMatchesShape,
];
