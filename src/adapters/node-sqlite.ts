import type { DatabaseSync } from 'node:sqlite';
import type { Executor } from '../index.js';

type SqliteParam = null | number | bigint | string | NodeJS.ArrayBufferView;

const NAMED_PARAM_PREFIXES = new Set(['@', '$', ':']);

const NAMED_PARAM_BODY = /^[A-Za-z0-9_]+/;

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

export function collectNamedParameters(sql: string): string[] {
  const names: string[] = [];
  let insideLiteral = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index] as string;

    if (char === "'") {
      insideLiteral = !insideLiteral;
      continue;
    }
    if (insideLiteral) {
      continue;
    }

    if (NAMED_PARAM_PREFIXES.has(char)) {
      const body = NAMED_PARAM_BODY.exec(sql.slice(index + 1));
      if (body) {
        const name = `${char}${body[0]}`;
        if (!names.includes(name)) {
          names.push(name);
        }
        index += body[0].length;
      }
    }
  }

  return names;
}

export function createNodeSqliteExecutor(db: DatabaseSync): Executor {
  return async (sql, params) => {
    const statement = db.prepare(sql);
    const values = params.map(toSqliteValue);
    const namedParameters = collectNamedParameters(sql);

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
