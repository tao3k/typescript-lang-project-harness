import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCliCapture } from "./cli_helpers.js";

test("compact graph entries use rendered aliases", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-search-entries-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "ts-search-entries", type: "module" }),
  );
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext" },
      include: ["src/**/*.ts", "tests/**/*.ts"],
    }),
  );
  fs.writeFileSync(
    path.join(root, "src/service.ts"),
    "export function describeService(): string { return 'service'; }\n",
  );
  fs.writeFileSync(
    path.join(root, "tests/service.test.ts"),
    "import { describeService } from '../src/service.js';\ndescribeService();\n",
  );

  const result = await runCliCapture(
    ["search", "lexical", "describe", "owner", "tests", "--view", "seeds", "--workspace", root],
    process.cwd(),
  );

  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /owner-tests\(O=>covering-tests\+test-entrypoints\+fixtures\)/);
  assert.doesNotMatch(result.stdout, /profiles=/);
  assert.doesNotMatch(result.stdout, /query-deps\(/);
  assert.doesNotMatch(result.stdout, /finding-frontier\(/);
});
