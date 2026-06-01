/**
 * Parser-owned API fact projection for the semantic-search api view.
 */

import type {
  TypeScriptHarnessReport,
  TypeScriptModuleReport,
  TypeScriptPublicAsyncEffectSurfaceFact,
  TypeScriptPublicDataFieldFact,
  TypeScriptPublicFunctionControlFlowFact,
  TypeScriptPublicFunctionParamFact,
  TypeScriptPublicTupleApiSurfaceFact,
} from "../../model.js";
import {
  dependencyApiNode,
  dependencyVersionScope,
  dependencyVersionStatus,
  dependencyWorkspaceVersion,
  parseDependencyApiQuery,
} from "./deps.js";
import { ownerNode } from "./facts.js";
import { dependencyManifestMatches, ownersForHits } from "./hits.js";
import type {
  SemanticSearchBuildOptions,
  SemanticSearchFields,
  SemanticSearchHit,
  SemanticSearchLocation,
  SemanticSearchPacketPayload,
} from "./types.js";
import { MAX_SYMBOL_HITS } from "./types.js";
import { compareHitsByRecency } from "./recency.js";
import { locationFromSource, relPath } from "./utils.js";

const MAX_API_SHAPE_FIELDS = 32;

export function buildApiPacketPayload(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacketPayload {
  const queryText = options.query ?? "";
  const dependencyQuery = queryText.includes("::") ? parseDependencyApiQuery(queryText) : undefined;
  const manifestMatches =
    dependencyQuery === undefined
      ? []
      : dependencyManifestMatches(report, dependencyQuery.packageRoot);
  const workspaceVersion =
    dependencyQuery === undefined
      ? {}
      : dependencyWorkspaceVersion(report, dependencyQuery.packageRoot, manifestMatches);
  const versionStatus =
    dependencyQuery === undefined
      ? "unknown"
      : dependencyVersionStatus(dependencyQuery, manifestMatches, workspaceVersion);
  const versionScope = dependencyVersionScope(versionStatus);
  const apiQuery = dependencyQuery?.apiQuery ?? (dependencyQuery === undefined ? queryText : "");
  const canUseLocalParserFacts = dependencyQuery === undefined;
  const hits = canUseLocalParserFacts ? apiHits(report, apiQuery) : [];
  const owners = ownersForHits(report, hits);
  return {
    header: {
      kind: "search-api",
      fields: {
        q: queryText,
        ...(apiQuery.trim() === "" ? {} : { api: apiQuery }),
        own: owners.length,
        hit: hits.length,
        source: canUseLocalParserFacts ? "native-parser" : "external-provider-missing",
        ...(dependencyQuery === undefined ? {} : { package: dependencyQuery.packageRoot }),
        ...(dependencyQuery?.requestedVersion === undefined
          ? {}
          : { requestedVersion: dependencyQuery.requestedVersion }),
        ...(workspaceVersion.currentWorkspaceVersion === undefined
          ? {}
          : { currentWorkspaceVersion: workspaceVersion.currentWorkspaceVersion }),
        ...(workspaceVersion.workspaceVersionSource === undefined
          ? {}
          : { workspaceVersionSource: workspaceVersion.workspaceVersionSource }),
        ...(dependencyQuery === undefined ? {} : { versionStatus, versionScope }),
        view: "hits",
      },
    },
    nodes: [
      ...(dependencyQuery === undefined
        ? []
        : [
            dependencyApiNode(
              dependencyQuery,
              manifestMatches,
              [],
              workspaceVersion,
              versionStatus,
              versionScope,
            ),
          ]),
      ...owners.map((owner) => ownerNode(owner)),
    ],
    edges: [],
    owners,
    hits,
    findings: [],
    nextActions: [
      ...(dependencyQuery === undefined
        ? []
        : [{ kind: "dependency" as const, target: dependencyQuery.packageRoot }]),
      ...owners.slice(0, 5).map((owner) => ({ kind: "owner" as const, target: owner.path })),
      ...(apiQuery.trim() === ""
        ? []
        : [
            { kind: "text" as const, target: apiQuery },
            { kind: "tests" as const, target: apiQuery },
          ]),
    ],
    notes: [
      ...(queryText.trim() === ""
        ? [{ kind: "empty-query" as const, message: "api search requires an API query" }]
        : []),
      ...(dependencyQuery !== undefined
        ? [
            {
              kind: "fact-scope" as const,
              message:
                "dependency-prefixed API queries require an external docs/API provider; TypeScript api search does not present current workspace parser facts as dependency-version docs",
            },
          ]
        : []),
      ...(queryText.trim() !== "" && hits.length === 0
        ? [
            {
              kind: "not-found" as const,
              message: `parser-owned API facts not found: ${queryText}`,
            },
          ]
        : []),
      {
        kind: "fact-scope" as const,
        message:
          "api view projects parser-owned exported API facts; docs prose and external dependency API docs require a separate provider",
      },
    ],
  };
}

function apiHits(report: TypeScriptHarnessReport, query: string): readonly SemanticSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  return report.modules
    .flatMap((moduleReport) => [
      ...exportApiHits(report, moduleReport, needle),
      ...functionApiHits(report, moduleReport, needle),
      ...returnShapeApiHits(report, moduleReport, needle),
      ...dataApiHits(report, moduleReport, needle),
      ...tupleApiHits(report, moduleReport, needle),
    ])
    .sort((left, right) => compareApiHits(report, left, right))
    .slice(0, MAX_SYMBOL_HITS);
}

