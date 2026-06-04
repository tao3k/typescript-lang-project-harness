import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCliCapture } from "./cli_helpers.js";

test("search fzf matches path-only TypeScript candidates", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-fzf-"));
  const workspaceRenderer = path.resolve(
    process.cwd(),
    "..",
    "..",
    ".bin",
    "semantic-agent-protocol",
  );
  const previousRenderer = process.env.SEMANTIC_AGENT_PROTOCOL_BIN;
  if (fs.existsSync(workspaceRenderer)) {
    process.env.SEMANTIC_AGENT_PROTOCOL_BIN = workspaceRenderer;
  }
  try {
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ type: "module" }));
    fs.writeFileSync(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          target: "ES2022",
        },
        include: ["src/**/*.ts"],
      }),
    );
    fs.writeFileSync(
      path.join(root, "src", "hook_runtime.ts"),
      "export function execute(): void {}\n",
    );

    const result = runCliCapture(
      ["search", "fzf", "hookruntime", "owner", "tests", "--view", "seeds", "."],
      root,
    );

    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /^\[search-fzf\] q=hookruntime/u);
    assert.match(result.stdout, /O=owner:path\(src\/hook_runtime\.ts\)!owner/u);
    assert.match(result.stdout, /rank=Q,O frontier=Q\.fzf,O\.owner/u);
    assert.match(
      result.stdout,
      /entries=owner-query\(O,Q=>items\+tests\+dependency-usage\),owner-tests\(O=>covering-tests\+test-entrypoints\+fixtures\)/u,
    );
    assert.doesNotMatch(result.stdout, /\|seed /u);

    const legacyAliasField = ["compatible", "Handles"].join("");
    const legacyResult = runCliCapture(
      [
        "search",
        "owner",
        "src/hook_runtime.ts",
        "items",
        "--query",
        legacyAliasField,
        "--view",
        "seeds",
        ".",
      ],
      root,
    );

    assert.equal(legacyResult.exitCode, 0, legacyResult.stderr);
    assert.match(legacyResult.stdout, /status=miss/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (previousRenderer === undefined) {
      delete process.env.SEMANTIC_AGENT_PROTOCOL_BIN;
    } else {
      process.env.SEMANTIC_AGENT_PROTOCOL_BIN = previousRenderer;
    }
  }
});
