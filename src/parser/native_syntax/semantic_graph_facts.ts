/**
 * Native TypeScript AST facts for graph-turbo provider enrichment.
 */
import ts from "typescript";

import { locationForNode } from "../diagnostics.js";
import { propertyNameText } from "./helpers.js";

export type TypeScriptSemanticGraphContainerKind = "class" | "interface" | "type";

export interface TypeScriptSemanticGraphFieldFact {
  readonly containerKind: TypeScriptSemanticGraphContainerKind;
  readonly containerName: string;
  readonly fieldName: string;
  readonly typeValue: string;
  readonly collectionKind?: string;
  readonly line: number;
  readonly contextStartLine: number;
  readonly contextEndLine: number;
}

export function collectSemanticGraphFieldFacts(
  sourceFile: ts.SourceFile,
): TypeScriptSemanticGraphFieldFact[] {
  const facts: TypeScriptSemanticGraphFieldFact[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(statement)) {
      facts.push(
        ...statement.members.flatMap((member) =>
          propertySignatureFact(sourceFile, "interface", statement.name.text, statement, member),
        ),
      );
    }
    if (ts.isTypeAliasDeclaration(statement) && ts.isTypeLiteralNode(statement.type)) {
      facts.push(
        ...statement.type.members.flatMap((member) =>
          propertySignatureFact(sourceFile, "type", statement.name.text, statement, member),
        ),
      );
    }
    if (ts.isClassDeclaration(statement)) {
      const className = statement.name?.text ?? "default";
      facts.push(
        ...statement.members.flatMap((member) =>
          classFieldFact(sourceFile, className, statement, member),
        ),
      );
    }
  }
  return facts;
}

function propertySignatureFact(
  sourceFile: ts.SourceFile,
  containerKind: "interface" | "type",
  containerName: string,
  containerNode: ts.Node,
  member: ts.TypeElement,
): readonly TypeScriptSemanticGraphFieldFact[] {
  if (!ts.isPropertySignature(member) || member.type === undefined) {
    return [];
  }
  return [fieldFact(sourceFile, containerKind, containerName, containerNode, member, member.type)];
}

function classFieldFact(
  sourceFile: ts.SourceFile,
  className: string,
  classNode: ts.ClassDeclaration,
  member: ts.ClassElement,
): readonly TypeScriptSemanticGraphFieldFact[] {
  if (!ts.isPropertyDeclaration(member) || member.type === undefined) {
    return [];
  }
  return [fieldFact(sourceFile, "class", className, classNode, member, member.type)];
}

function fieldFact(
  sourceFile: ts.SourceFile,
  containerKind: TypeScriptSemanticGraphContainerKind,
  containerName: string,
  containerNode: ts.Node,
  fieldNode: ts.PropertyDeclaration | ts.PropertySignature,
  typeNode: ts.TypeNode,
): TypeScriptSemanticGraphFieldFact {
  const fieldLocation = locationForNode(sourceFile, fieldNode);
  const containerLocation = locationForNode(sourceFile, containerNode);
  return {
    containerKind,
    containerName,
    fieldName: propertyNameText(fieldNode.name, sourceFile),
    typeValue: typeNode.getText(sourceFile),
    ...optionalCollectionKind(collectionKindForType(typeNode, sourceFile)),
    line: fieldLocation.line,
    contextStartLine: containerLocation.line,
    contextEndLine: endLineForNode(sourceFile, containerNode),
  };
}

function optionalCollectionKind(collectionKind: string | undefined): {
  readonly collectionKind?: string;
} {
  return collectionKind === undefined ? {} : { collectionKind };
}

function collectionKindForType(
  typeNode: ts.TypeNode | undefined,
  sourceFile: ts.SourceFile,
): string | undefined {
  if (typeNode === undefined) return undefined;
  if (ts.isArrayTypeNode(typeNode)) return "array";
  if (ts.isTupleTypeNode(typeNode)) return "tuple";
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return collectionKindForType(typeNode.type, sourceFile);
  }
  if (ts.isTypeOperatorNode(typeNode)) {
    return collectionKindForType(typeNode.type, sourceFile);
  }
  if (ts.isUnionTypeNode(typeNode)) {
    for (const member of typeNode.types) {
      const collectionKind = collectionKindForType(member, sourceFile);
      if (collectionKind !== undefined) return collectionKind;
    }
    return undefined;
  }
  if (ts.isTypeReferenceNode(typeNode)) {
    const typeName = typeNode.typeName.getText(sourceFile);
    if (typeName === "Readonly") {
      return collectionKindForType(typeNode.typeArguments?.[0], sourceFile);
    }
    if (typeName === "Array" || typeName === "ReadonlyArray") return "array";
    if (typeName === "Map" || typeName === "ReadonlyMap" || typeName === "WeakMap") return "map";
    if (typeName === "Set" || typeName === "ReadonlySet" || typeName === "WeakSet") return "set";
    if (typeName === "Record") return "record";
  }
  return undefined;
}

function endLineForNode(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
}
