import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { searchRunPlan } from "../../src/cli/protocol-runtime.js";
import type { SearchArgs } from "../../src/cli/protocol.js";
import { runCliCapture } from "./cli_helpers.js";

test("public external type search prefilters parser inputs by its query", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-public-type-prefilter-"));
  for (let index = 0; index < 129; index += 1) {
    fs.writeFileSync(
      path.join(root, `noise-${index}.ts`),
      `export const value${index} = ${index};\n`,
    );
  }
  fs.writeFileSync(
    path.join(root, "needle.ts"),
    "export interface NeedleMarker { readonly value: string; }\n",
  );

  const plan = searchRunPlan(root, searchArgs("public-external-types", "NeedleMarker"));

  assert.ok(plan.prefilter, "expected public external type query prefilter");
  assert.deepEqual(
    plan.fileNames?.map((fileName) => path.basename(fileName)),
    ["needle.ts"],
  );
});

test("import and reasoning queries prefilter parser inputs by their known terms", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-query-prefilter-"));
  for (let index = 0; index < 129; index += 1) {
    fs.writeFileSync(
      path.join(root, `noise-${index}.ts`),
      `export const value${index} = ${index};\n`,
    );
  }
  fs.writeFileSync(
    path.join(root, "needle.ts"),
    "import { NeedleMarker } from './marker.js'; export const needle = NeedleMarker;\n",
  );

  for (const args of [
    searchArgs("import", "NeedleMarker"),
    searchArgs("reasoning", "NeedleMarker", "marker"),
  ]) {
    const plan = searchRunPlan(root, args);
    assert.ok(plan.prefilter, args.view);
    assert.deepEqual(
      plan.fileNames?.map((fileName) => path.basename(fileName)),
      ["needle.ts"],
    );
  }
});

test("workspace seeds use the manifest router without full syntax or policy work", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-workspace-router-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "@scope/router" }));

  const result = runCliCapture(["search", "workspace", "--view", "seeds"], root);

  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /mode=manifest-router/);
  assert.match(result.stdout, /nativeSyntaxFacts=skipped policyFindings=skipped/);
  assert.match(result.stdout, /P=package:pkg\(@scope\/router\)!prime/);
});

function searchArgs(
  view: SearchArgs["view"],
  query: string,
  dependency: string | undefined = undefined,
): SearchArgs {
  return {
    kind: "search",
    view,
    query,
    projectRoot: undefined,
    packagePath: undefined,
    workspace: false,
    ownerPath: undefined,
    ...(dependency === undefined ? {} : { dependency }),
    pipes: [],
    querySet: [],
    json: false,
    renderMode: undefined,
  };
}
