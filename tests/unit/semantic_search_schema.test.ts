import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../../src/cli/main.js";

type JsonObject = Record<string, unknown>;

const TYPE_SCRIPT_SEARCH_VIEWS = [
  "workspace",
  "prime",
  "owner",
  "dependency",
  "deps",
  "symbol",
  "callsite",
  "import",
  "tests",
  "text",
  "ingest",
] as const;

test("semantic-search JSON packets conform to the shared schema envelope", () => {
  const schema = sharedSemanticSearchSchema();
  const viewEnum = stringArray(
    record(record(schema.properties).view).enum,
    "schema.properties.view.enum",
  );
  for (const view of TYPE_SCRIPT_SEARCH_VIEWS) {
    assert.ok(viewEnum.includes(view), `schema view enum includes ${view}`);
  }
  const fieldProperties = record(
    record(record(schema.$defs, "schema.$defs").fields, "schema.$defs.fields").properties,
    "schema.$defs.fields.properties",
  );
  assert.deepEqual(
    stringArray(
      record(fieldProperties.versionScope, "versionScope schema").enum,
      "versionScope enum",
    ),
    ["current", "external", "unknown"],
  );
  assert.ok(Object.hasOwn(fieldProperties, "currentWorkspaceVersion"));
  assert.equal(Object.hasOwn(fieldProperties, "workspaceResolvedVersion"), false);
  assert.equal(Object.hasOwn(fieldProperties, "resolvedVersion"), false);

  const root = semanticSearchFixture();
  const registry = jsonPacket(root, ["agent", "doctor", "--json", "."]);
  const provider = record(
    array(registry.languages, "registry.languages")[0],
    "registry.languages[0]",
  );
  const methods = stringArray(provider.methods, "registry.languages[0].methods");
  const packets = [
    jsonPacket(root, ["search", "workspace", "--json", "."]),
    jsonPacket(root, ["search", "prime", "--json", "."]),
    jsonPacket(root, ["search", "owner", "src/index.ts", "--json", "."]),
    jsonPacket(root, ["search", "dependency", "react", "--json", "."]),
    jsonPacket(root, ["search", "deps", "react::jsx", "--json", "."]),
    jsonPacket(root, ["search", "symbol", "findOrderStatus", "--json", "."]),
    jsonPacket(root, ["search", "callsite", "findOrderStatus", "--json", "."]),
    jsonPacket(root, ["search", "import", "./index", "--json", "."]),
    jsonPacket(root, ["search", "tests", "src/index.ts", "--json", "."]),
    jsonPacket(root, ["search", "text", "OrderStatus", "--json", "."]),
    jsonPacket(root, ["search", "ingest", "--json", "."], "src/index.ts:1:findOrderStatus\n"),
  ];

  assert.deepEqual(
    packets.map((packet) => packet.view),
    [...TYPE_SCRIPT_SEARCH_VIEWS],
  );
  for (const packet of packets) {
    assertSemanticSearchPacket(schema, packet);
    assert.equal(packet.languageId, provider.languageId);
    assert.equal(packet.providerId, provider.providerId);
    assert.equal(packet.binary, provider.binary);
    assert.equal(packet.namespace, provider.namespace);
    assert.ok(
      methods.includes(String(packet.method)),
      `registry includes ${String(packet.method)}`,
    );
  }
});

