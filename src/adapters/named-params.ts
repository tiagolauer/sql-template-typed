const NAMED_PARAM_BODY = /^[A-Za-z0-9_]+/;
const DOLLAR_QUOTE_TAG = /^\$([A-Za-z0-9_]*)\$/;

export function collectNamedParameters(sql: string, prefixes: ReadonlySet<string>): string[] {
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

    if (char === '$') {
      const open = DOLLAR_QUOTE_TAG.exec(sql.slice(index));
      if (open) {
        const closer = `$${open[1]}$`;
        const closeIndex = sql.indexOf(closer, index + open[0].length);
        index = closeIndex === -1 ? sql.length - 1 : closeIndex + closer.length - 1;
        continue;
      }
    }

    if (prefixes.has(char)) {
      if (sql[index + 1] === char) {
        index += 1;
        continue;
      }

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

export interface MixedParameters {
  named: Record<string, unknown>;
  positional: unknown[];
}

// Params<DB, Q> types one tuple slot per placeholder in first-occurrence
// order, with repeated named placeholders (@id, $id, ...) deduped to their
// first slot - matching collectNamedParameters' own dedup. A bare `?` is
// never deduped: each occurrence consumes its own slot. This walks the SQL
// once, in that same order, so `values` (built from that tuple) is
// partitioned back into a named bag and an ordered positional list.
export function resolveMixedParameters(
  sql: string,
  prefixes: ReadonlySet<string>,
  values: readonly unknown[],
): MixedParameters {
  const named: Record<string, unknown> = {};
  const positional: unknown[] = [];
  let insideLiteral = false;
  let valueIndex = 0;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index] as string;

    if (char === "'") {
      insideLiteral = !insideLiteral;
      continue;
    }
    if (insideLiteral) {
      continue;
    }

    if (char === '$') {
      const open = DOLLAR_QUOTE_TAG.exec(sql.slice(index));
      if (open) {
        const closer = `$${open[1]}$`;
        const closeIndex = sql.indexOf(closer, index + open[0].length);
        index = closeIndex === -1 ? sql.length - 1 : closeIndex + closer.length - 1;
        continue;
      }
    }

    if (char === '?') {
      positional.push(values[valueIndex] ?? null);
      valueIndex += 1;
      continue;
    }

    if (prefixes.has(char)) {
      if (sql[index + 1] === char) {
        index += 1;
        continue;
      }

      const body = NAMED_PARAM_BODY.exec(sql.slice(index + 1));
      if (body) {
        const name = `${char}${body[0]}`;
        if (!(name in named)) {
          named[name] = values[valueIndex] ?? null;
          valueIndex += 1;
        }
        index += body[0].length;
      }
    }
  }

  return { named, positional };
}
