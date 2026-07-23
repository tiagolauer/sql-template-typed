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
