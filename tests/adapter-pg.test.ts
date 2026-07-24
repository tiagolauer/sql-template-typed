import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { createPgExecutor, createPgTransaction } from '../src/adapters/pg.js';

function fakePool(result: { rows: unknown[]; rowCount: number | null }): {
  pool: Pool;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn().mockResolvedValue(result);
  return { pool: { query } as unknown as Pool, query };
}

interface DB {
  users: { id: number; name: string };
}

function fakeTransactionalPool(): {
  pool: Pool;
  connect: ReturnType<typeof vi.fn>;
  clientQuery: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
} {
  const clientQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const release = vi.fn();
  const client = { query: clientQuery, release };
  const connect = vi.fn().mockResolvedValue(client);
  return { pool: { connect } as unknown as Pool, connect, clientQuery, release };
}

describe('createPgExecutor', () => {
  it('passes rows and rowCount metadata through', async () => {
    const { pool } = fakePool({ rows: [{ id: 1 }], rowCount: 1 });
    const executor = createPgExecutor(pool);

    const result = await executor('select id from users where id = $1', [1]);

    expect(result).toEqual({ rows: [{ id: 1 }], meta: { rowCount: 1 } });
  });

  it('omits rowCount when the driver reports null', async () => {
    const { pool } = fakePool({ rows: [], rowCount: null });
    const executor = createPgExecutor(pool);

    const result = await executor('select 1', []);

    expect(result).toEqual({ rows: [], meta: {} });
  });

  it('sends the SQL alone when there are no params, keeping the simple protocol', async () => {
    const { pool, query } = fakePool({ rows: [], rowCount: 0 });
    const executor = createPgExecutor(pool);

    await executor('select id from users', []);

    expect(query).toHaveBeenCalledWith('select id from users');
  });

  it('forwards params when present', async () => {
    const { pool, query } = fakePool({ rows: [], rowCount: 0 });
    const executor = createPgExecutor(pool);

    await executor('select id from users where id = $1', [7]);

    expect(query).toHaveBeenCalledWith('select id from users where id = $1', [7]);
  });

  it('normalizes an undefined param to null, matching mssql/node-sqlite', async () => {
    const { pool, query } = fakePool({ rows: [], rowCount: 0 });
    const executor = createPgExecutor(pool);

    await executor('select id from users where id = $1 and name = $2', [7, undefined]);

    expect(query).toHaveBeenCalledWith('select id from users where id = $1 and name = $2', [
      7,
      null,
    ]);
  });
});

describe('createPgTransaction', () => {
  it('begins, runs the callback against the pinned client, commits, and releases', async () => {
    const { pool, connect, clientQuery, release } = fakeTransactionalPool();
    const calls: string[] = [];
    clientQuery.mockImplementation(async (sql: string) => {
      calls.push(sql);
      return { rows: [], rowCount: 0 };
    });

    const result = await createPgTransaction<DB>(pool)(async (tx) => {
      await tx.query('select id from users');
      return 'done';
    });

    expect(result).toBe('done');
    expect(connect).toHaveBeenCalledOnce();
    expect(calls).toEqual(['begin', 'select id from users', 'commit']);
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back and still releases when the callback throws', async () => {
    const { pool, clientQuery, release } = fakeTransactionalPool();
    const calls: string[] = [];
    clientQuery.mockImplementation(async (sql: string) => {
      calls.push(sql);
      return { rows: [], rowCount: 0 };
    });

    await expect(
      createPgTransaction<DB>(pool)(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(calls).toEqual(['begin', 'rollback']);
    expect(release).toHaveBeenCalledOnce();
  });

  it('releases even when commit itself throws', async () => {
    const { pool, clientQuery, release } = fakeTransactionalPool();
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'commit') {
        throw new Error('commit failed');
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(createPgTransaction<DB>(pool)(async () => 'done')).rejects.toThrow(
      'commit failed',
    );

    expect(release).toHaveBeenCalledOnce();
  });
});
