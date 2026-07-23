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