test("semantic language registry JSON documents the TypeScript provider identity", () => {
  const schema = sharedSemanticLanguageRegistrySchema();
  const root = semanticSearchFixture();
  const registry = jsonPacket(root, ["agent", "doctor", "--json", "."]);
  const properties = record(schema.properties, "registry schema.properties");
  assertAllowedKeys(registry, Object.keys(properties), "registry");
  assertRequiredKeys(
    registry,
    stringArray(schema.required, "registry schema.required"),
    "registry",
  );

  assert.equal(registry.registryId, record(properties.registryId, "registryId schema").const);
  assert.equal(
    registry.registryVersion,
    record(properties.registryVersion, "registryVersion schema").const,
  );
  assert.equal(registry.protocolId, record(properties.protocolId, "protocolId schema").const);
  assert.equal(
    registry.protocolVersion,
    record(properties.protocolVersion, "protocolVersion schema").const,
  );
  assertString(registry.projectRoot, "registry.projectRoot");

  const defs = record(schema.$defs, "registry schema.$defs");
  const languageRegistrationSchema = record(
    defs.languageRegistration,
    "registry schema languageRegistration",
  );
  const methodDescriptorSchema = record(defs.methodDescriptor, "registry schema methodDescriptor");
  const languages = array(registry.languages, "registry.languages");
  assert.equal(languages.length, 1);
  const language = record(languages[0], "registry.languages[0]");
  assertSchemaObject(language, languageRegistrationSchema, "registry.languages[0]");
  assert.equal(language.languageId, "typescript");
  assert.equal(language.providerId, "ts-harness");
  assert.equal(language.binary, "ts-harness");
  assert.equal(language.namespace, "agent.semantic-protocols.languages.typescript.ts-harness");
  assert.equal(language.displayName, "TypeScript");
  assert.deepEqual(stringArray(language.methods, "registry.languages[0].methods"), [
    "search/workspace",
    "search/prime",
    "search/owner",
    "search/dependency",
    "search/deps",
    "search/symbol",
    "search/callsite",
    "search/import",
    "search/tests",
    "search/text",
    "search/ingest",
    "check/changed",
    "check/full",
    "agent/doctor",
  ]);
  const methodDescriptors = array(
    language.methodDescriptors,
    "registry.languages[0].methodDescriptors",
  ).map((descriptor, index) =>
    record(descriptor, `registry.languages[0].methodDescriptors[${index}]`),
  );
  assert.equal(
    new Set(methodDescriptors.map((descriptor) => descriptor.method)).size,
    methodDescriptors.length,
    "registry methodDescriptors must not duplicate methods",
  );
  assert.deepEqual(
    methodDescriptors.map((descriptor) => descriptor.method),
    stringArray(language.methods, "registry.languages[0].methods"),
  );
  for (const descriptor of methodDescriptors) {
    assertSchemaObject(descriptor, methodDescriptorSchema, String(descriptor.method));
    assert.equal(descriptor.supportsJson, true);
    assert.equal(descriptor.supportsCompact, true);
    assert.ok(["search", "check", "agent"].includes(String(descriptor.command)));
    if (String(descriptor.method).startsWith("search/")) {
      assert.equal(descriptor.command, "search");
      assert.equal(descriptor.view, String(descriptor.method).slice("search/".length));
      assert.deepEqual(descriptor.outputSchemaIds, [
        "agent.semantic-protocols.semantic-search-packet",
      ]);
      assert.equal(
        descriptor.requiresQuery,
        [
          "search/owner",
          "search/dependency",
          "search/deps",
          "search/symbol",
          "search/callsite",
          "search/import",
          "search/tests",
          "search/text",
        ].includes(String(descriptor.method)),
      );
      assert.equal(descriptor.acceptsStdin, descriptor.method === "search/ingest");
      assert.equal(descriptor.supportsPackageScope, true);
    } else if (String(descriptor.method).startsWith("check/")) {
      assert.equal(descriptor.command, "check");
      assert.equal(Object.hasOwn(descriptor, "view"), false);
      assert.equal(Object.hasOwn(descriptor, "outputSchemaIds"), false);
      assert.equal(Object.hasOwn(descriptor, "requiresQuery"), false);
      assert.equal(Object.hasOwn(descriptor, "acceptsStdin"), false);
      assert.equal(Object.hasOwn(descriptor, "supportsPackageScope"), false);
    } else if (String(descriptor.method).startsWith("agent/")) {
      assert.equal(descriptor.command, "agent");
      assert.equal(Object.hasOwn(descriptor, "view"), false);
      assert.deepEqual(descriptor.outputSchemaIds, [
        "agent.semantic-protocols.semantic-language-registry",
      ]);
      assert.equal(Object.hasOwn(descriptor, "requiresQuery"), false);
      assert.equal(Object.hasOwn(descriptor, "acceptsStdin"), false);
      assert.equal(Object.hasOwn(descriptor, "supportsPackageScope"), false);
    }
  }
  const schemas = array(language.schemas, "registry.languages[0].schemas");
  const semanticSearchSchema = record(schemas[0], "registry.languages[0].schemas[0]");
  assert.equal(semanticSearchSchema.schemaId, "agent.semantic-protocols.semantic-search-packet");
  assert.equal(semanticSearchSchema.schemaVersion, "1");
  assert.equal(semanticSearchSchema.path, "schemas/semantic-search-packet.v1.schema.json");
  const registrySchema = record(schemas[1], "registry.languages[0].schemas[1]");
  assert.equal(registrySchema.schemaId, "agent.semantic-protocols.semantic-language-registry");
  assert.equal(registrySchema.schemaVersion, "1");
  assert.equal(registrySchema.path, "schemas/semantic-language-registry.v1.schema.json");
});