function exportApiHits(
  report: TypeScriptHarnessReport,
  moduleReport: TypeScriptModuleReport,
  needle: string,
): readonly SemanticSearchHit[] {
  return moduleReport.exports
    .filter((exportFact) =>
      matchesNeedle(needle, [exportFact.name, exportFact.kind, relPath(report, moduleReport.path)]),
    )
    .map((exportFact) => ({
      kind: "api" as const,
      ownerPath: relPath(report, moduleReport.path),
      symbol: exportFact.name,
      location: locationFromSource(report, exportFact.location),
      score: exportFact.name.toLowerCase() === needle ? 12 : 7,
      reason: "exported-api",
      fields: {
        source: "native-parser",
        apiKind: exportFact.kind,
        typeOnly: exportFact.isTypeOnly,
      },
    }));
}

function functionApiHits(
  report: TypeScriptHarnessReport,
  moduleReport: TypeScriptModuleReport,
  needle: string,
): readonly SemanticSearchHit[] {
  return groupedFunctionParams(moduleReport.publicFunctionParams)
    .flatMap((params) => functionApiHit(report, moduleReport, params, needle))
    .concat(
      moduleReport.publicAsyncEffectSurfaces.flatMap((surface) =>
        asyncSurfaceApiHit(report, moduleReport, surface, needle),
      ),
    );
}

function functionApiHit(
  report: TypeScriptHarnessReport,
  moduleReport: TypeScriptModuleReport,
  params: readonly TypeScriptPublicFunctionParamFact[],
  needle: string,
): readonly SemanticSearchHit[] {
  const first = params[0];
  if (first === undefined) return [];
  const controlFlow = moduleReport.publicFunctionControlFlows.find(
    (candidate) => candidate.functionName === first.functionName,
  );
  if (
    !matchesNeedle(needle, [
      first.functionName,
      ...params.flatMap((param) => [param.paramName, param.typeText ?? ""]),
    ])
  ) {
    return [];
  }
  return [
    {
      kind: "api" as const,
      ownerPath: relPath(report, moduleReport.path),
      symbol: first.functionName,
      location: functionLocation(report, controlFlow, first),
      score: first.functionName.toLowerCase() === needle ? 10 : 5,
      reason: "public-function-api",
      fields: {
        source: "native-parser",
        apiKind: "function",
        params: params.map(renderParam).slice(0, 8),
        paramCount: params.length,
        ...controlFlowFields(controlFlow),
      },
    },
  ];
}

