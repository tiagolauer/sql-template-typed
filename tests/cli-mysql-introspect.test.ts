import { describe, expect, it, vi } from 'vitest';
import { groupMysqlColumns, introspectMysql } from '../src/cli/dialects/mysql.js';

const UPPERCASE_ROWS = [
  {
    TABLE_NAME: 'users',
    COLUMN_NAME: 'id',
    DATA_TYPE: 'bigint',
    COLUMN_TYPE: 'bigint',
    IS_NULLABLE: 'NO',
  },
  {
    TABLE_NAME: 'users',
    COLUMN_NAME: 'active',
    DATA_TYPE: 'tinyint',
    COLUMN_TYPE: 'tinyint(1)',
    IS_NULLABLE: 'YES',
  },
];

describe('groupMysqlColumns', () => {
  it('reads UPPERCASE information_schema headers (MySQL 8.0.12+)', () => {
    const tables = groupMysqlColumns(UPPERCASE_ROWS);

    expect(tables).toEqual([
      {
        name: 'users',
        columns: [
          { name: 'id', tsType: 'number', nullable: false },
          { name: 'active', tsType: 'number', nullable: true },
        ],
      },
    ]);
  });

  it('still reads lowercase headers', () => {
    const tables = groupMysqlColumns([
      {
        table_name: 'posts',
        column_name: 'title',
        data_type: 'varchar',
        column_type: 'varchar(255)',
        is_nullable: 'NO',
      },
    ]);

    expect(tables).toEqual([
      { name: 'posts', columns: [{ name: 'title', tsType: 'string', nullable: false }] },
    ]);
  });
});

describe('introspectMysql', () => {
  it('aliases every information_schema column, filters views and keeps empty tables', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ TABLE_NAME: 'users' }, { TABLE_NAME: 'empty_t' }]])
      .mockResolvedValueOnce([UPPERCASE_ROWS]);
    const end = vi.fn().mockResolvedValue(undefined);
    vi.doMock('mysql2/promise', () => ({
      createConnection: vi.fn().mockResolvedValue({ query, end }),
    }));

    const tables = await introspectMysql({ url: 'mysql://localhost/db' });

    const tablesSql = query.mock.calls[0]?.[0] as string;
    const columnsSql = query.mock.calls[1]?.[0] as string;
    expect(tablesSql).toContain("table_type = 'BASE TABLE'");
    expect(columnsSql).toContain("table_type = 'BASE TABLE'");
    for (const column of ['table_name', 'column_name', 'data_type', 'is_nullable']) {
      expect(columnsSql).toContain(`${column} as ${column}`);
    }
    expect(tables.map((table) => table.name)).toEqual(['users', 'empty_t']);
    expect(tables[1]?.columns).toEqual([]);
    expect(end).toHaveBeenCalled();

    vi.doUnmock('mysql2/promise');
  });
});
