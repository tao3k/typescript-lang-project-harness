import ts from "typescript";

import type {
  TypeScriptPublicFunctionParamFact,
  TypeScriptPublicTupleApiSurfaceFact,
} from "../../model.js";
import { locationForNode } from "../diagnostics.js";
import {
  bindingNameText,
  publicFunctionLikeDeclarations,
  sourceLineField,
  tupleContractTypes,
  typeContractInfo,
} from "./helpers.js";

export function collectPublicFunctionParams(
  sourceFile: ts.SourceFile,
): TypeScriptPublicFunctionParamFact[] {
  return publicFunctionLikeDeclarations(sourceFile).flatMap(({ node, name }) => {
    const functionLine = locationForNode(sourceFile, node).line;
    return node.parameters.map((parameter) => {
      const typeInfo = typeContractInfo(parameter.type, sourceFile);
      return {
        functionName: name,
        functionLine,
        paramName: bindingNameText(parameter.name, sourceFile),
        ...typeInfo,
        location: locationForNode(sourceFile, parameter),
        ...sourceLineField(sourceFile, parameter),
      };
    });
  });
}

export function collectPublicTupleApiSurfaces(
  sourceFile: ts.SourceFile,
): TypeScriptPublicTupleApiSurfaceFact[] {
  return publicFunctionLikeDeclarations(sourceFile).flatMap(({ node, name }) => {
    const functionLine = locationForNode(sourceFile, node).line;
    const params = node.parameters.flatMap((parameter) => {
      const elementContractTypes = tupleContractTypes(parameter.type, sourceFile);
      if (elementContractTypes.length < 2 || parameter.type === undefined) {
        return [];
      }
      return [
        {
          functionName: name,
          functionLine,
          surfaceName: `parameter \`${bindingNameText(parameter.name, sourceFile)}\``,
          typeText: parameter.type.getText(sourceFile),
          elementContractTypes,
          location: locationForNode(sourceFile, parameter),
          ...sourceLineField(sourceFile, parameter),
        },
      ];
    });
    const returnType = node.type;
    const returnElementContractTypes = tupleContractTypes(returnType, sourceFile);
    const returns =
      returnType === undefined || returnElementContractTypes.length < 2
        ? []
        : [
            {
              functionName: name,
              functionLine,
              surfaceName: "return value",
              typeText: returnType.getText(sourceFile),
              elementContractTypes: returnElementContractTypes,
              location: locationForNode(sourceFile, node.name ?? node),
              ...sourceLineField(sourceFile, node),
            },
          ];
    return [...params, ...returns];
  });
}
