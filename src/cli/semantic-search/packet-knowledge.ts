/**
 * Provider-owned language and ecosystem knowledge search axes.
 */

import fs from "node:fs";
import path from "node:path";

import type { TypeScriptHarnessReport } from "../../model.js";
import type {
  SemanticSearchBuildOptions,
  SemanticSearchFact,
  SemanticSearchHit,
  SemanticSearchPacketPayload,
} from "./types.js";

const KNOWLEDGE_AXIS_DETAILS = {
  env: {
    authority: "project-environment",
    summary: "TypeScript environment facts from package metadata and compiler configuration.",
    next: "search lang module resolution",
  },
  "runtime-source": {
    authority: "local-source",
    summary: "TypeScript provider has no runtime checkout resolver; use owner/query/deps evidence.",
    next: "search deps <package>",
  },
  lang: {
    authority: "language-rules",
    summary: "TypeScript and JavaScript language semantics visible to the native parser.",
    next: "query guide treesitter",
  },
  std: {
    authority: "standard-library",
    summary: "ECMAScript and TypeScript standard APIs inferred from syntax and dependency facts.",
    next: "search api <symbol>",
  },
  capability: {
    authority: "provider-registry",
    summary: "TypeScript provider method and capability registry facts.",
    next: "guide",
  },
  extension: {
    authority: "ecosystem-extension",
    summary: "Framework or library-specific TypeScript ecosystem extension evidence.",
    next: "search deps <dependency>",
  },
  pattern: {
    authority: "executable-pattern",
    summary: "Executable syntax and API patterns backed by owner, deps, and tree-sitter evidence.",
    next: "search owner <path> items --query <symbol>",
  },
  compare: {
    authority: "semantic-comparison",
    summary: "Compare TypeScript project, dependency, or syntax axes using provider-owned facts.",
    next: "search deps <left> and search deps <right>",
  },
} as const;

type TypeScriptKnowledgeAxis = keyof typeof KNOWLEDGE_AXIS_DETAILS;

