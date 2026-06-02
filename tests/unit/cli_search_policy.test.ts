import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCliCapture } from "./cli_helpers.js";

test("search policy returns provider-owned owner and test handles", () => {
  const root = policySearchFixture();
  const result = runCliCapture(
    ["search", "policy", "TS-AGENT-R001", "owner", "tests", "--view", "seeds", "."],
    root,
  );
  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /^\[search-policy\] q=TS-AGENT-R001 handle=1 owner=1 tests=3/mu);
  assert.match(result.stdout, /\|handle TS-AGENT-R001 kind=policy-rule/u);
  assert.match(result.stdout, /\|seed owner:src\/rules\/agent_policy\/pack\.ts/u);
  assert.match(result.stdout, /\|seed tests:tests\/unit\/agent_policy\.test\.ts/u);
});

test("search policy JSON exposes semanticHandles", () => {
  const root = policySearchFixture();
  const result = runCliCapture(
    ["search", "policy", "TS-PROJ-R001", "owner", "tests", "--json", "."],
    root,
  );
  assert.equal(result.exitCode, 0, result.stderr);
  const packet = JSON.parse(result.stdout) as {
    readonly view: string;
    readonly semanticHandles?: readonly {
      readonly id: string;
      readonly kind: string;
      readonly ownerPath?: string;
      readonly testPaths?: readonly string[];
    }[];
  };
  assert.equal(packet.view, "policy");
  assert.equal(packet.semanticHandles?.[0]?.id, "TS-PROJ-R001");
  assert.equal(packet.semanticHandles?.[0]?.kind, "policy-rule");
  assert.equal(packet.semanticHandles?.[0]?.ownerPath, "src/rules/project_policy/pack.ts");
  assert.ok(packet.semanticHandles?.[0]?.testPaths?.includes("tests/unit/runner.test.ts"));
});

function policySearchFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-policy-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    `${JSON.stringify({ name: "policy-fixture", version: "0.0.0", type: "module" }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    `${JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(root, "src", "index.ts"), "export const value = 1;\n");
  return root;
}
