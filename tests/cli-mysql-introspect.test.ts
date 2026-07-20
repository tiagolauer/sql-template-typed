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
          { name: 'id', tsType: 'string', nullable: false },
          { name: 'active', tsType: 'boolean', nullable: true },
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
  it('aliases every information_schema column and groups the result', async () => {
    const query = vi.fn().mockResolvedValue([UPPERCASE_ROWS]);
    const end = vi.fn().mockResolvedValue(undefined);
    vi.doMock('mysql2/promise', () => ({
      createConnection: vi.fn().mockResolvedValue({ query, end }),
    }));

    const tables = await introspectMysql({ url: 'mysql://localhost/db' });

    const sql = query.mock.calls[0]?.[0] as string;
    for (const column of ['table_name', 'column_name', 'data_type', 'column_type', 'is_nullable']) {
      expect(sql).toContain(`${column} as ${column}`);
    }
    expect(tables[0]?.name).toBe('users');
    expect(end).toHaveBeenCalled();

    vi.doUnmock('mysql2/promise');
  });
});
