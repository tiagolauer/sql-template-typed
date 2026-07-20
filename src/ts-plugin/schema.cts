import type * as ts from 'typescript';

function scopeToTable(
  tableSymbols: ts.Symbol[],
  onlyTable: string | null,
): ts.Symbol[] {
  if (!onlyTable) {
    return tableSymbols;
  }

  return tableSymbols.filter((symbol) => symbol.getName() === onlyTable);
}

function getColumnNames(
  checker: ts.TypeChecker,
  dbType: ts.Type,
  node: ts.Node,
  onlyTable: string | null,
): string[] {
  const tables = scopeToTable(dbType.getProperties(), onlyTable);

  const columnNames = new Set<string>();

  for (const tableSymbol of tables) {
    const tableType = checker.getTypeOfSymbolAtLocation(tableSymbol, node);
    for (const columnSymbol of tableType.getProperties()) {
      columnNames.add(columnSymbol.getName());
    }
  }

  return [...columnNames];
}

function getColumnType(
  checker: ts.TypeChecker,
  dbType: ts.Type,
  node: ts.Node,
  onlyTable: string | null,
  columnName: string,
): ts.Type | null {
  const tables = scopeToTable(dbType.getProperties(), onlyTable);

  const matches: ts.Type[] = [];

  for (const tableSymbol of tables) {
    const tableType = checker.getTypeOfSymbolAtLocation(tableSymbol, node);
    for (const columnSymbol of tableType.getProperties()) {
      if (columnSymbol.getName() === columnName) {
        matches.push(checker.getTypeOfSymbolAtLocation(columnSymbol, node));
      }
    }
  }

  if (matches.length === 0) {
    return null;
  }

  const [first, ...rest] = matches;
  const firstText = checker.typeToString(first as ts.Type);
  const isUnambiguous = rest.every((type) => checker.typeToString(type) === firstText);

  return isUnambiguous ? (first as ts.Type) : null;
}

export = { getColumnNames, getColumnType };
