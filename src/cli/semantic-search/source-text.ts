/**
 * Bounded source-text hits for parser-visible TypeScript modules.
 */

import fs from "node:fs";

import type { TypeScriptHarnessReport, TypeScriptSourceTextFixtureFact } from "../../model.js";
import type { SemanticSearchHit } from "./types.js";
import { isTestOwnerPath } from "./test-path.js";
import { relPath } from "./utils.js";

const MAX_SOURCE_TEXT_HITS_PER_MODULE = 3;
const MAX_SOURCE_TEXT_SNIPPET_LENGTH = 160;

export function sourceTextHits(
  report: TypeScriptHarnessReport,
  query: string,
  needle: string,
): readonly SemanticSearchHit[] {
  const hits: SemanticSearchHit[] = [];
  for (const moduleReport of report.modules) {
    const ownerPath = relPath(report, moduleReport.path);
    const sourceText = readSourceText(moduleReport.path);
    if (sourceText === undefined) continue;
    const fixtureContexts = fixtureContextsByLine(moduleReport.sourceTextFixtures ?? [], ownerPath);
    const lines = sourceText.split(/\r\n|\r|\n/u);
    let matchesForModule = 0;
    for (const [index, line] of lines.entries()) {
      const column = line.toLowerCase().indexOf(needle);
      if (column === -1) continue;
      const fixtureContext = fixtureContexts.get(index + 1);
      hits.push({
        kind: "text",
        ownerPath,
        location: { path: ownerPath, lineRange: `${index + 1}:${index + 1}` },
        score: sourceTextScore(line, query),
        reason: "source-text",
        snippet: line.trim().slice(0, MAX_SOURCE_TEXT_SNIPPET_LENGTH),
        surface: fixtureContext === undefined ? ownerSurface(ownerPath) : "test-fixture-string",
        realOwner: fixtureContext === undefined,
        ...(fixtureContext === undefined
          ? {}
          : {
              fixturePath: fixtureContext.fixturePath,
              fixtureOwner: fixtureContext.fixtureOwner,
            }),
        fields: {
          source: "parser-visible-source",
          ...(fixtureContext === undefined
            ? {}
            : {
                fixturePath: fixtureContext.fixturePath,
                fixtureOwner: fixtureContext.fixtureOwner,
              }),
        },
      });
      matchesForModule += 1;
      if (matchesForModule >= MAX_SOURCE_TEXT_HITS_PER_MODULE) break;
    }
  }
  return hits;
}

interface FixtureContext {
  readonly fixturePath: string;
  readonly fixtureOwner: string;
}

function readSourceText(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
}

export function fuzzySourceTextHits(
  report: TypeScriptHarnessReport,
  query: string,
): readonly SemanticSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  const hits: SemanticSearchHit[] = [];
  for (const moduleReport of report.modules) {
    const ownerPath = relPath(report, moduleReport.path);
    const sourceText = readSourceText(moduleReport.path);
    if (sourceText === undefined) continue;
    const fixtureContexts = fixtureContextsByLine(moduleReport.sourceTextFixtures ?? [], ownerPath);
    const lines = sourceText.split(/\r\n|\r|\n/u);
    let matchesForModule = 0;
    for (const [index, line] of lines.entries()) {
      const match = fuzzyTextMatch(line, needle);
      if (match === undefined) continue;
      const fixtureContext = fixtureContexts.get(index + 1);
      hits.push({
        kind: "text",
        ownerPath,
        location: { path: ownerPath, lineRange: `${index + 1}:${index + 1}` },
        score: match.score,
        reason: "source-text-fuzzy",
        snippet: line.trim().slice(0, MAX_SOURCE_TEXT_SNIPPET_LENGTH),
        surface: fixtureContext === undefined ? ownerSurface(ownerPath) : "test-fixture-string",
        realOwner: fixtureContext === undefined,
        ...(fixtureContext === undefined
          ? {}
          : {
              fixturePath: fixtureContext.fixturePath,
              fixtureOwner: fixtureContext.fixtureOwner,
            }),
        fields: {
          source: "parser-visible-source",
          matchMode: "fuzzy",
          ...(fixtureContext === undefined
            ? {}
            : {
                fixturePath: fixtureContext.fixturePath,
                fixtureOwner: fixtureContext.fixtureOwner,
              }),
        },
      });
      matchesForModule += 1;
      if (matchesForModule >= MAX_SOURCE_TEXT_HITS_PER_MODULE) break;
    }
  }
  return hits;
}

function sourceTextScore(line: string, query: string): number {
  return line.includes(query) ? 2 : 1;
}

export function fuzzyTextMatch(
  candidate: string,
  lowerQuery: string,
): { readonly score: number; readonly column: number } | undefined {
  const query = lowerQuery.trim();
  if (query === "") return undefined;
  const lowerCandidate = candidate.toLowerCase();
  const exactIndex = lowerCandidate.indexOf(query);
  if (exactIndex >= 0) {
    return { score: 12 + query.length, column: exactIndex + 1 };
  }
  const positions: number[] = [];
  let cursor = 0;
  for (const char of query.replace(/\s+/gu, "")) {
    const index = lowerCandidate.indexOf(char, cursor);
    if (index < 0) return undefined;
    positions.push(index);
    cursor = index + char.length;
  }
  if (positions.length === 0) return undefined;
  const first = positions[0]!;
  const last = positions[positions.length - 1]!;
  const span = last - first + 1;
  if (span > Math.max(query.length * 3, query.length + 12)) return undefined;
  const compactness = Math.max(0, positions.length * 2 - (span - positions.length));
  return { score: 4 + compactness, column: first + 1 };
}

function ownerSurface(ownerPath: string): "real-source" | "test-source" {
  return isTestOwnerPath(ownerPath) ? "test-source" : "real-source";
}

function fixtureContextsByLine(
  fixtures: readonly TypeScriptSourceTextFixtureFact[],
  fixtureOwner: string,
): ReadonlyMap<number, FixtureContext> {
  const contexts = new Map<number, FixtureContext>();
  for (const fixture of fixtures) {
    for (let line = fixture.location.line; line <= fixture.lineEnd; line += 1) {
      contexts.set(line, { fixturePath: fixture.fixturePath, fixtureOwner });
    }
  }
  return contexts;
}
