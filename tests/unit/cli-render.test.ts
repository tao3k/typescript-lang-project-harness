import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HELP_TEXT, runCli } from "../../src/cli/main.js";

function captureStd() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    stdout: {
      write(chunk: string) {
        out.push(chunk);
      },
    },
    stderr: {
      write(chunk: string) {
        err.push(chunk);
      },
    },
    out,
    err,
  };
}

describe("CLI protocol help", () => {
  it("documents only search, check, and agent entrypoints", () => {
    assert.ok(HELP_TEXT.includes("ts-harness search <view>"));
    assert.ok(HELP_TEXT.includes("ts-harness query (--catalog <id> | --treesitter-query"));
    assert.ok(HELP_TEXT.includes("ts-harness check"));
    assert.ok(HELP_TEXT.includes("ts-harness agent doctor"));
    assert.doesNotMatch(HELP_TEXT, /--tree(?:\s|$)/u);
    assert.equal(HELP_TEXT.includes("--stats"), false);
    assert.equal(HELP_TEXT.includes("--harness"), false);
    assert.equal(HELP_TEXT.includes("--agent-compact"), false);
    assert.equal(HELP_TEXT.includes("--agent-snapshot"), false);
  });

  it("runCli with --help prints help and exits 0", () => {
    const { stdout, stderr, out, err } = captureStd();
    const code = runCli(["--help"], { stdout, stderr }, "/");
    assert.equal(code, 0);
    assert.match(out.join(""), /^ts-harness/u);
    assert.equal(err.join(""), "");
  });
});

describe("CLI removed compatibility flags", () => {
  it("rejects old direct output flags", () => {
    for (const argv of [
      ["--tree", "."],
      ["--stats", "."],
      ["--harness", "."],
      ["--agent-compact", "."],
      ["--agent-snapshot", "."],
    ]) {
      const { stdout, stderr } = captureStd();
      const code = runCli(argv, { stdout, stderr }, "/");
      assert.equal(code, 2);
    }
  });

  it("rejects bare project-root invocation", () => {
    const { stdout, stderr } = captureStd();
    const code = runCli(["."], { stdout, stderr }, "/");
    assert.equal(code, 2);
  });
});
