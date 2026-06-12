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
      "--workspace",
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
  assert.equal(
    packet.syntaxQueryRef,
    "semantic-tree-sitter-query/typescript-owner-items:src_demo.ts:all",
  );
  assert.deepEqual(packet.syntaxMatchRefs, ["match:1"]);
  assert.deepEqual(packet.syntaxCaptureRefs, ["capture:1"]);
  assert.deepEqual(packet.syntaxAnchor, {
    nodeType: "function_declaration",
    field: "name",
    capture: "function.name",
    location: { path: "src/demo.ts", lineRange: "1:3" },
  });

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
  const alphaLines = alpha.lines as JsonObject[];
  assert.equal(alphaLines[0]?.number, 1);
  assert.equal(alphaLines[0]?.text, "export function alpha(input: string): string {");
});

test("query direct-source-read read-packet preserves exact non-item source window", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-read-packet-header-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "read-packet-header", type: "module" }),
  );
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
  fs.writeFileSync(
    path.join(root, "src", "header.ts"),
    [
      "// generated header",
      "// keep exact spacing",
      "export function run(): void {",
      "  return;",
      "}",
    ].join("\n"),
  );

  const result = runCliCapture(
    [
      "query",
      "--from-hook",
      "direct-source-read",
      "--selector",
      "src/header.ts:1:2",
      "--workspace",
      ".",
      "--code",
      "--view",
      "read-packet",
      "--json",
    ],
    root,
  );
  assert.equal(result.exitCode, 0, result.stderr);
  const packet = JSON.parse(result.stdout) as JsonObject;
  assert.equal(packet.readPlan, undefined);
  const windows = packet.sourceWindows as JsonObject[];
  assert.equal(windows.length, 1);
  assert.equal(windows[0]?.read, "src/header.ts:1:2");
  assert.equal(windows[0]?.itemName, undefined);
  assert.equal(windows[0]?.itemKind, undefined);
  assert.equal(windows[0]?.text, "// generated header\n// keep exact spacing");
  const lines = windows[0]?.lines as JsonObject[];
  assert.equal(lines[0]?.number, 1);
  assert.equal(lines[1]?.text, "// keep exact spacing");
});

test("query direct-source-read line selector emits bounded source window", () => {
  const root = readPacketFixture();
  const result = runCliCapture(
    [
      "query",
      "--from-hook",
      "direct-source-read",
      "--selector",
      "src/demo.ts:2:2",
      "--workspace",
      ".",
    ],
    root,
  );

  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(
    result.stdout,
    /^\[read-owner\] q=src\/demo\.ts selector=src\/demo\.ts:2:2 window=1/m,
  );
  assert.match(
    result.stdout,
    /\|read path=src\/demo\.ts item=alpha kind=function lineRange=2:2 read=src\/demo\.ts:2:2 next=direct-source-read reason=direct-selector truncated=false/,
  );
  assert.doesNotMatch(result.stdout, /\|code /);
  assert.doesNotMatch(result.stdout, /text=/);
  assert.doesNotMatch(result.stdout, /\|item function alpha/);
  assert.doesNotMatch(result.stdout, /interface Beta/);
});

test("query direct-source-read wide selector emits source windows", () => {
  const root = readPacketFixture();
  const jsonResult = runCliCapture(
    [
      "query",
      "--from-hook",
      "direct-source-read",
      "--selector",
      "src/demo.ts:1-80",
      "--workspace",
      ".",
      "--code",
      "--view",
      "read-packet",
      "--json",
    ],
    root,
  );
  assert.equal(jsonResult.exitCode, 0, jsonResult.stderr);
  const packet = JSON.parse(jsonResult.stdout) as JsonObject;
  assert.equal(packet.schemaVersion, "1");
  assert.equal(packet.outputMode, "read-packet");
  assert.equal(packet.readPlan, undefined);
  const windows = packet.sourceWindows as JsonObject[];
  assert.equal(windows.length, 2);
  assert.equal(windows[0]?.read, "src/demo.ts:1:3");
  assert.equal(windows[0]?.itemName, "alpha");
  assert.equal(
    windows[0]?.text,
    "export function alpha(input: string): string {\n  return input.toUpperCase();\n}",
  );
  assert.equal(windows[1]?.read, "src/demo.ts:4:6");
  assert.equal(windows[1]?.itemName, "Beta");
  assert.equal(windows[1]?.text, "export interface Beta {\n  readonly value: string;\n}");

  const lineResult = runCliCapture(
    [
      "query",
      "--from-hook",
      "direct-source-read",
      "--selector",
      "src/demo.ts:1-80",
      "--code",
      "--workspace",
      ".",
    ],
    root,
  );
  assert.equal(lineResult.exitCode, 0, lineResult.stderr);
  assert.match(lineResult.stdout, /^export function alpha/u);
  assert.match(lineResult.stdout, /export interface Beta/u);
  assert.doesNotMatch(lineResult.stdout, /^\[read-plan\] /u);
  assert.doesNotMatch(lineResult.stdout, /\|code /u);
});
