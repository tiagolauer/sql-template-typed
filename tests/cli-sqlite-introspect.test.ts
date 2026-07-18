import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { introspectSqlite } from '../src/cli/dialects/sqlite';

function withTempDatabase(setup: (db: DatabaseSync) => void): string {
  const dir = mkdtempSync(join(tmpdir(), 'owlsql-'));
  const file = join(dir, 'test.db');
  const db = new DatabaseSync(file);
  setup(db);
  db.close();
  return file;
}

describe('introspectSqlite', () => {
  it('introspects columns, types, and nullability from a real database file', async () => {
    const file = withTempDatabase((db) => {
      db.exec(`
        create table users (
          id integer primary key,
          name text not null,
          bio text,
          active boolean not null
        )
      `);
    });

    try {
      const tables = await introspectSqlite({ url: file });

      expect(tables).toHaveLength(1);
      expect(tables[0]?.name).toBe('users');
      expect(tables[0]?.columns).toEqual([
        { name: 'id', tsType: 'number', nullable: true },
        { name: 'name', tsType: 'string', nullable: false },
        { name: 'bio', tsType: 'string', nullable: true },
        { name: 'active', tsType: 'boolean', nullable: false },
      ]);
    } finally {
      rmSync(join(file, '..'), { recursive: true, force: true });
    }
  });

  it('introspects multiple tables', async () => {
    const file = withTempDatabase((db) => {
      db.exec('create table users (id integer primary key, name text not null)');
      db.exec('create table posts (id integer primary key, user_id integer not null, title text not null)');
    });

    try {
      const tables = await introspectSqlite({ url: file });

      expect(tables.map((table) => table.name).sort()).toEqual(['posts', 'users']);
    } finally {
      rmSync(join(file, '..'), { recursive: true, force: true });
    }
  });
});
