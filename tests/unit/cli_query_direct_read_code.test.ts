import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parseProtocolArgs, runProtocolCli } from "../../src/cli/protocol.js";

test("query --from-hook line range --code emits exact source window", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-query-code-"));
  fs.mkdirSync(path.join(projectRoot, "src"));
  fs.writeFileSync(
    path.join(projectRoot, "src", "sample.ts"),
    `function first(): void {
  assert.deepEqual(
    decision.routes[0].argv,
    [
      "py-harness",
      "query",
      "--selector",
      "src/tools/report.py",
      ".",
    ],
  );
}

function second(): void {
  const decision = classifyHook();
}
`,
  );
  const args = parseProtocolArgs([
    "query",
    "--from-hook",
    "direct-source-read",
    "--selector",
    "src/sample.ts:7-14",
    "--workspace",
    projectRoot,
    "--code",
  ]);
  assert.equal(args?.kind, "query");
  let stdout = "";
  const outsideCwd = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-query-code-cwd-"));
  const status = runProtocolCli(
    args,
    { stdout: { write: (chunk: string) => (stdout += chunk) }, stderr: { write: () => undefined } },
    outsideCwd,
    "",
  );

  assert.equal(status, 0);
  assert.equal(
    stdout,
    [
      '      "--selector",',
      '      "src/tools/report.py",',
      '      ".",',
      "    ],",
      "  );",
      "}",
      "",
      "function second(): void {",
      "",
    ].join("\n"),
  );
  assert.doesNotMatch(stdout, /\[read-owner\]/u);
  assert.doesNotMatch(stdout, /\|code /u);
  assert.doesNotMatch(stdout, /function first/u);
  assert.doesNotMatch(stdout, /const decision = classifyHook/u);
});

test("query --code rejects trailing project root", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-query-code-reject-"));
  fs.mkdirSync(path.join(projectRoot, "src"));
  fs.writeFileSync(
    path.join(projectRoot, "src", "sample.ts"),
    "export function target(): void {}\n",
  );
  const cases: readonly (readonly string[])[] = [
    [
      "query",
      "--from-hook",
      "direct-source-read",
      "--selector",
      "src/sample.ts:1-1",
      "--code",
      projectRoot,
    ],
    ["query", "src/sample.ts", "--term", "target", "--code", projectRoot],
    [
      "query",
      "--treesitter-query",
      "(function_declaration name: (identifier) @function.name)",
      "--selector",
      "src/sample.ts:1-1",
      "--code",
      projectRoot,
    ],
    ["search", "owner", "src/sample.ts", "items", "--query", "target", "--code", projectRoot],
  ];

  for (const argv of cases) {
    const args = parseProtocolArgs(argv);
    assert.equal(args?.kind, "error");
    assert.match(args.message, /does not accept a trailing PROJECT_ROOT/u);
  }
});
