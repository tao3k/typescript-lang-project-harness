import ts from "typescript";

import type {
  TypeScriptEffectPromiseInteropRiskFact,
  TypeScriptEffectPromiseInteropRiskKind,
  TypeScriptEffectRuntimeCallFact,
  TypeScriptEffectRuntimeCallKind,
  TypeScriptEffectServiceContainerKind,
  TypeScriptEffectServiceMethodFact,
} from "../../model.js";
import { locationForNode } from "../diagnostics.js";
import { effectTypeParts } from "./effect_type.js";
import {
  bindingNameText,
  isExported,
  isPublicClassMember,
  propertyNameText,
  publicFunctionLikeDeclarations,
  sourceLineField,
} from "./helpers.js";

const EFFECT_RUN_METHODS = new Set([
  "runPromise",
  "runPromiseExit",
  "runSync",
  "runSyncExit",
  "runFork",
]);

export function collectEffectRuntimeCalls(
  sourceFile: ts.SourceFile,
): TypeScriptEffectRuntimeCallFact[] {
  const calls: TypeScriptEffectRuntimeCallFact[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const call = effectRuntimeCall(node, sourceFile);
      if (call !== undefined) {
        calls.push(call);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return calls;
}

export function collectEffectPromiseInteropRisks(
  sourceFile: ts.SourceFile,
): TypeScriptEffectPromiseInteropRiskFact[] {
  return [
    ...publicFunctionLikeDeclarations(sourceFile).flatMap(({ node, name }) =>
      effectPromiseInteropRisksForOwner(name, node, sourceFile),
    ),
    ...exportedValueOwners(sourceFile).flatMap(({ node, name }) =>
      effectPromiseInteropRisksForOwner(name, node, sourceFile),
    ),
  ];
}

export function collectEffectServiceMethods(
  sourceFile: ts.SourceFile,
): TypeScriptEffectServiceMethodFact[] {
  return sourceFile.statements.flatMap((statement) => {
    if (ts.isInterfaceDeclaration(statement) && isExported(statement)) {
      return serviceMethodsFromMembers(
        "interface",
        statement.name.text,
        statement.members,
        sourceFile,
      );
    }
    if (ts.isTypeAliasDeclaration(statement) && isExported(statement)) {
      return serviceMethodsFromTypeNode("type", statement.name.text, statement.type, sourceFile);
    }
    if (ts.isClassDeclaration(statement) && isExported(statement)) {
      const className = statement.name?.text ?? "default";
      return [
        ...serviceMethodsFromClass(className, statement, sourceFile),
        ...effectTagServiceMethodsFromClass(className, statement, sourceFile),
      ];
    }
    return [];
  });
}

function effectRuntimeCall(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
): TypeScriptEffectRuntimeCallFact | undefined {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return undefined;
  }
  const methodName = node.expression.name.text;
  if (!EFFECT_RUN_METHODS.has(methodName)) {
    return undefined;
  }
  const receiver = node.expression.expression;
  const callKind = effectRuntimeCallKind(receiver);
  if (callKind === undefined) {
    return undefined;
  }
  return {
    callee: `${receiver.getText(sourceFile)}.${methodName}`,
    callKind,
    location: locationForNode(sourceFile, node.expression.name),
    ...sourceLineField(sourceFile, node),
  };
}

function effectRuntimeCallKind(
  receiver: ts.Expression,
): TypeScriptEffectRuntimeCallKind | undefined {
  if (ts.isIdentifier(receiver)) {
    if (receiver.text === "Effect") {
      return "default-runtime";
    }
    if (receiver.text === "Runtime") {
      return "runtime-module";
    }
    return isRuntimeInstanceName(receiver.text) ? "runtime-instance" : undefined;
  }
  if (ts.isPropertyAccessExpression(receiver)) {
    const terminal = expressionNameParts(receiver).at(-1);
    return terminal !== undefined && isRuntimeInstanceName(terminal)
      ? "runtime-instance"
      : undefined;
  }
  return undefined;
}

function effectPromiseInteropRisksForOwner(
  ownerName: string,
  ownerNode: ts.Node,
  sourceFile: ts.SourceFile,
): TypeScriptEffectPromiseInteropRiskFact[] {
  const ownerLine = locationForNode(sourceFile, ownerNode).line;
  const risks: TypeScriptEffectPromiseInteropRiskFact[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const risk = effectPromiseInteropRisk(ownerName, ownerLine, node, sourceFile);
      if (risk !== undefined) {
        risks.push(risk);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ownerNode);
  return risks;
}

function effectPromiseInteropRisk(
  ownerName: string,
  ownerLine: number,
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
): TypeScriptEffectPromiseInteropRiskFact | undefined {
  if (!effectConstructorCall(node, "promise")) {
    return undefined;
  }
  const callback = node.arguments[0];
  const riskKinds = promiseCallbackRiskKinds(callback);
  if (riskKinds.length === 0) {
    return undefined;
  }
  return {
    ownerName,
    ownerLine,
    constructorName: "Effect.promise",
    riskKinds,
    location: locationForNode(sourceFile, node.expression),
    ...sourceLineField(sourceFile, node),
  };
}

function serviceMethodsFromClass(
  className: string,
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
): TypeScriptEffectServiceMethodFact[] {
  return node.members.flatMap((member) => {
    if (!ts.isMethodDeclaration(member) || !isPublicClassMember(member)) {
      return [];
    }
    return serviceMethodFromReturnType(
      "class",
      className,
      propertyNameText(member.name, sourceFile),
      member.type,
      member.name,
      sourceFile,
    );
  });
}

function effectTagServiceMethodsFromClass(
  className: string,
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
): TypeScriptEffectServiceMethodFact[] {
  if (!classExtendsEffectTag(node)) {
    return [];
  }
  return (node.heritageClauses ?? []).flatMap((heritageClause) =>
    typeLiteralDescendants(heritageClause).flatMap((typeLiteral) =>
      serviceMethodsFromMembers("effect-tag", className, typeLiteral.members, sourceFile),
    ),
  );
}

function serviceMethodsFromTypeNode(
  containerKind: TypeScriptEffectServiceContainerKind,
  containerName: string,
  typeNode: ts.TypeNode,
  sourceFile: ts.SourceFile,
): TypeScriptEffectServiceMethodFact[] {
  if (ts.isTypeLiteralNode(typeNode)) {
    return serviceMethodsFromMembers(containerKind, containerName, typeNode.members, sourceFile);
  }
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return serviceMethodsFromTypeNode(containerKind, containerName, typeNode.type, sourceFile);
  }
  return [];
}

function exportedValueOwners(
  sourceFile: ts.SourceFile,
): Array<{ readonly node: ts.Expression; readonly name: string }> {
  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isVariableStatement(statement) || !isExported(statement)) {
      return [];
    }
    return statement.declarationList.declarations.flatMap((declaration) => {
      const initializer = declaration.initializer;
      if (
        initializer === undefined ||
        ts.isArrowFunction(initializer) ||
        ts.isFunctionExpression(initializer)
      ) {
        return [];
      }
      return [{ node: initializer, name: bindingNameText(declaration.name, sourceFile) }];
    });
  });
}

