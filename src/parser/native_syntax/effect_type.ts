/**
 * Effect type projection helpers for native syntax facts.
 *
 * This module recognizes Effect type carriers and error channels from the
 * TypeScript compiler AST.
 */
import ts from "typescript";

import type { TypeScriptEffectErrorChannelKind } from "../../model.js";

export interface EffectTypeParts {
  readonly successTypeText?: string;
  readonly errorTypeText?: string;
  readonly errorChannelKind?: TypeScriptEffectErrorChannelKind;
  readonly requirementsTypeText?: string;
}

export function effectTypeParts(
  typeNode: ts.TypeNode | undefined,
  sourceFile: ts.SourceFile,
): EffectTypeParts | undefined {
  const reference = effectTypeReference(typeNode);
  if (reference === undefined) {
    return undefined;
  }
  const [successType, errorType, requirementsType] = reference.typeArguments ?? [];
  const errorChannelKind = effectErrorChannelKind(errorType);
  return {
    ...optionalText("successTypeText", successType?.getText(sourceFile)),
    ...optionalText("errorTypeText", errorType?.getText(sourceFile)),
    ...(errorChannelKind === undefined ? {} : { errorChannelKind }),
    ...optionalText("requirementsTypeText", requirementsType?.getText(sourceFile)),
  };
}

export function effectTypeReference(
  typeNode: ts.TypeNode | undefined,
): ts.TypeReferenceNode | undefined {
  if (typeNode === undefined) {
    return undefined;
  }
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return effectTypeReference(typeNode.type);
  }
  if (!ts.isTypeReferenceNode(typeNode)) {
    return undefined;
  }
  const nameParts = entityNameParts(typeNode.typeName);
  const root = nameParts[0];
  const terminal = nameParts.at(-1);
  return terminal === "Effect" && (root === "Effect" || root === "effect") ? typeNode : undefined;
}

function entityNameParts(name: ts.EntityName): readonly string[] {
  if (ts.isIdentifier(name)) {
    return [name.text];
  }
  return [...entityNameParts(name.left), name.right.text];
}

function effectErrorChannelKind(
  typeNode: ts.TypeNode | undefined,
): TypeScriptEffectErrorChannelKind | undefined {
  if (typeNode === undefined) {
    return undefined;
  }
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return effectErrorChannelKind(typeNode.type);
  }
  if (typeNode.kind === ts.SyntaxKind.NeverKeyword) {
    return "none";
  }
  if (weakErrorTypeNode(typeNode)) {
    return "weak";
  }
  if (ts.isUnionTypeNode(typeNode)) {
    const members = typeNode.types.map((member) => effectErrorChannelKind(member));
    if (members.every((member) => member === "none")) {
      return "none";
    }
    return members.some((member) => member === "weak") ? "weak" : "domain";
  }
  return "domain";
}

function weakErrorTypeNode(typeNode: ts.TypeNode): boolean {
  switch (typeNode.kind) {
    case ts.SyntaxKind.AnyKeyword:
    case ts.SyntaxKind.UnknownKeyword:
    case ts.SyntaxKind.StringKeyword:
    case ts.SyntaxKind.NumberKeyword:
    case ts.SyntaxKind.BooleanKeyword:
    case ts.SyntaxKind.BigIntKeyword:
    case ts.SyntaxKind.SymbolKeyword:
    case ts.SyntaxKind.ObjectKeyword:
    case ts.SyntaxKind.VoidKeyword:
    case ts.SyntaxKind.UndefinedKeyword:
    case ts.SyntaxKind.NullKeyword:
      return true;
    default:
      break;
  }
  return ts.isLiteralTypeNode(typeNode);
}

function optionalText<Key extends string>(
  key: Key,
  value: string | undefined,
): { readonly [Property in Key]?: string } {
  if (value === undefined || value.trim() === "") {
    return {};
  }
  return { [key]: value } as { readonly [Property in Key]: string };
}