test("package-local semantic schemas stay synchronized with the protocol repository", () => {
  for (const schemaFileName of [
    "semantic-search-packet.v1.schema.json",
    "semantic-language-registry.v1.schema.json",
  ]) {
    const repoSchemaPath = protocolRepositorySchemaPath(schemaFileName);
    if (repoSchemaPath === undefined) {
      continue;
    }
    assert.deepEqual(
      readJson(packageSchemaPath(schemaFileName)),
      readJson(repoSchemaPath),
      `${schemaFileName} matches the protocol repository schema`,
    );
  }
});

function sharedSemanticSearchSchema(): JsonObject {
  return readJson(packageSchemaPath("semantic-search-packet.v1.schema.json"));
}

function sharedSemanticLanguageRegistrySchema(): JsonObject {
  return readJson(packageSchemaPath("semantic-language-registry.v1.schema.json"));
}

function packageRoot(): string {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(testDir, "..", "..", "..");
}

function packageSchemaPath(schemaFileName: string): string {
  return path.join(packageRoot(), "schemas", schemaFileName);
}

function protocolRepositorySchemaPath(schemaFileName: string): string | undefined {
  const packageRootPath = packageRoot();
  const repoRoot = path.resolve(packageRootPath, "..", "..");
  const requestedSchemaPath = path.join(repoRoot, "schemas", schemaFileName);
  return fs.existsSync(requestedSchemaPath) ? requestedSchemaPath : undefined;
}

function readJson(filePath: string): JsonObject {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonObject;
}

function semanticSearchFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-semantic-search-schema-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.mkdirSync(path.join(root, "tests"));
  fs.mkdirSync(path.join(root, "packages", "core", "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "@example/schema-search",
      dependencies: { react: "^19.0.0" },
      workspaces: ["packages/*"],
    }),
  );
  fs.writeFileSync(
    path.join(root, "packages", "core", "package.json"),
    JSON.stringify({
      name: "@example/core",
      type: "module",
      types: "./src/index.ts",
    }),
  );
  fs.writeFileSync(
    path.join(root, "packages", "core", "src", "index.ts"),
    "export interface Core { readonly ok: true; }\n",
  );
  fs.writeFileSync(
    path.join(root, "packages", "core", "tsconfig.json"),
    JSON.stringify({ include: ["src/**/*.ts"] }),
  );
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: { "@example/core": ["packages/core/src/index.ts"] },
      },
      include: ["src/**/*.ts", "tests/**/*.ts"],
    }),
  );
  fs.writeFileSync(
    path.join(root, "src", "index.ts"),
    ["export type OrderStatus = 'ok';", "export function findOrderStatus() { return 'ok'; }"].join(
      "\n",
    ),
  );
  fs.writeFileSync(
    path.join(root, "src", "consumer.ts"),
    [
      'import { findOrderStatus } from "./index.js";',
      'import type { ReactNode } from "react";',
      'import type { Core } from "@example/core";',
      "export const status = findOrderStatus();",
      "export type StatusNode = ReactNode;",
      "export type CoreStatus = Core;",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "tests", "index.test.ts"),
    'import { findOrderStatus } from "../src/index.js";\nfindOrderStatus();\n',
  );
  return root;
}

function jsonPacket(root: string, argv: readonly string[], stdin = ""): JsonObject {
  const result = runCliCapture(argv, root, stdin);
  assert.equal(result.exitCode, 0, result.stderr);
  return JSON.parse(result.stdout) as JsonObject;
}

