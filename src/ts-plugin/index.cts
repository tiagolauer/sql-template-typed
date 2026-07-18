import type * as ts from 'typescript/lib/tsserverlibrary';
import sqlContext = require('./sql-context.cjs');
import schemaModule = require('./schema.cjs');
import detectModule = require('./detect.cjs');

const { getSelectListContext, findFromTable } = sqlContext;
const { getColumnNames } = schemaModule;
const { matchQueryLiteral } = detectModule;

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
      const prior = info.languageService.getCompletionsAtPosition(fileName, position, options);

      const program = info.languageService.getProgram();
      const sourceFile = program?.getSourceFile(fileName);
      if (!program || !sourceFile) {
        return prior;
      }

      const checker = program.getTypeChecker();
      const match = matchQueryLiteral(typescript, checker, sourceFile, position);
      if (!match) {
        return prior;
      }

      const literalStart = match.literal.getStart(sourceFile) + 1;
      const textBeforeCursor = sourceFile.text.slice(literalStart, position);
      const context = getSelectListContext(textBeforeCursor);
      if (!context) {
        return prior;
      }

      const fullLiteralText = match.literal.text;
      const table = findFromTable(fullLiteralText);
      const columns = getColumnNames(checker, match.dbType, match.literal, table);
      const filtered = columns.filter((name) => name.startsWith(context.prefix));

      return {
        isGlobalCompletion: false,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: filtered.map((name) => ({
          name,
          kind: typescript.ScriptElementKind.memberVariableElement,
          sortText: '0',
        })),
      };
    };

    proxy.getCompletionsAtPosition = getCompletionsAtPosition;

    return proxy as unknown as ts.LanguageService;
  }

  return { create };
}

export = init;
