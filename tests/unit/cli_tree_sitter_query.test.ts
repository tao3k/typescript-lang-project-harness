import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCliCapture } from "./cli_helpers.js";

type JsonObject = Record<string, unknown>;

test("query --treesitter-query renders compact syntax capture locators", () => {
  const root = treeSitterQueryFixture();
  const result = runCliCapture(functionNameTreeSitterQueryArgs(), root);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.stdout, "src/demo.ts:1:3\nalpha");
  assert.doesNotMatch(result.stdout, /\|syntax-capture/u);
  assert.doesNotMatch(result.stdout, /artifactId|sqlite|cacheRoot/u);
});

test("query --treesitter-query --json emits semantic tree-sitter query packet", () => {
  const root = treeSitterQueryFixture();
  const result = runCliCapture(functionNameTreeSitterQueryArgs(["--json"]), root);
  assert.equal(result.exitCode, 0, result.stderr);
  const packet = JSON.parse(result.stdout) as JsonObject;
  assert.equal(packet.schemaId, "agent.semantic-protocols.semantic-tree-sitter-query");
  assert.equal(packet.method, "query");
  assert.equal(packet.languageId, "typescript");
  assert.equal(packet.providerId, "ts-harness");
  assert.equal(packet.grammarId, "tree-sitter-typescript");
  assert.equal(packet.grammarProfileVersion, "2026-06-05.v1");
  assert.equal(packet.sourceAuthority, "native-parser-adapter");
  assert.equal(packet.adapterMode, "native-projection");
  assert.equal(packet.compatibilityLevel, "native-only");
  const query = record(packet.query, "packet.query");
  assert.equal(query.inputForm, "s-expression");
  assert.deepEqual(record(query.fields, "packet.query.fields").captures, ["function.name"]);
  const matches = array(packet.matches, "packet.matches");
  assert.equal(matches.length, 1);
  const firstMatch = record(matches[0], "packet.matches[0]");
  assert.deepEqual(firstMatch.nativeFactRefs, ["typescript:item:src/demo.ts:1:3:alpha"]);
  const firstCapture = record(
    array(firstMatch.captures, "packet.matches[0].captures")[0],
    "capture",
  );
  assert.equal(firstCapture.name, "function.name");
  assert.equal(firstCapture.nodeType, "function_declaration");
  assert.equal(record(packet.cache, "packet.cache").rawSourceStored, false);
});

test("query --treesitter-query --selector --code prints pure code", () => {
  const root = treeSitterQueryFixture();
  const result = runCliCapture(
    functionNameTreeSitterQueryArgs(["--selector", "src/demo.ts:1:3", "--code"]),
    root,
  );
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(
    result.stdout,
    ["export function alpha(input: string): string {", "  return input.toUpperCase();", "}"].join(
      "\n",
    ),
  );
});

test("direct provider inline tree-sitter query requires ASP compiled plan", () => {
  const root = treeSitterQueryFixture();
  const result = runCliCapture(
    [
      "query",
      "--treesitter-query",
      "(function_declaration name: (identifier) @function.name)",
      ".",
    ],
    root,
  );
  assert.equal(result.exitCode, 3);
  assert.match(result.stderr, /requires ASP-compiled query plan/u);
});

test("query --catalog declarations uses embedded canonical catalog", () => {
  const root = treeSitterQueryFixture();
  const result = runCliCapture(["query", "--catalog", "declarations", "--json", "."], root);
  assert.equal(result.exitCode, 0, result.stderr);
  const packet = JSON.parse(result.stdout) as JsonObject;
  const query = record(packet.query, "packet.query");
  assert.equal(query.inputForm, "catalog-id");
  assert.equal(query.catalogId, "declarations");
  assert.equal(query.catalogPath, "tree-sitter/tree-sitter-typescript/queries/declarations.scm");
  assert.match(String(query.compiledSource), /function_declaration/u);
  assert.equal(query.grammarProfilePath, "tree-sitter/tree-sitter-typescript/grammar-profile.json");
  assert.ok(array(packet.matches, "packet.matches").length >= 4);
});

function treeSitterQueryFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-tree-sitter-query-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(
    path.join(root, "src", "demo.ts"),
    [
      "export function alpha(input: string): string {",
      "  return input.toUpperCase();",
      "}",
      "export class Worker {}",
      "export interface Beta { readonly id: string; }",
      "export const value = alpha('x');",
    ].join("\n"),
  );
  return root;
}

function functionNameTreeSitterQueryArgs(extraArgs: readonly string[] = []): readonly string[] {
  return [
    "query",
    "--treesitter-query",
    "(function_declaration name: (identifier) @function.name)",
    ...extraArgs,
    ".",
    "--asp-syntax-query-captures",
    "function.name",
    "--asp-syntax-query-node-types",
    "function_declaration,identifier",
    "--asp-syntax-query-fields",
    "name",
  ];
}

function record(value: unknown, label: string): JsonObject {
  assert.equal(typeof value, "object", `${label} should be object`);
  assert.notEqual(value, null, `${label} should not be null`);
  return value as JsonObject;
}

function array(value: unknown, label: string): readonly unknown[] {
  assert.ok(Array.isArray(value), `${label} should be array`);
  return value;
}
