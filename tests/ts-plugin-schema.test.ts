import { describe, it, expect, afterEach } from 'vitest';
import { rmSync } from 'node:fs';
import ts from 'typescript';
import schemaModule from '../src/ts-plugin/schema.cts';
import { buildProgram } from './ts-plugin-test-helpers.js';

const { getColumnNames, getColumnType } = schemaModule;

describe('getColumnNames / getColumnType scoping', () => {
  let cleanupDir: string | null = null;

  afterEach(() => {
    if (cleanupDir) {
      rmSync(cleanupDir, { recursive: true, force: true });
      cleanupDir = null;
    }
  });

  function buildDbType(source: string): { checker: ts.TypeChecker; dbType: ts.Type; node: ts.Node } {
    const { program, sourceFile, dir } = buildProgram(`${source}\ndbValue;\n`, 'owlsql-ts-plugin-schema-');
    cleanupDir = dir;
    const checker = program.getTypeChecker();

    const lastStatement = sourceFile.statements[sourceFile.statements.length - 1];
    if (!lastStatement || !ts.isExpressionStatement(lastStatement) || !ts.isIdentifier(lastStatement.expression)) {
      throw new Error('expected a trailing `dbValue;` reference statement in the fixture');
    }

    const node = lastStatement.expression;
    return { checker, dbType: checker.getTypeAtLocation(node), node };
  }

  it('scopes to a named table', () => {
    const { checker, dbType, node } = buildDbType(`
      interface DB { users: { id: number; name: string }; posts: { id: number; title: string } }
      declare const dbValue: DB;
    `);

    expect(getColumnNames(checker, dbType, node, 'users').sort()).toEqual(['id', 'name']);
  });

  it('returns no columns for a FROM table that does not exist in the schema, instead of falling back to all tables', () => {
    const { checker, dbType, node } = buildDbType(`
      interface DB { users: { id: number; name: string }; posts: { id: number; title: string } }
      declare const dbValue: DB;
    `);

    expect(getColumnNames(checker, dbType, node, 'userz')).toEqual([]);
    expect(getColumnType(checker, dbType, node, 'userz', 'title')).toBeNull();
  });

  it('unions columns across all tables when no FROM table is given', () => {
    const { checker, dbType, node } = buildDbType(`
      interface DB { users: { id: number; name: string }; posts: { id: number; title: string } }
      declare const dbValue: DB;
    `);

    expect(getColumnNames(checker, dbType, node, null).sort()).toEqual(['id', 'name', 'title']);
  });

  it('resolves a column type unambiguously when every table agrees on it, even with no FROM scoping', () => {
    const { checker, dbType, node } = buildDbType(`
      interface DB { users: { id: number; name: string }; posts: { id: number; title: string } }
      declare const dbValue: DB;
    `);

    const columnType = getColumnType(checker, dbType, node, null, 'id');
    expect(columnType && checker.typeToString(columnType)).toBe('number');
  });

  it('refuses to guess a column type when tables disagree on it and there is no FROM scoping', () => {
    const { checker, dbType, node } = buildDbType(`
      interface DB { users: { id: number }; accounts: { id: string } }
      declare const dbValue: DB;
    `);

    expect(getColumnType(checker, dbType, node, null, 'id')).toBeNull();
  });

  it('unions columns across an explicit array of tables, for JOIN scoping', () => {
    const { checker, dbType, node } = buildDbType(`
      interface DB {
        users: { id: number; name: string };
        posts: { id: number; title: string };
        comments: { id: number; body: string };
      }
      declare const dbValue: DB;
    `);

    expect(getColumnNames(checker, dbType, node, ['users', 'posts']).sort()).toEqual([
      'id',
      'name',
      'title',
    ]);
    expect(getColumnNames(checker, dbType, node, ['users', 'posts'])).not.toContain('body');
  });

  it('resolves a column type unambiguously across a joined table array', () => {
    const { checker, dbType, node } = buildDbType(`
      interface DB { users: { id: number; name: string }; posts: { id: number; title: string } }
      declare const dbValue: DB;
    `);

    const columnType = getColumnType(checker, dbType, node, ['users', 'posts'], 'name');
    expect(columnType && checker.typeToString(columnType)).toBe('string');
  });

  it('refuses to guess a column type when joined tables in the array disagree on it', () => {
    const { checker, dbType, node } = buildDbType(`
      interface DB { users: { id: number }; accounts: { id: string } }
      declare const dbValue: DB;
    `);

    expect(getColumnType(checker, dbType, node, ['users', 'accounts'], 'id')).toBeNull();
  });
});
