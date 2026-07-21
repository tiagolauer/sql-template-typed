import { describe, it, expect } from 'vitest';
import {
  createTypedDb,
  ResultStatus,
  QueryErrorKind,
  isOk,
  isErr,
  ok,
  err,
  type Executor,
} from '../src/index.js';

interface DB {
  users: { id: number; name: string };
}

interface RecordingExecutor {
  executor: Executor;
  calls: { sql: string; params: readonly unknown[] }[];
}

function executorReturning(rows: unknown[]): RecordingExecutor {
  const calls: { sql: string; params: readonly unknown[] }[] = [];
  const executor: Executor = async (sql, params) => {
    calls.push({ sql, params });
    return rows;
  };
  return { executor, calls };
}

function executorThrowing(cause: unknown): RecordingExecutor {
  const calls: { sql: string; params: readonly unknown[] }[] = [];
  const executor: Executor = async (sql, params) => {
    calls.push({ sql, params });
    throw cause;
  };
  return { executor, calls };
}

describe('createTypedDb.query', () => {
  it('surfaces executor metadata on the Ok result', async () => {
    const executor: Executor = async () => ({ rows: [], meta: { rowCount: 3, lastInsertRowid: 9 } });
    const db = createTypedDb<DB>(executor);

    const result = await db.query('insert into users (name) values ($1)', 'ada');

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual([]);
      expect(result.meta).toEqual({ rowCount: 3, lastInsertRowid: 9 });
    }
  });

  it('includes the driver message in EXECUTOR_FAILED errors', async () => {
    const { executor } = executorThrowing(new Error('connection refused'));
    const db = createTypedDb<DB>(executor);

    const result = await db.query('select id from users');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe(QueryErrorKind.ExecutorFailed);
      expect(result.error.message).toContain('connection refused');
    }
  });

  it('returns Ok with the rows from the executor on success', async () => {
    const sampleRows = [{ id: 1, name: 'ada' }];
    const { executor, calls } = executorReturning(sampleRows);
    const db = createTypedDb<DB>(executor);

    const result = await db.query('select id, name from users');

    expect(result.status).toBe(ResultStatus.Ok);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual(sampleRows);
    }
    expect(calls).toHaveLength(1);
  });

  it('forwards positional params to the executor', async () => {
    const { executor, calls } = executorReturning([]);
    const db = createTypedDb<DB>(executor);

    await db.query('select id from users where id = $1', 7);

    expect(calls[0]?.params).toEqual([7]);
  });

  it('returns EMPTY_QUERY without calling the executor for empty sql', async () => {
    const { executor, calls } = executorReturning([]);
    const db = createTypedDb<DB>(executor);

    const result = await db.query('');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe(QueryErrorKind.EmptyQuery);
    }
    expect(calls).toHaveLength(0);
  });

  it('treats whitespace-only sql as empty', async () => {
    const { executor, calls } = executorReturning([]);
    const db = createTypedDb<DB>(executor);

    const result = await db.query('   ');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe(QueryErrorKind.EmptyQuery);
    }
    expect(calls).toHaveLength(0);
  });

  it('runs identically when the strict option is enabled', async () => {
    const sampleRows = [{ id: 1, name: 'ada' }];
    const { executor, calls } = executorReturning(sampleRows);
    const db = createTypedDb<DB, { strict: true }>(executor, { strict: true });

    const result = await db.query('select id, name from users');

    expect(isOk(result)).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('returns EXECUTOR_FAILED preserving the original cause when the executor throws', async () => {
    const boom = new Error('connection lost');
    const { executor } = executorThrowing(boom);
    const db = createTypedDb<DB>(executor);

    const result = await db.query('select id from users');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe(QueryErrorKind.ExecutorFailed);
      expect(result.error.cause).toBe(boom);
    }
  });
});

describe('Result helpers', () => {
  it('builds and narrows an Ok result', () => {
    const result = ok(42);

    expect(result.status).toBe(ResultStatus.Ok);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
    if (isOk(result)) {
      expect(result.value).toBe(42);
    }
  });

  it('builds and narrows an Err result', () => {
    const result = err('nope');

    expect(result.status).toBe(ResultStatus.Error);
    expect(isErr(result)).toBe(true);
    expect(isOk(result)).toBe(false);
    if (isErr(result)) {
      expect(result.error).toBe('nope');
    }
  });
});
