import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { tryRunExactSourceQueryCli } from "../../src/queries/exact-source-query-cli.js";

test("exact source query emits selector source window without protocol dispatch", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ts-exact-source-query-"));
  fs.mkdirSync(path.join(projectRoot, "src"));
  fs.writeFileSync(
    path.join(projectRoot, "src", "sample.ts"),
    [
      "export function first(): void {",
      "  const contentBlocks = [];",
      "  contentBlocks.push('ok');",
      "}",
      "export function second(): void {}",
      "",
    ].join("\n"),
  );
  let stdout = "";
  const status = tryRunExactSourceQueryCli(
    ["query", "--selector", "src/sample.ts:2-4", "--term", "contentBlocks", "--code", "."],
    { stdout: { write: (chunk: string) => void (stdout += chunk) } },
    projectRoot,
  );

  assert.equal(status, 0);
  assert.equal(stdout, "  const contentBlocks = [];\n  contentBlocks.push('ok');\n}\n");
});

test("exact source query declines non-code and json query shapes", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ts-exact-source-query-decline-"));
  fs.mkdirSync(path.join(projectRoot, "src"));
  fs.writeFileSync(path.join(projectRoot, "src", "sample.ts"), "export const value = 1;\n");

  assert.equal(
    tryRunExactSourceQueryCli(
      ["query", "--selector", "src/sample.ts:1-1", "--term", "value", "."],
      { stdout: { write: () => undefined } },
      projectRoot,
    ),
    undefined,
  );
  assert.equal(
    tryRunExactSourceQueryCli(
      ["query", "--selector", "src/sample.ts:1-1", "--term", "value", "--code", "--json", "."],
      { stdout: { write: () => undefined } },
      projectRoot,
    ),
    undefined,
  );
});
