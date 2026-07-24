import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'mysql2/promise';
import { createMysql2Executor, createMysql2Transaction } from '../src/adapters/mysql2.js';

function fakePool(result: unknown): { pool: Pool; execute: ReturnType<typeof vi.fn> } {
  const execute = vi.fn().mockResolvedValue([result, undefined]);
  return { pool: { execute } as unknown as Pool, execute };
}

interface DB {
  users: { id: number; name: string };
}

function fakeTransactionalPool(): {
  pool: Pool;
  getConnection: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  beginTransaction: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
  rollback: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
} {
  const execute = vi.fn().mockResolvedValue([[], undefined]);
  const beginTransaction = vi.fn().mockResolvedValue(undefined);
  const commit = vi.fn().mockResolvedValue(undefined);
  const rollback = vi.fn().mockResolvedValue(undefined);
  const release = vi.fn();
  const connection = { execute, beginTransaction, commit, rollback, release };
  const getConnection = vi.fn().mockResolvedValue(connection);
  return {
    pool: { getConnection } as unknown as Pool,
    getConnection,
    execute,
    beginTransaction,
    commit,
    rollback,
    release,
  };
}

describe('createMysql2Executor', () => {
  it('returns row arrays from SELECT results', async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const { pool, execute } = fakePool(rows);

    const executor = createMysql2Executor(pool);
    const result = await executor('select id from users', []);

    expect(result).toEqual(rows);
    expect(execute).toHaveBeenCalledWith('select id from users', []);
  });

  it('returns empty rows plus write metadata instead of a ResultSetHeader', async () => {
    const header = { affectedRows: 1, insertId: 7, fieldCount: 0 };
    const { pool } = fakePool(header);

    const executor = createMysql2Executor(pool);
    const result = await executor('insert into users (name) values (?)', ['ada']);

    expect(result).toEqual({ rows: [], meta: { rowCount: 1, lastInsertRowid: 7 } });
  });

  it('uses execute for server-side parameter binding', async () => {
    const { pool, execute } = fakePool([]);

    const executor = createMysql2Executor(pool);
    await executor('select id from users where id = ?', [7]);

    expect(execute).toHaveBeenCalledWith('select id from users where id = ?', [7]);
  });

  it('normalizes an undefined param to null - mysql2 throws on a raw undefined', async () => {
    const { pool, execute } = fakePool([]);

    const executor = createMysql2Executor(pool);
    await executor('select id from users where id = ? and name = ?', [7, undefined]);

    expect(execute).toHaveBeenCalledWith('select id from users where id = ? and name = ?', [
      7,
      null,
    ]);
  });
});

describe('createMysql2Transaction', () => {
  it('begins, runs the callback against the pinned connection, commits, and releases', async () => {
    const { pool, getConnection, execute, beginTransaction, commit, release } =
      fakeTransactionalPool();

    const result = await createMysql2Transaction<DB>(pool)(async (tx) => {
      await tx.query('select id from users');
      return 'done';
    });

    expect(result).toBe('done');
    expect(getConnection).toHaveBeenCalledOnce();
    expect(beginTransaction).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith('select id from users', []);
    expect(commit).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back and still releases when the callback throws', async () => {
    const { pool, rollback, commit, release } = fakeTransactionalPool();

    await expect(
      createMysql2Transaction<DB>(pool)(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(rollback).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });
});
