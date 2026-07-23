const SELECT_START = /^select\b/i;
const HAS_FROM = /\bfrom\b/i;
const HAS_COLUMN_CLAUSE = /\b(where|having|on|order\s+by|group\s+by)\b/i;
const QUALIFIED_TRAILING_TOKEN = /(?:([A-Za-z_][A-Za-z0-9_]*)\.)?([A-Za-z0-9_]*)$/;
const FROM_TABLE = /\bfrom\s+(?:[A-Za-z_][A-Za-z0-9_]*\.)?([A-Za-z_][A-Za-z0-9_]*)/i;
const FROM_OR_JOIN_SOURCE = /\b(from|join)\s+(?:[A-Za-z_][A-Za-z0-9_]*\.)?([A-Za-z_][A-Za-z0-9_]*)(?:\s+(as\s+)?([A-Za-z_][A-Za-z0-9_]*))?/gid;
const WORD_CHAR = /[A-Za-z0-9_]/;
const WORD_START_CHAR = /[A-Za-z_]/;

const RESERVED_AFTER_SOURCE = new Set([
  'on',
  'where',
  'join',
  'inner',
  'left',
  'right',
  'full',
  'outer',
  'cross',
  'group',
  'order',
  'having',
  'limit',
  'offset',
  'union',
  'set',
  'as',
]);

interface SelectListContext {
  prefix: string;
  qualifier: string | null;
}

interface QuerySource {
  table: string;
  alias: string;
  tableStart: number;
  tableEnd: number;
}

interface WordAtOffset {
  word: string;
  start: number;
  end: number;
}

interface StrippedText {
  stripped: string;
  insideLiteral: boolean;
}

// Mask string-literal bodies AND SQL comments (`-- line`, `/* block */`) with
// spaces so that FROM/JOIN/column detection never matches text that isn't part
// of the executable query, while preserving every character offset (each input
// character maps to exactly one output character). Mirrors the type-level
// parser's `StripCommentsAndMaskLiterals` in `src/string.ts`: string literals
// take precedence, so a `--` or `/*` inside `'...'` is not treated as a comment.
function stripStringLiterals(text: string): StrippedText {
  let stripped = '';
  let insideLiteral = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (insideLiteral) {
      if (char === "'") {
        insideLiteral = false;
        stripped += char;
      } else {
        stripped += ' ';
      }
      i += 1;
      continue;
    }

    if (char === "'") {
      insideLiteral = true;
      stripped += char;
      i += 1;
      continue;
    }

    if (char === '-' && text[i + 1] === '-') {
      // Line comment: mask the `--` and everything up to (not including) the
      // newline, which is preserved by the outer loop.
      stripped += '  ';
      i += 2;
      while (i < text.length && text[i] !== '\n') {
        stripped += ' ';
        i += 1;
      }
      continue;
    }

    if (char === '/' && text[i + 1] === '*') {
      // Block comment: mask the `/*`, the body (newlines kept), and the closing
      // `*/` if present; an unterminated block runs to the end of the text.
      stripped += '  ';
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        stripped += text[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      if (i < text.length) {
        stripped += '  ';
        i += 2;
      }
      continue;
    }

    stripped += char;
    i += 1;
  }

  return { stripped, insideLiteral };
}

function prefixFrom(textBeforeCursor: string): SelectListContext | null {
  const match = QUALIFIED_TRAILING_TOKEN.exec(textBeforeCursor);
  const qualifier = match?.[1] ?? null;
  const token = match?.[2] ?? '';
  if (token !== '' && !WORD_START_CHAR.test(token[0] ?? '')) {
    return null;
  }
  return { prefix: token, qualifier };
}

function getSelectListContext(textBeforeCursor: string): SelectListContext | null {
  const { stripped, insideLiteral } = stripStringLiterals(textBeforeCursor);
  if (insideLiteral) {
    return null;
  }

  if (!SELECT_START.test(stripped.trimStart())) {
    return null;
  }

  if (HAS_FROM.test(stripped)) {
    return null;
  }

  return prefixFrom(textBeforeCursor);
}

function getWhereClauseContext(textBeforeCursor: string): SelectListContext | null {
  const { stripped, insideLiteral } = stripStringLiterals(textBeforeCursor);
  if (insideLiteral) {
    return null;
  }

  if (!HAS_FROM.test(stripped)) {
    return null;
  }

  if (!HAS_COLUMN_CLAUSE.test(stripped)) {
    return null;
  }

  return prefixFrom(textBeforeCursor);
}

function findFromTable(fullLiteralText: string): string | null {
  const { stripped } = stripStringLiterals(fullLiteralText);
  const match = FROM_TABLE.exec(stripped);
  return match?.[1] ?? null;
}

function findSources(fullLiteralText: string): QuerySource[] {
  const { stripped } = stripStringLiterals(fullLiteralText);
  const sources: QuerySource[] = [];

  FROM_OR_JOIN_SOURCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FROM_OR_JOIN_SOURCE.exec(stripped)) !== null) {
    const table = match[2];
    const tableSpan = (match as unknown as { indices?: Array<[number, number] | undefined> }).indices?.[2];
    if (!table || !tableSpan) {
      continue;
    }
    const rawAlias = match[4] ?? null;
    const alias = rawAlias && !RESERVED_AFTER_SOURCE.has(rawAlias.toLowerCase()) ? rawAlias : table;
    sources.push({ table, alias, tableStart: tableSpan[0], tableEnd: tableSpan[1] });
  }

  return sources;
}

function findSourceByAlias(sources: QuerySource[], alias: string): QuerySource | null {
  const lowerAlias = alias.toLowerCase();
  return sources.find((source) => source.alias.toLowerCase() === lowerAlias) ?? null;
}

function getQualifierBefore(text: string, wordStart: number): string | null {
  if (text[wordStart - 1] !== '.') {
    return null;
  }

  let start = wordStart - 1;
  while (start > 0 && WORD_CHAR.test(text[start - 1] ?? '')) {
    start -= 1;
  }

  const qualifier = text.slice(start, wordStart - 1);
  return qualifier !== '' && WORD_START_CHAR.test(qualifier[0] ?? '') ? qualifier : null;
}

function getWordAtOffset(text: string, offset: number): WordAtOffset | null {
  if (offset < 0 || offset > text.length) {
    return null;
  }

  let start = offset;
  while (start > 0 && WORD_CHAR.test(text[start - 1] ?? '')) {
    start -= 1;
  }

  let end = offset;
  while (end < text.length && WORD_CHAR.test(text[end] ?? '')) {
    end += 1;
  }

  if (start === end) {
    return null;
  }

  const word = text.slice(start, end);
  if (!WORD_START_CHAR.test(word[0] ?? '')) {
    return null;
  }

  return { word, start, end };
}

export = {
  getSelectListContext,
  getWhereClauseContext,
  findFromTable,
  findSources,
  findSourceByAlias,
  getQualifierBefore,
  getWordAtOffset,
  stripStringLiterals,
};
