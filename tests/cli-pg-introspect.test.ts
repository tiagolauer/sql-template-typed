import { describe, expect, it, vi } from 'vitest';
import { introspectPostgres } from '../src/cli/dialects/postgres.js';

const TABLE_ROWS = [{ table_name: 'users' }, { table_name: 'empty_t' }];

const ENUM_ROWS = [
  { typname: 'mood', enumlabel: 'happy' },
  { typname: 'mood', enumlabel: 'sad' },
];

const COLUMN_ROWS = [
  { table_name: 'users', column_name: 'id', udt_name: 'int4', is_nullable: 'NO' },
  { table_name: 'users', column_name: 'state', udt_name: 'mood', is_nullable: 'YES' },
  { table_name: 'users', column_name: 'tags', udt_name: '_text', is_nullable: 'YES' },
];

describe('introspectPostgres', () => {
  it('groups columns, resolves enums to label unions and keeps empty tables', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: TABLE_ROWS })
      .mockResolvedValueOnce({ rows: ENUM_ROWS })
      .mockResolvedValueOnce({ rows: COLUMN_ROWS });
    const end = vi.fn().mockResolvedValue(undefined);
    vi.doMock('pg', () => ({
      Pool: class {
        query = query;
        end = end;
      },
    }));

    const tables = await introspectPostgres({ url: 'postgres://localhost/db' });

    expect(query.mock.calls[0]?.[0]).toContain("table_type = 'BASE TABLE'");
    expect(query.mock.calls[1]?.[0]).toContain('pg_enum');
    expect(query.mock.calls.map((call) => call[1])).toEqual([['public'], ['public'], ['public']]);

    expect(tables).toEqual([
      {
        name: 'users',
        columns: [
          { name: 'id', tsType: 'number', nullable: false },
          { name: 'state', tsType: "'happy' | 'sad'", nullable: true },
          { name: 'tags', tsType: 'string[]', nullable: true },
        ],
      },
      { name: 'empty_t', columns: [] },
    ]);
    expect(end).toHaveBeenCalled();

    vi.doUnmock('pg');
  });

  it('respects the schema option', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const end = vi.fn().mockResolvedValue(undefined);
    vi.doMock('pg', () => ({
      Pool: class {
        query = query;
        end = end;
      },
    }));

    await introspectPostgres({ url: 'postgres://localhost/db', schema: 'app' });

    expect(query.mock.calls.every((call) => call[1]?.[0] === 'app')).toBe(true);

    vi.doUnmock('pg');
  });
});
