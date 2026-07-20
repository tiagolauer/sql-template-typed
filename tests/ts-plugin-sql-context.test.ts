import { describe, it, expect } from 'vitest';
import sqlContext from '../src/ts-plugin/sql-context.cts';

const { getSelectListContext, getWhereClauseContext, findFromTable } = sqlContext;

describe('getSelectListContext', () => {
  it('extracts the partial word being typed in a SELECT list', () => {
    expect(getSelectListContext('select id, na')).toEqual({ prefix: 'na' });
  });

  it('returns an empty prefix right after SELECT or a comma', () => {
    expect(getSelectListContext('select ')).toEqual({ prefix: '' });
    expect(getSelectListContext('select id, ')).toEqual({ prefix: '' });
  });

  it('returns null once a FROM clause has already been typed', () => {
    expect(getSelectListContext('select id, name from users where na')).toBeNull();
  });

  it('returns null for text that does not start with SELECT', () => {
    expect(getSelectListContext('')).toBeNull();
    expect(getSelectListContext('update users set na')).toBeNull();
  });

  it('is case-insensitive on the SELECT keyword', () => {
    expect(getSelectListContext('SELECT id, na')).toEqual({ prefix: 'na' });
  });
});

describe('getWhereClauseContext', () => {
  it('extracts the partial word being typed after WHERE', () => {
    expect(getWhereClauseContext('select id from users where na')).toEqual({ prefix: 'na' });
  });

  it('extracts the partial word being typed after AND/OR', () => {
    expect(getWhereClauseContext('select id from users where active = true and na')).toEqual({
      prefix: 'na',
    });
  });

  it('returns an empty prefix right after WHERE', () => {
    expect(getWhereClauseContext('select id from users where ')).toEqual({ prefix: '' });
  });

  it('returns null when there is no FROM clause yet', () => {
    expect(getWhereClauseContext('select id where na')).toBeNull();
  });

  it('returns null when there is no WHERE clause yet', () => {
    expect(getWhereClauseContext('select id from na')).toBeNull();
  });

  it('is case-insensitive on the WHERE keyword', () => {
    expect(getWhereClauseContext('select id from users WHERE na')).toEqual({ prefix: 'na' });
  });
});

describe('findFromTable', () => {
  it('finds the table name after FROM', () => {
    expect(findFromTable('select id, name from users')).toBe('users');
  });

  it('is case-insensitive', () => {
    expect(findFromTable('SELECT id FROM users')).toBe('users');
  });

  it('returns null when there is no FROM clause yet', () => {
    expect(findFromTable('select id, na')).toBeNull();
  });
});
