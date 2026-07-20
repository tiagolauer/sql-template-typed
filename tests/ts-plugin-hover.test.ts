import { describe, it, expect, afterEach } from 'vitest';
import ts from 'typescript';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { matchQueryLiteral } from '../src/ts-plugin/detect.cts';
import { getColumnType } from '../src/ts-plugin/schema.cts';
import { findFromTable, getWordAtOffset } from '../src/ts-plugin/sql-context.cts';

const FIXTURE = `
interface TypedDb<DB> {
  query(sql: string): Promise<unknown>;
}

interface DB {
  users: { id: number; name: string; email: string | null };
  posts: { id: number; title: string };
}

declare const db: TypedDb<DB>;

db.query(\`select id, name from users\`);
db.query(\`select id from posts\`);
`;

function buildProgram(source: string): { program: ts.Program; sourceFile: ts.SourceFile; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'owlsql-ts-plugin-hover-'));
  const filePath = join(dir, 'fixture.ts');
  writeFileSync(filePath, source, 'utf8');

  const program = ts.createProgram([filePath], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
  });

  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) {
    throw new Error('fixture source file was not found in the program');
  }

  return { program, sourceFile, dir };
}

describe('getWordAtOffset', () => {
  it('finds the word the cursor sits inside', () => {
    expect(getWordAtOffset('select id, name from users', 8)).toEqual({ word: 'id', start: 7, end: 9 });
  });

  it('finds the word when the cursor sits at its trailing edge', () => {
    expect(getWordAtOffset('select id, name from users', 9)).toEqual({ word: 'id', start: 7, end: 9 });
  });

  it('returns null for a position that is not inside a word', () => {
    expect(getWordAtOffset('select id,  name from users', 10)).toBeNull();
  });

  it('returns null for an out-of-range offset', () => {
    expect(getWordAtOffset('select id', -1)).toBeNull();
    expect(getWordAtOffset('select id', 100)).toBeNull();
  });
});

describe('ts-plugin hover: getColumnType against a real ts.Program', () => {
  let cleanupDir: string | null = null;

  afterEach(() => {
    if (cleanupDir) {
      rmSync(cleanupDir, { recursive: true, force: true });
      cleanupDir = null;
    }
  });

  it('resolves the type of a column scoped to its FROM table', () => {
    const { program, sourceFile, dir } = buildProgram(FIXTURE);
    cleanupDir = dir;
    const checker = program.getTypeChecker();

    const literalText = 'select id, name from users';
    const literalStart = sourceFile.text.indexOf(`\`${literalText}\``) + 1;
    const cursor = sourceFile.text.indexOf('name', literalStart) + 1;
    const match = matchQueryLiteral(ts, checker, sourceFile, cursor);
    expect(match).not.toBeNull();
    if (!match) return;

    const word = getWordAtOffset(match.literal.text, cursor - literalStart);
    expect(word?.word).toBe('name');
    if (!word) return;

    const table = findFromTable(match.literal.text);
    expect(table).toBe('users');

    const columnType = getColumnType(checker, match.dbType, match.literal, table, word.word);
    expect(columnType && checker.typeToString(columnType)).toBe('string');
  });

  it('resolves a nullable column type', () => {
    const { program, sourceFile, dir } = buildProgram(FIXTURE);
    cleanupDir = dir;
    const checker = program.getTypeChecker();

    const literalText = 'select id, name from users';
    const literalStart = sourceFile.text.indexOf(`\`${literalText}\``) + 1;
    const cursor = literalStart + literalText.indexOf('users') + 1;
    const match = matchQueryLiteral(ts, checker, sourceFile, cursor);
    expect(match).not.toBeNull();
    if (!match) return;

    const table = findFromTable(match.literal.text);
    const columnType = getColumnType(checker, match.dbType, match.literal, table, 'email');
    expect(columnType && checker.typeToString(columnType)).toBe('string | null');
  });

  it('returns null for a word that is not a real column', () => {
    const { program, sourceFile, dir } = buildProgram(FIXTURE);
    cleanupDir = dir;
    const checker = program.getTypeChecker();

    const literalText = 'select id from posts';
    const literalStart = sourceFile.text.indexOf(`\`${literalText}\``) + 1;
    const cursor = literalStart + 1;
    const match = matchQueryLiteral(ts, checker, sourceFile, cursor);
    expect(match).not.toBeNull();
    if (!match) return;

    const table = findFromTable(match.literal.text);
    const columnType = getColumnType(checker, match.dbType, match.literal, table, 'nope');
    expect(columnType).toBeNull();
  });
});
