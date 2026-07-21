import type { DatabaseSync } from 'node:sqlite';
import type { Executor } from '../index.js';
import { collectNamedParameters } from './named-params.js';

type SqliteParam = null | number | bigint | string | NodeJS.ArrayBufferView;

const SQLITE_PARAM_PREFIXES: ReadonlySet<string> = new Set(['@', '$', ':']);

function toSqliteValue(value: unknown): SqliteParam {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value === undefined) {
    return null;
  }
  return value as SqliteParam;
}

export function createNodeSqliteExecutor(db: DatabaseSync): Executor {
  return async (sql, params) => {
    const statement = db.prepare(sql);
    const values = params.map(toSqliteValue);
    const namedParameters = collectNamedParameters(sql, SQLITE_PARAM_PREFIXES);

    if (namedParameters.length > 0) {
      const bag: Record<string, SqliteParam> = {};
      namedParameters.forEach((name, index) => {
        bag[name] = values[index] ?? null;
      });
      return statement.all(bag);
    }

    return statement.all(...values);
  };
}
