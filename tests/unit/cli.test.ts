import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../../src/cli/main.js";

test("CLI supports compact, JSON, agent compact, and agent snapshot output modes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-cli-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
  fs.writeFileSync(path.join(root, "src", "index.ts"), "export const ok = 1;\n");

  const adviceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-cli-advice-"));
  fs.mkdirSync(path.join(adviceRoot, "src"));
  fs.writeFileSync(
    path.join(adviceRoot, "tsconfig.json"),
    JSON.stringify({ include: ["src/**/*.ts"] }),
  );
  fs.writeFileSync(
    path.join(adviceRoot, "src", "index.ts"),
    [
      "export function loadOwner(includeDrafts: boolean, forceRefresh: boolean) {",
      "  return includeDrafts || forceRefresh;",
      "}",
    ].join("\n"),
  );

  const compact = runCliCapture(["."], root);
  assert.equal(compact.exitCode, 0);
  // Default output is now the agent guide (when no flags given)
  assert.match(compact.stdout, /(?:\[ok\] typescript|Reasoning Tree — Agent Guide)/u);

  const json = runCliCapture(["--json", "."], root);
  assert.equal(json.exitCode, 0);
  const jsonReport = JSON.parse(json.stdout) as {
    readonly modules: readonly unknown[];
    readonly reasoningTree: { readonly runMode: string };
    readonly runMode: string;
  };
  assert.equal(jsonReport.runMode, "project");
  assert.equal(jsonReport.reasoningTree.runMode, "project");
  assert.equal(jsonReport.modules.length, 1);

  const agentCompact = runCliCapture(["--agent-compact", "."], adviceRoot);
  assert.equal(agentCompact.exitCode, 0);
  assert.match(agentCompact.stdout, /^AgentCompactText: mode=all/u);
  assert.match(agentCompact.stdout, /TS-AGENT-R004/u);
  assert.match(agentCompact.stdout, /Directive: edit listed targets/u);

  const snapshot = runCliCapture(["--agent-snapshot", "."], root);
  assert.equal(snapshot.exitCode, 0);
  assert.match(snapshot.stdout, /^Modules: source=1 branches=1/u);
  assert.match(
    snapshot.stdout,
    /OwnerBranches:\n - src\/index\.ts \[root, facade\] owner=src exports=ok/u,
  );

  const invalid = runCliCapture(["--json", "--agent-compact", "."], root);
  assert.equal(invalid.exitCode, 2);
  assert.match(invalid.stderr, /cannot combine/u);
});

function runCliCapture(
  argv: readonly string[],
  cwd: string,
): {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
} {
  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    argv,
    {
      stdout: { write: (chunk: string) => void (stdout += chunk) },
      stderr: { write: (chunk: string) => void (stderr += chunk) },
    },
    cwd,
  );
  return { exitCode, stdout, stderr };
}
