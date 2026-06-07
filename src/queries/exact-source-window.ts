import fs from "node:fs";
import path from "node:path";

import { sourceSelectorLineRange } from "./source-selector.js";

export function renderExactSourceWindowCode(
  projectRoot: string,
  ownerPath: string,
  selector: string,
): string | undefined {
  const range = sourceSelectorLineRange(selector, ownerPath);
  if (range === undefined) return undefined;
  const sourceText = fs.readFileSync(path.resolve(projectRoot, ownerPath), "utf8");
  const sourceLines = sourceText.split(/\r?\n/u);
  if (range.lineStart > sourceLines.length) {
    throw new Error(
      `direct-source-read selector starts after end of file: ${ownerPath}:${range.lineStart}`,
    );
  }
  const lineEnd = Math.min(range.lineEnd, sourceLines.length);
  return sourceLines
    .slice(range.lineStart - 1, lineEnd)
    .join("\n")
    .trimEnd();
}
