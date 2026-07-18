import { describe, it, expect } from 'vitest';
import { getSelectListContext, findFromTable } from '../src/ts-plugin/sql-context.cts';

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