function asyncSurfaceApiHit(
  report: TypeScriptHarnessReport,
  moduleReport: TypeScriptModuleReport,
  surface: TypeScriptPublicAsyncEffectSurfaceFact,
  needle: string,
): readonly SemanticSearchHit[] {
  if (
    !matchesNeedle(needle, [
      surface.functionName,
      surface.returnTypeText ?? "",
      surface.successTypeText ?? "",
      surface.errorTypeText ?? "",
      surface.requirementsTypeText ?? "",
    ])
  ) {
    return [];
  }
  return [
    {
      kind: "api" as const,
      ownerPath: relPath(report, moduleReport.path),
      symbol: surface.functionName,
      location: locationFromSource(report, surface.location),
      score: surface.functionName.toLowerCase() === needle ? 9 : 4,
      reason: "public-async-api",
      fields: {
        source: "native-parser",
        apiKind: "function",
        async: surface.isAsync,
        returnsPromise: surface.returnsPromise,
        returnsEffect: surface.returnsEffect,
        ...(surface.returnTypeText === undefined ? {} : { returnType: surface.returnTypeText }),
        ...(surface.successTypeText === undefined ? {} : { successType: surface.successTypeText }),
        ...(surface.errorTypeText === undefined ? {} : { errorType: surface.errorTypeText }),
        ...(surface.errorChannelKind === undefined
          ? {}
          : { errorChannel: surface.errorChannelKind }),
        ...(surface.requirementsTypeText === undefined
          ? {}
          : { requirementsType: surface.requirementsTypeText }),
      },
    },
  ];
}

function returnShapeApiHits(
  report: TypeScriptHarnessReport,
  moduleReport: TypeScriptModuleReport,
  needle: string,
): readonly SemanticSearchHit[] {
  return moduleReport.publicReturnObjectShapes
    .filter((shape) =>
      matchesNeedle(needle, [shape.functionName, ...shape.fields, ...shape.spreads]),
    )
    .map((shape) => ({
      kind: "api" as const,
      ownerPath: relPath(report, moduleReport.path),
      symbol: shape.functionName,
      location: locationFromSource(report, shape.location),
      score: shape.functionName.toLowerCase() === needle ? 8 : 4,
      reason: "api-return-shape",
      fields: {
        source: "native-parser",
        apiKind: "function",
        returns: "object",
        fields: shape.fields.slice(0, MAX_API_SHAPE_FIELDS),
        fieldCount: shape.fields.length,
        ...(shape.spreads.length === 0
          ? {}
          : { spreads: shape.spreads.slice(0, MAX_API_SHAPE_FIELDS) }),
        spreadCount: shape.spreads.length,
      },
    }));
}

function dataApiHits(
  report: TypeScriptHarnessReport,
  moduleReport: TypeScriptModuleReport,
  needle: string,
): readonly SemanticSearchHit[] {
  return groupedDataFields(moduleReport.publicDataFields).flatMap((fields) =>
    dataApiHit(report, moduleReport, fields, needle),
  );
}

function dataApiHit(
  report: TypeScriptHarnessReport,
  moduleReport: TypeScriptModuleReport,
  fields: readonly TypeScriptPublicDataFieldFact[],
  needle: string,
): readonly SemanticSearchHit[] {
  const first = fields[0];
  if (first === undefined) return [];
  if (
    !matchesNeedle(needle, [
      first.typeName,
      first.typeKind,
      ...fields.flatMap((field) => [field.fieldName, field.typeText ?? ""]),
    ])
  ) {
    return [];
  }
  return [
    {
      kind: "api" as const,
      ownerPath: relPath(report, moduleReport.path),
      symbol: first.typeName,
      location: locationFromSource(report, first.location),
      score: first.typeName.toLowerCase() === needle ? 9 : 4,
      reason: "public-data-api",
      fields: {
        source: "native-parser",
        apiKind: first.typeKind,
        fields: fields.map(renderField).slice(0, 8),
        fieldCount: fields.length,
      },
    },
  ];
}

