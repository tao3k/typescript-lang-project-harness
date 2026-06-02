import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCliCapture } from "./cli_helpers.js";

test("search query maps hook selector terms into query-set owner and test seeds", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-search-query-"));
  fs.mkdirSync(path.join(root, "src", "cli", "semantic-search"), { recursive: true });
  fs.mkdirSync(path.join(root, "tests", "unit"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "search-query-fixture", type: "module" }),
  );
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        strict: true,
      },
      include: ["src/**/*.ts", "tests/**/*.ts"],
    }),
  );
  fs.writeFileSync(
    path.join(root, "src", "cli", "protocol.ts"),
    [
      "export function parseSearchArgs(argv: readonly string[]) {",
      "  const querySets = argv.filter((arg) => arg.startsWith('--term='));",
      "  return { querySets };",
      "}",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "src", "cli", "semantic-search", "build.ts"),
    [
      "export function buildSemanticSearchPacket(querySets: readonly string[]) {",
      "  return { querySets };",
      "}",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "tests", "unit", "protocol.test.ts"),
    [
      "import { parseSearchArgs } from '../../src/cli/protocol.js';",
      "",
      "export function coversQuerySets() {",
      "  return parseSearchArgs(['--term=querySets']);",
      "}",
      "",
    ].join("\n"),
  );

  const result = runCliCapture(
    [
      "search",
      "query",
      "--from-hook",
      "direct-source-read",
      "--selector",
      "**/*.{ts,tsx,js}",
      "--intent",
      "inspect-cli-search",
      "--term",
      "parseSearchArgs",
      "--term",
      "querySets",
      "--term",
      "buildSemanticSearchPacket",
      "--surface",
      "owner,tests",
      "--view",
      "seeds",
      ".",
    ],
    root,
  );

  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /^\[search-fzf\].*querySet=3.*pipes=owner,tests/mu);
  assert.match(result.stdout, /\|query parseSearchArgs status=hit/mu);
  assert.match(result.stdout, /\|query querySets status=(?:hit|partial)/mu);
  assert.match(result.stdout, /\|query buildSemanticSearchPacket status=hit/mu);
  assert.match(result.stdout, /\|seed owner:.*src\/cli\/protocol\.ts/mu);
  assert.match(result.stdout, /\|seed owner:.*src\/cli\/semantic-search\/build\.ts/mu);
  assert.match(result.stdout, /\|seed tests:tests\/unit\/protocol\.test\.ts/mu);
  assert.match(result.stdout, /algorithm=query-set-owner-resolution/mu);

  fs.rmSync(root, { recursive: true, force: true });
});

test("search query validates hook selector and terms", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-search-query-errors-"));
  const missingSelector = runCliCapture(
    ["search", "query", "--from-hook", "direct-source-read", "--term", "parseSearchArgs", "."],
    root,
  );
  assert.equal(missingSelector.exitCode, 2);
  assert.match(missingSelector.stderr, /--from-hook requires --selector/u);

  const missingTerms = runCliCapture(
    ["search", "query", "--from-hook", "direct-source-read", "--selector", "**/*.ts", "."],
    root,
  );
  assert.equal(missingTerms.exitCode, 2);
  assert.match(missingTerms.stderr, /search query requires at least one --term/u);

  fs.rmSync(root, { recursive: true, force: true });
});
