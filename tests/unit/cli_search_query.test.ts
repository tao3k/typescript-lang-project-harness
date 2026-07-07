import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCliCapture } from "./cli_helpers.js";

test("search lexical maps hook selector terms into query-set owner and test seeds", () => {
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
      "lexical",
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
      "--workspace",
      ".",
    ],
    root,
  );

  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /^\[search-lexical\].*querySet=3.*alg=query-set-owner-resolution/mu);
  assert.match(
    result.stdout,
    /(?:^|;)O=owner:path\(src\/cli\/semantic-search\/build\.ts\)!owner(?:;|$)/mu,
  );
  assert.match(
    result.stdout,
    /^rank=(?:Q,)?O,O2,O3,T,S,T2,S2 frontier=(?:Q\.lexical,)?O\.owner,O2\.owner,O3\.owner,T\.tests,S\.symbol,T2\.tests,S2\.symbol/mu,
  );
  assert.match(result.stdout, /S=symbol:symbol\(buildSemanticSearchPacket\)(?:@[^!]+)?!symbol/mu);
  assert.match(result.stdout, /S2=symbol:symbol\(parseSearchArgs\)(?:@[^!]+)?!symbol/mu);
  assert.doesNotMatch(result.stdout, /\|query /mu);
  assert.doesNotMatch(result.stdout, /\|seed /mu);

  fs.rmSync(root, { recursive: true, force: true });
});

test("search lexical validates hook selector and terms", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-search-query-errors-"));
  const missingSelector = runCliCapture(
    [
      "search",
      "lexical",
      "--from-hook",
      "direct-source-read",
      "--term",
      "parseSearchArgs",
      "--workspace",
      ".",
    ],
    root,
  );
  assert.equal(missingSelector.exitCode, 2);
  assert.match(missingSelector.stderr, /--from-hook requires --selector/u);

  const missingTerms = runCliCapture(
    [
      "search",
      "lexical",
      "--from-hook",
      "direct-source-read",
      "--selector",
      "**/*.ts",
      "--workspace",
      ".",
    ],
    root,
  );
  assert.equal(missingTerms.exitCode, 2);
  assert.match(missingTerms.stderr, /search lexical requires at least one --term/u);

  fs.rmSync(root, { recursive: true, force: true });
});
