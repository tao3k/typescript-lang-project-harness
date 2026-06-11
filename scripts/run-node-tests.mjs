#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const mode = process.argv[2] ?? "implementation";
if (!["implementation", "policy"].includes(mode)) {
  console.error(`unknown test mode: ${mode}`);
  process.exit(2);
}

const root = process.cwd();
const fixtureAsp =
  process.platform === "win32"
    ? path.join(root, "tests", "fixtures", "bin", "asp.cmd")
    : path.join(root, "tests", "fixtures", "bin", "asp");

const testFiles =
  mode === "policy"
    ? [path.join(root, "dist", "tests", "unit", "self_policy.test.js")]
    : listFiles(path.join(root, "dist", "tests")).filter(
        (file) => file.endsWith(".test.js") && !file.endsWith(`${path.sep}self_policy.test.js`),
      );

if (testFiles.length === 0) {
  console.error(`no ${mode} test files found`);
  process.exit(1);
}

const args = [
  "--test",
  ...(mode === "implementation" ? ["--test-concurrency=1"] : []),
  ...testFiles,
];
const result = spawnSync(process.execPath, args, {
  env: {
    ...process.env,
    SEMANTIC_AGENT_PROTOCOL_BIN: fixtureAsp,
  },
  stdio: "inherit",
});

process.exit(result.status ?? 1);

function listFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files.sort();
}