function assertSemanticSearchPacket(schema: JsonObject, packet: JsonObject): void {
  const properties = record(schema.properties, "schema.properties");
  const required = stringArray(schema.required, "schema.required");
  const defs = record(schema.$defs, "schema.$defs");
  assertAllowedKeys(packet, Object.keys(properties), "packet");
  assertRequiredKeys(packet, required, "packet");

  assert.equal(packet.schemaId, record(properties.schemaId, "schemaId schema").const);
  assert.equal(
    packet.schemaVersion,
    record(properties.schemaVersion, "schemaVersion schema").const,
  );
  assert.equal(packet.protocolId, record(properties.protocolId, "protocolId schema").const);
  assert.equal(
    packet.protocolVersion,
    record(properties.protocolVersion, "protocolVersion schema").const,
  );
  assert.equal(packet.languageId, "typescript");
  assert.equal(packet.providerId, "ts-harness");
  assert.equal(packet.binary, "ts-harness");
  assert.equal(packet.namespace, "agent.semantic-protocols.languages.typescript.ts-harness");
  assertString(packet.projectRoot, "packet.projectRoot");
  assertString(packet.view, "packet.view");
  assertString(packet.method, "packet.method");
  assert.equal(packet.method, `search/${String(packet.view)}`);
  assert.ok(
    stringArray(record(properties.view, "view schema").enum, "view enum").includes(
      String(packet.view),
    ),
    `packet.view ${packet.view} is in schema enum`,
  );
  assert.ok(
    stringArray(
      record(properties.renderMode, "renderMode schema").enum,
      "renderMode enum",
    ).includes(String(packet.renderMode)),
    `packet.renderMode ${String(packet.renderMode)} is in schema enum`,
  );
  if (packet.packageName !== undefined) assertString(packet.packageName, "packet.packageName");
  if (packet.query !== undefined) assertString(packet.query, "packet.query");

  assertHeader(record(packet.header, "packet.header"), String(packet.view), record(defs.header));
  if (packet.inputDetection !== undefined) {
    assertInputDetection(record(packet.inputDetection), record(defs.inputDetection));
  }
  assertArray(packet.packages, "packet.packages", (fact, context) =>
    assertFact(fact, record(defs.fact), context),
  );
  assertArray(packet.nodes, "packet.nodes", (node, context) =>
    assertNode(node, record(defs.node), context),
  );
  assertArray(packet.edges, "packet.edges", (edge, context) =>
    assertEdge(edge, record(defs.edge), context),
  );
  assertArray(packet.owners, "packet.owners", (owner, context) =>
    assertOwner(owner, record(defs.owner), context),
  );
  assertArray(packet.items, "packet.items", (item, context) =>
    assertItem(item, record(defs.item), context),
  );
  assertArray(packet.hits, "packet.hits", (hit, context) =>
    assertHit(hit, record(defs.hit), context),
  );
  assertArray(packet.findings, "packet.findings", (finding, context) =>
    assertFinding(finding, record(defs.finding), context),
  );
  assertArray(packet.nextActions, "packet.nextActions", (nextAction, context) =>
    assertNextAction(nextAction, context),
  );
  assertArray(packet.notes, "packet.notes", (note, context) =>
    assertNote(note, record(defs.note), context),
  );
}

function assertHeader(header: JsonObject, view: string, schema: JsonObject): void {
  assertSchemaObject(header, schema, "header");
  assert.equal(header.kind, `search-${view}`);
  assertFields(header.fields, "header.fields");
}

function assertInputDetection(inputDetection: JsonObject, schema: JsonObject): void {
  assertSchemaObject(inputDetection, schema, "inputDetection");
  assert.ok(
    stringArray(
      record(record(schema.properties).source).enum,
      "inputDetection source enum",
    ).includes(String(inputDetection.source)),
  );
  assertNonNegativeInteger(inputDetection.lineCount, "inputDetection.lineCount");
  assertNonNegativeInteger(inputDetection.byteCount, "inputDetection.byteCount");
  if (inputDetection.sample !== undefined)
    assertString(inputDetection.sample, "inputDetection.sample");
}

function assertFact(fact: JsonObject, schema: JsonObject, context: string): void {
  assertSchemaObject(fact, schema, context);
  assertString(fact.id, `${context}.id`);
  assertFields(fact.fields, `${context}.fields`);
}

