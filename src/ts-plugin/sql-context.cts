const SELECT_START = /^select\b/i;
const HAS_FROM = /\bfrom\b/i;
const HAS_COLUMN_CLAUSE = /\b(where|having|on|order\s+by|group\s+by)\b/i;
const WITH_START = /^\s*with\b/i;
const RECURSIVE_KEYWORD = /^\s*recursive\b/i;
const CTE_NAME = /^\s*([A-Za-z_][A-Za-z0-9_]*)/;
const AS_KEYWORD_START = /^\s*as\b/i;
const LEADING_COMMA = /^\s*,/;
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
  // Count of consecutive backslash characters immediately preceding the
  // current position, so a quote closing a literal can be told apart from
  // one escaped by MySQL's default \' - mirrors EndsWithOddBackslashes in
  // src/string.ts, which the type-level parser already relies on for the
  // same reason. Only meaningful while insideLiteral is true.
  let precedingBackslashes = 0;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (insideLiteral) {
      if (char === "'" && precedingBackslashes % 2 === 0) {
        insideLiteral = false;
        stripped += char;
      } else {
        stripped += ' ';
      }
      precedingBackslashes = char === '\\' ? precedingBackslashes + 1 : 0;
      i += 1;
      continue;
    }

    if (char === "'") {
      insideLiteral = true;
      stripped += char;
      precedingBackslashes = 0;
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
    precedingBackslashes = char === '\\' ? precedingBackslashes + 1 : 0;
    i += 1;
  }

  return { stripped, insideLiteral };
}

interface WithClauseResult {
  cteNames: string[];
  remainder: string;
  remainderStart: number;
}

function skipParenGroup(text: string, openIndex: number): number | null {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    if (text[i] === '(') {
      depth += 1;
    } else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) {
        return i + 1;
      }
    }
  }
  return null;
}

// Skip a leading `WITH [RECURSIVE] name [(cols)] AS (query), ...` prefix so
// the caller can test the statement that actually follows it, mirroring how
// the type-level parser's ParseWithClause (src/cte.ts) strips CTEs before
// parsing the rest of the statement. `text` is expected to already be
// comment/literal-masked (see stripStringLiterals). When the cursor lands
// inside a still-open CTE body, this recurses into that body directly, since
// completions there should be resolved against the CTE's own inner query.
function stripWithClause(text: string): WithClauseResult {
  const fallback: WithClauseResult = { cteNames: [], remainder: text, remainderStart: 0 };
  if (!WITH_START.test(text)) {
    return fallback;
  }

  const cteNames: string[] = [];
  let rest = text.replace(WITH_START, '').replace(RECURSIVE_KEYWORD, '');

  while (true) {
    const nameMatch = CTE_NAME.exec(rest);
    if (!nameMatch?.[1]) {
      return fallback;
    }
    const name = nameMatch[1];
    let afterName = rest.slice(nameMatch[0].length);

    if (/^\s*\(/.test(afterName)) {
      const openIndex = afterName.indexOf('(');
      const closeIndex = skipParenGroup(afterName, openIndex);
      if (closeIndex === null) {
        return fallback;
      }
      afterName = afterName.slice(closeIndex);
    }

    if (!AS_KEYWORD_START.test(afterName)) {
      return fallback;
    }
    const afterAs = afterName.replace(AS_KEYWORD_START, '');

    const openIndex = afterAs.indexOf('(');
    if (openIndex === -1 || afterAs.slice(0, openIndex).trim() !== '') {
      return fallback;
    }

    const closeIndex = skipParenGroup(afterAs, openIndex);
    if (closeIndex === null) {
      const body = afterAs.slice(openIndex + 1);
      const inner = stripWithClause(body);
      const remainderStart = text.length - body.length + inner.remainderStart;
      return { cteNames: [...cteNames, name, ...inner.cteNames], remainder: inner.remainder, remainderStart };
    }

    cteNames.push(name);
    rest = afterAs.slice(closeIndex);

    if (LEADING_COMMA.test(rest)) {
      rest = rest.replace(LEADING_COMMA, '');
      continue;
    }

    return { cteNames, remainder: rest, remainderStart: text.length - rest.length };
  }
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

  const { remainder } = stripWithClause(stripped);

  if (!SELECT_START.test(remainder.trimStart())) {
    return null;
  }

  if (HAS_FROM.test(remainder)) {
    return null;
  }

  return prefixFrom(textBeforeCursor);
}

function getWhereClauseContext(textBeforeCursor: string): SelectListContext | null {
  const { stripped, insideLiteral } = stripStringLiterals(textBeforeCursor);
  if (insideLiteral) {
    return null;
  }

  const { remainder } = stripWithClause(stripped);

  if (!HAS_FROM.test(remainder)) {
    return null;
  }

  if (!HAS_COLUMN_CLAUSE.test(remainder)) {
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
  // A CTE's inner query is its own private scope: its FROM/JOIN sources
  // belong to it, not to the outer statement, so scan only what follows the
  // WITH-clause. That also keeps a CTE's own name from being surfaced as a
  // FROM/JOIN source when the outer statement selects from it - it isn't a
  // real schema table, and its projected columns aren't something this
  // heuristic scanner can compute anyway.
  const { remainder, remainderStart, cteNames } = stripWithClause(stripped);
  const cteNameSet = new Set(cteNames.map((name) => name.toLowerCase()));
  const sources: QuerySource[] = [];

  FROM_OR_JOIN_SOURCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FROM_OR_JOIN_SOURCE.exec(remainder)) !== null) {
    const table = match[2];
    const tableSpan = (match as unknown as { indices?: Array<[number, number] | undefined> }).indices?.[2];
    if (!table || !tableSpan || cteNameSet.has(table.toLowerCase())) {
      continue;
    }
    const rawAlias = match[4] ?? null;
    const alias = rawAlias && !RESERVED_AFTER_SOURCE.has(rawAlias.toLowerCase()) ? rawAlias : table;
    sources.push({
      table,
      alias,
      tableStart: remainderStart + tableSpan[0],
      tableEnd: remainderStart + tableSpan[1],
    });
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
  stripWithClause,
};
