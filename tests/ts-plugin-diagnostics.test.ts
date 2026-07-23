import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { rmSync } from 'node:fs';
import ts from 'typescript';
import detectModule from '../src/ts-plugin/detect.cts';
import { buildProgram, loadDiagnostics } from './ts-plugin-test-helpers.js';

const { findAllQueryLiterals } = detectModule;
const { diagnostics: diagnosticsModule, dir: diagnosticsDir } = loadDiagnostics();
const { getQueryDiagnostics } = diagnosticsModule;

afterAll(() => {
  rmSync(diagnosticsDir, { recursive: true, force: true });
});

const FIXTURE = `
import type { TypedDb } from '@owlsql/core';

interface DB {
  users: { id: number; name: string };
  posts: { id: number; title: string; user_id: number };
}

declare const db: TypedDb<DB>;
`;

function diagnosticsFor(query: string): { message: string; text: string }[] {
  const source = `${FIXTURE}\ndb.query(\`${query}\`);\n`;
  const { program, sourceFile, dir } = buildProgram(source, 'owlsql-ts-plugin-diagnostics-');
  try {
    const checker = program.getTypeChecker();
    const matches = findAllQueryLiterals(ts, checker, sourceFile);
    expect(matches).toHaveLength(1);
    const [match] = matches;
    if (!match) return [];
    return getQueryDiagnostics(checker, match.dbType, match.literal).map((span) => ({
      message: span.message,
      text: sourceFile.text.slice(span.start, span.start + span.length),
    }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('ts-plugin diagnostics: getQueryDiagnostics', () => {
  it('reports no diagnostics for a valid query', () => {
    expect(diagnosticsFor('select id, name from users')).toEqual([]);
  });

  it('reports an unknown column in the SELECT list', () => {
    expect(diagnosticsFor('select id, nope from users')).toEqual([
      { message: 'unknown column: nope', text: 'nope' },
    ]);
  });

  it('reports an unknown table in the FROM clause', () => {
    expect(diagnosticsFor('select id from ghosts')).toEqual([
      { message: 'unknown table: ghosts', text: 'ghosts' },
    ]);
  });

  it('resolves a qualified column against its JOINed alias', () => {
    expect(
      diagnosticsFor('select u.id, p.title from users u join posts p on p.user_id = u.id'),
    ).toEqual([]);
  });

  it('reports an unknown column on a specific alias', () => {
    expect(
      diagnosticsFor('select u.nope from users u join posts p on p.user_id = u.id'),
    ).toEqual([{ message: 'unknown column: nope', text: 'nope' }]);
  });

  it('reports an unknown alias qualifier', () => {
    expect(diagnosticsFor('select z.id from users u')).toEqual([
      { message: 'unknown alias: z', text: 'z' },
    ]);
  });

  it('reports an ambiguous unqualified column across a join', () => {
    expect(diagnosticsFor('select id from users u join posts p on p.user_id = u.id')).toEqual([
      { message: 'ambiguous column: id', text: 'id' },
    ]);
  });

  it('skips validation for function calls, literals, and star', () => {
    expect(
      diagnosticsFor("select *, count(*), 'literal', 1, name from users"),
    ).toEqual([]);
  });

  it('does not run without a FROM clause', () => {
    expect(diagnosticsFor('select nope')).toEqual([]);
  });

  it('ignores a table named inside a line comment (issue #138 repro)', () => {
    expect(diagnosticsFor('select id -- from ghosts\nfrom users')).toEqual([]);
  });

  it('ignores a table named inside a block comment', () => {
    expect(diagnosticsFor('select id /* from ghosts */ from users')).toEqual([]);
  });

  it('does not treat a -- inside a string literal as a comment', () => {
    expect(diagnosticsFor("select name from users where name = 'a -- not a comment'")).toEqual([]);
  });
});
