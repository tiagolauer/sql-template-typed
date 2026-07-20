import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { runGenerate, detectDialect } from '../src/cli/generate';

describe('detectDialect', () => {
  it('detects postgres, mysql, and mssql from the URL scheme', () => {
    expect(detectDialect('postgres://user:pass@host/db')).toBe('postgres');
    expect(detectDialect('postgresql://user:pass@host/db')).toBe('postgres');
    expect(detectDialect('mysql://user:pass@host/db')).toBe('mysql');
    expect(detectDialect('mssql://user:pass@host/db')).toBe('mssql');
    expect(detectDialect('sqlserver://user:pass@host/db')).toBe('mssql');
  });

  it('falls back to sqlite for a bare file path', () => {
    expect(detectDialect('./app.db')).toBe('sqlite');
    expect(detectDialect(':memory:')).toBe('sqlite');
  });

  it('rejects an unrecognized URL scheme instead of silently falling back to sqlite', () => {
    expect(() => detectDialect('postgress://user:pass@host/db')).toThrow(
      'Unrecognized connection URL "postgress://***@host/db"',
    );
    expect(() => detectDialect('mongodb://user:pass@host/db')).toThrow('Unrecognized connection URL');
  });
});

describe('runGenerate (end to end against a real sqlite file)', () => {
  it('introspects the database and writes the rendered schema to --out', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'owlsql-'));
    const dbFile = join(dir, 'app.db');
    const outFile = join(dir, 'schema.ts');

    try {
      const db = new DatabaseSync(dbFile);
      db.exec('create table users (id integer primary key, name text not null, bio text)');
      db.close();

      await runGenerate({ url: dbFile, out: outFile, dialect: 'sqlite' });

      const written = readFileSync(outFile, 'utf8');
      expect(written).toBe(
        'export interface DB {\n' +
          '  users: {\n' +
          '    id: number | null;\n' +
          '    name: string;\n' +
          '    bio: string | null;\n' +
          '  };\n' +
          '}\n',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws a clear error when no tables are found', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'owlsql-'));
    const dbFile = join(dir, 'empty.db');

    try {
      const db = new DatabaseSync(dbFile);
      db.close();

      await expect(
        runGenerate({ url: dbFile, out: join(dir, 'schema.ts'), dialect: 'sqlite' }),
      ).rejects.toThrow('No tables found');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses to introspect a nonexistent sqlite file instead of creating one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'owlsql-'));
    const missingFile = join(dir, 'typo.db');

    try {
      await expect(
        runGenerate({ url: missingFile, out: join(dir, 'schema.ts'), dialect: 'sqlite' }),
      ).rejects.toThrow('SQLite database file not found');

      expect(existsSync(missingFile)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
