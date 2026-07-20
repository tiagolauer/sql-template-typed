const SELECT_START = /^select\b/i;
const HAS_FROM = /\bfrom\b/i;
const HAS_WHERE = /\bwhere\b/i;
const TRAILING_WORD = /([A-Za-z_][A-Za-z0-9_]*)$/;
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

function getSelectListContext(textBeforeCursor: string): SelectListContext | null {
  const trimmed = textBeforeCursor.trimStart();

  if (!SELECT_START.test(trimmed)) {
    return null;
  }

  if (HAS_FROM.test(textBeforeCursor)) {
    return null;
  }

  const match = TRAILING_WORD.exec(textBeforeCursor);
  return { prefix: match?.[1] ?? '' };
}

function getWhereClauseContext(textBeforeCursor: string): SelectListContext | null {
  if (!HAS_FROM.test(textBeforeCursor)) {
    return null;
  }

  if (!HAS_WHERE.test(textBeforeCursor)) {
    return null;
  }

  const match = TRAILING_WORD.exec(textBeforeCursor);
  return { prefix: match?.[1] ?? '' };
}

function findFromTable(fullLiteralText: string): string | null {
  const match = FROM_TABLE.exec(fullLiteralText);
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
