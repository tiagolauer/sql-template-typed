const NAMED_PARAM_BODY = /^[A-Za-z0-9_]+/;

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
