import { describe, expect, it, vi } from 'vitest';
import type { ConnectionPool, Request, Transaction } from 'mssql';
import { createMssqlExecutor, createMssqlTransaction } from '../src/adapters/mssql.js';

interface FakeRequest {
  input: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
}

function fakeRequest(result: unknown): FakeRequest {
  return {
    input: vi.fn(),
    query: vi.fn().mockResolvedValue(result),
  };
}

function fakePool(result: unknown): { pool: ConnectionPool; request: FakeRequest } {
  const request = fakeRequest(result);
  const pool = { request: () => request } as unknown as ConnectionPool;
  return { pool, request };
}

function fakeTransaction(result: unknown): { transaction: Transaction; request: FakeRequest } {
  const request = fakeRequest(result);
  const transaction = { request: () => request } as unknown as Transaction;
  return { transaction, request };
}

interface DB {
  users: { id: number; name: string };
}

function fakeTransactionalPool(): {
  pool: ConnectionPool;
  transactionFactory: ReturnType<typeof vi.fn>;
  begin: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
  rollback: ReturnType<typeof vi.fn>;
  request: FakeRequest;
} {
  const request = fakeRequest({ recordset: [] });
  const begin = vi.fn().mockResolvedValue(undefined);
  const commit = vi.fn().mockResolvedValue(undefined);
  const rollback = vi.fn().mockResolvedValue(undefined);
  const transaction = { begin, commit, rollback, request: () => request };
  const transactionFactory = vi.fn().mockReturnValue(transaction);
  const pool = { transaction: transactionFactory } as unknown as ConnectionPool;
  return { pool, transactionFactory, begin, commit, rollback, request };
}

describe('createMssqlExecutor', () => {
  it('binds @name placeholders by name in order of first appearance', async () => {
    const { pool, request } = fakePool({ recordset: [{ id: 1 }] });
    const executor = createMssqlExecutor(pool);

    const result = await executor('select id from users where name = @name and id = @id', [
      'ada',
      7,
    ]);

    expect(request.input.mock.calls).toEqual([
      ['name', 'ada'],
      ['id', 7],
    ]);
    expect(result).toEqual({ rows: [{ id: 1 }], meta: {} });
  });

  it('binds a repeated @name once', async () => {
    const { pool, request } = fakePool({ recordset: [] });
    const executor = createMssqlExecutor(pool);

    await executor('select id from users where id = @id or parent_id = @id', [7]);

    expect(request.input.mock.calls).toEqual([['id', 7]]);
  });

  it('ignores @@system variables and literals containing @', async () => {
    const { pool, request } = fakePool({ recordset: [] });
    const executor = createMssqlExecutor(pool);

    await executor("select id from users where email like '%@%' and id = @@rowcount", []);

    expect(request.input).not.toHaveBeenCalled();
  });

  it('returns empty rows and rowCount metadata when a write produces no recordset', async () => {
    const { pool } = fakePool({ recordset: undefined, rowsAffected: [3] });
    const executor = createMssqlExecutor(pool);

    const result = await executor('update users set name = @name where id = @id', ['ada', 1]);

    expect(result).toEqual({ rows: [], meta: { rowCount: 3 } });
  });

  it('routes the query through an open transaction instead of a fresh pool request', async () => {
    const { transaction, request } = fakeTransaction({ recordset: [{ id: 1 }] });
    const executor = createMssqlExecutor(transaction);

    const result = await executor('select id from users where id = @id', [1]);

    expect(request.input.mock.calls).toEqual([['id', 1]]);
    expect(result).toEqual({ rows: [{ id: 1 }], meta: {} });
  });

  it('accepts an already-bound Request directly, without calling .request() on it', async () => {
    const request = fakeRequest({ recordset: [{ id: 1 }] }) as unknown as Request;
    const executor = createMssqlExecutor(request);

    const result = await executor('select id from users where id = @id', [1]);

    expect((request as unknown as FakeRequest).input.mock.calls).toEqual([['id', 1]]);
    expect(result).toEqual({ rows: [{ id: 1 }], meta: {} });
  });

  it('binds a repeated @name once, without misaligning the parameter after it', async () => {
    const { pool, request } = fakePool({ recordset: [] });
    const executor = createMssqlExecutor(pool);

    // @now is used twice (deduped to one slot) and @id is a distinct third
    // occurrence. Params<> now types this as two arguments; passing them
    // straight through must bind @now to the first and @id to the second -
    // not shift @id onto a duplicated @now value.
    await executor('update users set last_login = @now, updated_at = @now where id = @id', [
      'now-value',
      7,
    ]);

    expect(request.input.mock.calls).toEqual([
      ['now', 'now-value'],
      ['id', 7],
    ]);
  });
});

describe('createMssqlTransaction', () => {
  it('begins, runs the callback against the pinned transaction, and commits', async () => {
    const { pool, transactionFactory, begin, commit, request } = fakeTransactionalPool();

    const result = await createMssqlTransaction<DB>(pool)(async (tx) => {
      await tx.query('select id from users');
      return 'done';
    });

    expect(result).toBe('done');
    expect(transactionFactory).toHaveBeenCalledOnce();
    expect(begin).toHaveBeenCalledOnce();
    expect(request.query).toHaveBeenCalledWith('select id from users');
    expect(commit).toHaveBeenCalledOnce();
  });

  it('rolls back when the callback throws', async () => {
    const { pool, rollback, commit } = fakeTransactionalPool();

    await expect(
      createMssqlTransaction<DB>(pool)(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(rollback).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
  });
});
