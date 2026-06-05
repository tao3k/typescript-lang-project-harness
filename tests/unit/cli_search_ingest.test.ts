import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { TYPE_SCRIPT_SEARCH_VIEW_DESCRIPTORS } from "../../src/cli/semantic-language.js";
import { parseProtocolArgs } from "../../src/cli/protocol.js";
import { runCliCapture } from "./cli_helpers.js";

test("search ingest descriptor accepts items and tests pipes", () => {
  const descriptor = TYPE_SCRIPT_SEARCH_VIEW_DESCRIPTORS.find(
    (candidate) => candidate.method === "search/ingest",
  );

  assert.deepEqual(descriptor?.acceptedPipes, ["items", "tests"]);
  assert.equal(descriptor?.acceptsStdin, true);
});

test("search ingest accepts pipes before project root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-search-ingest-cli-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fixture" }));

  const result = runCliCapture(
    ["search", "ingest", "items", "tests", "--view", "seeds", "."],
    root,
  );

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /^\[search-ingest\] root=\. alg=seed-frontier/mu);
});

test("search ingest rejects extra positional root after pipes", () => {
  const parsed = parseProtocolArgs([
    "search",
    "ingest",
    "items",
    "tests",
    "extra",
    "--view",
    "seeds",
    ".",
  ]);

  assert.equal(parsed?.kind, "error");
  if (parsed?.kind !== "error") return;
  assert.equal(parsed.message, "expected at most one PROJECT_ROOT argument");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-search-ingest-cli-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fixture" }));

  const result = runCliCapture(
    ["search", "ingest", "items", "tests", "extra", "--view", "seeds", "."],
    root,
  );

  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /expected at most one PROJECT_ROOT argument/u);
});