function assertNode(node: JsonObject, schema: JsonObject, context: string): void {
  assertSchemaObject(node, schema, context);
  assertString(node.id, `${context}.id`);
  assert.ok(
    stringArray(record(record(schema.properties).kind).enum, "node kind enum").includes(
      String(node.kind),
    ),
  );
  if (node.path !== undefined) assertString(node.path, `${context}.path`);
  assertFields(node.fields, `${context}.fields`);
}

function assertEdge(edge: JsonObject, schema: JsonObject, context: string): void {
  assertSchemaObject(edge, schema, context);
  assertString(edge.from, `${context}.from`);
  assertString(edge.kind, `${context}.kind`);
  assertString(edge.to, `${context}.to`);
  if (edge.label !== undefined) assertString(edge.label, `${context}.label`);
  if (edge.location !== undefined) assertLocation(record(edge.location), `${context}.location`);
  if (edge.fields !== undefined) assertFields(edge.fields, `${context}.fields`);
}

function assertOwner(owner: JsonObject, schema: JsonObject, context: string): void {
  assertSchemaObject(owner, schema, context);
  assertString(owner.path, `${context}.path`);
  if (owner.namespace !== undefined) assertString(owner.namespace, `${context}.namespace`);
  assertString(owner.role, `${context}.role`);
  assert.equal(typeof owner.public, "boolean", `${context}.public must be boolean`);
  if (owner.exports !== undefined) {
    assert.ok(Array.isArray(owner.exports), `${context}.exports must be an array`);
    for (const [index, exportName] of owner.exports.entries()) {
      assertString(exportName, `${context}.exports[${index}]`);
    }
  }
  assertArray(owner.nextActions, `${context}.nextActions`, (nextAction, nextActionContext) =>
    assertNextAction(nextAction, nextActionContext),
  );
  assertFields(owner.fields, `${context}.fields`);
}

function assertItem(item: JsonObject, schema: JsonObject, context: string): void {
  assertSchemaObject(item, schema, context);
  assertString(item.name, `${context}.name`);
  assertString(item.kind, `${context}.kind`);
  assertString(item.ownerPath, `${context}.ownerPath`);
  if (item.location !== undefined) assertLocation(record(item.location), `${context}.location`);
  assertFields(item.fields, `${context}.fields`);
}

function assertHit(hit: JsonObject, schema: JsonObject, context: string): void {
  assertSchemaObject(hit, schema, context);
  assertString(hit.kind, `${context}.kind`);
  assertString(hit.ownerPath, `${context}.ownerPath`);
  if (hit.symbol !== undefined) assertString(hit.symbol, `${context}.symbol`);
  assertLocation(record(hit.location), `${context}.location`);
  assertNumber(hit.score, `${context}.score`);
  assertString(hit.reason, `${context}.reason`);
  if (hit.snippet !== undefined) assertString(hit.snippet, `${context}.snippet`);
  if (hit.fields !== undefined) assertFields(hit.fields, `${context}.fields`);
}

function assertFinding(finding: JsonObject, schema: JsonObject, context: string): void {
  assertSchemaObject(finding, schema, context);
  assertString(finding.ruleId, `${context}.ruleId`);
  assert.ok(["info", "warning", "error"].includes(String(finding.severity)), `${context}.severity`);
  assertPositiveInteger(finding.count, `${context}.count`);
  if (finding.title !== undefined) assertString(finding.title, `${context}.title`);
  assertLocation(record(finding.location), `${context}.location`);
  if (finding.fields !== undefined) assertFields(finding.fields, `${context}.fields`);
}

function assertNextAction(nextAction: JsonObject, context: string): void {
  assertString(nextAction.kind, `${context}.kind`);
  assertString(nextAction.target, `${context}.target`);
  if (nextAction.scope !== undefined) assertString(nextAction.scope, `${context}.scope`);
  if (nextAction.ownerPath !== undefined)
    assertString(nextAction.ownerPath, `${context}.ownerPath`);
  if (nextAction.fields !== undefined) assertFields(nextAction.fields, `${context}.fields`);
}

function assertNote(note: JsonObject, schema: JsonObject, context: string): void {
  assertSchemaObject(note, schema, context);
  assertString(note.kind, `${context}.kind`);
  assertString(note.message, `${context}.message`);
  if (note.fields !== undefined) assertFields(note.fields, `${context}.fields`);
}

