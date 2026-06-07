import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { TYPE_SCRIPT_SEARCH_VIEW_DESCRIPTORS } from "../../src/cli/semantic-language.js";
import { runCliCapture } from "./cli_helpers.js";

test("semantic graph facts descriptor is graph-turbo owned", () => {
  const descriptor = TYPE_SCRIPT_SEARCH_VIEW_DESCRIPTORS.find(
    (candidate) => candidate.method === "search/semantic-facts",
  );

  assert.ok(descriptor, "semantic facts descriptor should exist");
  assert.equal(descriptor.requiresQuery, true);
  assert.equal(descriptor.acceptsStdin, true);
  assert.deepEqual(descriptor.outputModes, ["json"]);
  assert.deepEqual(descriptor.packetSchemas, [
    "semantic-fact-graph.v1",
    "semantic-fact-ontology.v1",
  ]);
});

test("semantic graph facts renders field type and collection graph facts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-semantic-graph-facts-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fixture" }));
  fs.writeFileSync(
    path.join(root, "model.ts"),
    [
      "interface Catalog {",
      "  names: string[];",
      "  readonly tags: readonly string[];",
      "  byId: Map<string, number>;",
      "}",
      "",
      "class Store {",
      "  readonly items: Array<Catalog>;",
      "}",
    ].join("\n"),
  );

  const command = ["search", "semantic-facts", "array collection fields", "--json", "."];
  const result = runCliCapture(command, root, "model.ts:2:1:names\n");

  assert.equal(result.exitCode, 0, result.stderr);
  const payload = JSON.parse(result.stdout) as {
    readonly schemaId: string;
    readonly languageId: string;
    readonly providerId: string;
    readonly nodes: readonly {
      readonly id: string;
      readonly kind: string;
      readonly role?: string;
      readonly value?: string;
      readonly fields?: Record<string, unknown>;
    }[];
    readonly edges: readonly {
      readonly source: string;
      readonly target: string;
      readonly relation: string;
    }[];
  };
  assert.equal(payload.schemaId, "agent.semantic-protocols.semantic-fact-graph");
  assert.equal(payload.languageId, "typescript");
  assert.equal(payload.providerId, "ts-harness");
  const fieldNode = payload.nodes.find(
    (node) => node.kind === "field" && node.value === "names: string[]",
  );
  assert.ok(fieldNode, "expected interface field node");
  assert.equal(fieldNode.role, "interface-field");
  assert.deepEqual(fieldNode.fields, {
    languageId: "typescript",
    providerId: "ts-harness",
    semanticFactKind: "field",
    provenance: "parser",
    confidence: "exact",
    freshness: "fresh",
    containerKind: "interface",
    containerName: "Catalog",
    fieldName: "names",
    typeValue: "string[]",
    elementShape: "collection",
    contextLocator: "model.ts:1:5",
    contextStartLine: 1,
    contextEndLine: 5,
    field: {
      ownerKind: "interface",
      name: "names",
      ownerPath: "model.ts",
      access: ["read", "append", "validate"],
    },
    collectionKind: "array",
    collectionFamily: "sequence",
    collectionImpl: "array",
  });

  const typeNode = payload.nodes.find((node) => node.kind === "type" && node.value === "string[]");
  assert.ok(typeNode, "expected field type node");
  assert.deepEqual(typeNode.fields, {
    languageId: "typescript",
    providerId: "ts-harness",
    semanticFactKind: "type",
    provenance: "parser",
    confidence: "exact",
    freshness: "fresh",
    containerKind: "interface",
    containerName: "Catalog",
    fieldName: "names",
    typeValue: "string[]",
    elementShape: "collection",
    contextLocator: "model.ts:1:5",
    contextStartLine: 1,
    contextEndLine: 5,
    collectionKind: "array",
    collectionFamily: "sequence",
    collectionImpl: "array",
    type: { name: "string[]" },
  });
  assert.ok(
    payload.nodes.some(
      (node) =>
        node.kind === "field" &&
        node.value === "tags: readonly string[]" &&
        node.fields?.collectionKind === "array" &&
        node.fields?.collectionFamily === "sequence",
    ),
    "expected readonly array field node",
  );
  const collectionNode = payload.nodes.find(
    (node) => node.kind === "collection" && node.value === "array",
  );
  assert.ok(collectionNode, "expected array collection node");
  assert.deepEqual(collectionNode.fields, {
    languageId: "typescript",
    providerId: "ts-harness",
    semanticFactKind: "collection",
    provenance: "parser",
    confidence: "exact",
    freshness: "fresh",
    collectionKind: "array",
    collectionFamily: "sequence",
    collectionImpl: "array",
    collection: {
      family: "sequence",
      impl: "array",
      mutation: ["append", "insert", "remove"],
    },
  });
  assert.ok(payload.edges.some((edge) => edge.relation === "has_type"));
  assert.ok(payload.edges.some((edge) => edge.relation === "collection_of"));
});

