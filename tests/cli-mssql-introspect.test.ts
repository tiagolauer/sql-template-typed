import { describe, expect, it, vi } from 'vitest';
import { introspectMssql } from '../src/cli/dialects/mssql.js';

describe('introspectMssql', () => {
  it('resolves alias types via system_type_id, groups columns and keeps empty tables', async () => {
    const queries: string[] = [];
    const request = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn((sql: string) => {
        queries.push(sql);
        if (sql.includes('type_name')) {
          return Promise.resolve({
            recordset: [
              { table_name: 'users', column_name: 'id', data_type: 'int', is_nullable: false },
              {
                table_name: 'users',
                column_name: 'email',
                data_type: 'varchar',
                is_nullable: true,
              },
            ],
          });
        }
        return Promise.resolve({
          recordset: [{ table_name: 'users' }, { table_name: 'empty_t' }],
        });
      }),
    };
    const close = vi.fn().mockResolvedValue(undefined);
    vi.doMock('mssql', () => ({
      connect: vi.fn().mockResolvedValue({ request: () => request, close }),
    }));

    const tables = await introspectMssql({
      url: 'Server=host;Database=db;User Id=u;Password=p',
    });

    expect(queries.some((sql) => sql.includes('type_name(c.system_type_id)'))).toBe(true);
    expect(request.input).toHaveBeenCalledWith('schema', 'dbo');
    expect(tables).toEqual([
      {
        name: 'users',
        columns: [
          { name: 'id', tsType: 'number', nullable: false },
          { name: 'email', tsType: 'string', nullable: true },
        ],
      },
      { name: 'empty_t', columns: [] },
    ]);
    expect(close).toHaveBeenCalled();

    vi.doUnmock('mssql');
  });
});
