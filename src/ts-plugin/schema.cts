import type * as ts from 'typescript';

function getColumnNames(
  checker: ts.TypeChecker,
  dbType: ts.Type,
  node: ts.Node,
  onlyTable: string | null,
): string[] {
  const tableSymbols = dbType.getProperties();

  const scopedTables = onlyTable
    ? tableSymbols.filter((symbol) => symbol.getName() === onlyTable)
    : tableSymbols;

  const tables = scopedTables.length > 0 ? scopedTables : tableSymbols;

  const columnNames = new Set<string>();

  for (const tableSymbol of tables) {
    const tableType = checker.getTypeOfSymbolAtLocation(tableSymbol, node);
    for (const columnSymbol of tableType.getProperties()) {
      columnNames.add(columnSymbol.getName());
    }
  }

  return [...columnNames];
}

export = { getColumnNames };
