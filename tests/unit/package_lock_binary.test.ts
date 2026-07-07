import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const packageRoot = path.resolve(import.meta.dirname, "../../..");

test("package lock keeps ts-harness bin on bundled CLI entrypoint", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(packageRoot, "package-lock.json"), "utf8"));

  assert.equal(pkg.bin?.["ts-harness"], "./dist/src/cli/main.bundle.js");
  assert.equal(lock.packages?.[""]?.bin?.["ts-harness"], "dist/src/cli/main.bundle.js");
  assert.notEqual(lock.packages?.[""]?.bin?.["ts-harness"], "dist/src/cli/main.js");
});
