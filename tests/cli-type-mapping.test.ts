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
});

describe('mapMysqlType', () => {
  it('maps ordinary integers and floats to number', () => {
    expect(mapMysqlType('int', 'int(11)')).toBe('number');
    expect(mapMysqlType('smallint', 'smallint(6)')).toBe('number');
  });

  it('maps decimal and bigint to string to avoid precision loss', () => {
    expect(mapMysqlType('decimal', 'decimal(10,2)')).toBe('string');
    expect(mapMysqlType('bigint', 'bigint(20)')).toBe('string');
  });

  it('maps tinyint(1) to boolean but other tinyint widths to number', () => {
    expect(mapMysqlType('tinyint', 'tinyint(1)')).toBe('boolean');
    expect(mapMysqlType('tinyint', 'tinyint(4)')).toBe('number');
  });

  it('maps date/time types and binary types', () => {
    expect(mapMysqlType('datetime', 'datetime')).toBe('Date');
    expect(mapMysqlType('time', 'time')).toBe('string');
    expect(mapMysqlType('blob', 'blob')).toBe('Buffer');
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
    expect(mapSqliteType('BOOLEAN')).toBe('boolean');
    expect(mapSqliteType('DATE')).toBe('string');
    expect(mapSqliteType('DATETIME')).toBe('string');
  });

  it('falls back to number for NUMERIC-affinity types', () => {
    expect(mapSqliteType('NUMERIC')).toBe('number');
    expect(mapSqliteType('DECIMAL(10,2)')).toBe('number');
  });
});

describe('mapMssqlType', () => {
  it('maps ordinary integers and floats to number', () => {
    expect(mapMssqlType('int')).toBe('number');
    expect(mapMssqlType('real')).toBe('number');
  });

  it('maps bigint, decimal, numeric, and money to string', () => {
    expect(mapMssqlType('bigint')).toBe('string');
    expect(mapMssqlType('decimal')).toBe('string');
    expect(mapMssqlType('money')).toBe('string');
  });

  it('maps bit to boolean and binary types to Buffer', () => {
    expect(mapMssqlType('bit')).toBe('boolean');
    expect(mapMssqlType('varbinary')).toBe('Buffer');
  });

  it('is case-insensitive and falls back to unknown', () => {
    expect(mapMssqlType('INT')).toBe('number');
    expect(mapMssqlType('geography')).toBe('unknown');
  });
});
