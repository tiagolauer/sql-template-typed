import { describe, expect, it } from 'vitest';
import { renderSchema } from '../src/cli/codegen.js';

describe('renderSchema edge cases', () => {
  it('quotes names that are not valid identifiers, including quotes and backslashes', () => {
    const rendered = renderSchema([
      {
        name: 'weird table',
        columns: [
          { name: 'col"name', tsType: 'string', nullable: false },
          { name: 'back\\slash', tsType: 'number', nullable: true },
          { name: 'plain', tsType: 'boolean', nullable: false },
        ],
      },
    ]);

    expect(rendered).toBe(
      'export interface DB {\n' +
        '  "weird table": {\n' +
        '    "col\\"name": string;\n' +
        '    "back\\\\slash": number | null;\n' +
        '    plain: boolean;\n' +
        '  };\n' +
        '}\n',
    );
  });

  it('renders a zero-column table as an empty object', () => {
    const rendered = renderSchema([{ name: 'empty_t', columns: [] }]);

    expect(rendered).toBe('export interface DB {\n  empty_t: {\n\n  };\n}\n');
  });
});
