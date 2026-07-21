import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'mysql2/promise';
import { createMysql2Executor } from '../src/adapters/mysql2.js';

function fakePool(result: unknown): { pool: Pool; execute: ReturnType<typeof vi.fn> } {
  const execute = vi.fn().mockResolvedValue([result, undefined]);
  return { pool: { execute } as unknown as Pool, execute };
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

  it('returns an empty array instead of a ResultSetHeader for writes', async () => {
    const header = { affectedRows: 1, insertId: 7, fieldCount: 0 };
    const { pool } = fakePool(header);

    const executor = createMysql2Executor(pool);
    const result = await executor('insert into users (name) values (?)', ['ada']);

    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('uses execute for server-side parameter binding', async () => {
    const { pool, execute } = fakePool([]);

    const executor = createMysql2Executor(pool);
    await executor('select id from users where id = ?', [7]);

    expect(execute).toHaveBeenCalledWith('select id from users where id = ?', [7]);
  });
});
