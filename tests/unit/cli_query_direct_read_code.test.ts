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
    "--code",
    ".",
  ]);
  assert.equal(args?.kind, "query");
  let stdout = "";
  const status = runProtocolCli(
    args,
    { stdout: { write: (chunk: string) => (stdout += chunk) }, stderr: { write: () => undefined } },
    projectRoot,
    "",
  );

  assert.equal(status, 0);
  assert.match(stdout, /mode=exact-source/u);
  assert.match(stdout, /syntax=exact-source/u);
  assert.match(stdout, /lineRange=7:14/u);
  assert.match(stdout, /function second/u);
  assert.match(stdout, /\\"--selector\\"/u);
  assert.doesNotMatch(stdout, /function first/u);
  assert.doesNotMatch(stdout, /const decision = classifyHook/u);
});
