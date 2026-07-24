import { describe, expect, it, vi } from 'vitest';
import type postgres from 'postgres';
import { createPostgresJsExecutor, createPostgresJsTransaction } from '../src/adapters/postgres.js';

function fakeClient(rows: unknown[], count: number | null): {
  client: postgres.Sql;
  unsafe: ReturnType<typeof vi.fn>;
} {
  const result = Object.assign([...rows], { count });
  const unsafe = vi.fn().mockResolvedValue(result);
  return { client: { unsafe } as unknown as postgres.Sql, unsafe };
}

interface DB {
  users: { id: number; name: string };
}

function fakeTransactionalSql(): {
  sql: postgres.Sql;
  unsafe: ReturnType<typeof vi.fn>;
  begin: ReturnType<typeof vi.fn>;
} {
  const result = Object.assign([], { count: 0 });
  const unsafe = vi.fn().mockResolvedValue(result);
  const transactionSql = { unsafe } as unknown as postgres.TransactionSql;
  // Real sql.begin invokes the callback with a transaction-scoped sql,
  // commits on a resolved callback, and rolls back (rejecting) on a thrown
  // one - the fake only needs to reproduce that pass-through/reject shape.
  const begin = vi.fn(async (cb: (transactionSql: postgres.TransactionSql) => unknown) =>
    cb(transactionSql),
  );
  return { sql: { begin } as unknown as postgres.Sql, unsafe, begin };
}

describe('createPostgresJsExecutor', () => {
  it('passes rows and rowCount metadata through', async () => {
    const { client } = fakeClient([{ id: 1 }], 1);
    const executor = createPostgresJsExecutor(client);

    const result = await executor('select id from users where id = $1', [1]);

    expect(result).toEqual({ rows: [{ id: 1 }], meta: { rowCount: 1 } });
  });

  it('normalizes an undefined param to null - postgres.js throws on a raw undefined', async () => {
    const { client, unsafe } = fakeClient([], 0);
    const executor = createPostgresJsExecutor(client);

    await executor('select id from users where id = $1 and name = $2', [7, undefined]);

    expect(unsafe).toHaveBeenCalledWith('select id from users where id = $1 and name = $2', [
      7,
      null,
    ]);
  });
});

describe('createPostgresJsTransaction', () => {
  it('runs the callback against the transaction-scoped sql via sql.begin', async () => {
    const { sql, unsafe, begin } = fakeTransactionalSql();

    const result = await createPostgresJsTransaction<DB>(sql)(async (tx) => {
      await tx.query('select id from users');
      return 'done';
    });

    expect(result).toBe('done');
    expect(begin).toHaveBeenCalledOnce();
    expect(unsafe).toHaveBeenCalledWith('select id from users', []);
  });

  it('propagates a thrown error from the callback - sql.begin owns the rollback itself', async () => {
    const { sql } = fakeTransactionalSql();

    await expect(
      createPostgresJsTransaction<DB>(sql)(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});
