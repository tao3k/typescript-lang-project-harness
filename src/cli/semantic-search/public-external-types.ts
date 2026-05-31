/**
 * Public API surfaces that expose external dependency types.
 */

import type {
  SourceLocation,
  TypeScriptHarnessReport,
  TypeScriptModuleReport,
  TypeScriptNativeImportResolutionFact,
  TypeScriptPublicAsyncEffectSurfaceFact,
  TypeScriptPublicDataFieldFact,
  TypeScriptPublicDiscriminatedUnionVariantFieldFact,
  TypeScriptPublicFunctionParamFact,
  TypeScriptPublicTupleApiSurfaceFact,
  TypeScriptPublicTypeAliasFact,
} from "../../model.js";
import { ownerNode } from "./facts.js";
import { dependencyManifestMatches, ownersForHits, packageRootFromSpecifier } from "./hits.js";
import { compareHitsByRecency } from "./recency.js";
import type {
  SemanticSearchBuildOptions,
  SemanticSearchHit,
  SemanticSearchNode,
  SemanticSearchPacketPayload,
} from "./types.js";
import { MAX_SYMBOL_HITS } from "./types.js";
import { locationFromSource, relPath } from "./utils.js";

interface PublicTypeSurface {
  readonly symbol: string;
  readonly apiKind: string;
  readonly surface: string;
  readonly typeText: string;
  readonly location: SourceLocation;
}

interface DependencyImportContext {
  readonly importFact: TypeScriptNativeImportResolutionFact;
  readonly moduleSpecifier: string;
}

const BUILTIN_TYPE_NAMES = new Set([
  "Array",
  "AsyncIterable",
  "BigInt",
  "Boolean",
  "Date",
  "Error",
  "Map",
  "NonNullable",
  "Omit",
  "Partial",
  "Pick",
  "Promise",
  "Readonly",
  "ReadonlyArray",
  "Record",
  "Required",
  "Set",
  "String",
  "Symbol",
  "Uint8Array",
]);

