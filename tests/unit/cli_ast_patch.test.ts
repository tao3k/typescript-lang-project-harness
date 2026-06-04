import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCliCapture } from "./cli_helpers.js";

test("ast-patch dry-run resolves bounded remove_statement targets without mutation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-ast-patch-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  const sourcePath = path.join(root, "src", "render.ts");
  const sourceText = [
    "export function render(value: string): string {",
    "  console.log(value);",
    "  if (value.length > 0) {",
    "    console.log(value);",
    "  }",
    "  return value;",
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(sourcePath, sourceText);
  const packet = {
    schemaId: "agent.semantic-protocols.semantic-ast-patch",
    schemaVersion: "1",
    protocolId: "agent.semantic-protocols.ast-patch",
    protocolVersion: "1",
    languageId: "typescript",
    target: {
      ownerPath: "src/render.ts",
      locator: "src/render.ts#fn:render",
      read: "src/render.ts:1:7",
    },
    operation: {
      op: "remove_statement",
      expectedSnippet: "console.log(value);",
      mechanicalKind: "bounded-multi-node",
      maxEdits: 5,
      allowLargeMechanicalEdit: true,
    },
  };

  const result = runCliCapture(
    ["ast-patch", "dry-run", "--packet", "-", "."],
    root,
    JSON.stringify(packet),
  );

  assert.equal(result.exitCode, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.status, "verified");
  assert.equal(receipt.capability, "provider-ast-dry-run");
  assert.equal(receipt.mutationAvailable, false);
  assert.equal(receipt.mechanicalEditPlan.safeForLargeChange, true);
  assert.deepEqual(receipt.mechanicalEditPlan.changedRanges, [
    "src/render.ts:2:2",
    "src/render.ts:4:4",
  ]);
  assert.equal(receipt.mechanicalEditPlan.estimatedEdits, 2);
  assert.equal(fs.readFileSync(sourcePath, "utf8"), sourceText);
});

test("ast-patch dry-run rejects unsupported operations without a plan", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-ast-patch-reject-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "render.ts"), "export const value = 1;\n");
  const packet = {
    schemaId: "agent.semantic-protocols.semantic-ast-patch",
    schemaVersion: "1",
    protocolId: "agent.semantic-protocols.ast-patch",
    protocolVersion: "1",
    languageId: "typescript",
    target: {
      ownerPath: "src/render.ts",
      locator: "src/render.ts#const:value",
      read: "src/render.ts:1:1",
    },
    operation: {
      op: "regex_replace_everything",
      expectedSnippet: "value",
    },
  };

  const result = runCliCapture(
    ["ast-patch", "dry-run", "--packet", "-", "."],
    root,
    JSON.stringify(packet),
  );

  assert.equal(result.exitCode, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.mechanicalEditPlan, null);
  assert.equal(receipt.failureKind, "unsupported-operation");
  assert.equal(receipt.operation, null);
  assert.match(receipt.failures.join("\n"), /unsupported operation regex_replace_everything/u);
});

test("ast-patch dry-run resolves replace_item targets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-ast-patch-replace-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  const sourcePath = path.join(root, "src", "render.ts");
  const expectedSnippet = [
    "export function render(value: string): string {",
    "  return value;",
    "}",
  ].join("\n");
  const replacementSnippet = [
    "export function render(value: string): string {",
    "  return value.trim();",
    "}",
  ].join("\n");
  const sourceText = expectedSnippet + "\n";
  fs.writeFileSync(sourcePath, sourceText);
  const packet = {
    schemaId: "agent.semantic-protocols.semantic-ast-patch",
    schemaVersion: "1",
    protocolId: "agent.semantic-protocols.ast-patch",
    protocolVersion: "1",
    languageId: "typescript",
    target: {
      ownerPath: "src/render.ts",
      locator: "src/render.ts#fn:render",
      read: "src/render.ts:1:3",
    },
    operation: {
      op: "replace_item",
      expectedSnippet,
      snippet: replacementSnippet,
    },
  };

  const result = runCliCapture(
    ["ast-patch", "dry-run", "--packet", "-", "."],
    root,
    JSON.stringify(packet),
  );

  assert.equal(result.exitCode, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.status, "verified");
  assert.deepEqual(receipt.supportedOperations, [
    "remove_statement",
    "replace_item",
    "insert_after_statement",
  ]);
  assert.deepEqual(receipt.mechanicalEditPlan.changedRanges, ["src/render.ts:1:3"]);
  assert.match(receipt.fields.diff, /-export function render/u);
  assert.match(receipt.fields.diff, /\+export function render/u);
  assert.equal(fs.readFileSync(sourcePath, "utf8"), sourceText);
});

test("ast-patch dry-run resolves insert_after_statement targets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-ast-patch-insert-after-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  const sourcePath = path.join(root, "src", "render.ts");
  const sourceText = [
    "export function render(value: string): string {",
    "  const current = value;",
    "  return current;",
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(sourcePath, sourceText);
  const packet = {
    schemaId: "agent.semantic-protocols.semantic-ast-patch",
    schemaVersion: "1",
    protocolId: "agent.semantic-protocols.ast-patch",
    protocolVersion: "1",
    languageId: "typescript",
    target: {
      ownerPath: "src/render.ts",
      locator: "src/render.ts#fn:render",
      read: "src/render.ts:1:4",
    },
    operation: {
      op: "insert_after_statement",
      expectedSnippet: "const current = value;",
      snippet: "const next = current.trim();",
    },
  };

  const result = runCliCapture(
    ["ast-patch", "dry-run", "--packet", "-", "."],
    root,
    JSON.stringify(packet),
  );

  assert.equal(result.exitCode, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.status, "verified");
  assert.deepEqual(receipt.mechanicalEditPlan.changedRanges, ["src/render.ts:2:2"]);
  assert.match(receipt.fields.diff, / const current = value;/u);
  assert.match(receipt.fields.diff, /\+const next = current.trim\(\);/u);
  assert.equal(fs.readFileSync(sourcePath, "utf8"), sourceText);
});
