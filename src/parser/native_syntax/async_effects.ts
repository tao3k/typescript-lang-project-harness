import ts from "typescript";

import type { TypeScriptPublicAsyncEffectSurfaceFact } from "../../model.js";
import { locationForNode } from "../diagnostics.js";
import { effectTypeParts } from "./effect_type.js";
import { publicFunctionLikeDeclarations, sourceLineField } from "./helpers.js";

export function collectPublicAsyncEffectSurfaces(
  sourceFile: ts.SourceFile,
): TypeScriptPublicAsyncEffectSurfaceFact[] {
  return publicFunctionLikeDeclarations(sourceFile).flatMap(({ node, name }) => {
    const isAsync = hasAsyncModifier(node);
    const returnType = node.type;
    const returnsPromise = isAsync || returnsPromiseType(returnType);
    const effectParts = effectTypeParts(returnType, sourceFile);
    const returnsEffect = effectParts !== undefined;
    if (!returnsPromise && !returnsEffect) {
      return [];
    }
    return [
      {
        functionName: name,
        functionLine: locationForNode(sourceFile, node).line,
        isAsync,
        returnsPromise,
        returnsEffect,
        ...(returnType === undefined ? {} : { returnTypeText: returnType.getText(sourceFile) }),
        ...effectParts,
        location: locationForNode(sourceFile, node.name ?? node),
        ...sourceLineField(sourceFile, node),
      },
    ];
  });
}

function hasAsyncModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ??
      false)
  );
}

function returnsPromiseType(typeNode: ts.TypeNode | undefined): boolean {
  return typeReferenceNameParts(typeNode).at(-1) === "Promise";
}

function typeReferenceNameParts(typeNode: ts.TypeNode | undefined): readonly string[] {
  if (typeNode === undefined) {
    return [];
  }
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return typeReferenceNameParts(typeNode.type);
  }
  if (!ts.isTypeReferenceNode(typeNode)) {
    return [];
  }
  return entityNameParts(typeNode.typeName);
}

function entityNameParts(name: ts.EntityName): readonly string[] {
  if (ts.isIdentifier(name)) {
    return [name.text];
  }
  return [...entityNameParts(name.left), name.right.text];
}
