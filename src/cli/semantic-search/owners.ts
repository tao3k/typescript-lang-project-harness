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
  return uniqueBy(hits, (hit) => hit.ownerPath).map((hit) => {
    const branch = byPath.get(hit.ownerPath);
    if (branch !== undefined) {
      return ownerFact(report, branch);
    }
    const moduleReport = modulesByPath.get(hit.ownerPath);
    return moduleReport === undefined
      ? {
          path: hit.ownerPath,
          role: "unknown",
          public: false,
          fields: {},
        }
      : moduleOwnerFact(report, moduleReport);
  });
}

export function ownersForPaths(
  report: TypeScriptHarnessReport,
  paths: readonly string[],
): readonly SemanticSearchOwner[] {
  const byPath = new Map(
    report.reasoningTree.ownerBranches.map((branch) => [relPath(report, branch.path), branch]),
  );
  return uniqueBy(paths.map(slashPath), (ownerPath) => ownerPath).flatMap((ownerPath) => {
    const branch = byPath.get(ownerPath);
    return branch === undefined ? [] : [ownerFact(report, branch)];
  });
}

export function uniqueOwners(
  owners: readonly SemanticSearchOwner[],
): readonly SemanticSearchOwner[] {
  return uniqueBy(owners, (owner) => owner.path);
}

function uniqueBy<T>(values: readonly T[], keyFor: (value: T) => string): readonly T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = keyFor(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
