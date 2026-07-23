import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runGenerate, detectDialect } from '../src/cli/generate';
import { loadSqlite, sqliteAvailable } from './sqlite-availability.js';

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

  it('rejects a mistyped single-slash URL without leaking the password or defaulting to sqlite (#134)', () => {
    let message = '';
    try {
      detectDialect('postgres:/user:S3cretPass@host/db');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('Unrecognized connection URL');
    expect(message).toContain('postgres:/***@host/db');
    expect(message).not.toContain('S3cretPass');
    expect(message).not.toContain('user:');
  });

  it('rejects an ADO/DSN string missing a server keyword without leaking the password (#134)', () => {
    let message = '';
    try {
      detectDialect('Uid=sa;Pwd=S3cretPass;Initial Catalog=mydb;');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('Unrecognized connection URL');
    expect(message).not.toContain('S3cretPass');
    expect(message).toContain('Uid=sa;Pwd=***;Initial Catalog=mydb;');
  });

  it('treats Windows drive-letter paths containing "@" as sqlite, not a mistyped URL', () => {
    expect(detectDialect('C:/app@prod.db')).toBe('sqlite');
    expect(detectDialect('D:\\data@backup.db')).toBe('sqlite');
    expect(detectDialect('c:/Users/me@work/app.db')).toBe('sqlite');
  });

  it('redacts a quoted DSN password containing a semicolon without leaking it', () => {
    let message = '';
    try {
      detectDialect('Uid=sa;Pwd="S3;cretPass";Initial Catalog=mydb;');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('Unrecognized connection URL');
    expect(message).toContain('Uid=sa;Pwd=***;Initial Catalog=mydb;');
    expect(message).not.toContain('S3;cretPass');
    expect(message).not.toContain('cretPass');
  });

  it('redacts a brace-wrapped DSN password containing a semicolon without leaking it', () => {
    let message = '';
    try {
      detectDialect('Uid=sa;Pwd={S3;cretPass};Initial Catalog=mydb;');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('Unrecognized connection URL');
    expect(message).toContain('Uid=sa;Pwd=***;Initial Catalog=mydb;');
    expect(message).not.toContain('S3;cretPass');
    expect(message).not.toContain('cretPass');
  });
});

describe.skipIf(!sqliteAvailable)('runGenerate (end to end against a real sqlite file)', () => {
  it('introspects the database and writes the rendered schema to --out', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'owlsql-'));
    const dbFile = join(dir, 'app.db');
    const outFile = join(dir, 'schema.ts');

    try {
      const db = new (loadSqlite())(dbFile);
      db.exec('create table users (id integer primary key, name text not null, bio text)');
      db.close();

      await runGenerate({ url: dbFile, out: outFile, dialect: 'sqlite' });

      const written = readFileSync(outFile, 'utf8');
      expect(written).toBe(
        'export interface DB {\n' +
          '  users: {\n' +
          '    id: number;\n' +
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
      const db = new (loadSqlite())(dbFile);
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
