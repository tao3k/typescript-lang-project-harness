/**
 * Path, owner-id, and source-location helpers for semantic-search packets.
 */

import path from "node:path";
import fs from "node:fs";

import type {
  SourceLocation,
  TypeScriptHarnessReport,
  TypeScriptReasoningOwnerBranchFact,
} from "../../model.js";
import { relativeTo } from "../utils.js";
import type { SemanticSearchLocation } from "./types.js";

export function findOwner(
  report: TypeScriptHarnessReport,
  query: string,
): TypeScriptReasoningOwnerBranchFact | undefined {
  const normalized = slashPath(query);
  return report.reasoningTree.ownerBranches.find((branch) => {
    const rel = relPath(report, branch.path);
    return (
      rel === normalized ||
      rel.endsWith(`/${normalized}`) ||
      branch.ownerNamespace === query ||
      branch.exportNames.includes(query)
    );
  });
}

export function resolveOwnerPath(report: TypeScriptHarnessReport, candidatePath: string): string {
  const normalized = slashPath(candidatePath);
  const owner = report.reasoningTree.ownerBranches.find(
    (branch) => relPath(report, branch.path) === normalized,
  );
  return owner ? relPath(report, owner.path) : normalized;
}

export function isProjectPath(projectRoot: string, value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  return fs.existsSync(path.resolve(projectRoot, trimmed));
}

export function normalizeInputPath(projectRoot: string, value: string): string {
  const trimmed = value.trim();
  const absolute = path.isAbsolute(trimmed) ? trimmed : path.resolve(projectRoot, trimmed);
  const relative = path.relative(projectRoot, absolute);
  return slashPath(relative === "" ? "." : relative);
}

export function relPath(report: TypeScriptHarnessReport, filePath: string): string {
  return slashPath(relativeTo(report.reasoningTree, filePath));
}

export function locationPath(report: TypeScriptHarnessReport, location: SourceLocation): string {
  return location.path
    ? normalizeInputPath(report.reasoningTree.projectRoot, location.path)
    : "<memory>";
}

export function locationFromSource(
  report: TypeScriptHarnessReport,
  location: SourceLocation,
): SemanticSearchLocation {
  return {
    path: locationPath(report, location),
    line: location.line,
    column: location.column + 1,
  };
}

export function ownerId(ownerPath: string): string {
  return `O:${ownerPath}`;
}

export function testId(ownerPath: string): string {
  return `T:${ownerPath}`;
}

export function stripNodePrefix(value: string): string {
  return /^[A-Z]:/u.test(value) ? value.slice(2) : value;
}

export function slashPath(value: string): string {
  return value.split(path.sep).join("/");
}
