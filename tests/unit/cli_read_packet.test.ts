import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCliCapture } from "./cli_helpers.js";

type JsonObject = Record<string, unknown>;

function readPacketFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-read-packet-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "read-packet-fixture", type: "module" }),
  );
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
  fs.writeFileSync(
    path.join(root, "src", "demo.ts"),
    [
      "export function alpha(input: string): string {",
      "  return input.toUpperCase();",
      "}",
      "export interface Beta {",
      "  readonly value: string;",
      "}",
    ].join("\n"),
  );
  return root;
}

test("query direct-source-read emits semantic read packet", () => {
  const root = readPacketFixture();
  const result = runCliCapture(
    [
      "query",
      "--from-hook",
      "direct-source-read",
      "--selector",
      "owner:src/demo.ts:1:3",
      "--json",
      ".",
    ],
    root,
  );
  assert.equal(result.exitCode, 0, result.stderr);

  const packet = JSON.parse(result.stdout) as JsonObject;
  assert.equal(packet.schemaId, "agent.semantic-protocols.semantic-read-packet");
  assert.equal(packet.schemaVersion, "1");
  assert.equal(packet.protocolId, "agent.semantic-protocols.semantic-language");
  assert.equal(packet.languageId, "typescript");
  assert.equal(packet.providerId, "ts-harness");
  assert.equal(packet.method, "query/direct-source-read");
  assert.equal(packet.ownerPath, "src/demo.ts");
  assert.equal(packet.selector, "owner:src/demo.ts:1:3");
  assert.equal(packet.fromHook, "direct-source-read");
  assert.equal(packet.outputMode, "read-packet");
  assert.equal(packet.truncated, false);

  assert.ok(Array.isArray(packet.sourceWindows));
  const windows = packet.sourceWindows as JsonObject[];
  assert.equal(windows.length, 1);
  const alpha = windows.find((window) => window.itemName === "alpha");
  assert.ok(alpha, "alpha function should be present");
  assert.equal(alpha.ownerPath, "src/demo.ts");
  assert.equal(alpha.read, "src/demo.ts:1:3");
  const alphaLocation = alpha.location as JsonObject;
  assert.equal(alphaLocation.lineRange, "1:3");
  assert.equal(alpha.lineCount, 3);
  assert.equal(alpha.reason, "direct-selector");
  assert.equal(alpha.truncated, false);
  assert.match(String(alpha.text), /export function alpha/);
});

test("query direct-source-read line selector emits bounded source window", () => {
  const root = readPacketFixture();
  const result = runCliCapture(
    ["query", "--from-hook", "direct-source-read", "--selector", "src/demo.ts:2:2", "."],
    root,
  );

  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(
    result.stdout,
    /^\[read-owner\] q=src\/demo\.ts selector=src\/demo\.ts:2:2 window=1/m,
  );
  assert.match(
    result.stdout,
    /\|read path=src\/demo\.ts item=alpha kind=function lineRange=2:2 reason=direct-selector truncated=false/,
  );
  assert.match(
    result.stdout,
    /\|code path=src\/demo\.ts lineRange=2:2 reason=direct-source-read text="  return input\.toUpperCase\(\);"/,
  );
  assert.doesNotMatch(result.stdout, /\|item function alpha/);
  assert.doesNotMatch(result.stdout, /interface Beta/);
});

test("query direct-source-read wide selector emits read plan without source windows", () => {
  const root = readPacketFixture();
  const jsonResult = runCliCapture(
    [
      "query",
      "--from-hook",
      "direct-source-read",
      "--selector",
      "src/demo.ts:1-80",
      "--code",
      "--view",
      "read-packet",
      "--json",
      ".",
    ],
    root,
  );
  assert.equal(jsonResult.exitCode, 0, jsonResult.stderr);
  const packet = JSON.parse(jsonResult.stdout) as JsonObject;
  assert.equal(packet.schemaVersion, "1");
  assert.equal(packet.outputMode, "read-packet");
  assert.equal(packet.sourceWindows, undefined);
  const readPlan = packet.readPlan as JsonObject;
  assert.equal(readPlan.mode, "range-frontier");
  assert.equal(readPlan.code, false);
  assert.equal(readPlan.reason, "wide-selector");
  assert.equal(readPlan.algorithm, "symbol-frontier");
  assert.deepEqual(readPlan.avoid, ["repeat-wide-read", "manual-window-scan", "raw-read"]);
  const frontier = readPlan.frontier as JsonObject[];
  assert.equal(frontier[0]?.kind, "symbol");
  assert.equal(frontier[0]?.action, "code");
  assert.equal(frontier[0]?.read, "src/demo.ts:1:3");
  const symbols = readPlan.symbols as JsonObject[];
  assert.equal(symbols[0]?.itemName, "alpha");

  const lineResult = runCliCapture(
    ["query", "--from-hook", "direct-source-read", "--selector", "src/demo.ts:1-80", "--code", "."],
    root,
  );
  assert.equal(lineResult.exitCode, 0, lineResult.stderr);
  assert.match(lineResult.stdout, /^\[read-plan\] /u);
  assert.match(lineResult.stdout, /mode=range-frontier/u);
  assert.match(lineResult.stdout, /alg=range-split/u);
  assert.match(lineResult.stdout, /frontier=W\.code,W2\.code/u);
  assert.match(lineResult.stdout, /reason=wide-selector/u);
  assert.doesNotMatch(lineResult.stdout, /export function alpha/u);
  assert.doesNotMatch(lineResult.stdout, /\|code /u);
});
