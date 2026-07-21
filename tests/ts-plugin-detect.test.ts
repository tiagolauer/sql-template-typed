import { describe, it, expect, afterEach } from 'vitest';
import { rmSync } from 'node:fs';
import ts from 'typescript';
import detectModule from '../src/ts-plugin/detect.cts';
import { buildProgram } from './ts-plugin-test-helpers.js';

const { matchQueryLiteral } = detectModule;

describe('matchQueryLiteral', () => {
  let cleanupDir: string | null = null;

  afterEach(() => {
    if (cleanupDir) {
      rmSync(cleanupDir, { recursive: true, force: true });
      cleanupDir = null;
    }
  });

  function run(source: string, cursorMarker = 'select 1') {
    const { program, sourceFile, dir } = buildProgram(source, 'owlsql-ts-plugin-detect-');
    cleanupDir = dir;
    const checker = program.getTypeChecker();
    const cursor = sourceFile.text.indexOf(cursorMarker) + cursorMarker.length;
    return matchQueryLiteral(ts, checker, sourceFile, cursor);
  }

  it('detects a real TypedDb receiver', () => {
    const match = run(`
      import type { TypedDb } from '@owlsql/core';
      interface DB { users: { id: number } }
      declare const db: TypedDb<DB>;
      db.query(\`select 1\`);
    `);

    expect(match).not.toBeNull();
  });

  it('detects a plain double-quoted string literal query', () => {
    const match = run(`
      import type { TypedDb } from '@owlsql/core';
      interface DB { users: { id: number } }
      declare const db: TypedDb<DB>;
      db.query("select 1");
    `);

    expect(match).not.toBeNull();
  });

  it('does not match when the cursor sits after the closing backtick', () => {
    const match = run(
      `
      import type { TypedDb } from '@owlsql/core';
      interface DB { users: { id: number } }
      declare const db: TypedDb<DB>;
      db.query(\`select 1\`);
    `,
      'select 1`',
    );

    expect(match).toBeNull();
  });

  it('does not activate on an unrelated interface that happens to be named TypedDb', () => {
    const match = run(`
      interface TypedDb<DB> {
        query(sql: string): Promise<unknown>;
      }
      interface DB { users: { id: number } }
      declare const db: TypedDb<DB>;
      db.query(\`select 1\`);
    `);

    expect(match).toBeNull();
  });

  it('does not activate on a non-query method with the same string-literal argument shape', () => {
    const match = run(`
      import type { TypedDb } from '@owlsql/core';
      interface DB { users: { id: number } }
      interface Logger { log(sql: string): void }
      declare const db: TypedDb<DB>;
      declare const logger: Logger;
      logger.log(\`select 1\`);
    `);

    expect(match).toBeNull();
  });

  it('does not activate when the literal is not the first call argument', () => {
    const match = run(`
      import type { TypedDb } from '@owlsql/core';
      interface DB { users: { id: number } }
      declare const db: TypedDb<DB>;
      function run(label: string, sql: string) {}
      run('label', \`select 1\`);
    `);

    expect(match).toBeNull();
  });

  it('does not activate on a receiver with no TypedDb brand at all', () => {
    const match = run(`
      interface DB { users: { id: number } }
      declare const db: { query(sql: string): Promise<unknown> };
      db.query(\`select 1\`);
    `);

    expect(match).toBeNull();
  });

  it('activates through an intersection with the real TypedDb', () => {
    const match = run(`
      import type { TypedDb } from '@owlsql/core';
      interface DB { users: { id: number } }
      declare const db: TypedDb<DB> & { close(): void };
      db.query(\`select 1\`);
    `);

    expect(match).not.toBeNull();
  });

  it('activates on element-access call syntax', () => {
    const match = run(`
      import type { TypedDb } from '@owlsql/core';
      interface DB { users: { id: number } }
      declare const db: TypedDb<DB>;
      db['query'](\`select 1\`);
    `);

    expect(match).not.toBeNull();
  });

  it('activates when the literal argument is parenthesized', () => {
    const match = run(`
      import type { TypedDb } from '@owlsql/core';
      interface DB { users: { id: number } }
      declare const db: TypedDb<DB>;
      db.query((\`select 1\`));
    `);

    expect(match).not.toBeNull();
  });
});
