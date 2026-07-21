import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { createPgExecutor } from '../src/adapters/pg.js';

function fakePool(result: { rows: unknown[]; rowCount: number | null }): {
  pool: Pool;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn().mockResolvedValue(result);
  return { pool: { query } as unknown as Pool, query };
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
});
