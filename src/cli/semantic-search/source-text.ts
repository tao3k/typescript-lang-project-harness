/**
 * Bounded source-text hits for parser-visible TypeScript modules.
 */

import fs from "node:fs";

import type { TypeScriptHarnessReport } from "../../model.js";
import type { SemanticSearchHit } from "./types.js";
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
    const lines = sourceText.split(/\r\n|\r|\n/u);
    let matchesForModule = 0;
    for (const [index, line] of lines.entries()) {
      const column = line.toLowerCase().indexOf(needle);
      if (column === -1) continue;
      hits.push({
        kind: "text",
        ownerPath,
        location: { path: ownerPath, line: index + 1, column: column + 1 },
        score: sourceTextScore(line, query),
        reason: "source-text",
        snippet: line.trim().slice(0, MAX_SOURCE_TEXT_SNIPPET_LENGTH),
        fields: {
          source: "parser-visible-source",
        },
      });
      matchesForModule += 1;
      if (matchesForModule >= MAX_SOURCE_TEXT_HITS_PER_MODULE) break;
    }
  }
  return hits;
}

function readSourceText(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
}

function sourceTextScore(line: string, query: string): number {
  return line.includes(query) ? 2 : 1;
}
