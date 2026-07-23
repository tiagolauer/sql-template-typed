import { describe, expect, it, vi } from 'vitest';
import type postgres from 'postgres';
import { createPostgresJsExecutor } from '../src/adapters/postgres.js';

function fakeClient(rows: unknown[], count: number | null): {
  client: postgres.Sql;
  unsafe: ReturnType<typeof vi.fn>;
} {
  const result = Object.assign([...rows], { count });
  const unsafe = vi.fn().mockResolvedValue(result);
  return { client: { unsafe } as unknown as postgres.Sql, unsafe };
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
