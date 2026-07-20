import { describe, expect, it } from 'vitest';
import { detectDialect, redactCredentials } from '../src/cli/generate.js';

describe('redactCredentials', () => {
  it('replaces the user:password segment with ***', () => {
    expect(redactCredentials('postgres://user:S3cret@host/db')).toBe('postgres://***@host/db');
  });

  it('replaces a lone username segment', () => {
    expect(redactCredentials('mysql://root@host/db')).toBe('mysql://***@host/db');
  });

  it('leaves credential-free URLs untouched', () => {
    expect(redactCredentials('postgres://host/db')).toBe('postgres://host/db');
    expect(redactCredentials('./local.sqlite')).toBe('./local.sqlite');
  });
});

describe('detectDialect error redaction', () => {
  it('does not echo the password on an unrecognized scheme', () => {
    let message = '';
    try {
      detectDialect('postgress://user:S3cret@host/db');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('postgress://***@host/db');
    expect(message).not.toContain('S3cret');
    expect(message).not.toContain('user:');
  });
});