function promiseCallbackRiskKinds(
  node: ts.Node | undefined,
): readonly TypeScriptEffectPromiseInteropRiskKind[] {
  if (node === undefined) {
    return [];
  }
  const risks = new Set<TypeScriptEffectPromiseInteropRiskKind>();
  if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    if (hasAsyncModifier(node)) {
      risks.add("async-callback");
    }
  }
  const visit = (child: ts.Node): void => {
    if (ts.isThrowStatement(child)) {
      risks.add("throw");
    }
    if (ts.isCallExpression(child) && promiseRejectCall(child)) {
      risks.add("promise-reject");
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return [...risks].sort();
}

function effectConstructorCall(node: ts.CallExpression, methodName: string): boolean {
  const expression = node.expression;
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === methodName &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "Effect"
  );
}

function promiseRejectCall(node: ts.CallExpression): boolean {
  const expression = node.expression;
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === "reject" &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "Promise"
  );
}

function hasAsyncModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ??
      false)
  );
}

function serviceMethodsFromMembers(
  containerKind: TypeScriptEffectServiceContainerKind,
  containerName: string,
  members: ts.NodeArray<ts.TypeElement>,
  sourceFile: ts.SourceFile,
): TypeScriptEffectServiceMethodFact[] {
  return members.flatMap((member) => {
    if (ts.isMethodSignature(member)) {
      return serviceMethodFromReturnType(
        containerKind,
        containerName,
        propertyNameText(member.name, sourceFile),
        member.type,
        member.name,
        sourceFile,
      );
    }
    if (ts.isPropertySignature(member) && member.type !== undefined) {
      return serviceMethodFromPropertyType(
        containerKind,
        containerName,
        propertyNameText(member.name, sourceFile),
        member.type,
        member.name,
        sourceFile,
      );
    }
    return [];
  });
}

