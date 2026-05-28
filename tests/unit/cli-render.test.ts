import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runTypeScriptProjectHarness } from "../../src/runner.js";
import { renderTree } from "../../src/cli/render-tree.js";
import { renderStats } from "../../src/cli/render-stats.js";
import { renderCache } from "../../src/cli/render-cache.js";
import { runCli } from "../../src/cli/main.js";
import { HELP_TEXT } from "../../src/cli/help.js";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-cli-"));
}

function writeFile(dir: string, name: string, content: string): string {
  const full = path.join(dir, name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
  return full;
}

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

describe("CLI: --tree", () => {
  it("renders reasoning tree with modules and branches", () => {
    const dir = tmpDir();
    writeFile(dir, "src/index.ts", "export { helper } from './helper.js';");
    writeFile(dir, "src/helper.ts", "export function helper(x: string) { return x.trim(); }");
    const report = runTypeScriptProjectHarness(dir);
    const output = renderTree(report);
    assert.ok(output.includes("Modules:"), "has Modules line");
    assert.ok(output.includes("OwnerBranches:"), "has OwnerBranches");
    assert.ok(output.endsWith("\n\n"), "ends with newline");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("includes FindingGroups when findings exist", () => {
    const dir = tmpDir();
    writeFile(dir, "src/broken.ts", "export function broken( { }\n");
    const report = runTypeScriptProjectHarness(dir);
    const output = renderTree(report);
    assert.ok(output.includes("FindingGroups:"), "has FindingGroups section");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("CLI: --stats", () => {
  it("renders one-line stats", () => {
    const dir = tmpDir();
    writeFile(dir, "src/a.ts", "export const a = 1;");
    const report = runTypeScriptProjectHarness(dir);
    const output = renderStats(report);
    assert.ok(output.startsWith("[stats]"), "starts with [stats]");
    assert.ok(output.includes("files="), "has files count");
    assert.ok(output.includes("branches="), "has branches count");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("CLI: --cache", () => {
  it("shows empty cache when no cache dir exists", () => {
    const dir = tmpDir();
    const output = renderCache(dir);
    assert.ok(output.includes("[cache]"), "has [cache] tag");
    assert.ok(output.includes("empty"), "says empty");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("shows cached file when cache directory is created", () => {
    const dir = tmpDir();
    writeFile(dir, "src/a.ts", "export const a = 1;");
    // Manually create cache to simulate a cached state
    const cacheDir = path.join(dir, ".cache", "ts-harness");
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, "file-hashes.json"),
      JSON.stringify({ "src/a.ts": "abc" }),
      "utf8",
    );
    const output = renderCache(dir);
    assert.ok(output.includes("[cache]:"), "has [cache]:");
    assert.ok(output.includes("file-hashes.json"), "shows file name");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("CLI: --help", () => {
  it("displays help text", () => {
    assert.ok(HELP_TEXT.includes("Usage:"));
    assert.ok(HELP_TEXT.includes("--tree"));
    assert.ok(HELP_TEXT.includes("--stats"));
    assert.ok(HELP_TEXT.includes("--cache"));
    assert.ok(HELP_TEXT.includes("--help"));
  });

  it("runCli with --help prints help and exits 0", () => {
    const { stdout, stderr } = captureStd();
    const code = runCli(["--help"], { stdout, stderr }, "/");
    assert.equal(code, 0);
  });
});

describe("CLI: --findings", () => {
  it("executes without crash for clean project", () => {
    const dir = tmpDir();
    writeFile(dir, "src/a.ts", "export const a = 1;");
    const { stdout, stderr } = captureStd();
    const code = runCli(["--findings", dir], { stdout, stderr }, dir);
    assert.ok(code === 0 || code === 1, "returns valid exit code");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("CLI: error handling", () => {
  it("unknown flag returns error and exit 2", () => {
    const { stdout, stderr } = captureStd();
    const code = runCli(["--bogus"], { stdout, stderr }, "/");
    assert.equal(code, 2);
  });

  it("output flags cannot be combined", () => {
    const { stdout, stderr } = captureStd();
    const code = runCli(["--tree", "--stats", "."], { stdout, stderr }, "/");
    assert.equal(code, 2);
  });
});
