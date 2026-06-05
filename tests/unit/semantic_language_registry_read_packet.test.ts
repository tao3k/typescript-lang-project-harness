import assert from "node:assert/strict";
import test from "node:test";

import {
  SEMANTIC_DEV_COMMAND_LOG_SCHEMA_ID,
  SEMANTIC_QUERY_PACKET_SCHEMA_ID,
  SEMANTIC_READ_PACKET_SCHEMA_ID,
  SEMANTIC_SOURCE_LOCATION_SCHEMA_ID,
  SEMANTIC_TREE_SITTER_PROVENANCE_SCHEMA_ID,
  SEMANTIC_TREE_SITTER_GRAMMAR_PROFILE_SCHEMA_ID,
  SEMANTIC_TREE_SITTER_QUERY_SCHEMA_ID,
  semanticLanguageRegistryDocument,
} from "../../src/cli/semantic-language.js";

test("registry declares TypeScript direct-source-read read packet output", () => {
  const registry = semanticLanguageRegistryDocument();
  const language = registry.languages.find((candidate) => candidate.languageId === "typescript");
  assert.ok(language, "typescript language registration should exist");
  assert.ok(language.methods.includes("query/direct-source-read"));

  const descriptor = language.methodDescriptors.find(
    (candidate) => candidate.method === "query/direct-source-read",
  );
  assert.ok(descriptor, "direct-source-read descriptor should exist");
  assert.equal(descriptor.command, "query");
  assert.deepEqual(descriptor.requiredOptions, ["--from-hook", "--selector"]);
  assert.deepEqual(descriptor.outputSchemaIds, [
    SEMANTIC_QUERY_PACKET_SCHEMA_ID,
    SEMANTIC_READ_PACKET_SCHEMA_ID,
  ]);
  assert.deepEqual(descriptor.packetSchemas, [
    "semantic-query-packet.v1",
    "semantic-read-packet.v1",
    "semantic-tree-sitter-query.v1",
  ]);
  assert.deepEqual(descriptor.queryInputForms, ["selector"]);
  assert.equal(descriptor.grammarId, "tree-sitter-typescript");
  assert.ok(descriptor.outputModes?.includes("read-packet"));
  assert.equal(descriptor.supportsJson, true);
});

test("registry advertises dev command log schema", () => {
  const registry = semanticLanguageRegistryDocument();
  const language = registry.languages.find((candidate) => candidate.languageId === "typescript");
  assert.ok(language, "typescript language registration should exist");
  const schema = language.schemas.find(
    (candidate) => candidate.schemaId === SEMANTIC_DEV_COMMAND_LOG_SCHEMA_ID,
  );
  assert.ok(schema, "dev command log schema should be advertised");
  assert.equal(schema.path, "schemas/semantic-dev-command-log.v1.schema.json");
});

test("registry advertises shared tree-sitter provenance schema", () => {
  const registry = semanticLanguageRegistryDocument();
  const language = registry.languages.find((candidate) => candidate.languageId === "typescript");
  assert.ok(language, "typescript language registration should exist");
  const sourceLocation = language.schemas.find(
    (candidate) => candidate.schemaId === SEMANTIC_SOURCE_LOCATION_SCHEMA_ID,
  );
  assert.ok(sourceLocation, "shared source-location schema should be advertised");
  assert.equal(sourceLocation.path, "schemas/semantic-source-location.v1.schema.json");
  const schema = language.schemas.find(
    (candidate) => candidate.schemaId === SEMANTIC_TREE_SITTER_PROVENANCE_SCHEMA_ID,
  );
  assert.ok(schema, "shared tree-sitter provenance schema should be advertised");
  assert.equal(schema.path, "schemas/semantic-tree-sitter-provenance.v1.schema.json");
});

test("registry declares TypeScript tree-sitter query ABI", () => {
  const registry = semanticLanguageRegistryDocument();
  const language = registry.languages.find((candidate) => candidate.languageId === "typescript");
  assert.ok(language, "typescript language registration should exist");
  assert.ok(language.methods.includes("query"));

  const descriptor = language.methodDescriptors.find((candidate) => candidate.method === "query");
  assert.ok(descriptor, "tree-sitter query descriptor should exist");
  assert.deepEqual(descriptor.outputSchemaIds, [SEMANTIC_TREE_SITTER_QUERY_SCHEMA_ID]);
  assert.deepEqual(descriptor.packetSchemas, ["semantic-tree-sitter-query.v1"]);
  assert.deepEqual(descriptor.queryInputForms, ["catalog-id", "s-expression"]);
  assert.equal(descriptor.grammarId, "tree-sitter-typescript");
  assert.equal(descriptor.grammarProfileVersion, "2026-06-05.v1");
  assert.equal(descriptor.cacheReplay, true);
  assert.equal(descriptor.queryCatalogs?.length, 3);

  const querySchema = language.schemas.find(
    (candidate) => candidate.schemaId === SEMANTIC_TREE_SITTER_QUERY_SCHEMA_ID,
  );
  assert.ok(querySchema, "tree-sitter query schema should be advertised");
  assert.equal(querySchema.path, "schemas/semantic-tree-sitter-query.v1.schema.json");

  const profileSchema = language.schemas.find(
    (candidate) => candidate.schemaId === SEMANTIC_TREE_SITTER_GRAMMAR_PROFILE_SCHEMA_ID,
  );
  assert.ok(profileSchema, "tree-sitter grammar profile schema should be advertised");
  assert.equal(profileSchema.path, "schemas/semantic-tree-sitter-grammar-profile.v1.schema.json");
});
