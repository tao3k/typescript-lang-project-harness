import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCliCapture } from "./cli_helpers.js";

test("search fzf matches path-only TypeScript candidates", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-fzf-"));
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
    assert.match(result.stdout, /\|seed owner:src\/hook_runtime\.ts/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
