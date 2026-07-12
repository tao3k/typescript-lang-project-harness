import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCliCapture } from "./cli_helpers.js";

test("workspace seeds use the manifest router without full syntax or policy work", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-workspace-router-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "@scope/router" }));

  const result = runCliCapture(["search", "workspace", "--view", "seeds"], root);

  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /mode=manifest-router/);
  assert.match(result.stdout, /nativeSyntaxFacts=skipped policyFindings=skipped/);
  assert.match(result.stdout, /P=package:pkg\(@scope\/router\)!prime/);
});
