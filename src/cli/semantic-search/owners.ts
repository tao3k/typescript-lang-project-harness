/**
 * Semantic-search owner selection helpers.
 */

import type { TypeScriptHarnessReport } from "../../model.js";
import { moduleOwnerFact, ownerFact } from "./facts.js";
import type { SemanticSearchHit, SemanticSearchOwner } from "./types.js";
import { relPath, slashPath } from "./utils.js";

export function ownersForHits(
  report: TypeScriptHarnessReport,
  hits: readonly SemanticSearchHit[],
): readonly SemanticSearchOwner[] {
  const byPath = new Map(
    report.reasoningTree.ownerBranches.map((branch) => [relPath(report, branch.path), branch]),
  );
  const modulesByPath = new Map(
    report.reasoningTree.modules.map((moduleReport) => [
      relPath(report, moduleReport.path),
      moduleReport,
    ]),
  );
  const owners: SemanticSearchOwner[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (seen.has(hit.ownerPath)) continue;
    seen.add(hit.ownerPath);
    const branch = byPath.get(hit.ownerPath);
    if (branch !== undefined) {
      owners.push(ownerFact(report, branch));
    } else {
      const moduleReport = modulesByPath.get(hit.ownerPath);
      owners.push(
        moduleReport === undefined
          ? {
              path: hit.ownerPath,
              role: "unknown",
              public: false,
              fields: {},
            }
          : moduleOwnerFact(report, moduleReport),
      );
    }
  }
  return owners;
}

export function ownersForPaths(
  report: TypeScriptHarnessReport,
  paths: readonly string[],
): readonly SemanticSearchOwner[] {
  const byPath = new Map(
    report.reasoningTree.ownerBranches.map((branch) => [relPath(report, branch.path), branch]),
  );
  const owners: SemanticSearchOwner[] = [];
  const seen = new Set<string>();
  for (const rawPath of paths) {
    const ownerPath = slashPath(rawPath);
    if (seen.has(ownerPath)) continue;
    const branch = byPath.get(ownerPath);
    if (branch === undefined) continue;
    seen.add(ownerPath);
    owners.push(ownerFact(report, branch));
  }
  return owners;
}

export function uniqueOwners(
  owners: readonly SemanticSearchOwner[],
): readonly SemanticSearchOwner[] {
  const seen = new Set<string>();
  const result: SemanticSearchOwner[] = [];
  for (const owner of owners) {
    if (seen.has(owner.path)) continue;
    seen.add(owner.path);
    result.push(owner);
  }
  return result;
}
