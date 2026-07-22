import type * as ts from 'typescript';
import sqlContext = require('./sql-context.cjs');
import schemaModule = require('./schema.cjs');

const { findSources, findSourceByAlias, stripStringLiterals } = sqlContext;
const { getColumnNames } = schemaModule;

const SELECT_KEYWORD = /^\s*select\b/i;
const DISTINCT_KEYWORD = /^\s*distinct\b/i;
const LITERAL_TOKEN = /^(?:-?\d+(?:\.\d+)?|true|false|null)$/i;
const QUOTE_CHAR = /['"`[\]]/;
const AS_KEYWORD = /^as$/i;

interface ColumnEntry {
  text: string;
  start: number;
}

interface DiagnosticSpan {
  start: number;
  length: number;
  message: string;
}

function findTopLevelFromIndex(text: string): number | null {
  const fromPattern = /\bfrom\b/gi;
  let match: RegExpExecArray | null;
  while ((match = fromPattern.exec(text)) !== null) {
    let depth = 0;
    for (let i = 0; i < match.index; i += 1) {
      if (text[i] === '(') depth += 1;
      else if (text[i] === ')') depth -= 1;
    }
    if (depth === 0) {
      return match.index;
    }
  }
  return null;
}

function splitTopLevelCommas(text: string): ColumnEntry[] {
  const entries: ColumnEntry[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      entries.push({ text: text.slice(start, i), start });
      start = i + 1;
    }
  }
  entries.push({ text: text.slice(start), start });

  return entries;
}

function skipLeadingKeyword(text: string, keyword: RegExp): string {
  const match = keyword.exec(text);
  return match ? text.slice(match[0].length) : text;
}

function columnTokenFromEntry(entry: ColumnEntry): { token: string; offset: number } | null {
  const leadingWhitespace = entry.text.length - entry.text.trimStart().length;
  const trimmed = entry.text.trim();

  if (trimmed === '' || trimmed === '*' || trimmed.includes('(')) {
    return null;
  }
  if (QUOTE_CHAR.test(trimmed[0] ?? '')) {
    return null;
  }
  if (LITERAL_TOKEN.test(trimmed)) {
    return null;
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const token = parts[0];
  if (!token) {
    return null;
  }
  if (parts.length > 1 && !(parts.length === 2 || (parts.length === 3 && AS_KEYWORD.test(parts[1] ?? '')))) {
    return null;
  }
  if (QUOTE_CHAR.test(token) || /[*+/%^<>=|-]/.test(token)) {
    return null;
  }

  return { token, offset: leadingWhitespace };
}

function getQueryDiagnostics(
  checker: ts.TypeChecker,
  dbType: ts.Type,
  literal: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
): DiagnosticSpan[] {
  const literalStart = literal.getStart() + 1;
  const text = literal.text;
  const { stripped } = stripStringLiterals(text);

  const fromIndex = findTopLevelFromIndex(stripped);
  if (fromIndex === null || !SELECT_KEYWORD.test(stripped)) {
    return [];
  }

  const sources = findSources(text);
  const diagnostics: DiagnosticSpan[] = [];

  for (const source of sources) {
    if (!checker.getPropertyOfType(dbType, source.table)) {
      diagnostics.push({
        start: literalStart + source.tableStart,
        length: source.tableEnd - source.tableStart,
        message: `unknown table: ${source.table}`,
      });
    }
  }

  const beforeFrom = stripped.slice(0, fromIndex);
  const afterSelect = skipLeadingKeyword(beforeFrom, SELECT_KEYWORD);
  const selectList = skipLeadingKeyword(afterSelect, DISTINCT_KEYWORD);
  const selectListOffset = beforeFrom.length - selectList.length;

  for (const entry of splitTopLevelCommas(selectList)) {
    const parsed = columnTokenFromEntry(entry);
    if (!parsed) {
      continue;
    }

    const dotIndex = parsed.token.indexOf('.');
    const qualifier = dotIndex === -1 ? null : parsed.token.slice(0, dotIndex);
    const columnName = dotIndex === -1 ? parsed.token : parsed.token.slice(dotIndex + 1);
    if (columnName === '' || columnName === '*') {
      continue;
    }

    const tokenStart = literalStart + selectListOffset + entry.start + parsed.offset;
    const columnStart = tokenStart + (dotIndex === -1 ? 0 : dotIndex + 1);

    if (qualifier) {
      const matchedSource = findSourceByAlias(sources, qualifier);
      if (!matchedSource) {
        diagnostics.push({ start: tokenStart, length: qualifier.length, message: `unknown alias: ${qualifier}` });
        continue;
      }
      if (!checker.getPropertyOfType(dbType, matchedSource.table)) {
        continue;
      }
      const names = getColumnNames(checker, dbType, literal, matchedSource.table);
      if (!names.includes(columnName)) {
        diagnostics.push({ start: columnStart, length: columnName.length, message: `unknown column: ${columnName}` });
      }
      continue;
    }

    const knownTables = sources.filter((source) => checker.getPropertyOfType(dbType, source.table));
    if (knownTables.length === 0) {
      continue;
    }

    const containingTables = knownTables.filter((source) =>
      getColumnNames(checker, dbType, literal, source.table).includes(columnName),
    );

    if (containingTables.length === 0) {
      diagnostics.push({ start: columnStart, length: columnName.length, message: `unknown column: ${columnName}` });
    } else if (containingTables.length > 1) {
      diagnostics.push({ start: columnStart, length: columnName.length, message: `ambiguous column: ${columnName}` });
    }
  }

  return diagnostics;
}

export = { getQueryDiagnostics };
