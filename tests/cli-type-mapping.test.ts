import { describe, it, expect } from 'vitest';
import { mapPostgresType } from '../src/cli/dialects/postgres';
import { mapMysqlType } from '../src/cli/dialects/mysql';
import { mapSqliteType } from '../src/cli/dialects/sqlite';
import { mapMssqlType } from '../src/cli/dialects/mssql';

describe('mapPostgresType', () => {
  it('maps small integers to number', () => {
    expect(mapPostgresType('int4')).toBe('number');
    expect(mapPostgresType('int2')).toBe('number');
    expect(mapPostgresType('float8')).toBe('number');
  });

  it('maps bigint and numeric to string to avoid precision loss', () => {
    expect(mapPostgresType('int8')).toBe('string');
    expect(mapPostgresType('numeric')).toBe('string');
    expect(mapPostgresType('money')).toBe('string');
  });

  it('maps booleans, text, json, and binary types', () => {
    expect(mapPostgresType('bool')).toBe('boolean');
    expect(mapPostgresType('varchar')).toBe('string');
    expect(mapPostgresType('jsonb')).toBe('unknown');
    expect(mapPostgresType('bytea')).toBe('Buffer');
  });

  it('maps time-only values to strings to match pg defaults', () => {
    expect(mapPostgresType('time')).toBe('string');
    expect(mapPostgresType('timetz')).toBe('string');
  });

  it('maps array udt names (leading underscore) to T[]', () => {
    expect(mapPostgresType('_int4')).toBe('number[]');
    expect(mapPostgresType('_text')).toBe('string[]');
  });

  it('falls back to unknown for unrecognized types', () => {
    expect(mapPostgresType('some_custom_domain')).toBe('unknown');
  });

  it('maps network, interval, bit and text-search types to string', () => {
    expect(mapPostgresType('inet')).toBe('string');
    expect(mapPostgresType('interval')).toBe('string');
    expect(mapPostgresType('tsvector')).toBe('string');
    expect(mapPostgresType('oid')).toBe('number');
  });

  it('maps enums to a label union when the enum map is provided', () => {
    const enums = new Map([['mood', ['happy', 'sad']]]);
    expect(mapPostgresType('mood', enums)).toBe("'happy' | 'sad'");
    expect(mapPostgresType('_mood', enums)).toBe("('happy' | 'sad')[]");
  });
});

describe('mapMysqlType', () => {
  it('maps ordinary integers and floats to number', () => {
    expect(mapMysqlType('int')).toBe('number');
    expect(mapMysqlType('smallint')).toBe('number');
  });

  it('maps decimal to string but bigint to number, matching mysql2 defaults', () => {
    expect(mapMysqlType('decimal')).toBe('string');
    expect(mapMysqlType('bigint')).toBe('number');
  });

  it('maps every tinyint width to number, matching mysql2 defaults', () => {
    // mysql2's stock parsers decode TINY as a plain number regardless of
    // display width - tinyint(1) is not special-cased to boolean, since
    // nothing actually casts it to one at runtime (#135).
    expect(mapMysqlType('tinyint')).toBe('number');
  });

  it('maps bit to Buffer at every width, matching mysql2 defaults', () => {
    // BIT has no dedicated case in mysql2's parsers, so it falls through to
    // a raw Buffer - bit(1) is not special-cased to boolean, since a
    // non-empty Buffer is always truthy regardless of the underlying byte
    // (#135).
    expect(mapMysqlType('bit')).toBe('Buffer');
  });

  it('maps date/time types and binary types', () => {
    expect(mapMysqlType('datetime')).toBe('Date');
    expect(mapMysqlType('time')).toBe('string');
    expect(mapMysqlType('blob')).toBe('Buffer');
  });
});

describe('mapSqliteType', () => {
  it('applies standard SQLite type affinity rules', () => {
    expect(mapSqliteType('INTEGER')).toBe('number');
    expect(mapSqliteType('VARCHAR(255)')).toBe('string');
    expect(mapSqliteType('TEXT')).toBe('string');
    expect(mapSqliteType('REAL')).toBe('number');
    expect(mapSqliteType('BLOB')).toBe('Buffer');
    expect(mapSqliteType('')).toBe('Buffer');
  });

  it('special-cases BOOLEAN and DATE-like declared types', () => {
    expect(mapSqliteType('BOOLEAN')).toBe('0 | 1');
    expect(mapSqliteType('DATE')).toBe('string');
    expect(mapSqliteType('DATETIME')).toBe('string');
  });

  it('falls back to number for NUMERIC-affinity types', () => {
    expect(mapSqliteType('NUMERIC')).toBe('number');
    expect(mapSqliteType('DECIMAL(10,2)')).toBe('number');
  });

  it('accepts lowercase declared types', () => {
    expect(mapSqliteType('integer')).toBe('number');
    expect(mapSqliteType('text')).toBe('string');
    expect(mapSqliteType('boolean')).toBe('0 | 1');
  });
});

describe('mapMssqlType', () => {
  it('maps ordinary integers and floats to number', () => {
    expect(mapMssqlType('int')).toBe('number');
    expect(mapMssqlType('real')).toBe('number');
  });

  it('maps bigint to string but decimal, numeric and money to number, matching tedious defaults', () => {
    expect(mapMssqlType('bigint')).toBe('string');
    expect(mapMssqlType('decimal')).toBe('number');
    expect(mapMssqlType('numeric')).toBe('number');
    expect(mapMssqlType('money')).toBe('number');
    expect(mapMssqlType('smallmoney')).toBe('number');
  });

  it('maps bit to boolean and binary types to Buffer', () => {
    expect(mapMssqlType('bit')).toBe('boolean');
    expect(mapMssqlType('varbinary')).toBe('Buffer');
  });

  it('is case-insensitive and falls back to unknown', () => {
    expect(mapMssqlType('INT')).toBe('number');
    expect(mapMssqlType('geography')).toBe('unknown');
  });

  it('maps time to Date, matching tedious defaults', () => {
    expect(mapMssqlType('time')).toBe('Date');
  });
});