function assertSchemaObject(value: JsonObject, schema: JsonObject, context: string): void {
  assertAllowedKeys(
    value,
    Object.keys(record(schema.properties, `${context} schema properties`)),
    context,
  );
  assertRequiredKeys(value, stringArray(schema.required, `${context} schema required`), context);
}

function assertLocation(location: JsonObject, context: string): void {
  assertAllowedKeys(location, ["path", "line", "column", "endLine", "endColumn"], context);
  assertString(location.path, `${context}.path`);
  if (location.line !== undefined) assertPositiveInteger(location.line, `${context}.line`);
  if (location.column !== undefined) assertPositiveInteger(location.column, `${context}.column`);
  if (location.endLine !== undefined) assertPositiveInteger(location.endLine, `${context}.endLine`);
  if (location.endColumn !== undefined)
    assertPositiveInteger(location.endColumn, `${context}.endColumn`);
}

function assertFields(value: unknown, context: string): void {
  const fields = record(value, context);
  for (const [key, fieldValue] of Object.entries(fields)) {
    assertScalar(fieldValue, `${context}.${key}`);
  }
}

function assertScalar(value: unknown, context: string): void {
  if (typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${context} must be finite`);
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertScalarArrayItem(item, `${context}[${index}]`);
    }
    return;
  }
  assert.fail(`${context} must be a scalar field value`);
}

function assertScalarArrayItem(value: unknown, context: string): void {
  if (typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  assert.fail(`${context} must be a string, number, or boolean`);
}

function assertArray(
  value: unknown,
  context: string,
  itemAssertion: (item: JsonObject, context: string) => void,
): void {
  if (value === undefined) return;
  assert.ok(Array.isArray(value), `${context} must be an array`);
  for (const [index, item] of value.entries()) {
    itemAssertion(record(item, `${context}[${index}]`), `${context}[${index}]`);
  }
}

function assertAllowedKeys(
  value: JsonObject,
  allowedKeys: readonly string[],
  context: string,
): void {
  for (const key of Object.keys(value)) {
    assert.ok(allowedKeys.includes(key), `${context} has unexpected key ${key}`);
  }
}

function assertRequiredKeys(
  value: JsonObject,
  requiredKeys: readonly string[],
  context: string,
): void {
  for (const key of requiredKeys) {
    assert.ok(Object.hasOwn(value, key), `${context} missing required key ${key}`);
  }
}

function assertString(value: unknown, context: string): void {
  assert.equal(typeof value, "string", `${context} must be a string`);
}

function assertNumber(value: unknown, context: string): void {
  assert.equal(typeof value, "number", `${context} must be a number`);
  assert.ok(Number.isFinite(value), `${context} must be finite`);
}

function assertPositiveInteger(value: unknown, context: string): void {
  assert.equal(typeof value, "number", `${context} must be a number`);
  const numberValue = value as number;
  assert.ok(
    Number.isInteger(numberValue) && numberValue >= 1,
    `${context} must be an integer >= 1`,
  );
}

function assertNonNegativeInteger(value: unknown, context: string): void {
  assert.equal(typeof value, "number", `${context} must be a number`);
  const numberValue = value as number;
  assert.ok(
    Number.isInteger(numberValue) && numberValue >= 0,
    `${context} must be an integer >= 0`,
  );
}

function record(value: unknown, context = "value"): JsonObject {
  assert.equal(typeof value, "object", `${context} must be an object`);
  assert.notEqual(value, null, `${context} must not be null`);
  assert.equal(Array.isArray(value), false, `${context} must not be an array`);
  return value as JsonObject;
}

function stringArray(value: unknown, context: string): string[] {
  assert.ok(Array.isArray(value), `${context} must be an array`);
  for (const [index, item] of value.entries()) {
    assertString(item, `${context}[${index}]`);
  }
  return value;
}

function array(value: unknown, context: string): unknown[] {
  assert.ok(Array.isArray(value), `${context} must be an array`);
  return value;
}

function runCliCapture(
  argv: readonly string[],
  cwd: string,
  stdin = "",
): {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
} {
  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    argv,
    {
      stdout: { write: (chunk: string) => void (stdout += chunk) },
      stderr: { write: (chunk: string) => void (stderr += chunk) },
      stdin,
    },
    cwd,
  );
  return { exitCode, stdout, stderr };
}
