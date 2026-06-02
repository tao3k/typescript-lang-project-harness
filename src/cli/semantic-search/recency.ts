/**
 * Project-path recency helpers for deterministic semantic-search ranking.
 */

import fs from "node:fs";
import path from "node:path";

import type { SemanticSearchHit } from "./types.js";

export function compareHitsByRecency(
  projectRoot: string,
  left: SemanticSearchHit,
  right: SemanticSearchHit,
): number {
  const recency = compareProjectPathsByRecency(projectRoot, left.ownerPath, right.ownerPath);
  if (recency !== 0) return recency;
  return `${left.ownerPath}:${left.location.lineRange ?? ""}`.localeCompare(
    `${right.ownerPath}:${right.location.lineRange ?? ""}`,
  );
}

export function compareProjectPathsByRecency(
  projectRoot: string,
  leftPath: string,
  rightPath: string,
): number {
  const leftMtime = projectPathMtime(projectRoot, leftPath);
  const rightMtime = projectPathMtime(projectRoot, rightPath);
  if (leftMtime !== rightMtime) return rightMtime - leftMtime;
  return slashPath(leftPath).localeCompare(slashPath(rightPath));
}

function projectPathMtime(projectRoot: string, candidatePath: string): number {
  const absolute = path.isAbsolute(candidatePath)
    ? path.resolve(candidatePath)
    : path.resolve(projectRoot, candidatePath);
  const relative = path.relative(path.resolve(projectRoot), absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return 0;
  }
  try {
    return fs.statSync(absolute).mtimeMs;
  } catch {
    return 0;
  }
}

function slashPath(value: string): string {
  return value.split(path.sep).join("/");
}
