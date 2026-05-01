import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertTypeScriptProjectHarnessClean,
  renderTypeScriptProjectHarness,
  runTypeScriptProjectHarness,
} from "../../src/index.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("repository self-applies the default TypeScript project harness", () => {
  assertTypeScriptProjectHarnessClean(projectRoot);
});

test("repository self-applies the default advice surface with zero findings", () => {
  const report = runTypeScriptProjectHarness(projectRoot);
  const rendered = renderTypeScriptProjectHarness(report);

  assert.equal(report.findings.length, 0, rendered);
  assert.match(rendered, /^\[ok\] typescript files=/u);
});
