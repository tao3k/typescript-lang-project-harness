import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { HELP_TEXT } from "../../src/cli/main.js";
import {
  TYPE_SCRIPT_BINARY,
  TYPE_SCRIPT_PROVIDER_ID,
  TYPE_SCRIPT_PROVIDER_NAMESPACE,
  typeScriptSemanticLanguageRegistration,
} from "../../src/cli/semantic-language.js";

test("CLI documents ts-harness as the primary binary", () => {
  assert.match(HELP_TEXT, /^ts-harness — TypeScript semantic search/u);
  assert.match(HELP_TEXT, /ts-harness search prime \./u);
  assert.doesNotMatch(HELP_TEXT, /ts-harnesss/u);
  assert.doesNotMatch(HELP_TEXT, new RegExp(["typescript", "project", "harness"].join("-"), "u"));
});

test("CLI package bin and semantic registry use the same canonical binary", () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(testDir, "..", "..", "..");
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")) as {
    readonly bin?: Record<string, string>;
  };
  const registration = typeScriptSemanticLanguageRegistration();

  assert.equal(TYPE_SCRIPT_BINARY, "ts-harness");
  assert.equal(TYPE_SCRIPT_PROVIDER_ID, "ts-harness");
  assert.equal(
    TYPE_SCRIPT_PROVIDER_NAMESPACE,
    "agent.semantic-protocols.languages.typescript.ts-harness",
  );
  assert.deepEqual(Object.keys(pkg.bin ?? {}), [TYPE_SCRIPT_BINARY]);
  assert.equal(pkg.bin?.[TYPE_SCRIPT_BINARY], "./dist/src/cli/main.js");
  assert.equal(registration.providerId, TYPE_SCRIPT_PROVIDER_ID);
  assert.equal(registration.binary, TYPE_SCRIPT_BINARY);
  assert.equal(registration.namespace, TYPE_SCRIPT_PROVIDER_NAMESPACE);
  assert.notEqual(TYPE_SCRIPT_BINARY, "ts-harnesss");
  assert.doesNotMatch(JSON.stringify(pkg.bin), /ts-harnesss/u);
  assert.doesNotMatch(
    JSON.stringify(pkg.bin),
    new RegExp(["typescript", "project", "harness"].join("-"), "u"),
  );
});
