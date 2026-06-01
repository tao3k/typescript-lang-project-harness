/**
 * Typed docs and local schema search for semantic-search docs view.
 */

import fs from "node:fs";
import path from "node:path";

import type { TypeScriptHarnessReport } from "../../model.js";
import type {
  SemanticSearchBuildOptions,
  SemanticSearchHit,
  SemanticSearchPacketPayload,
} from "./types.js";
import { MAX_TEXT_HITS } from "./types.js";
import { normalizeInputPath } from "./utils.js";

interface SchemaDocumentCandidate {
  readonly path: string;
  readonly absolutePath: string;
  readonly text: string;
  readonly json: Record<string, unknown> | undefined;
}

interface SchemaMatch {
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly score: number;
  readonly pointer: string;
  readonly text: string;
  readonly schemaId?: string;
  readonly schemaVersion?: string;
  readonly title?: string;
}

export function buildDocsPacketPayload(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacketPayload {
  const query = options.query ?? "";
  const hits = docsHits(report, query);
  return {
    header: {
      kind: "search-docs",
      fields: {
        q: query,
        hit: hits.length,
        source: "local-docs",
        surface: "schema-json",
      },
    },
    nodes: [],
    edges: [],
    owners: [],
    hits,
    findings: [],
    nextActions: [
      ...(query.trim() === ""
        ? []
        : [
            { kind: "text" as const, target: query },
            { kind: "ingest" as const, target: query, scope: "external-docs" },
          ]),
    ],
    notes: [
      ...(query.trim() === ""
        ? [{ kind: "empty-query" as const, message: "docs search requires a query" }]
        : []),
      {
        kind: "fact-scope" as const,
        message:
          "docs view searches local provider documentation contracts such as JSON Schema; external docs require ingest or a docs provider",
      },
    ],
  };
}

function docsHits(report: TypeScriptHarnessReport, query: string): readonly SemanticSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  return schemaCandidates(report)
    .flatMap((candidate) => schemaMatches(candidate, needle))
    .sort(compareSchemaMatches)
    .slice(0, MAX_TEXT_HITS)
    .map((match) => ({
      kind: "text" as const,
      ownerPath: match.path,
      location: {
        path: match.path,
        line: match.line,
        column: match.column,
      },
      score: match.score,
      reason: "schema-contract",
      snippet: match.text,
      fields: {
        source: "schema-json",
        surface: "schema",
        pointer: match.pointer,
        ...(match.schemaId === undefined ? {} : { schemaId: match.schemaId }),
        ...(match.schemaVersion === undefined ? {} : { schemaVersion: match.schemaVersion }),
        ...(match.title === undefined ? {} : { title: match.title }),
        text: match.text,
      },
    }));
}

function schemaCandidates(report: TypeScriptHarnessReport): readonly SchemaDocumentCandidate[] {
  const schemaDir = path.join(report.reasoningTree.projectRoot, "schemas");
  if (!fs.existsSync(schemaDir)) return [];
  return fs
    .readdirSync(schemaDir)
    .filter((entry) => entry.endsWith(".schema.json"))
    .sort()
    .flatMap((entry) => {
      const absolutePath = path.join(schemaDir, entry);
      const text = fs.readFileSync(absolutePath, "utf8");
      return [
        {
          path: normalizeInputPath(report.reasoningTree.projectRoot, absolutePath),
          absolutePath,
          text,
          json: parseJsonObject(text),
        },
      ];
    });
}

function schemaMatches(candidate: SchemaDocumentCandidate, needle: string): readonly SchemaMatch[] {
  const matches: SchemaMatch[] = [];
  const schemaId = stringField(candidate.json, "$id");
  const schemaVersion =
    stringField(candidate.json, "$schemaVersion") ??
    constStringAtPointer(candidate.json, ["properties", "schemaVersion", "const"]);
  const title = stringField(candidate.json, "title");

  const addMatch = (score: number, pointer: string, rawNeedle: string, text: string): void => {
    const location = locateText(candidate.text, rawNeedle);
    matches.push({
      path: candidate.path,
      line: location.line,
      column: location.column,
      score,
      pointer,
      text,
      ...(schemaId === undefined ? {} : { schemaId }),
      ...(schemaVersion === undefined ? {} : { schemaVersion }),
      ...(title === undefined ? {} : { title }),
    });
  };

  if (candidate.path.toLowerCase().includes(needle)) {
    addMatch(10, "/", path.basename(candidate.path), candidate.path);
  }
  if (schemaId?.toLowerCase().includes(needle) === true) {
    addMatch(12, "/$id", schemaId, schemaId);
  }
  if (title?.toLowerCase().includes(needle) === true) {
    addMatch(8, "/title", title, title);
  }

  visitJson(candidate.json, [], (pointer, key, value) => {
    if (key.toLowerCase().includes(needle)) {
      addMatch(9, pointer, key, key);
      return;
    }
    if (typeof value === "string" && value.toLowerCase().includes(needle)) {
      addMatch(6, pointer, value, value);
    }
  });

  return dedupeSchemaMatches(matches);
}

function visitJson(
  value: unknown,
  pathParts: readonly string[],
  visit: (pointer: string, key: string, value: unknown) => void,
): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitJson(item, [...pathParts, String(index)], visit));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const pointer = jsonPointer([...pathParts, key]);
    visit(pointer, key, child);
    visitJson(child, [...pathParts, key], visit);
  }
}

function dedupeSchemaMatches(matches: readonly SchemaMatch[]): readonly SchemaMatch[] {
  const seen = new Set<string>();
  const deduped: SchemaMatch[] = [];
  for (const match of matches) {
    const key = `${match.path}:${match.pointer}:${match.line}:${match.column}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(match);
  }
  return deduped;
}

function compareSchemaMatches(left: SchemaMatch, right: SchemaMatch): number {
  const scoreDiff = right.score - left.score;
  if (scoreDiff !== 0) return scoreDiff;
  return `${left.path}:${left.line}:${left.column}`.localeCompare(
    `${right.path}:${right.line}:${right.column}`,
  );
}

function locateText(
  text: string,
  needle: string,
): { readonly line: number; readonly column: number } {
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return { line: 1, column: 1 };
  const prefix = text.slice(0, index);
  const lines = prefix.split("\n");
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function stringField(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const field = value?.[key];
  return typeof field === "string" ? field : undefined;
}

function constStringAtPointer(
  value: Record<string, unknown> | undefined,
  pathParts: readonly string[],
): string | undefined {
  let current: unknown = value;
  for (const part of pathParts) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

function jsonPointer(pathParts: readonly string[]): string {
  if (pathParts.length === 0) return "/";
  return `/${pathParts.map((part) => part.replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
}
