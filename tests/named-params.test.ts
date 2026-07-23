import { describe, expect, it } from 'vitest';
import { collectNamedParameters } from '../src/adapters/named-params.js';

const AT_DOLLAR_COLON: ReadonlySet<string> = new Set(['@', '$', ':']);

describe('collectNamedParameters', () => {
  it('collects named parameters outside of literals and dollar-quoted bodies', () => {
    expect(collectNamedParameters('select 1 where id = @id', AT_DOLLAR_COLON)).toEqual(['@id']);
  });

  it('does not treat a $word inside a $$ ... $$ dollar-quoted body as a parameter', () => {
    const sql = "create function f() returns int as $$ select $foo from bar $$ language sql";
    expect(collectNamedParameters(sql, AT_DOLLAR_COLON)).toEqual([]);
  });

  it('does not treat a $word inside a $tag$ ... $tag$ dollar-quoted body as a parameter', () => {
    const sql = "create function f() returns int as $body$ select $foo from bar $body$ language sql";
    expect(collectNamedParameters(sql, AT_DOLLAR_COLON)).toEqual([]);
  });

  it('still collects a real parameter that follows a dollar-quoted body', () => {
    const sql = "create function f() returns int as $$ select 1 $$ language sql; select @id";
    expect(collectNamedParameters(sql, AT_DOLLAR_COLON)).toEqual(['@id']);
  });

  it('does not confuse a positional $1 placeholder for a dollar-quote opener', () => {
    expect(collectNamedParameters('select * from t where id = $1', AT_DOLLAR_COLON)).toEqual([
      '$1',
    ]);
  });

  it('still skips parameters inside a plain string literal', () => {
    expect(collectNamedParameters("select '@id' from t where x = @real", AT_DOLLAR_COLON)).toEqual(
      ['@real'],
    );
  });

  it('dedupes a repeated named parameter', () => {
    expect(
      collectNamedParameters('select * from t where a = @id or b = @id', AT_DOLLAR_COLON),
    ).toEqual(['@id']);
  });
});