export function buildKnowledgePacketPayload(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacketPayload {
  return buildKnowledgePacketPayloadForProject(
    report.reasoningTree.projectRoot,
    report.reasoningTree.packageName,
    options.view as TypeScriptKnowledgeAxis,
    options.query,
  );
}

export function buildKnowledgePacketPayloadForProject(
  projectRoot: string,
  packageName: string | undefined,
  axis: TypeScriptKnowledgeAxis,
  query: string | undefined,
): SemanticSearchPacketPayload {
  const detail = KNOWLEDGE_AXIS_DETAILS[axis];
  const normalizedQuery = query ?? "";
  const terms = queryTerms(normalizedQuery);
  const facts = knowledgeFacts(projectRoot, packageName, axis, terms);
  const hits = knowledgeHits(axis, detail.authority, facts, terms);
  const missing = facts.length === 0;
  return {
    header: {
      kind: `search-${axis}`,
      fields: {
        q: normalizedQuery,
        evidenceGrade: missing ? "unknown" : "fact",
        authority: detail.authority,
        fact: facts.length,
        hit: hits.length,
      },
    },
    packages: facts,
    nodes: facts.map((fact) => ({
      id: `knowledge:${axis}:${fact.id}`,
      kind: "package" as const,
      fields: {
        axis,
        ...fact.fields,
      },
    })),
    edges: [],
    owners: [],
    hits,
    findings: [],
    nextActions: [
      { kind: "lexical" as const, target: query || axis },
      { kind: "owner" as const, target: "." },
    ],
    notes: [
      {
        kind: missing ? "fact-scope" : "fact-scope",
        message: missing
          ? `${axis} search did not find a provider-owned fact for the query; refine the axis query or route through owner/deps/tree-sitter evidence`
          : detail.summary,
      },
      { kind: "fact-scope", message: detail.next },
    ],
  };
}

function knowledgeFacts(
  projectRoot: string,
  packageName: string | undefined,
  axis: TypeScriptKnowledgeAxis,
  terms: readonly string[],
): readonly SemanticSearchFact[] {
  switch (axis) {
    case "env":
      return envFacts(projectRoot, packageName, terms);
    case "runtime-source":
      return [];
    case "lang":
      return languageFacts(terms);
    case "std":
      return standardLibraryFacts(terms);
    case "capability":
      return capabilityFacts(terms);
    case "extension":
      return extensionFacts(projectRoot, terms);
    case "pattern":
      return patternFacts(terms);
    case "compare":
      return compareFacts(terms);
  }
}

function envFacts(
  projectRoot: string,
  packageName: string | undefined,
  terms: readonly string[],
): readonly SemanticSearchFact[] {
  const facts: SemanticSearchFact[] = [];
  if (packageName !== undefined && matchesTerms(packageName, terms)) {
    facts.push({
      id: "package-name",
      fields: { axis: "env", source: "package-json", packageName },
    });
  }
  for (const configPath of projectConfigPaths(projectRoot)) {
    if (terms.length === 0 || matchesTerms(configPath, terms)) {
      facts.push({
        id: configPath,
        fields: { axis: "env", path: configPath, source: "project-config" },
      });
    }
  }
  return facts;
}

function languageFacts(terms: readonly string[]): readonly SemanticSearchFact[] {
  return filterFacts(
    [
      {
        id: "module-import-export",
        fields: {
          axis: "lang",
          syntax: "import/export",
          selector: "query guide treesitter",
          summary: "Use tree-sitter import/export captures before changing module boundaries.",
        },
      },
      {
        id: "type-surface",
        fields: {
          axis: "lang",
          syntax: "interface/type/enum/class",
          selector: "query --catalog declarations",
          summary: "Use declaration catalog captures for public type surface edits.",
        },
      },
    ],
    terms,
  );
}

function standardLibraryFacts(terms: readonly string[]): readonly SemanticSearchFact[] {
  return filterFacts(
    [
      {
        id: "promise-async",
        fields: { axis: "std", symbol: "Promise", pattern: "async/await" },
      },
      {
        id: "array-iterators",
        fields: { axis: "std", symbol: "Array", pattern: "map/filter/reduce/find" },
      },
      {
        id: "map-set-record",
        fields: { axis: "std", symbol: "Map/Set/Record", pattern: "keyed data modeling" },
      },
    ],
    terms,
  );
}

function capabilityFacts(terms: readonly string[]): readonly SemanticSearchFact[] {
  return filterFacts(
    [
      { id: "owner-items", fields: { axis: "capability", command: "search owner <path> items" } },
      {
        id: "deps",
        fields: { axis: "capability", command: "search deps <dep[/subpath][@version][::api]>" },
      },
      {
        id: "tree-sitter",
        fields: { axis: "capability", command: "query --treesitter-query <pattern>" },
      },
    ],
    terms,
  );
}

function extensionFacts(
  projectRoot: string,
  terms: readonly string[],
): readonly SemanticSearchFact[] {
  const dependencies = packageDependencies(projectRoot);
  return dependencies
    .filter((dependency) => terms.length === 0 || matchesTerms(dependency, terms))
    .map((dependency) => ({
      id: dependency,
      fields: { axis: "extension", dependency, source: "package-metadata" },
    }));
}

function projectConfigPaths(projectRoot: string): readonly string[] {
  return ["package.json", "tsconfig.json", "tsconfig.base.json", "vite.config.ts"].filter(
    (fileName) => fs.existsSync(path.join(projectRoot, fileName)),
  );
}

function packageDependencies(projectRoot: string): readonly string[] {
  const packageJsonPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(packageJsonPath)) return [];
  try {
    const payload = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    return Object.keys({
      ...(payload.dependencies ?? {}),
      ...(payload.devDependencies ?? {}),
    }).sort();
  } catch {
    return [];
  }
}

function patternFacts(terms: readonly string[]): readonly SemanticSearchFact[] {
  return filterFacts(
    [
      {
        id: "declaration-to-owner-query",
        fields: {
          axis: "pattern",
          command: "query --catalog declarations then search owner <path> items",
          qualitySignal: "parser-owned declaration before code read",
        },
      },
      {
        id: "dependency-api-usage",
        fields: {
          axis: "pattern",
          command: "search deps <dependency>::<api>",
          qualitySignal: "dependency and local usage evidence",
        },
      },
    ],
    terms,
  );
}

function compareFacts(terms: readonly string[]): readonly SemanticSearchFact[] {
  return [
    {
      id: "compare-query",
      fields: {
        axis: "compare",
        left: terms.at(0) ?? "-",
        right: terms.at(1) ?? "-",
        route: "run each side through the matching provider axis and compare facts",
      },
    },
  ];
}

function knowledgeHits(
  axis: TypeScriptKnowledgeAxis,
  authority: string,
  facts: readonly SemanticSearchFact[],
  terms: readonly string[],
): readonly SemanticSearchHit[] {
  return facts.slice(0, 12).map((fact) => ({
    kind: "text" as const,
    ownerPath: ".",
    location: { path: "." },
    score: terms.length === 0 ? 1 : 2,
    reason: `${axis}:${authority}`,
    symbol: fact.id,
    snippet: JSON.stringify(fact.fields),
    fields: { axis, authority, ...fact.fields },
  }));
}

function filterFacts(
  facts: readonly SemanticSearchFact[],
  terms: readonly string[],
): readonly SemanticSearchFact[] {
  if (terms.length === 0) return facts;
  return facts.filter((fact) => matchesTerms(`${fact.id} ${JSON.stringify(fact.fields)}`, terms));
}

function queryTerms(query: string): readonly string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

function matchesTerms(value: string, terms: readonly string[]): boolean {
  const normalized = value.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}
