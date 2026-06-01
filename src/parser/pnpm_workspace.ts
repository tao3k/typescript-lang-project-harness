import fs from "node:fs";
import path from "node:path";

import type { PackageJsonWorkspaceFact } from "../model.js";

export function pnpmWorkspaceFacts(projectRoot: string): readonly PackageJsonWorkspaceFact[] {
  const workspacePath = path.join(projectRoot, "pnpm-workspace.yaml");
  if (!fs.existsSync(workspacePath)) {
    return [];
  }
  const sourceText = fs.readFileSync(workspacePath, "utf8");
  return parsePnpmWorkspacePackages(workspacePath, sourceText);
}

export function parsePnpmWorkspacePackages(
  workspacePath: string,
  sourceText: string,
): readonly PackageJsonWorkspaceFact[] {
  const facts: PackageJsonWorkspaceFact[] = [];
  const lines = sourceText.replace(/\r\n/g, "\n").split("\n");
  let inPackages = false;
  const packagesIndent = { value: -1 };
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (!inPackages) {
      if (trimmed === "packages:") {
        inPackages = true;
        packagesIndent.value = indent;
      }
      continue;
    }
    if (indent <= packagesIndent.value && !trimmed.startsWith("-")) {
      break;
    }
    if (!trimmed.startsWith("-")) {
      continue;
    }
    const pattern = parseYamlListString(trimmed.slice(1).trim());
    if (pattern === undefined) {
      continue;
    }
    facts.push({ pattern, location: { path: workspacePath, line: index + 1, column: indent } });
  }
  return facts.sort((left, right) => left.pattern.localeCompare(right.pattern));
}

function parseYamlListString(value: string): string | undefined {
  const withoutComment = stripInlineComment(value).trim();
  if (withoutComment === "") {
    return undefined;
  }
  if (
    (withoutComment.startsWith("'") && withoutComment.endsWith("'")) ||
    (withoutComment.startsWith('"') && withoutComment.endsWith('"'))
  ) {
    return withoutComment.slice(1, -1);
  }
  return withoutComment;
}

function stripInlineComment(value: string): string {
  let quote: string | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === "'" || char === '"') && (index === 0 || value[index - 1] !== "\\")) {
      quote = quote === char ? undefined : (quote ?? char);
    }
    if (char === "#" && quote === undefined) {
      return value.slice(0, index);
    }
  }
  return value;
}
