/**
 * Stdin detection and ingestion for semantic-search path and grep records.
 */

import type { TypeScriptHarnessReport } from "../../model.js";
import type {
  SemanticSearchHit,
  SemanticSearchInputDetection,
  SemanticSearchInputSource,
} from "./types.js";
import { MAX_LEXICAL_HITS } from "./types.js";
import { compareProjectPathsByRecency } from "./recency.js";
import { isProjectPath, normalizeInputPath, resolveOwnerPath } from "./utils.js";

export function detectInput(stdin: string, projectRoot: string): SemanticSearchInputDetection {
  const normalized = stdin.replace(/\r\n/g, "\n");
  const lines =
    normalized.length === 0 ? [] : normalized.split("\n").filter((line) => line.length > 0);
  const first = lines[0]?.trimStart() ?? "";
  const source: SemanticSearchInputSource = (() => {
    if (stdin.includes("\0")) return "path-list-nul";
    if (first.startsWith("{")) return "rg-json";
    if (first.startsWith("diff --git ")) return "diff-paths";
    if (lines.some((line) => /^.+?:\d+:\d+:/u.test(line))) return "vimgrep";
    if (lines.some((line) => /^.+?:\d+:/u.test(line))) return "rg-n";
    if (lines.some((line) => isProjectPath(projectRoot, line))) return "path-list";
    return "unknown";
  })();
  return {
    source,
    lineCount: lines.length,
    byteCount: Buffer.byteLength(stdin),
    ...(first ? { sample: first.slice(0, 120) } : {}),
  };
}

export function ingestHits(
  report: TypeScriptHarnessReport,
  stdin: string,
  source: SemanticSearchInputSource,
): readonly SemanticSearchHit[] {
  const records = parseIngestRecords(report.reasoningTree.projectRoot, stdin, source);
  return [...records]
    .sort((left, right) =>
      compareProjectPathsByRecency(report.reasoningTree.projectRoot, left.path, right.path),
    )
    .slice(0, MAX_LEXICAL_HITS)
    .map((record) => {
      const ownerPath = resolveOwnerPath(report, record.path);
      return {
        kind: record.kind,
        ownerPath,
        location: {
          path: record.path,
          ...(record.line !== undefined ? { lineRange: `${record.line}:${record.line}` } : {}),
        },
        score: record.line !== undefined ? 2 : 1,
        reason: source,
        ...(record.snippet ? { snippet: record.snippet } : {}),
        fields: { source },
      };
    });
}

interface IngestRecord {
  readonly path: string;
  readonly line?: number;
  readonly column?: number;
  readonly snippet?: string;
  readonly kind: "path" | "text";
}

export function parseIngestRecords(
  projectRoot: string,
  stdin: string,
  source: SemanticSearchInputSource,
): readonly IngestRecord[] {
  if (source === "path-list-nul") {
    return stdin
      .split("\0")
      .filter((line) => line.trim() !== "")
      .map((line) => ({ path: normalizeInputPath(projectRoot, line.trim()), kind: "path" }));
  }
  const lines = stdin
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.length > 0);
  if (source === "vimgrep" || source === "rg-n") {
    return lines.flatMap((line) => {
      const match = line.match(/^(.+?):(\d+)(?::(\d+))?:(.*)$/u);
      if (!match) return [];
      const [, rawPath, rawLine, rawColumn, snippet] = match;
      if (rawPath === undefined || rawLine === undefined) return [];
      return [
        {
          path: normalizeInputPath(projectRoot, rawPath),
          line: Number.parseInt(rawLine, 10),
          ...(rawColumn !== undefined ? { column: Number.parseInt(rawColumn, 10) } : {}),
          snippet: snippet ?? "",
          kind: "text",
        },
      ];
    });
  }
  if (source === "diff-paths") {
    return lines.flatMap((line) => {
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/u);
      if (!match) return [];
      const pathValue = match[2] ?? match[1];
      if (pathValue === undefined) return [];
      return [{ path: normalizeInputPath(projectRoot, pathValue), kind: "path" }];
    });
  }
  if (source === "rg-json") {
    return lines.flatMap((line) => parseRgJsonLine(projectRoot, line));
  }
  if (source === "path-list") {
    return lines.map((line) => ({
      path: normalizeInputPath(projectRoot, line.trim()),
      kind: "path",
    }));
  }
  return [];
}

export function parseRgJsonLine(projectRoot: string, line: string): readonly IngestRecord[] {
  try {
    const payload = JSON.parse(line) as {
      type?: string;
      data?: {
        path?: { text?: string };
        line_number?: number;
        submatches?: readonly { start?: number }[];
        lines?: { text?: string };
      };
    };
    if (payload.type !== "match" || payload.data?.path?.text === undefined) return [];
    return [
      {
        path: normalizeInputPath(projectRoot, payload.data.path.text),
        ...(payload.data.line_number !== undefined ? { line: payload.data.line_number } : {}),
        ...(payload.data.submatches?.[0]?.start !== undefined
          ? { column: payload.data.submatches[0].start + 1 }
          : {}),
        ...(payload.data.lines?.text !== undefined
          ? { snippet: payload.data.lines.text.trimEnd() }
          : {}),
        kind: "text",
      },
    ];
  } catch {
    return [];
  }
}
