import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runCliCapture } from "./cli_helpers.js";

const packageRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

test("agent guide advertises --code as pure item output", () => {
  const result = runCliCapture(["agent", "guide", packageRoot], packageRoot);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /asp typescript query <owner-path> --term <symbol> --code/);
  assert.match(
    result.stdout,
    /asp typescript search owner <owner-path> items --query <symbol-or-a\|b\|c> --code/,
  );
});

test("help advertises --code as an explicit owner item output mode", () => {
  const top = runCliCapture(["--help"], packageRoot);
  assert.equal(top.exitCode, 0, top.stderr);
  assert.match(top.stdout, /ts-harness search <view> \.\.\. \[--json\] \[--code\]/u);
  assert.match(
    top.stdout,
    /ts-harness query <owner-path> --term <symbol> \[--term <symbol>\] \[--names-only \| --code\]/u,
  );

  const search = runCliCapture(["search", "--help"], packageRoot);
  assert.equal(search.exitCode, 0, search.stderr);
  assert.match(
    search.stdout,
    /search owner <path> items --query <symbol> \[--names-only \| --code\]/u,
  );

  const query = runCliCapture(["query", "--help"], packageRoot);
  assert.equal(query.exitCode, 0, query.stderr);
  assert.match(query.stdout, /query <owner-path> --term <symbol> --code/u);
});

test("owner item query --code emits compact code without line protocol metadata", () => {
  const result = runCliCapture(
    [
      "search",
      "owner",
      "src/cli/semantic-search/types.ts",
      "items",
      "--query",
      "SemanticSearchPacket",
      "--code",
      ".",
    ],
    packageRoot,
  );

  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /^interface SemanticSearchPacket/u);
  assert.match(
    result.stdout,
    /readonly schemaId: "agent\.semantic-protocols\.semantic-search-packet"/u,
  );
  assert.doesNotMatch(result.stdout, /\[search-owner\]|\|owner |\|item |\|code |text=/u);
});

test("owner item query --code rejects JSON output", () => {
  const result = runCliCapture(
    [
      "search",
      "owner",
      "src/cli/semantic-search/types.ts",
      "items",
      "--query",
      "SemanticSearchPacket",
      "--code",
      "--json",
      ".",
    ],
    packageRoot,
  );

  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /--code cannot be combined with --json/u);
});
