import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCliCapture } from "./cli_helpers.js";

test("public external type search reports exported dependency surfaces", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-public-external-types-"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ dependencies: { "needle-package": "1.0.0" } }),
  );
  fs.writeFileSync(
    path.join(root, "needle.ts"),
    [
      'import type { NeedleMarker } from "needle-package";',
      "export type PublicNeedle = NeedleMarker;",
    ].join("\n"),
  );

  const result = runCliCapture(
    ["search", "public-external-types", "needle-package", "--workspace", "."],
    root,
  );

  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /needle-package/u);
});

test("import search returns a compact owner-facing receipt", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-import-search-"));
  fs.writeFileSync(
    path.join(root, "needle.ts"),
    'import { NeedleMarker } from "./marker.js"; export const needle = NeedleMarker;\n',
  );

  const result = runCliCapture(["search", "import", "NeedleMarker", "--workspace", "."], root);

  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /NeedleMarker/u);
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
