import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CompactGraphRenderError,
  SEMANTIC_AGENT_PROTOCOL_BIN_ENV,
  renderCompactGraphPacket,
} from "../../src/cli/semantic-search/compact-graph-render.js";
import type { SemanticSearchPacket } from "../../src/cli/semantic-search/types.js";

test("compact graph renderer shells out to canonical asp by default", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "ts-graph-render-"));
  const argvPath = path.join(dir, "argv.txt");
  const stdinPath = path.join(dir, "stdin.json");
  const aspBin = path.join(dir, "asp");
  writeFileSync(
    aspBin,
    "#!/bin/sh\n" +
      'printf "%s\\n" "$@" > "$ASLP_ARGV_PATH"\n' +
      'cat > "$ASLP_STDIN_PATH"\n' +
      'printf "[search-fzf] q=test\\n"\n',
  );
  chmodSync(aspBin, 0o755);
  const oldBin = process.env[SEMANTIC_AGENT_PROTOCOL_BIN_ENV];
  const oldPath = process.env.PATH;
  const oldArgvPath = process.env.ASLP_ARGV_PATH;
  const oldStdinPath = process.env.ASLP_STDIN_PATH;
  t.after(() => {
    restoreEnv(SEMANTIC_AGENT_PROTOCOL_BIN_ENV, oldBin);
    restoreEnv("PATH", oldPath);
    restoreEnv("ASLP_ARGV_PATH", oldArgvPath);
    restoreEnv("ASLP_STDIN_PATH", oldStdinPath);
  });
  delete process.env[SEMANTIC_AGENT_PROTOCOL_BIN_ENV];
  process.env.PATH = `${dir}${path.delimiter}${oldPath ?? ""}`;
  process.env.ASLP_ARGV_PATH = argvPath;
  process.env.ASLP_STDIN_PATH = stdinPath;

  const packet = { header: { kind: "search-fzf" } } as unknown as SemanticSearchPacket;
  const output = renderCompactGraphPacket(packet, 3);

  assert.equal(output, "[search-fzf] q=test\n");
  assert.deepEqual(readFileSync(argvPath, "utf8").trimEnd().split("\n"), [
    "graph",
    "render",
    "--packet",
    "-",
    "--view",
    "seeds",
    "--seeds",
    "3",
  ]);
  assert.deepEqual(JSON.parse(readFileSync(stdinPath, "utf8")), packet);
});

test("compact graph renderer does not fallback when protocol bin is missing", (t) => {
  const oldBin = process.env[SEMANTIC_AGENT_PROTOCOL_BIN_ENV];
  t.after(() => {
    restoreEnv(SEMANTIC_AGENT_PROTOCOL_BIN_ENV, oldBin);
  });
  process.env[SEMANTIC_AGENT_PROTOCOL_BIN_ENV] = path.join(tmpdir(), "missing-asp");

  assert.throws(
    () =>
      renderCompactGraphPacket({
        header: { kind: "search-fzf" },
      } as unknown as SemanticSearchPacket),
    CompactGraphRenderError,
  );
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
