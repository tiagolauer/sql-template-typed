import { describe, it, expect } from 'vitest';
import sqlContext from '../src/ts-plugin/sql-context.cts';

const {
  getSelectListContext,
  getWhereClauseContext,
  findFromTable,
  findSources,
  findSourceByAlias,
  getQualifierBefore,
} = sqlContext;

describe('getSelectListContext', () => {
  it('extracts the partial word being typed in a SELECT list', () => {
    expect(getSelectListContext('select id, na')).toEqual({ prefix: 'na', qualifier: null });
  });

  it('returns an empty prefix right after SELECT or a comma', () => {
    expect(getSelectListContext('select ')).toEqual({ prefix: '', qualifier: null });
    expect(getSelectListContext('select id, ')).toEqual({ prefix: '', qualifier: null });
  });

  it('returns null once a FROM clause has already been typed', () => {
    expect(getSelectListContext('select id, name from users where na')).toBeNull();
  });

  it('returns null for text that does not start with SELECT', () => {
    expect(getSelectListContext('')).toBeNull();
    expect(getSelectListContext('update users set na')).toBeNull();
  });

  it('is case-insensitive on the SELECT keyword', () => {
    expect(getSelectListContext('SELECT id, na')).toEqual({ prefix: 'na', qualifier: null });
  });

  it('offers completions in the outer SELECT list of a CTE query (issue #165 repro)', () => {
    expect(
      getSelectListContext('with recent_users as (select id from users) select id, na'),
    ).toEqual({ prefix: 'na', qualifier: null });
  });

  it('offers completions inside a still-open CTE body', () => {
    expect(getSelectListContext('with recent_users as (select id, na')).toEqual({
      prefix: 'na',
      qualifier: null,
    });
  });

  it('offers completions past a WITH RECURSIVE clause', () => {
    expect(
      getSelectListContext('with recursive nums as (select id from users) select id, na'),
    ).toEqual({ prefix: 'na', qualifier: null });
  });

  it('offers completions past multiple comma-separated CTEs', () => {
    expect(
      getSelectListContext(
        'with a as (select id from users), b as (select id from posts) select id, na',
      ),
    ).toEqual({ prefix: 'na', qualifier: null });
  });

  it('captures an alias qualifier in front of the partial word', () => {
    expect(getSelectListContext('select u.na')).toEqual({ prefix: 'na', qualifier: 'u' });
  });
});

describe('getWhereClauseContext', () => {
  it('extracts the partial word being typed after WHERE', () => {
    expect(getWhereClauseContext('select id from users where na')).toEqual({
      prefix: 'na',
      qualifier: null,
    });
  });

  it('extracts the partial word being typed after AND/OR', () => {
    expect(getWhereClauseContext('select id from users where active = true and na')).toEqual({
      prefix: 'na',
      qualifier: null,
    });
  });

  it('returns an empty prefix right after WHERE', () => {
    expect(getWhereClauseContext('select id from users where ')).toEqual({ prefix: '', qualifier: null });
  });

  it('returns null when there is no FROM clause yet', () => {
    expect(getWhereClauseContext('select id where na')).toBeNull();
  });

  it('returns null when there is no WHERE clause yet', () => {
    expect(getWhereClauseContext('select id from na')).toBeNull();
  });

  it('is case-insensitive on the WHERE keyword', () => {
    expect(getWhereClauseContext('select id from users WHERE na')).toEqual({
      prefix: 'na',
      qualifier: null,
    });
  });

  it('offers completions in the outer WHERE clause of a CTE query', () => {
    expect(
      getWhereClauseContext(
        'with recent_users as (select id from users) select id from recent_users where na',
      ),
    ).toEqual({ prefix: 'na', qualifier: null });
  });
});

describe('context misfire guards', () => {
  it('offers no completions inside a string literal value', () => {
    expect(getWhereClauseContext("select id from users where name = 'al")).toBeNull();
    expect(getSelectListContext("select 'par")).toBeNull();
  });

  it('ignores a quoted from keyword when deciding the select-list context', () => {
    expect(getSelectListContext("select 'from users', na")).toEqual({ prefix: 'na', qualifier: null });
  });

  it('returns null while the cursor trails a numeric token', () => {
    expect(getWhereClauseContext('select id from users where id = 12')).toBeNull();
  });

  it('stays inside the literal after a backslash-escaped quote', () => {
    expect(getWhereClauseContext("select id from users where bio = 'it\\'s ")).toBeNull();
  });

  it('offers columns after ORDER BY and GROUP BY without a WHERE clause', () => {
    expect(getWhereClauseContext('select id from users order by na')).toEqual({
      prefix: 'na',
      qualifier: null,
    });
    expect(getWhereClauseContext('select id from users group by ')).toEqual({
      prefix: '',
      qualifier: null,
    });
  });

  it('offers columns in JOIN ... ON conditions, capturing the alias qualifier', () => {
    expect(getWhereClauseContext('select id from users u join posts p on u.')).toEqual({
      prefix: '',
      qualifier: 'u',
    });
  });
});

