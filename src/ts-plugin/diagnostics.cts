import type * as ts from 'typescript';
import sqlContext = require('./sql-context.cjs');
import schemaModule = require('./schema.cjs');

const { findSources, findSourceByAlias, stripStringLiterals, stripWithClause } = sqlContext;
const { getColumnNames } = schemaModule;

const SELECT_KEYWORD = /^\s*select\b/i;
const DISTINCT_KEYWORD = /^\s*distinct\b/i;
const LITERAL_TOKEN = /^(?:-?\d+(?:\.\d+)?|true|false|null)$/i;
const QUOTE_CHAR = /['"`[\]]/;
const AS_KEYWORD = /^as$/i;
const WHERE_KEYWORD = /\bwhere\b/gi;
const WHERE_CLAUSE_BOUNDARY_WORDS: ReadonlySet<string> = new Set([
  'group',
  'having',
  'order',
  'limit',
  'offset',
  'union',
]);
// Mirrors IsTriggerOperator/IsAndOr/IsTransparentToken in src/where.ts: the
// type-level WHERE scanner validates whichever token sits immediately before
// one of these, plus the clause's trailing token.
const WHERE_TRIGGER_OPERATORS: ReadonlySet<string> = new Set([
  '=',
  '<>',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  'like',
  'ilike',
  'in',
  'between',
  'is',
]);
const WHERE_AND_OR: ReadonlySet<string> = new Set(['and', 'or']);
const WHERE_TRANSPARENT_WORD = /^not$/i;
const WHERE_IDENTIFIER_TOKEN = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;
const WHERE_PLACEHOLDER_TOKEN = /^(?:\$\d+|\?|@[A-Za-z_][A-Za-z0-9_]*)$/;

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

// Finds the top-level WHERE clause's body, bounded by the next top-level
// GROUP BY/HAVING/ORDER BY/LIMIT/OFFSET/UNION keyword (or the end of the
// text). Those clauses have their own, different column semantics (HAVING
// sees aggregates, ORDER BY can reference a SELECT-list alias), so they're
// excluded rather than treated as more WHERE text.
function findWhereClauseText(text: string): { text: string; start: number } | null {
  WHERE_KEYWORD.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WHERE_KEYWORD.exec(text)) !== null) {
    let depth = 0;
    for (let i = 0; i < match.index; i += 1) {
      if (text[i] === '(') depth += 1;
      else if (text[i] === ')') depth -= 1;
    }
    if (depth !== 0) {
      continue;
    }

    const clauseStart = match.index + match[0].length;
    let end = text.length;
    let wordStart = clauseStart;
    let boundaryDepth = 0;
    for (let i = clauseStart; i <= text.length; i += 1) {
      const char = text[i];
      if (char === '(') boundaryDepth += 1;
      else if (char === ')') boundaryDepth -= 1;

      if (char === undefined || char === ' ') {
        const word = text.slice(wordStart, i).toLowerCase();
        if (boundaryDepth === 0 && WHERE_CLAUSE_BOUNDARY_WORDS.has(word)) {
          end = wordStart;
          break;
        }
        wordStart = i + 1;
      }
    }

    return { text: text.slice(clauseStart, end), start: clauseStart };
  }
  return null;
}

// Validates one WHERE-clause token the same way an unqualified/qualified
// SELECT-list column already is. Only plain identifier-shaped tokens are
// checked - literals, placeholders, quoted identifiers, and anything
// operator-shaped are silently left alone, matching how src/where.ts's
// ValidateWhereOperand already short-circuits on IsPlaceholder/LiteralType
// before attempting a column lookup.
function whereTokenDiagnostics(
  checker: ts.TypeChecker,
  dbType: ts.Type,
  literal: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
  sources: ReturnType<typeof findSources>,
  token: { text: string; start: number },
): DiagnosticSpan[] {
  if (
    !WHERE_IDENTIFIER_TOKEN.test(token.text) ||
    LITERAL_TOKEN.test(token.text) ||
    WHERE_PLACEHOLDER_TOKEN.test(token.text)
  ) {
    return [];
  }

  const dotIndex = token.text.indexOf('.');
  const qualifier = dotIndex === -1 ? null : token.text.slice(0, dotIndex);
  const columnName = dotIndex === -1 ? token.text : token.text.slice(dotIndex + 1);
  const columnStart = token.start + (dotIndex === -1 ? 0 : dotIndex + 1);

  if (qualifier) {
    const matchedSource = findSourceByAlias(sources, qualifier);
    if (!matchedSource) {
      return [{ start: token.start, length: qualifier.length, message: `unknown alias: ${qualifier}` }];
    }
    if (!checker.getPropertyOfType(dbType, matchedSource.table)) {
      return [];
    }
    const names = getColumnNames(checker, dbType, literal, matchedSource.table);
    return names.includes(columnName)
      ? []
      : [{ start: columnStart, length: columnName.length, message: `unknown column: ${columnName}` }];
  }

  const knownTables = sources.filter((source) => checker.getPropertyOfType(dbType, source.table));
  if (knownTables.length === 0) {
    return [];
  }

  const containingTables = knownTables.filter((source) =>
    getColumnNames(checker, dbType, literal, source.table).includes(columnName),
  );

  if (containingTables.length === 0) {
    return [{ start: columnStart, length: columnName.length, message: `unknown column: ${columnName}` }];
  }
  if (containingTables.length > 1) {
    return [{ start: columnStart, length: columnName.length, message: `ambiguous column: ${columnName}` }];
  }
  return [];
}

