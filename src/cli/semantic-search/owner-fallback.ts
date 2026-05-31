/**
 * Fallback owner facts for paths that are not reasoning-tree owners.
 */

import type { TypeScriptHarnessReport } from "../../model.js";
import type { SemanticSearchOwner } from "./types.js";
import { moduleOwnerFact } from "./facts.js";
import { isTestOwnerPath } from "./hits.js";
import { isProjectPath, normalizeInputPath, relPath } from "./utils.js";

export interface SemanticSearchOwnerFallback {
  readonly owner: SemanticSearchOwner;
  readonly message: string;
}

export function ownerFallback(
  report: TypeScriptHarnessReport,
  query: string,
): SemanticSearchOwnerFallback | undefined {
  const projectRoot = report.reasoningTree.projectRoot;
  if (!isProjectPath(projectRoot, query)) {
    return undefined;
  }
  const ownerPath = normalizeInputPath(projectRoot, query);
  if (ownerPath === ".." || ownerPath.startsWith("../")) {
    return undefined;
  }
  const moduleReport = report.reasoningTree.modules.find(
    (candidate) => relPath(report, candidate.path) === ownerPath,
  );
  if (moduleReport !== undefined) {
    return {
      owner: moduleOwnerFact(report, moduleReport),
      message:
        "module is parser-visible but not a reasoning owner; owner graph edges are unavailable",
    };
  }
  return {
    owner: pathOnlyOwner(ownerPath),
    message: "path exists but is not parser-visible; use search ingest for line evidence",
  };
}

function pathOnlyOwner(ownerPath: string): SemanticSearchOwner {
  return {
    path: ownerPath,
    role: isTestOwnerPath(ownerPath) ? "test" : "file",
    public: false,
    nextActions: [{ kind: "ingest", target: ownerPath }],
    fields: {
      source: "path-only",
      parserOwner: false,
    },
  };
}
