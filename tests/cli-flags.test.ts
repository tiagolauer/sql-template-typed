import { describe, it, expect } from 'vitest';
import { parseFlags } from '../src/cli/index';

describe('parseFlags', () => {
  it('parses the spaced form', () => {
    const flags = parseFlags(['--url', 'postgres://localhost/db', '--out', './schema.ts']);
    expect(flags.get('url')).toBe('postgres://localhost/db');
    expect(flags.get('out')).toBe('./schema.ts');
  });

  it('parses the --flag=value form', () => {
    const flags = parseFlags(['--url=postgres://localhost/db', '--schema=app']);
    expect(flags.get('url')).toBe('postgres://localhost/db');
    expect(flags.get('schema')).toBe('app');
  });

  it('mixes the spaced and equals forms in the same call', () => {
    const flags = parseFlags(['--url=postgres://localhost/db', '--out', './schema.ts']);
    expect(flags.get('url')).toBe('postgres://localhost/db');
    expect(flags.get('out')).toBe('./schema.ts');
  });

  it('passes a value starting with -- through the equals form', () => {
    const flags = parseFlags(['--url=--weird-value']);
    expect(flags.get('url')).toBe('--weird-value');
  });

  it('still rejects a missing value in the spaced form', () => {
    expect(() => parseFlags(['--url'])).toThrow('Missing value for --url');
    expect(() => parseFlags(['--url', '--out', './schema.ts'])).toThrow('Missing value for --url');
  });
});
