import { describe, it, expect, afterEach } from 'vitest';
import ts from 'typescript';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { matchQueryLiteral } from '../src/ts-plugin/detect.cts';
import { getColumnNames } from '../src/ts-plugin/schema.cts';
import { getSelectListContext, findFromTable } from '../src/ts-plugin/sql-context.cts';

const FIXTURE = `
interface TypedDb<DB> {
  query(sql: string): Promise<unknown>;
}

interface DB {
  users: { id: number; name: string; email: string };
  posts: { id: number; title: string };
}

declare const db: TypedDb<DB>;

db.query(\`select id, na\`);
db.query(\`select id, na from posts\`);
`;

function buildProgram(source: string): { program: ts.Program; sourceFile: ts.SourceFile; filePath: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'owlsql-ts-plugin-'));
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

  return { program, sourceFile, filePath, dir };
}

describe('ts-plugin: detect + schema against a real ts.Program', () => {
  let cleanupDir: string | null = null;

  afterEach(() => {
    if (cleanupDir) {
      rmSync(cleanupDir, { recursive: true, force: true });
      cleanupDir = null;
    }
  });

  it('detects a db.query(...) call and resolves its DB type argument', () => {
    const { program, sourceFile, dir } = buildProgram(FIXTURE);
    cleanupDir = dir;
    const checker = program.getTypeChecker();

    const cursor = sourceFile.text.indexOf('select id, na') + 'select id, na'.length;
    const match = matchQueryLiteral(ts, checker, sourceFile, cursor);

    expect(match).not.toBeNull();
  });

  it('suggests columns from the union of all tables when no FROM is typed yet', () => {
    const { program, sourceFile, dir } = buildProgram(FIXTURE);
    cleanupDir = dir;
    const checker = program.getTypeChecker();

    const literalStart = sourceFile.text.indexOf('`select id, na`') + 1;
    const cursor = sourceFile.text.indexOf('select id, na') + 'select id, na'.length;
    const match = matchQueryLiteral(ts, checker, sourceFile, cursor);
    expect(match).not.toBeNull();
    if (!match) return;

    const textBeforeCursor = sourceFile.text.slice(literalStart, cursor);
    const context = getSelectListContext(textBeforeCursor);
    expect(context).toEqual({ prefix: 'na' });
    if (!context) return;

    const table = findFromTable(match.literal.text);
    expect(table).toBeNull();

    const columns = getColumnNames(checker, match.dbType, match.literal, table);
    const filtered = columns.filter((name) => name.startsWith(context.prefix));

    expect(filtered).toEqual(['name']);
  });

  it('scopes columns to the FROM table once one is present', () => {
    const { program, sourceFile, dir } = buildProgram(FIXTURE);
    cleanupDir = dir;
    const checker = program.getTypeChecker();

    const secondCallText = 'select id, na from posts';
    const cursor = sourceFile.text.indexOf(secondCallText) + 'select id, na'.length;
    const match = matchQueryLiteral(ts, checker, sourceFile, cursor);
    expect(match).not.toBeNull();
    if (!match) return;

    const table = findFromTable(match.literal.text);
    expect(table).toBe('posts');

    const columns = getColumnNames(checker, match.dbType, match.literal, table);

    expect(columns.sort()).toEqual(['id', 'title']);
    expect(columns).not.toContain('name');
    expect(columns).not.toContain('email');
  });
});
