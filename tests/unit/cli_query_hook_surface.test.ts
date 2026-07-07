import assert from "node:assert/strict";
import test from "node:test";

import { parseProtocolArgs, runProtocolCli } from "../../src/cli/protocol.js";

test("query --from-hook broad selector accepts shared surfaces", () => {
  const args = parseProtocolArgs([
    "search",
    "lexical",
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
  assert.match(stdout, /O=owner:path\(tests\/unit\/cli_query_hook_surface\.test\.ts\)!owner/);
  assert.match(stdout, /T=test:path\(tests\/unit\/cli_query_hook_surface\.test\.ts\)!tests/);
  assert.match(stdout, /frontier=.*O\.owner.*T\.tests/);
  assert.doesNotMatch(stdout, /\|seed /);
});
