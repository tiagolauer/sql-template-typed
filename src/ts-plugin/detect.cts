import type * as ts from 'typescript';

type TypeScript = typeof import('typescript');

interface QueryLiteralMatch {
  literal: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral;
  dbType: ts.Type;
}

function findNodeAtPosition(typescript: TypeScript, sourceFile: ts.SourceFile, position: number): ts.Node {
  let best: ts.Node = sourceFile;

  const visit = (node: ts.Node): void => {
    if (position < node.getFullStart() || position > node.getEnd()) {
      return;
    }

    best = node;
    typescript.forEachChild(node, visit);
  };

  typescript.forEachChild(sourceFile, visit);
  return best;
}

function isSqlLiteral(
  typescript: TypeScript,
  node: ts.Node,
): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return typescript.isStringLiteral(node) || typescript.isNoSubstitutionTemplateLiteral(node);
}

function findEnclosingQueryCall(
  typescript: TypeScript,
  literal: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
): ts.CallExpression | null {
  const call = literal.parent;
  if (!call || !typescript.isCallExpression(call) || call.arguments[0] !== literal) {
    return null;
  }

  if (!typescript.isPropertyAccessExpression(call.expression) || call.expression.name.text !== 'query') {
    return null;
  }

  return call;
}

function isTypeReference(typescript: TypeScript, type: ts.Type): type is ts.TypeReference {
  return (
    (type.flags & typescript.TypeFlags.Object) !== 0 &&
    (((type as ts.ObjectType).objectFlags & typescript.ObjectFlags.Reference) !== 0)
  );
}

function isTypedDbQueryMethod(checker: ts.TypeChecker, call: ts.CallExpression): boolean {
  const signature = checker.getResolvedSignature(call);
  const declaration = signature?.declaration;
  const parent = declaration?.parent;
  return parent !== undefined && 'name' in parent && (parent as { name?: ts.Identifier }).name?.text === 'TypedDb';
}

function matchQueryLiteral(
  typescript: TypeScript,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  position: number,
): QueryLiteralMatch | null {
  const node = findNodeAtPosition(typescript, sourceFile, position);
  if (!isSqlLiteral(typescript, node)) {
    return null;
  }

  const call = findEnclosingQueryCall(typescript, node);
  if (!call || !isTypedDbQueryMethod(checker, call)) {
    return null;
  }

  const objectExpression = (call.expression as ts.PropertyAccessExpression).expression;
  const objectType = checker.getTypeAtLocation(objectExpression);
  const dbType = isTypeReference(typescript, objectType)
    ? checker.getTypeArguments(objectType)[0]
    : undefined;

  if (!dbType) {
    return null;
  }

  return { literal: node, dbType };
}

export = { matchQueryLiteral };
