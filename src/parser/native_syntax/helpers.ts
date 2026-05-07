import ts from "typescript";

import { locationForNode, sourceLineAt } from "../diagnostics.js";

export type FunctionLikeWithBody =
  | ts.FunctionDeclaration
  | ts.MethodDeclaration
  | ts.ArrowFunction
  | ts.FunctionExpression;

export interface PublicFunctionLikeDeclaration {
  readonly node: FunctionLikeWithBody;
  readonly name: string;
}

export function publicFunctionLikeDeclarations(
  sourceFile: ts.SourceFile,
): PublicFunctionLikeDeclaration[] {
  return sourceFile.statements.flatMap((statement): PublicFunctionLikeDeclaration[] => {
    if (ts.isFunctionDeclaration(statement) && isExported(statement)) {
      return [{ node: statement, name: statement.name?.text ?? "default" }];
    }
    if (ts.isClassDeclaration(statement) && isExported(statement)) {
      const className = statement.name?.text ?? "default";
      return statement.members.flatMap((member) => {
        if (!ts.isMethodDeclaration(member) || !isPublicClassMember(member)) {
          return [];
        }
        return [
          {
            node: member,
            name: `${className}.${propertyNameText(member.name, sourceFile)}`,
          },
        ];
      });
    }
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      return statement.declarationList.declarations.flatMap((declaration) => {
        const initializer = declaration.initializer;
        if (
          initializer === undefined ||
          (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer))
        ) {
          return [];
        }
        return [
          {
            node: initializer,
            name: bindingNameText(declaration.name, sourceFile),
          },
        ];
      });
    }
    return [];
  });
}

export function typeContractInfo(
  typeNode: ts.TypeNode | undefined,
  sourceFile: ts.SourceFile,
): {
  readonly typeText?: string;
  readonly primitiveContractType?: string;
  readonly flagContractType?: string;
} {
  if (typeNode === undefined) {
    return {};
  }
  const primitiveContractType = primitiveContractTypeName(typeNode);
  const flagContractType = flagContractTypeName(typeNode, sourceFile);
  return {
    typeText: typeNode.getText(sourceFile),
    ...(primitiveContractType === undefined ? {} : { primitiveContractType }),
    ...(flagContractType === undefined ? {} : { flagContractType }),
  };
}

export function tupleContractTypes(
  typeNode: ts.TypeNode | undefined,
  sourceFile: ts.SourceFile,
): readonly string[] {
  if (typeNode === undefined) {
    return [];
  }
  if (ts.isTupleTypeNode(typeNode)) {
    return typeNode.elements
      .map((element) => {
        const elementType = ts.isNamedTupleMember(element) ? element.type : element;
        return (
          primitiveContractTypeName(elementType) ??
          flagContractTypeName(elementType, sourceFile) ??
          undefined
        );
      })
      .filter((label): label is string => label !== undefined);
  }
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return tupleContractTypes(typeNode.type, sourceFile);
  }
  if (ts.isTypeReferenceNode(typeNode)) {
    const name = typeNode.typeName.getText(sourceFile);
    if (name !== "Promise" && name !== "Readonly") {
      return [];
    }
    const firstArgument = typeNode.typeArguments?.[0];
    return tupleContractTypes(firstArgument, sourceFile);
  }
  return [];
}

export function bindingNameText(name: ts.BindingName, sourceFile: ts.SourceFile): string {
  return ts.isIdentifier(name) ? name.text : name.getText(sourceFile);
}

export function propertyNameText(name: ts.PropertyName, sourceFile: ts.SourceFile): string {
  return ts.isIdentifier(name) || ts.isPrivateIdentifier(name)
    ? name.text
    : name.getText(sourceFile);
}

export function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
      false)
  );
}

export function isPublicClassMember(member: ts.ClassElement): boolean {
  if (!ts.canHaveModifiers(member)) {
    return true;
  }
  const modifiers = ts.getModifiers(member) ?? [];
  return !modifiers.some(
    (modifier) =>
      modifier.kind === ts.SyntaxKind.PrivateKeyword ||
      modifier.kind === ts.SyntaxKind.ProtectedKeyword,
  );
}

export function sourceLineField(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): { readonly sourceLine?: string } {
  const line = locationForNode(sourceFile, node).line;
  const sourceLine = sourceLineAt(sourceFile.text, line);
  return sourceLine === undefined ? {} : { sourceLine };
}

function primitiveContractTypeName(typeNode: ts.TypeNode): string | undefined {
  switch (typeNode.kind) {
    case ts.SyntaxKind.StringKeyword:
      return "string";
    case ts.SyntaxKind.NumberKeyword:
      return "number";
    case ts.SyntaxKind.BooleanKeyword:
      return "boolean";
    case ts.SyntaxKind.BigIntKeyword:
      return "bigint";
    case ts.SyntaxKind.SymbolKeyword:
      return "symbol";
    default:
      break;
  }
  if (ts.isLiteralTypeNode(typeNode)) {
    if (ts.isStringLiteral(typeNode.literal)) {
      return "string-literal";
    }
    if (
      typeNode.literal.kind === ts.SyntaxKind.TrueKeyword ||
      typeNode.literal.kind === ts.SyntaxKind.FalseKeyword
    ) {
      return "boolean-literal";
    }
    if (ts.isNumericLiteral(typeNode.literal)) {
      return "number-literal";
    }
  }
  if (ts.isUnionTypeNode(typeNode)) {
    const labels = typeNode.types
      .map((candidate) => primitiveContractTypeName(candidate))
      .filter((label): label is string => label !== undefined);
    return labels.length === typeNode.types.length
      ? [...new Set(labels)].sort().join("|")
      : undefined;
  }
  return undefined;
}

function flagContractTypeName(
  typeNode: ts.TypeNode,
  sourceFile: ts.SourceFile,
): string | undefined {
  if (typeNode.kind === ts.SyntaxKind.BooleanKeyword) {
    return "boolean";
  }
  if (ts.isLiteralTypeNode(typeNode)) {
    return typeNode.literal.kind === ts.SyntaxKind.TrueKeyword ||
      typeNode.literal.kind === ts.SyntaxKind.FalseKeyword
      ? "boolean-literal"
      : undefined;
  }
  if (ts.isUnionTypeNode(typeNode)) {
    const hasBoolean = typeNode.types.some(
      (candidate) =>
        candidate.kind === ts.SyntaxKind.BooleanKeyword ||
        (ts.isLiteralTypeNode(candidate) &&
          (candidate.literal.kind === ts.SyntaxKind.TrueKeyword ||
            candidate.literal.kind === ts.SyntaxKind.FalseKeyword)),
    );
    const onlyBooleanLike = typeNode.types.every(
      (candidate) =>
        candidate.kind === ts.SyntaxKind.BooleanKeyword ||
        candidate.kind === ts.SyntaxKind.UndefinedKeyword ||
        candidate.kind === ts.SyntaxKind.NullKeyword ||
        (ts.isLiteralTypeNode(candidate) &&
          (candidate.literal.kind === ts.SyntaxKind.TrueKeyword ||
            candidate.literal.kind === ts.SyntaxKind.FalseKeyword)),
    );
    return hasBoolean && onlyBooleanLike ? typeNode.getText(sourceFile) : undefined;
  }
  return undefined;
}
