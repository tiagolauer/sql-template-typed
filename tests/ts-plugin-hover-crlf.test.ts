import { afterAll, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import ts from 'typescript';
import { buildLanguageService, loadPlugin } from './ts-plugin-test-helpers.js';

const { plugin, dir: transpileDir } = loadPlugin();

const CRLF_FIXTURE = [
  "import type { TypedDb } from '@owlsql/core';",
  '',
  'interface DB {',
  '  users: { id: number; name: string };',
  '}',
  '',
  'declare const db: TypedDb<DB>;',
  '',
  'db.query(`select id,',
  '  name from users`);',
  '',
].join('\r\n');

const cleanupDirs: string[] = [transpileDir];

afterAll(() => {
  for (const dir of cleanupDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function hoverAt(markerOffsetInto: string, offset: number): ts.QuickInfo | undefined {
  const { languageService, filePath, dir } = buildLanguageService(
    CRLF_FIXTURE,
    'owlsql-ts-plugin-crlf-',
  );
  cleanupDirs.push(dir);

  const proxied = plugin({ typescript: ts }).create({ languageService });
  const position = CRLF_FIXTURE.indexOf(markerOffsetInto) + offset;
  return proxied.getQuickInfoAtPosition(filePath, position);
}

describe('ts-plugin hover on CRLF multiline templates', () => {
  it('resolves the hovered column on a line after a CRLF break', () => {
    const hover = hoverAt('name from users', 2);

    expect(hover).toBeDefined();
    expect(hover?.displayParts?.[0]?.text).toBe('(column) name: string');
  });

  it('anchors the text span at the raw source position of the word', () => {
    const hover = hoverAt('name from users', 2);

    expect(hover?.textSpan).toEqual({
      start: CRLF_FIXTURE.indexOf('name from users'),
      length: 'name'.length,
    });
  });

  it('still resolves columns on the first template line', () => {
    const hover = hoverAt('select id,', 'select '.length + 1);

    expect(hover?.displayParts?.[0]?.text).toBe('(column) id: number');
  });
});
