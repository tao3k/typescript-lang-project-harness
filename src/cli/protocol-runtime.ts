/**
 * Runtime planning helpers for protocol command execution.
 */

import fs from "node:fs";
import path from "node:path";

import { defaultTypeScriptHarnessConfig } from "../config.js";
import {
  prefilterTypeScriptSearchPaths,
  typeScriptSearchScopeFileNames,
  type TypeScriptSearchPrefilterResult,
} from "./search-prefilter.js";
import type { CheckArgs, SearchArgs } from "./protocol.js";
import type { TypeScriptSemanticSearchView } from "./semantic-language.js";

interface SearchRunPlan {
  readonly projectRoot: string;
  readonly fileNames?: readonly string[];
  readonly prefilter?: TypeScriptSearchPrefilterResult;
}

export const SEARCH_VIEWS_REQUIRING_FULL_NATIVE_SYNTAX_FACTS =
  new Set<TypeScriptSemanticSearchView>(["workspace", "owner", "api", "public-external-types"]);

export const SEARCH_VIEWS_REQUIRING_RULE_EVALUATION = new Set<TypeScriptSemanticSearchView>([
  "workspace",
  "owner",
  "policy",
]);

export function checkConfig(mode: CheckArgs["mode"]) {
  const config = defaultTypeScriptHarnessConfig();
  if (mode === "changed") {
    return {
      ...config,
      ruleSeverityOverrides: {
        ...config.ruleSeverityOverrides,
        "TS-PROJ-R001": "info" as const,
      },
    };
  }
  return config;
}

export function searchRunPlan(cwd: string, args: SearchArgs): SearchRunPlan {
  const root = path.resolve(cwd, args.projectRoot ?? ".");
  if (args.packagePath === undefined) {
    return prefilteredSearchRunPlan(root, args, []);
  }

  const scopePath = path.resolve(root, args.packagePath);
  if (!fs.existsSync(scopePath)) {
    throw new Error(`package path does not exist: ${scopePath}`);
  }
  if (fs.existsSync(path.join(scopePath, "package.json"))) {
    return prefilteredSearchRunPlan(scopePath, args, []);
  }
  return prefilteredSearchRunPlan(root, args, [scopePath]);
}

function prefilteredSearchRunPlan(
  projectRoot: string,
  args: SearchArgs,
  scopePaths: readonly string[],
): SearchRunPlan {
  const queryTerms = prefilterQueryTerms(args);
  const prefilter =
    queryTerms.length === 0
      ? undefined
      : prefilterTypeScriptSearchPaths(projectRoot, queryTerms, {
          scopePaths,
          ...(args.ownerPath === undefined ? {} : { ownerPath: args.ownerPath }),
        });
  if (prefilter !== undefined) {
    return { projectRoot, fileNames: prefilter.fileNames, prefilter };
  }
  if (scopePaths.length > 0) {
    return { projectRoot, fileNames: typeScriptSearchScopeFileNames(scopePaths) };
  }
  return { projectRoot };
}

function prefilterQueryTerms(args: SearchArgs): readonly string[] {
  if (args.view === "fzf") {
    if (args.querySet.length > 0) return args.querySet;
    return args.query === undefined ? [] : [args.query];
  }
  if (args.view === "api" && args.query !== undefined && !args.query.includes("::")) {
    return [args.query];
  }
  return [];
}
