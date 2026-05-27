import ts from "typescript";

import type {
  TypeScriptPublicDataFieldFact,
  TypeScriptPublicDiscriminatedUnionVariantFieldFact,
  TypeScriptPublicTypeAliasFact,
} from "../../model.js";
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

export function collectPublicTypeAliases(
  sourceFile: ts.SourceFile,
): TypeScriptPublicTypeAliasFact[] {
  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isTypeAliasDeclaration(statement) || !isExported(statement)) {
      return [];
    }
    const typeInfo = typeContractInfo(statement.type, sourceFile);
    if (typeInfo.primitiveContractType === undefined && typeInfo.flagContractType === undefined) {
      return [];
    }
    return [
      {
        aliasName: statement.name.text,
        targetTypeText: statement.type.getText(sourceFile),
        ...typeInfo,
        location: locationForNode(sourceFile, statement),
        ...sourceLineField(sourceFile, statement),
      },
    ];
  });
}

export function collectPublicDiscriminatedUnionVariantFields(
  sourceFile: ts.SourceFile,
): TypeScriptPublicDiscriminatedUnionVariantFieldFact[] {
  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isTypeAliasDeclaration(statement) || !isExported(statement)) {
      return [];
    }
    const unionMembers = unionTypeMembers(statement.type);
    if (unionMembers.length < 2) {
      return [];
    }
    const unionLine = locationForNode(sourceFile, statement).line;
    return unionMembers.flatMap((member) =>
      publicDiscriminatedUnionVariantFieldFacts(sourceFile, statement.name.text, unionLine, member),
    );
  });
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

function publicDiscriminatedUnionVariantFieldFacts(
  sourceFile: ts.SourceFile,
  unionName: string,
  unionLine: number,
  member: ts.TypeLiteralNode,
): readonly TypeScriptPublicDiscriminatedUnionVariantFieldFact[] {
  const discriminant = discriminantProperty(sourceFile, member);
  if (discriminant === undefined) {
    return [];
  }
  const variantLine = locationForNode(sourceFile, member).line;
  return member.members.flatMap((candidate) => {
    if (!ts.isPropertySignature(candidate)) {
      return [];
    }
    const fieldName = propertyNameText(candidate.name, sourceFile);
    if (fieldName === discriminant.name) {
      return [];
    }
    const typeInfo = typeContractInfo(candidate.type, sourceFile);
    if (typeInfo.primitiveContractType === undefined && typeInfo.flagContractType === undefined) {
      return [];
    }
    return [
      {
        unionName,
        unionLine,
        variantName: discriminant.value,
        variantLine,
        discriminantName: discriminant.name,
        fieldName,
        ...typeInfo,
        location: locationForNode(sourceFile, candidate),
        ...sourceLineField(sourceFile, candidate),
      },
    ];
  });
}

function unionTypeMembers(typeNode: ts.TypeNode): readonly ts.TypeLiteralNode[] {
  if (!ts.isUnionTypeNode(typeNode)) {
    return [];
  }
  return typeNode.types.flatMap((member) => {
    if (ts.isTypeLiteralNode(member)) {
      return [member];
    }
    if (ts.isParenthesizedTypeNode(member) && ts.isTypeLiteralNode(member.type)) {
      return [member.type];
    }
    return [];
  });
}

function discriminantProperty(
  sourceFile: ts.SourceFile,
  member: ts.TypeLiteralNode,
): { readonly name: string; readonly value: string } | undefined {
  for (const candidate of member.members) {
    if (!ts.isPropertySignature(candidate) || candidate.type === undefined) {
      continue;
    }
    const name = propertyNameText(candidate.name, sourceFile);
    if (!isDiscriminantFieldName(name)) {
      continue;
    }
    const value = stringLiteralTypeValue(candidate.type);
    if (value !== undefined) {
      return { name, value };
    }
  }
  return undefined;
}

function stringLiteralTypeValue(typeNode: ts.TypeNode): string | undefined {
  if (!ts.isLiteralTypeNode(typeNode)) {
    return undefined;
  }
  const literal = typeNode.literal;
  return ts.isStringLiteral(literal) || ts.isNoSubstitutionTemplateLiteral(literal)
    ? literal.text
    : undefined;
}

function isDiscriminantFieldName(name: string): boolean {
  return ["kind", "type", "status", "state", "mode", "phase", "tag", "category"].includes(name);
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