describe('findFromTable', () => {
  it('ignores a quoted from keyword inside a literal', () => {
    expect(findFromTable("select 'x from fake' , id from users")).toBe('users');
  });

  it('finds the table name after FROM', () => {
    expect(findFromTable('select id, name from users')).toBe('users');
  });

  it('is case-insensitive', () => {
    expect(findFromTable('SELECT id FROM users')).toBe('users');
  });

  it('returns null when there is no FROM clause yet', () => {
    expect(findFromTable('select id, na')).toBeNull();
  });

  it('strips a schema qualifier instead of capturing it as the table name', () => {
    expect(findFromTable('select id from public.users')).toBe('users');
  });

  it('finds the table name when an alias follows it', () => {
    expect(findFromTable('select u.id from users u where u.name = 1')).toBe('users');
  });
});

describe('findSources', () => {
  it('returns a single source for a plain FROM with no alias', () => {
    const sources = findSources('select id from users');
    expect(sources.map((s) => ({ table: s.table, alias: s.alias }))).toEqual([
      { table: 'users', alias: 'users' },
    ]);
  });

  it('captures the alias when one follows the table', () => {
    const sources = findSources('select u.id from users u');
    expect(sources.map((s) => ({ table: s.table, alias: s.alias }))).toEqual([
      { table: 'users', alias: 'u' },
    ]);
  });

  it('captures the alias when introduced with AS', () => {
    const sources = findSources('select u.id from users as u');
    expect(sources.map((s) => ({ table: s.table, alias: s.alias }))).toEqual([
      { table: 'users', alias: 'u' },
    ]);
  });

  it('captures every JOINed source, defaulting alias to the table name', () => {
    const sources = findSources(
      'select u.id, p.title from users u join posts p on p.user_id = u.id',
    );
    expect(sources.map((s) => ({ table: s.table, alias: s.alias }))).toEqual([
      { table: 'users', alias: 'u' },
      { table: 'posts', alias: 'p' },
    ]);
  });

  it('does not mistake a trailing clause keyword for an alias', () => {
    const sources = findSources('select id from users where id = 1');
    expect(sources.map((s) => ({ table: s.table, alias: s.alias }))).toEqual([
      { table: 'users', alias: 'users' },
    ]);
  });

  it('reports the table token span for each source', () => {
    const text = 'select id from users';
    const sources = findSources(text);
    const [users] = sources;
    expect(users).toBeDefined();
    if (!users) return;
    expect(text.slice(users.tableStart, users.tableEnd)).toBe('users');
  });

  it('ignores a source mentioned in a line comment', () => {
    const sources = findSources('select id -- from ghosts\nfrom users');
    expect(sources.map((s) => ({ table: s.table, alias: s.alias }))).toEqual([
      { table: 'users', alias: 'users' },
    ]);
  });

  it('ignores a source mentioned in a block comment', () => {
    const sources = findSources('select id /* from ghosts */ from users');
    expect(sources.map((s) => ({ table: s.table, alias: s.alias }))).toEqual([
      { table: 'users', alias: 'users' },
    ]);
  });

  it('does not treat a -- inside a string literal as a comment', () => {
    const sources = findSources("select id from users where note = 'a -- from ghosts'");
    expect(sources.map((s) => ({ table: s.table, alias: s.alias }))).toEqual([
      { table: 'users', alias: 'users' },
    ]);
  });

  it('does not treat a backslash-escaped quote as closing the string literal', () => {
    const sources = findSources("select * from users where bio = 'it\\'s from secrets_table'");
    expect(sources.map((s) => ({ table: s.table, alias: s.alias }))).toEqual([
      { table: 'users', alias: 'users' },
    ]);
  });

  it('reports the correct table span despite a preceding comment', () => {
    const text = 'select id /* x */ from users';
    const sources = findSources(text);
    const [users] = sources;
    expect(users).toBeDefined();
    if (!users) return;
    expect(text.slice(users.tableStart, users.tableEnd)).toBe('users');
  });

  it('does not surface a CTE name as if it were a real schema table (issue #165 repro)', () => {
    const sources = findSources(
      'with recent_users as (select id from users) select id from recent_users where active',
    );
    expect(sources).toEqual([]);
  });

  it('scopes sources to the outer statement, not a CTE body real table it wraps', () => {
    const sources = findSources(
      'with recent_users as (select id from users) select id, name from users',
    );
    expect(sources.map((s) => ({ table: s.table, alias: s.alias }))).toEqual([
      { table: 'users', alias: 'users' },
    ]);
  });

  it('excludes every comma-separated CTE name, keeping only real sources', () => {
    const sources = findSources(
      'with a as (select id from users), b as (select id from posts) select id from a join b on a.id = b.id',
    );
    expect(sources).toEqual([]);
  });
});

describe('findSourceByAlias', () => {
  it('finds a source by its alias, case-insensitively', () => {
    const sources = findSources('select u.id from users u');
    expect(findSourceByAlias(sources, 'U')?.table).toBe('users');
  });

  it('returns null for an alias that is not present', () => {
    const sources = findSources('select u.id from users u');
    expect(findSourceByAlias(sources, 'p')).toBeNull();
  });
});

describe('getQualifierBefore', () => {
  it('returns the identifier immediately before a dot', () => {
    expect(getQualifierBefore('select u.name from users u', 9)).toBe('u');
  });

  it('returns null when the preceding character is not a dot', () => {
    expect(getQualifierBefore('select name from users', 9)).toBeNull();
  });
});
