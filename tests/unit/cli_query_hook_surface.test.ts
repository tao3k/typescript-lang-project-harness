import assert from "node:assert/strict";
import test from "node:test";

import { parseProtocolArgs, runProtocolCli } from "../../src/cli/protocol.js";

test("query --from-hook broad selector accepts shared surfaces", () => {
  const args = parseProtocolArgs([
    "query",
    "--from-hook",
    "direct-source-read",
    "--selector",
    "**/*.{ts,tsx,js}",
    "--term",
    "HookDecision",
    "--surface",
    "owners,tests",
    "--view",
    "seeds",
    "--workspace",
    ".",
  ]);

  assert.equal(args?.kind, "search");
  assert.deepEqual(args?.pipes, ["owner", "tests"]);
  assert.equal(args?.renderMode, "seeds");

  let stdout = "";
  const status = runProtocolCli(
    args,
    {
      stdout: { write: (chunk: string) => void (stdout += chunk) },
      stderr: { write: () => undefined },
    },
    process.cwd(),
    "",
  );

  assert.equal(status, 0);
  assert.match(stdout, /querySet=1/);
  assert.match(stdout, /selector=fuzzy-set/);
  assert.match(
    stdout,
    /legend: (?:aliases ID:kind; node )?ID=kind:role\(value\)!next; edge SRC>{DST:rel}; frontier ID\.next/,
  );
  assert.match(stdout, /(?:aliases=G:search,Q:query|aliases: graph:\{G=search,Q=query)/);
  assert.match(stdout, /rank=Q,O,T frontier=Q\.fzf,O\.owner,T\.tests/);
  assert.doesNotMatch(stdout, /\|seed /);
});