function tupleApiHits(
  report: TypeScriptHarnessReport,
  moduleReport: TypeScriptModuleReport,
  needle: string,
): readonly SemanticSearchHit[] {
  return moduleReport.publicTupleApiSurfaces.flatMap((surface) =>
    tupleApiHit(report, moduleReport, surface, needle),
  );
}

function tupleApiHit(
  report: TypeScriptHarnessReport,
  moduleReport: TypeScriptModuleReport,
  surface: TypeScriptPublicTupleApiSurfaceFact,
  needle: string,
): readonly SemanticSearchHit[] {
  if (!matchesNeedle(needle, [surface.functionName, surface.surfaceName, surface.typeText])) {
    return [];
  }
  return [
    {
      kind: "api" as const,
      ownerPath: relPath(report, moduleReport.path),
      symbol: surface.functionName,
      location: locationFromSource(report, surface.location),
      score: surface.functionName.toLowerCase() === needle ? 8 : 4,
      reason: "public-tuple-api",
      fields: {
        source: "native-parser",
        apiKind: "tuple",
        surface: surface.surfaceName,
        typeText: surface.typeText,
        elementContracts: surface.elementContractTypes,
      },
    },
  ];
}

function groupedFunctionParams(
  params: readonly TypeScriptPublicFunctionParamFact[],
): readonly (readonly TypeScriptPublicFunctionParamFact[])[] {
  const groups = new Map<string, TypeScriptPublicFunctionParamFact[]>();
  for (const param of params) {
    const group = groups.get(param.functionName) ?? [];
    group.push(param);
    groups.set(param.functionName, group);
  }
  return [...groups.values()];
}

function groupedDataFields(
  fields: readonly TypeScriptPublicDataFieldFact[],
): readonly (readonly TypeScriptPublicDataFieldFact[])[] {
  const groups = new Map<string, TypeScriptPublicDataFieldFact[]>();
  for (const field of fields) {
    const key = `${field.typeKind}:${field.typeName}`;
    const group = groups.get(key) ?? [];
    group.push(field);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function functionLocation(
  report: TypeScriptHarnessReport,
  controlFlow: TypeScriptPublicFunctionControlFlowFact | undefined,
  firstParam: TypeScriptPublicFunctionParamFact,
): SemanticSearchLocation {
  return locationFromSource(report, controlFlow?.location ?? firstParam.location);
}

function controlFlowFields(
  controlFlow: TypeScriptPublicFunctionControlFlowFact | undefined,
): SemanticSearchFields {
  if (controlFlow === undefined) return {};
  return {
    lineSpan: controlFlow.lineSpan,
    statements: controlFlow.statementCount,
    branches: controlFlow.branchCount,
    loops: controlFlow.loopCount,
    maxNesting: controlFlow.maxNestingDepth,
  };
}

function renderParam(param: TypeScriptPublicFunctionParamFact): string {
  return `${param.paramName}:${param.typeText ?? "unknown"}`;
}

function renderField(field: TypeScriptPublicDataFieldFact): string {
  return `${field.fieldName}:${field.typeText ?? "unknown"}`;
}

function matchesNeedle(needle: string, values: readonly string[]): boolean {
  return values.some((value) => value.toLowerCase().includes(needle));
}

function compareApiHits(
  report: TypeScriptHarnessReport,
  left: SemanticSearchHit,
  right: SemanticSearchHit,
): number {
  const scoreDiff = right.score - left.score;
  if (scoreDiff !== 0) return scoreDiff;
  const recencyDiff = compareHitsByRecency(report.reasoningTree.projectRoot, left, right);
  if (recencyDiff !== 0) return recencyDiff;
  return `${left.location.line ?? 0}:${left.symbol ?? ""}`.localeCompare(
    `${right.location.line ?? 0}:${right.symbol ?? ""}`,
  );
}
