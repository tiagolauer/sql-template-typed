const SELECT_START = /^select\b/i;
const HAS_FROM = /\bfrom\b/i;
const TRAILING_WORD = /([A-Za-z_][A-Za-z0-9_]*)$/;
const FROM_TABLE = /\bfrom\s+([A-Za-z_][A-Za-z0-9_]*)/i;

interface SelectListContext {
  prefix: string;
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

function findFromTable(fullLiteralText: string): string | null {
  const match = FROM_TABLE.exec(fullLiteralText);
  return match?.[1] ?? null;
}

export = { getSelectListContext, findFromTable };
