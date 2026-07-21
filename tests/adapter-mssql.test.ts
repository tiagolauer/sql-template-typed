import { describe, expect, it, vi } from 'vitest';
import type { ConnectionPool } from 'mssql';
import { createMssqlExecutor } from '../src/adapters/mssql.js';

interface FakeRequest {
  input: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
}

function fakePool(result: unknown): { pool: ConnectionPool; request: FakeRequest } {
  const request: FakeRequest = {
    input: vi.fn(),
    query: vi.fn().mockResolvedValue(result),
  };
  const pool = { request: () => request } as unknown as ConnectionPool;
  return { pool, request };
}

describe('createMssqlExecutor', () => {
  it('binds @name placeholders by name in order of first appearance', async () => {
    const { pool, request } = fakePool({ recordset: [{ id: 1 }] });
    const executor = createMssqlExecutor(pool);

    const rows = await executor('select id from users where name = @name and id = @id', [
      'ada',
      7,
    ]);

    expect(request.input.mock.calls).toEqual([
      ['name', 'ada'],
      ['id', 7],
    ]);
    expect(rows).toEqual([{ id: 1 }]);
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

  it('returns an empty array when a write produces no recordset', async () => {
    const { pool } = fakePool({ recordset: undefined });
    const executor = createMssqlExecutor(pool);

    const rows = await executor('update users set name = @name where id = @id', ['ada', 1]);

    expect(rows).toEqual([]);
  });
});
