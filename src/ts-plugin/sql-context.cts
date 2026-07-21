const SELECT_START = /^select\b/i;
const HAS_FROM = /\bfrom\b/i;
const HAS_COLUMN_CLAUSE = /\b(where|having|on|order\s+by|group\s+by)\b/i;
const TRAILING_TOKEN = /([A-Za-z0-9_]+)$/;
const FROM_TABLE = /\bfrom\s+(?:[A-Za-z_][A-Za-z0-9_]*\.)?([A-Za-z_][A-Za-z0-9_]*)/i;
const WORD_CHAR = /[A-Za-z0-9_]/;
const WORD_START_CHAR = /[A-Za-z_]/;

interface SelectListContext {
  prefix: string;
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

function stripStringLiterals(text: string): StrippedText {
  let stripped = '';
  let insideLiteral = false;

  for (const char of text) {
    if (char === "'") {
      insideLiteral = !insideLiteral;
      stripped += char;
      continue;
    }
    if (!insideLiteral) {
      stripped += char;
    }
  }

  return { stripped, insideLiteral };
}

function prefixFrom(textBeforeCursor: string): SelectListContext | null {
  const token = TRAILING_TOKEN.exec(textBeforeCursor)?.[1];
  if (token === undefined) {
    return { prefix: '' };
  }
  if (!WORD_START_CHAR.test(token[0] ?? '')) {
    return null;
  }
  return { prefix: token };
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

export = { getSelectListContext, getWhereClauseContext, findFromTable, getWordAtOffset };
