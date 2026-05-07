import ts from "typescript";

import type { TypeScriptPublicDataFieldFact } from "../../model.js";
import { locationForNode } from "../diagnostics.js";
import {
  isExported,
  isPublicClassMember,
  propertyNameText,
  sourceLineField,
  typeContractInfo,
} from "./helpers.js";

export function collectPublicDataFields(
  sourceFile: ts.SourceFile,
): TypeScriptPublicDataFieldFact[] {
  const facts: TypeScriptPublicDataFieldFact[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(statement) && isExported(statement)) {
      facts.push(
        ...statement.members.flatMap((member) =>
          publicPropertyFact(sourceFile, "interface", statement.name.text, statement, member),
        ),
      );
    }
    if (ts.isTypeAliasDeclaration(statement) && isExported(statement)) {
      const typeNode = statement.type;
      if (ts.isTypeLiteralNode(typeNode)) {
        facts.push(
          ...typeNode.members.flatMap((member) =>
            publicPropertyFact(sourceFile, "type", statement.name.text, statement, member),
          ),
        );
      }
    }
    if (ts.isClassDeclaration(statement) && isExported(statement)) {
      const className = statement.name?.text ?? "default";
      facts.push(
        ...statement.members.flatMap((member) =>
          publicClassPropertyFact(sourceFile, className, statement, member),
        ),
      );
    }
  }
  return facts;
}

function publicPropertyFact(
  sourceFile: ts.SourceFile,
  typeKind: TypeScriptPublicDataFieldFact["typeKind"],
  typeName: string,
  typeNode: ts.Node,
  member: ts.TypeElement,
): readonly TypeScriptPublicDataFieldFact[] {
  if (!ts.isPropertySignature(member)) {
    return [];
  }
  const typeInfo = typeContractInfo(member.type, sourceFile);
  if (typeInfo.primitiveContractType === undefined && typeInfo.flagContractType === undefined) {
    return [];
  }
  return [
    {
      typeKind,
      typeName,
      typeLine: locationForNode(sourceFile, typeNode).line,
      fieldName: propertyNameText(member.name, sourceFile),
      ...typeInfo,
      location: locationForNode(sourceFile, member),
      ...sourceLineField(sourceFile, member),
    },
  ];
}

function publicClassPropertyFact(
  sourceFile: ts.SourceFile,
  className: string,
  classNode: ts.ClassDeclaration,
  member: ts.ClassElement,
): readonly TypeScriptPublicDataFieldFact[] {
  if (!ts.isPropertyDeclaration(member) || !isPublicClassMember(member)) {
    return [];
  }
  const typeInfo = typeContractInfo(member.type, sourceFile);
  if (typeInfo.primitiveContractType === undefined && typeInfo.flagContractType === undefined) {
    return [];
  }
  return [
    {
      typeKind: "class",
      typeName: className,
      typeLine: locationForNode(sourceFile, classNode).line,
      fieldName: propertyNameText(member.name, sourceFile),
      ...typeInfo,
      location: locationForNode(sourceFile, member),
      ...sourceLineField(sourceFile, member),
    },
  ];
}
