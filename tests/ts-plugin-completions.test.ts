import { describe, it, expect, afterEach } from 'vitest';
import { rmSync } from 'node:fs';
import ts from 'typescript';
import detectModule from '../src/ts-plugin/detect.cts';
import schemaModule from '../src/ts-plugin/schema.cts';
import sqlContext from '../src/ts-plugin/sql-context.cts';
import { buildProgram } from './ts-plugin-test-helpers.js';

const { matchQueryLiteral } = detectModule;
const { getColumnNames } = schemaModule;
const { getSelectListContext, getWhereClauseContext, findFromTable } = sqlContext;

const FIXTURE = `
import type { TypedDb } from '@owlsql/core';

interface DB {
  users: { id: number; name: string; email: string };
  posts: { id: number; title: string };
}

declare const db: TypedDb<DB>;

db.query(\`select id, na\`);
db.query(\`select id, na from posts\`);
db.query(\`select id from users where na\`);
`;

describe('ts-plugin: detect + schema against a real ts.Program', () => {
  let cleanupDir: string | null = null;

  afterEach(() => {
    if (cleanupDir) {
      rmSync(cleanupDir, { recursive: true, force: true });
      cleanupDir = null;
    }
  });

  it('detects a db.query(...) call and resolves its DB type argument', () => {
    const { program, sourceFile, dir } = buildProgram(FIXTURE, 'owlsql-ts-plugin-completions-');
    cleanupDir = dir;
    const checker = program.getTypeChecker();

    const cursor = sourceFile.text.indexOf('select id, na') + 'select id, na'.length;
    const match = matchQueryLiteral(ts, checker, sourceFile, cursor);

    expect(match).not.toBeNull();
  });

  it('suggests columns from the union of all tables when no FROM is typed yet', () => {
    const { program, sourceFile, dir } = buildProgram(FIXTURE, 'owlsql-ts-plugin-completions-');
    cleanupDir = dir;
    const checker = program.getTypeChecker();

    const literalStart = sourceFile.text.indexOf('`select id, na`') + 1;
    const cursor = sourceFile.text.indexOf('select id, na') + 'select id, na'.length;
    const match = matchQueryLiteral(ts, checker, sourceFile, cursor);
    expect(match).not.toBeNull();
    if (!match) return;

    const textBeforeCursor = sourceFile.text.slice(literalStart, cursor);
    const context = getSelectListContext(textBeforeCursor);
    expect(context).toEqual({ prefix: 'na', qualifier: null });
    if (!context) return;

    const table = findFromTable(match.literal.text);
    expect(table).toBeNull();

    const columns = getColumnNames(checker, match.dbType, match.literal, table);
    const filtered = columns.filter((name) => name.startsWith(context.prefix));

    expect(filtered).toEqual(['name']);
  });

  it('scopes columns to the FROM table once one is present', () => {
    const { program, sourceFile, dir } = buildProgram(FIXTURE, 'owlsql-ts-plugin-completions-');
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

  it('suggests columns after WHERE, scoped to the FROM table', () => {
    const { program, sourceFile, dir } = buildProgram(FIXTURE, 'owlsql-ts-plugin-completions-');
    cleanupDir = dir;
    const checker = program.getTypeChecker();

    const queryText = 'select id from users where na';
    const literalStart = sourceFile.text.indexOf(`\`${queryText}\``) + 1;
    const cursor = sourceFile.text.indexOf(queryText) + queryText.length;
    const match = matchQueryLiteral(ts, checker, sourceFile, cursor);
    expect(match).not.toBeNull();
    if (!match) return;

    const textBeforeCursor = sourceFile.text.slice(literalStart, cursor);
    const context = getSelectListContext(textBeforeCursor) ?? getWhereClauseContext(textBeforeCursor);
    expect(context).toEqual({ prefix: 'na', qualifier: null });
    if (!context) return;

    const table = findFromTable(match.literal.text);
    expect(table).toBe('users');

    const columns = getColumnNames(checker, match.dbType, match.literal, table);
    const filtered = columns.filter((name) => name.startsWith(context.prefix));

    expect(filtered).toEqual(['name']);
  });
});