function serviceMethodFromPropertyType(
  containerKind: TypeScriptEffectServiceContainerKind,
  containerName: string,
  methodName: string,
  typeNode: ts.TypeNode,
  locationNode: ts.Node,
  sourceFile: ts.SourceFile,
): TypeScriptEffectServiceMethodFact[] {
  if (ts.isFunctionTypeNode(typeNode)) {
    return serviceMethodFromReturnType(
      containerKind,
      containerName,
      methodName,
      typeNode.type,
      locationNode,
      sourceFile,
    );
  }
  return serviceMethodFromReturnType(
    containerKind,
    containerName,
    methodName,
    typeNode,
    locationNode,
    sourceFile,
  );
}

function serviceMethodFromReturnType(
  containerKind: TypeScriptEffectServiceContainerKind,
  containerName: string,
  methodName: string,
  returnType: ts.TypeNode | undefined,
  locationNode: ts.Node,
  sourceFile: ts.SourceFile,
): TypeScriptEffectServiceMethodFact[] {
  const effectType = effectTypeParts(returnType, sourceFile);
  if (returnType === undefined || effectType === undefined) {
    return [];
  }
  return [
    {
      containerKind,
      containerName,
      methodName,
      returnTypeText: returnType.getText(sourceFile),
      ...effectType,
      location: locationForNode(sourceFile, locationNode),
      ...sourceLineField(sourceFile, locationNode),
    },
  ];
}

function classExtendsEffectTag(node: ts.ClassDeclaration): boolean {
  return (node.heritageClauses ?? []).some((heritageClause) => {
    let found = false;
    const visit = (child: ts.Node): void => {
      if (found) {
        return;
      }
      if (
        ts.isPropertyAccessExpression(child) &&
        expressionNameParts(child).join(".") === "Effect.Tag"
      ) {
        found = true;
        return;
      }
      ts.forEachChild(child, visit);
    };
    visit(heritageClause);
    return found;
  });
}

function isRuntimeInstanceName(name: string): boolean {
  const lowerName = name.toLowerCase();
  return lowerName === "runtime" || lowerName.endsWith("runtime");
}

function typeLiteralDescendants(node: ts.Node): ts.TypeLiteralNode[] {
  const descendants: ts.TypeLiteralNode[] = [];
  const visit = (child: ts.Node): void => {
    if (ts.isTypeLiteralNode(child)) {
      descendants.push(child);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return descendants;
}

function expressionNameParts(expression: ts.Expression): readonly string[] {
  if (ts.isIdentifier(expression)) {
    return [expression.text];
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return [...expressionNameParts(expression.expression), expression.name.text];
  }
  return [];
}
