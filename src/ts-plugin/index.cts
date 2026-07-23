import type * as ts from 'typescript/lib/tsserverlibrary';
import sqlContext = require('./sql-context.cjs');
import schemaModule = require('./schema.cjs');
import detectModule = require('./detect.cjs');
import diagnosticsModule = require('./diagnostics.cjs');

const {
  getSelectListContext,
  getWhereClauseContext,
  findSources,
  findSourceByAlias,
  getQualifierBefore,
  getWordAtOffset,
} = sqlContext;
const { getColumnNames, getColumnType } = schemaModule;
const { matchQueryLiteral, findAllQueryLiterals } = detectModule;
const { getQueryDiagnostics } = diagnosticsModule;

const OWLSQL_DIAGNOSTIC_SOURCE = 'owlsql';
const OWLSQL_DIAGNOSTIC_CODE = 990001;

function resolveTableScope(
  sources: ReturnType<typeof findSources>,
  qualifier: string | null,
): string | string[] | null {
  if (qualifier) {
    const source = findSourceByAlias(sources, qualifier);
    return source ? source.table : [];
  }

  return sources.length > 0 ? sources.map((source) => source.table) : null;
}

function init(modules: { typescript: typeof ts }) {
  const typescript = modules.typescript;

  function create(info: ts.server.PluginCreateInfo): ts.LanguageService {
    const languageService = info.languageService;
    const proxy = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(languageService) as (keyof ts.LanguageService)[]) {
      const original = languageService[key];
      if (typeof original === 'function') {
        proxy[key] = (original as (...args: unknown[]) => unknown).bind(languageService);
      }
    }

    const getCompletionsAtPosition: ts.LanguageService['getCompletionsAtPosition'] = (
      fileName,
      position,
      options,
    ) => {
      const native = () =>
        info.languageService.getCompletionsAtPosition(fileName, position, options);

      try {
        const program = info.languageService.getProgram();
        const sourceFile = program?.getSourceFile(fileName);
        if (!program || !sourceFile) {
          return native();
        }

        const checker = program.getTypeChecker();
        const match = matchQueryLiteral(typescript, checker, sourceFile, position);
        if (!match) {
          return native();
        }

        const literalStart = match.literal.getStart(sourceFile) + 1;
        const textBeforeCursor = sourceFile.text.slice(literalStart, position);
        const context = getSelectListContext(textBeforeCursor) ?? getWhereClauseContext(textBeforeCursor);
        if (!context) {
          return native();
        }

        const fullLiteralText = match.literal.text;
        const sources = findSources(fullLiteralText);
        const table = resolveTableScope(sources, context.qualifier);
        const columns = getColumnNames(checker, match.dbType, match.literal, table);
        const prefix = context.prefix.toLowerCase();
        const filtered = columns.filter((name) => name.toLowerCase().startsWith(prefix));

        if (filtered.length === 0) {
          return native();
        }

        const replacementSpan = {
          start: position - context.prefix.length,
          length: context.prefix.length,
        };

        return {
          isGlobalCompletion: false,
          isMemberCompletion: false,
          isNewIdentifierLocation: false,
          entries: filtered.map((name) => ({
            name,
            kind: typescript.ScriptElementKind.memberVariableElement,
            sortText: '0',
            replacementSpan,
          })),
        };
      } catch {
        return native();
      }
    };

    proxy.getCompletionsAtPosition = getCompletionsAtPosition;

    const getCompletionEntryDetails: ts.LanguageService['getCompletionEntryDetails'] = (
      fileName,
      position,
      entryName,
      formatOptions,
      source,
      preferences,
      data,
    ) => {
      const native = () =>
        info.languageService.getCompletionEntryDetails(
          fileName,
          position,
          entryName,
          formatOptions,
          source,
          preferences,
          data,
        );

      try {
        const program = info.languageService.getProgram();
        const sourceFile = program?.getSourceFile(fileName);
        if (!program || !sourceFile) {
          return native();
        }

        const checker = program.getTypeChecker();
        const match = matchQueryLiteral(typescript, checker, sourceFile, position);
        if (!match) {
          return native();
        }

        const table = resolveTableScope(findSources(match.literal.text), null);
        const columnType = getColumnType(checker, match.dbType, match.literal, table, entryName);
        if (!columnType) {
          return native();
        }

        return {
          name: entryName,
          kind: typescript.ScriptElementKind.memberVariableElement,
          kindModifiers: '',
          displayParts: [
            { text: `(column) ${entryName}: ${checker.typeToString(columnType)}`, kind: 'text' },
          ],
        };
      } catch {
        return native();
      }
    };

    proxy.getCompletionEntryDetails = getCompletionEntryDetails;

    const getQuickInfoAtPosition: ts.LanguageService['getQuickInfoAtPosition'] = (fileName, position) => {
      const native = () => info.languageService.getQuickInfoAtPosition(fileName, position);

      try {
        const program = info.languageService.getProgram();
        const sourceFile = program?.getSourceFile(fileName);
        if (!program || !sourceFile) {
          return native();
        }

        const checker = program.getTypeChecker();
        const match = matchQueryLiteral(typescript, checker, sourceFile, position);
        if (!match) {
          return native();
        }

        const literalStart = match.literal.getStart(sourceFile) + 1;
        const rawLiteralText = sourceFile.text.slice(literalStart, match.literal.getEnd() - 1);
        const word = getWordAtOffset(rawLiteralText, position - literalStart);
        if (!word) {
          return native();
        }

        const qualifier = getQualifierBefore(rawLiteralText, word.start);
        const table = resolveTableScope(findSources(rawLiteralText), qualifier);
        const columnType = getColumnType(checker, match.dbType, match.literal, table, word.word);
        if (!columnType) {
          return native();
        }

        const typeText = checker.typeToString(columnType);

        return {
          kind: typescript.ScriptElementKind.memberVariableElement,
          kindModifiers: '',
          textSpan: { start: literalStart + word.start, length: word.end - word.start },
          displayParts: [{ text: `(column) ${word.word}: ${typeText}`, kind: 'text' }],
        };
      } catch {
        return native();
      }
    };

    proxy.getQuickInfoAtPosition = getQuickInfoAtPosition;

    const getSemanticDiagnostics: ts.LanguageService['getSemanticDiagnostics'] = (fileName) => {
      const native = () => info.languageService.getSemanticDiagnostics(fileName);

      try {
        const program = info.languageService.getProgram();
        const sourceFile = program?.getSourceFile(fileName);
        if (!program || !sourceFile) {
          return native();
        }

        const checker = program.getTypeChecker();
        const matches = findAllQueryLiterals(typescript, checker, sourceFile);
        const extra: ts.Diagnostic[] = [];

        for (const match of matches) {
          for (const span of getQueryDiagnostics(checker, match.dbType, match.literal, sourceFile)) {
            extra.push({
              file: sourceFile,
              start: span.start,
              length: span.length,
              messageText: span.message,
              category: typescript.DiagnosticCategory.Warning,
              code: OWLSQL_DIAGNOSTIC_CODE,
              source: OWLSQL_DIAGNOSTIC_SOURCE,
            });
          }
        }

        const nativeDiagnostics = native();
        return extra.length === 0 ? nativeDiagnostics : [...nativeDiagnostics, ...extra];
      } catch {
        return native();
      }
    };

    proxy.getSemanticDiagnostics = getSemanticDiagnostics;

    return proxy as unknown as ts.LanguageService;
  }

  return { create };
}

export = init;