export function buildPublicExternalTypesPacketPayload(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacketPayload {
  const query = options.query ?? "";
  const packageRoot = packageRootFromSpecifier(query) ?? query.trim();
  const manifestMatches = packageRoot === "" ? [] : dependencyManifestMatches(report, packageRoot);
  const hits = packageRoot === "" ? [] : publicExternalTypeHits(report, packageRoot);
  const owners = ownersForHits(report, hits);
  return {
    header: {
      kind: "search-public-external-types",
      fields: {
        q: query,
        ...(packageRoot === "" ? {} : { package: packageRoot }),
        manifest: manifestMatches.length,
        own: owners.length,
        hit: hits.length,
        source: "native-parser",
        view: "hits",
      },
    },
    nodes: [
      ...(packageRoot === "" ? [] : [dependencyNode(packageRoot, manifestMatches.length, hits)]),
      ...owners.map((owner) => ownerNode(owner)),
    ],
    edges: [],
    owners,
    hits,
    findings: [],
    nextActions: [
      ...(packageRoot === "" ? [] : [{ kind: "dependency" as const, target: packageRoot }]),
      ...owners.slice(0, 5).map((owner) => ({ kind: "owner" as const, target: owner.path })),
      ...hits
        .filter((hit) => hit.symbol !== undefined)
        .slice(0, 5)
        .map((hit) => ({ kind: "api" as const, target: hit.symbol! })),
    ],
    notes: [
      ...(query.trim() === ""
        ? [
            {
              kind: "empty-query" as const,
              message: "public-external-types search requires a dependency package query",
            },
          ]
        : []),
      ...(query.trim() !== "" && hits.length === 0
        ? [
            {
              kind: "not-found" as const,
              message: `public external type surfaces not found: ${query}`,
            },
          ]
        : []),
      {
        kind: "fact-scope" as const,
        message:
          "public-external-types uses parser-owned public function, async/effect, tuple, and available public data/type-boundary facts; named import binding attribution is not yet available, so owner-import matches are possible not confirmed",
      },
    ],
  };
}

function publicExternalTypeHits(
  report: TypeScriptHarnessReport,
  packageRoot: string,
): readonly SemanticSearchHit[] {
  return report.modules
    .flatMap((moduleReport) => publicExternalTypeModuleHits(report, moduleReport, packageRoot))
    .sort(comparePublicExternalTypeHits(report))
    .slice(0, MAX_SYMBOL_HITS);
}

function publicExternalTypeModuleHits(
  report: TypeScriptHarnessReport,
  moduleReport: TypeScriptModuleReport,
  packageRoot: string,
): readonly SemanticSearchHit[] {
  const imports = externalImportsForDependency(moduleReport, packageRoot);
  const moduleSpecifiers = uniqueStrings(imports.map((candidate) => candidate.moduleSpecifier));
  return publicTypeSurfaces(moduleReport).flatMap((surface) =>
    publicExternalTypeHit(report, moduleReport, surface, packageRoot, moduleSpecifiers, imports),
  );
}

function publicExternalTypeHit(
  report: TypeScriptHarnessReport,
  moduleReport: TypeScriptModuleReport,
  surface: PublicTypeSurface,
  packageRoot: string,
  moduleSpecifiers: readonly string[],
  imports: readonly DependencyImportContext[],
): readonly SemanticSearchHit[] {
  const directSpecifier = directDependencyTypeSpecifier(
    surface.typeText,
    packageRoot,
    moduleSpecifiers,
  );
  const direct = directSpecifier !== undefined;
  if (!direct && (imports.length === 0 || !hasCustomTypeReference(surface.typeText))) {
    return [];
  }
  const importContext = direct
    ? (imports.find((candidate) => candidate.moduleSpecifier === directSpecifier) ?? imports[0])
    : imports[0];
  return [
    {
      kind: "api" as const,
      ownerPath: relPath(report, moduleReport.path),
      symbol: surface.symbol,
      location: locationFromSource(report, surface.location),
      score: direct ? 9 : 4,
      reason: direct ? "public-external-type" : "possible-public-external-type",
      fields: {
        source: "native-parser",
        dependency: packageRoot,
        confidence: direct ? "direct" : "possible",
        apiKind: surface.apiKind,
        surface: surface.surface,
        typeText: surface.typeText,
        ...(directSpecifier === undefined ? {} : { moduleSpecifier: directSpecifier }),
        ...(importContext === undefined
          ? {}
          : {
              importSpecifier: importContext.moduleSpecifier,
              importKind: importContext.importFact.kind,
              typeOnly: importContext.importFact.isTypeOnly,
            }),
      },
    },
  ];
}

function externalImportsForDependency(
  moduleReport: TypeScriptModuleReport,
  packageRoot: string,
): readonly DependencyImportContext[] {
  return moduleReport.importResolutions.flatMap((importFact) => {
    if (importFact.resolution !== "external") return [];
    if (packageRootFromSpecifier(importFact.moduleSpecifier) !== packageRoot) return [];
    return [{ importFact, moduleSpecifier: importFact.moduleSpecifier }];
  });
}

function publicTypeSurfaces(moduleReport: TypeScriptModuleReport): readonly PublicTypeSurface[] {
  return [
    ...moduleReport.publicFunctionParams.flatMap(functionParamSurface),
    ...moduleReport.publicAsyncEffectSurfaces.flatMap(asyncEffectSurfaces),
    ...moduleReport.publicDataFields.flatMap(dataFieldSurface),
    ...moduleReport.publicTupleApiSurfaces.map(tupleApiSurface),
    ...moduleReport.publicTypeAliases.map(typeAliasSurface),
    ...moduleReport.publicDiscriminatedUnionVariantFields.flatMap(discriminatedUnionFieldSurface),
  ];
}

function functionParamSurface(
  param: TypeScriptPublicFunctionParamFact,
): readonly PublicTypeSurface[] {
  if (param.typeText === undefined) return [];
  return [
    {
      symbol: param.functionName,
      apiKind: "function",
      surface: `param:${param.paramName}`,
      typeText: param.typeText,
      location: param.location,
    },
  ];
}

function asyncEffectSurfaces(
  surface: TypeScriptPublicAsyncEffectSurfaceFact,
): readonly PublicTypeSurface[] {
  return [
    typedSurface(surface.returnTypeText, surface, "function", "return", surface.functionName),
    typedSurface(surface.successTypeText, surface, "function", "success", surface.functionName),
    typedSurface(surface.errorTypeText, surface, "function", "error", surface.functionName),
    typedSurface(
      surface.requirementsTypeText,
      surface,
      "function",
      "requirements",
      surface.functionName,
    ),
  ].filter((candidate): candidate is PublicTypeSurface => candidate !== undefined);
}

function dataFieldSurface(field: TypeScriptPublicDataFieldFact): readonly PublicTypeSurface[] {
  if (field.typeText === undefined) return [];
  return [
    {
      symbol: field.typeName,
      apiKind: field.typeKind,
      surface: `field:${field.fieldName}`,
      typeText: field.typeText,
      location: field.location,
    },
  ];
}

function tupleApiSurface(surface: TypeScriptPublicTupleApiSurfaceFact): PublicTypeSurface {
  return {
    symbol: surface.functionName,
    apiKind: "tuple",
    surface: surface.surfaceName,
    typeText: surface.typeText,
    location: surface.location,
  };
}

function typeAliasSurface(alias: TypeScriptPublicTypeAliasFact): PublicTypeSurface {
  return {
    symbol: alias.aliasName,
    apiKind: "type",
    surface: "alias",
    typeText: alias.targetTypeText,
    location: alias.location,
  };
}

function discriminatedUnionFieldSurface(
  field: TypeScriptPublicDiscriminatedUnionVariantFieldFact,
): readonly PublicTypeSurface[] {
  if (field.typeText === undefined) return [];
  return [
    {
      symbol: field.unionName,
      apiKind: "union",
      surface: `variant:${field.variantName}.${field.fieldName}`,
      typeText: field.typeText,
      location: field.location,
    },
  ];
}

function typedSurface(
  typeText: string | undefined,
  locationOwner: { readonly location: SourceLocation },
  apiKind: string,
  surface: string,
  symbol: string,
): PublicTypeSurface | undefined {
  if (typeText === undefined) return undefined;
  return {
    symbol,
    apiKind,
    surface,
    typeText,
    location: locationOwner.location,
  };
}

function directDependencyTypeSpecifier(
  typeText: string,
  packageRoot: string,
  moduleSpecifiers: readonly string[],
): string | undefined {
  const specifiers = [...uniqueStrings([packageRoot, ...moduleSpecifiers])].sort(
    (left, right) => right.length - left.length,
  );
  return specifiers.find((specifier) => typeTextDirectlyMentionsSpecifier(typeText, specifier));
}

function typeTextDirectlyMentionsSpecifier(typeText: string, specifier: string): boolean {
  return importTypeExpressionPattern(specifier).test(typeText);
}

function importTypeExpressionPattern(specifier: string): RegExp {
  return new RegExp(`\\bimport\\(\\s*["']${escapeRegExp(specifier)}["']\\s*\\)`, "u");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function hasCustomTypeReference(typeText: string): boolean {
  const identifiers = typeText.match(/\b[A-Z][A-Za-z0-9_]*\b/gu) ?? [];
  return identifiers.some((identifier) => !BUILTIN_TYPE_NAMES.has(identifier));
}

function dependencyNode(
  packageRoot: string,
  manifestCount: number,
  hits: readonly SemanticSearchHit[],
): SemanticSearchNode {
  return {
    id: `C:${packageRoot}`,
    kind: "dependency",
    fields: {
      dependency: packageRoot,
      manifest: manifestCount,
      publicExternalTypes: hits.length,
      possible: hits.filter((hit) => hit.fields?.confidence === "possible").length,
      confirmed: hits.filter((hit) => hit.fields?.confidence === "direct").length,
      source: "native-parser",
    },
  };
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function comparePublicExternalTypeHits(
  report: TypeScriptHarnessReport,
): (left: SemanticSearchHit, right: SemanticSearchHit) => number {
  return (left, right) => {
    const scoreDiff = right.score - left.score;
    if (scoreDiff !== 0) return scoreDiff;
    const recencyDiff = compareHitsByRecency(report.reasoningTree.projectRoot, left, right);
    if (recencyDiff !== 0) return recencyDiff;
    return `${left.location.line ?? 0}:${left.symbol ?? ""}:${left.fields?.surface ?? ""}`.localeCompare(
      `${right.location.line ?? 0}:${right.symbol ?? ""}:${right.fields?.surface ?? ""}`,
    );
  };
}
