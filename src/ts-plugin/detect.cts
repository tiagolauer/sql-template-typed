import type * as ts from 'typescript';

type TypeScript = typeof import('typescript');

const TYPED_DB_BRAND_PROPERTY = '__owlsqlTypedDb';

interface QueryLiteralMatch {
  literal: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral;
  dbType: ts.Type;
}

function findNodeAtPosition(typescript: TypeScript, sourceFile: ts.SourceFile, position: number): ts.Node {
  let best: ts.Node = sourceFile;

  const visit = (node: ts.Node): void => {
    if (position < node.getFullStart() || position >= node.getEnd()) {
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

function getQueryPropertyName(typescript: TypeScript, expression: ts.LeftHandSideExpression): string | null {
  if (typescript.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  if (
    typescript.isElementAccessExpression(expression) &&
    typescript.isStringLiteralLike(expression.argumentExpression)
  ) {
    return expression.argumentExpression.text;
  }

  return null;
}

function getReceiverExpression(typescript: TypeScript, call: ts.CallExpression): ts.Expression | null {
  const expression = call.expression;
  return typescript.isPropertyAccessExpression(expression) || typescript.isElementAccessExpression(expression)
    ? expression.expression
    : null;
}

function findEnclosingQueryCall(
  typescript: TypeScript,
  literal: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
): ts.CallExpression | null {
  let argumentNode: ts.Expression = literal;
  let parent = argumentNode.parent;

  while (parent && typescript.isParenthesizedExpression(parent)) {
    argumentNode = parent;
    parent = argumentNode.parent;
  }

  if (!parent || !typescript.isCallExpression(parent) || parent.arguments[0] !== argumentNode) {
    return null;
  }

  if (getQueryPropertyName(typescript, parent.expression) !== 'query') {
    return null;
  }

  return parent;
}

function isTypeReference(typescript: TypeScript, type: ts.Type): type is ts.TypeReference {
  return (
    (type.flags & typescript.TypeFlags.Object) !== 0 &&
    (((type as ts.ObjectType).objectFlags & typescript.ObjectFlags.Reference) !== 0)
  );
}

function hasTypedDbBrand(checker: ts.TypeChecker, type: ts.Type): boolean {
  return checker.getPropertyOfType(type, TYPED_DB_BRAND_PROPERTY) !== undefined;
}

function findTypedDbTypeReference(
  typescript: TypeScript,
  checker: ts.TypeChecker,
  type: ts.Type,
): ts.TypeReference | null {
  // A type reference only carries the DB type argument when it's an actual
  // instantiation of the generic TypedDb<DB> - `interface AppDb extends
  // TypedDb<DB> {}` inherits the brand property onto AppDb's own type too
  // (getPropertyOfType walks inherited members), but AppDb itself isn't
  // generic, so checker.getTypeArguments(AppDb) is empty. Requiring a type
  // argument here forces that case past this check and into the base-type
  // walk below, where the real TypedDb<DB> reference is found instead.
  if (
    isTypeReference(typescript, type) &&
    hasTypedDbBrand(checker, type) &&
    checker.getTypeArguments(type).length > 0
  ) {
    return type;
  }

  if (type.isIntersection()) {
    for (const constituent of type.types) {
      const found = findTypedDbTypeReference(typescript, checker, constituent);
      if (found) {
        return found;
      }
    }
  }

  if (type.isClassOrInterface()) {
    for (const baseType of type.getBaseTypes() ?? []) {
      const found = findTypedDbTypeReference(typescript, checker, baseType);
      if (found) {
        return found;
      }
    }
  }

  // `function run<T extends TypedDb<DB>>(db: T)` - the receiver is a bare
  // type parameter, so the brand only shows up on its constraint.
  if (type.isTypeParameter()) {
    const constraint = type.getConstraint();
    if (constraint) {
      return findTypedDbTypeReference(typescript, checker, constraint);
    }
  }

  return null;
}

function matchQueryLiteralNode(
  typescript: TypeScript,
  checker: ts.TypeChecker,
  node: ts.Node,
): QueryLiteralMatch | null {
  if (!isSqlLiteral(typescript, node)) {
    return null;
  }

  const call = findEnclosingQueryCall(typescript, node);
  if (!call) {
    return null;
  }

  const receiver = getReceiverExpression(typescript, call);
  if (!receiver) {
    return null;
  }

  const receiverType = checker.getTypeAtLocation(receiver);
  const typedDbRef = findTypedDbTypeReference(typescript, checker, receiverType);
  if (!typedDbRef) {
    return null;
  }

  const dbType = checker.getTypeArguments(typedDbRef)[0];
  if (!dbType) {
    return null;
  }

  return { literal: node, dbType };
}

function matchQueryLiteral(
  typescript: TypeScript,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  position: number,
): QueryLiteralMatch | null {
  const node = findNodeAtPosition(typescript, sourceFile, position);
  return matchQueryLiteralNode(typescript, checker, node);
}

function findAllQueryLiterals(
  typescript: TypeScript,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
): QueryLiteralMatch[] {
  const matches: QueryLiteralMatch[] = [];

  const visit = (node: ts.Node): void => {
    if (isSqlLiteral(typescript, node)) {
      const match = matchQueryLiteralNode(typescript, checker, node);
      if (match) {
        matches.push(match);
      }
    }
    typescript.forEachChild(node, visit);
  };

  typescript.forEachChild(sourceFile, visit);
  return matches;
}

export = { matchQueryLiteral, findAllQueryLiterals };
