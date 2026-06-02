import assert from "node:assert/strict";
import test from "node:test";

import {
  SEMANTIC_QUERY_PACKET_SCHEMA_ID,
  SEMANTIC_READ_PACKET_SCHEMA_ID,
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
  assert.ok(descriptor.outputModes?.includes("read-packet"));
  assert.equal(descriptor.supportsJson, true);
});