// Scans the WHERE clause the same way src/where.ts's type-level WhereScan
// does: track the token immediately before it, and validate that token as a
// column reference whenever a comparison operator, AND/OR, or the end of the
// clause is reached. Deliberately skips anything containing a paren
// (subqueries, function calls, grouped expressions) rather than tracking
// depth through them - the common, parenthesis-free case is what this
// recovers diagnostics for; a stray ( or ) just means no extra diagnostics,
// never a wrong one.
function findWhereDiagnostics(
  checker: ts.TypeChecker,
  dbType: ts.Type,
  literal: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
  sources: ReturnType<typeof findSources>,
  stripped: string,
  literalStart: number,
): DiagnosticSpan[] {
  const clause = findWhereClauseText(stripped);
  if (!clause || clause.text.includes('(') || clause.text.includes(')')) {
    return [];
  }

  const diagnostics: DiagnosticSpan[] = [];
  let prevToken: { text: string; start: number } | null = null;
  const wordPattern = /\S+/g;
  let match: RegExpExecArray | null;

  const flush = () => {
    if (!prevToken) {
      return;
    }
    diagnostics.push(
      ...whereTokenDiagnostics(checker, dbType, literal, sources, {
        text: prevToken.text,
        start: literalStart + prevToken.start,
      }),
    );
  };

  while ((match = wordPattern.exec(clause.text)) !== null) {
    const word = match[0];
    const lower = word.toLowerCase();
    const start = clause.start + match.index;

    if (WHERE_TRIGGER_OPERATORS.has(lower) || WHERE_AND_OR.has(lower)) {
      flush();
      prevToken = null;
      continue;
    }
    if (WHERE_TRANSPARENT_WORD.test(word)) {
      continue;
    }
    prevToken = { text: word, start };
  }
  flush();

  return diagnostics;
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
  sourceFile: ts.SourceFile,
): DiagnosticSpan[] {
  const literalStart = literal.getStart(sourceFile) + 1;
  // Read the raw source slice, not the node's cooked `.text` - `.text`
  // normalizes CRLF line endings to LF and resolves escapes, so offsets
  // computed against it drift out of alignment with literalStart (a raw
  // source position) by one character per preceding line break on a CRLF
  // file. Mirrors the same fix already applied to hover in index.cts.
  const text = sourceFile.text.slice(literalStart, literal.getEnd() - 1);
  const { stripped } = stripStringLiterals(text);
  // A CTE query's outer statement doesn't start at offset 0 - skip the
  // WITH-clause prefix (mirroring ParseWithClause in src/cte.ts) so the
  // SELECT gate and the select-list slice below both operate on the outer
  // statement rather than being fooled by the CTE body's own FROM/SELECT.
  const { remainder, remainderStart } = stripWithClause(stripped);

  const fromIndex = findTopLevelFromIndex(stripped);
  if (fromIndex === null || !SELECT_KEYWORD.test(remainder)) {
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

  const beforeFrom = stripped.slice(remainderStart, fromIndex);
  const afterSelect = skipLeadingKeyword(beforeFrom, SELECT_KEYWORD);
  const selectList = skipLeadingKeyword(afterSelect, DISTINCT_KEYWORD);
  const selectListOffset = remainderStart + (beforeFrom.length - selectList.length);

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

  diagnostics.push(...findWhereDiagnostics(checker, dbType, literal, sources, stripped, literalStart));

  return diagnostics;
}

export = { getQueryDiagnostics };