test("semantic graph facts renders package build dependency and test facts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-semantic-project-facts-"));
  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "@scope/fact-pkg",
      dependencies: { zod: "^4.0.0" },
      devDependencies: { "node:test": "*" },
    }),
  );
  fs.writeFileSync(
    path.join(root, "tests", "api.test.ts"),
    ['import test from "node:test";', "", 'test("api", () => {', "  // fixture", "});"].join("\n"),
  );
  fs.writeFileSync(path.join(root, "model.ts"), "interface Cache {\n  entries: string[];\n}\n");

  const result = runCliCapture(
    ["search", "semantic-facts", "field", "--json", "."],
    root,
    "model.ts:2:1:entries\n",
  );

  assert.equal(result.exitCode, 0, result.stderr);
  const payload = JSON.parse(result.stdout) as {
    readonly nodes: readonly {
      readonly id: string;
      readonly kind: string;
      readonly action?: string;
      readonly path?: string;
      readonly value?: string;
      readonly fields?: Record<string, unknown>;
    }[];
    readonly edges: readonly {
      readonly source: string;
      readonly target: string;
      readonly relation: string;
    }[];
  };
  assert.ok(
    payload.nodes.some(
      (node) =>
        node.kind === "package" &&
        node.value === "@scope/fact-pkg" &&
        node.action === "package" &&
        node.fields?.semanticFactKind === "package" &&
        node.fields?.manifestPath === "package.json",
    ),
    "expected package node",
  );
  assert.ok(
    payload.nodes.some(
      (node) =>
        node.kind === "build" &&
        node.action === "build" &&
        node.fields?.semanticFactKind === "build" &&
        node.fields?.command === "npm test",
    ),
    "expected build node",
  );
  assert.ok(
    payload.nodes.some(
      (node) =>
        node.kind === "dependency" &&
        node.value === "zod" &&
        node.action === "deps" &&
        node.fields?.semanticFactKind === "dependency" &&
        node.fields?.dependencyKind === "normal" &&
        node.fields?.versionReq === "^4.0.0",
    ),
    "expected normal dependency node",
  );
  assert.ok(
    payload.nodes.some(
      (node) =>
        node.kind === "dependency" &&
        node.value === "node:test" &&
        node.fields?.dependencyKind === "dev",
    ),
    "expected dev dependency node",
  );
  assert.ok(
    payload.nodes.some(
      (node) =>
        node.kind === "test" &&
        node.path === "tests/api.test.ts" &&
        node.action === "tests" &&
        node.fields?.semanticFactKind === "test" &&
        node.fields?.functionCount === 1,
    ),
    "expected test node",
  );
  for (const relation of ["builds", "depends_on", "tests", "belongs_to"]) {
    assert.ok(
      payload.edges.some((edge) => edge.relation === relation),
      relation,
    );
  }
  const fieldNode = payload.nodes.find(
    (node) => node.kind === "field" && node.value === "entries: string[]",
  );
  const packageNode = payload.nodes.find((node) => node.kind === "package");
  assert.ok(fieldNode, "expected field node");
  assert.ok(packageNode, "expected package node");
  assert.ok(
    payload.edges.some(
      (edge) =>
        edge.source === fieldNode.id &&
        edge.target === packageNode.id &&
        edge.relation === "belongs_to",
    ),
    "expected field to package bridge",
  );
});
