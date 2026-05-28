import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  isTypeScriptHarnessClean,
  renderTypeScriptProjectHarness,
  runTypeScriptProjectHarness,
} from "../../src/index.js";

test("modularity pack reports production modules depending on tests without blocking", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-modularity-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.mkdirSync(path.join(root, "tests"));
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
      },
      include: ["src/**/*.ts", "tests/**/*.ts"],
    }),
  );
  fs.writeFileSync(path.join(root, "tests", "helper.ts"), "export const helper = 1;\n");
  fs.writeFileSync(
    path.join(root, "src", "index.ts"),
    'import { helper } from "../tests/helper.js";\nexport const value = helper;\n',
  );

  const report = runTypeScriptProjectHarness(root);
  const rendered = renderTypeScriptProjectHarness(report);

  assert.equal(isTypeScriptHarnessClean(report), true);
  assert.deepEqual(
    report.findings.map((finding) => `${finding.ruleId}:${finding.severity}`),
    ["TS-MOD-R001:info"],
  );
  assert.match(rendered, /\[TS-MOD-R001\] Info/u);
  assert.match(rendered, /Module role 'facade' depends on test owner '\.\.\/tests\/helper\.js'/u);
});

test("modularity pack reports oversized package project modules without blocking", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-parser-modularity-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "@example/modularity" }),
  );
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
  fs.writeFileSync(
    path.join(root, "src", "reasoning.ts"),
    [
      "export const reasoning = 1;",
      ...Array.from({ length: 501 }, (_, index) => `// reasoning concern ${index}`),
    ].join("\n"),
  );

  const report = runTypeScriptProjectHarness(root);
  const rendered = renderTypeScriptProjectHarness(report);

  assert.equal(isTypeScriptHarnessClean(report), true);
  assert.deepEqual(
    report.findings.map((finding) => `${finding.ruleId}:${finding.severity}`),
    ["TS-MOD-R002:info"],
  );
  assert.match(rendered, /\[TS-MOD-R002\] Info/u);
  assert.match(rendered, /Project module 'src\/reasoning\.ts' in reasoning layer has 502 lines/u);
  assert.match(rendered, /oversized project module/u);
});
