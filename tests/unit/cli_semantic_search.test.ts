import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCliCapture } from "./cli_helpers.js";

test("CLI exposes semantic-search protocol commands", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-semantic-search-cli-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.mkdirSync(path.join(root, "tests"));
  fs.mkdirSync(path.join(root, "test-fixtures"));
  fs.mkdirSync(path.join(root, "schemas"));
  fs.mkdirSync(path.join(root, "packages", "core", "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "@example/search-cli",
      scripts: { build: "rspack build" },
      dependencies: { react: "^19.0.0", "@rspack/core": "^1.0.0" },
      workspaces: ["packages/*"],
    }),
  );
  fs.writeFileSync(
    path.join(root, "packages", "core", "package.json"),
    JSON.stringify({ name: "@example/core", type: "module", types: "./src/index.ts" }),
  );
  fs.writeFileSync(
    path.join(root, "packages", "core", "src", "index.ts"),
    "export interface Core { readonly ok: true; }\n",
  );
  fs.writeFileSync(
    path.join(root, "schemas", "semantic-search-packet.v1.schema.json"),
    JSON.stringify(
      {
        $id: "agent.semantic-protocols.semantic-search-packet",
        title: "Semantic Search Packet",
        properties: {
          schemaVersion: { const: "1" },
          searchSynthesis: { type: "object" },
        },
      },
      null,
      2,
    ),
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
    "export function findOrderStatus(input: string, strict: boolean): { readonly status: string; readonly strict: boolean } { return { status: strict ? input : 'ok', strict }; }\n",
  );
  fs.writeFileSync(
    path.join(root, "src", "consumer.ts"),
    [
      'import { findOrderStatus } from "./index.js";',
      'import type { Core } from "@example/core";',
      'const internalOrderToken = "ready";',
      'export const status = findOrderStatus("ready", true);',
      "export type CoreStatus = Core;",
    ].join("\n"),
  );
  fs.writeFileSync(path.join(root, "tests", "flow.spec.ts"), "const specOnlyMarker = true;\n");
  const olderSearchPath = path.join(root, "src", "a-old.ts");
  const newerSearchPath = path.join(root, "src", "z-new.ts");
  fs.writeFileSync(olderSearchPath, 'export {};\nconst sharedMtimeNeedle = "older";\n');
  fs.writeFileSync(newerSearchPath, 'export {};\nconst sharedMtimeNeedle = "newer";\n');
  fs.utimesSync(
    olderSearchPath,
    new Date("2025-01-01T00:00:00Z"),
    new Date("2025-01-01T00:00:00Z"),
  );
  fs.utimesSync(
    newerSearchPath,
    new Date("2025-02-01T00:00:00Z"),
    new Date("2025-02-01T00:00:00Z"),
  );
  fs.writeFileSync(
    path.join(root, "tests", "index.test.ts"),
    'import { findOrderStatus } from "../src/index.js";\nconst testOnlyMarker = "ready";\nfindOrderStatus("ready", true);\n',
  );
  fs.writeFileSync(
    path.join(root, "test-fixtures", "semantic_search_schema.test.ts"),
    "export const schemaFixture = true;\n",
  );

  const prime = runCliCapture(["search", "prime", "."], root);
  assert.equal(prime.exitCode, 0);
  assert.match(prime.stdout, /^\[search-prime\] /u);
  assert.match(prime.stdout, /\bsourceFiles=\d+\b/u);
  assert.match(prime.stdout, /\bowners=\d+\b/u);
  assert.match(prime.stdout, /\bextensions=1\b/u);
  assert.match(prime.stdout, /\bbuildTools=1\b/u);
  assert.match(prime.stdout, /\|tsconfig tsconfig\.json /u);
  assert.match(prime.stdout, /\bpathAliases=1\b/u);
  assert.match(prime.stdout, /\bpaths=@example\/core\b/u);
  assert.match(prime.stdout, /\|extension react /u);
  assert.match(prime.stdout, /\bactivation=dependency\b/u);
  assert.match(prime.stdout, /\|build_tool rspack /u);
  assert.match(prime.stdout, /\bscripts=build\b/u);
  assert.match(prime.stdout, /\|test_surface \. /u);
  assert.match(prime.stdout, /\btests=2\b/u);
  assert.match(prime.stdout, /\|synthesis .*algorithm=owner-rank-frontier/u);
  assert.match(prime.stdout, /\|owner src\/index\.ts/u);

  const primeSeeds = runCliCapture(["search", "prime", "--view", "seeds", "."], root);
  assert.equal(primeSeeds.exitCode, 0);
  assert.match(primeSeeds.stdout, /^\[search-prime\] /u);
  assert.match(primeSeeds.stdout, /\|flow prime->owner\|deps\|symbol\|tests/u);
  assert.match(primeSeeds.stdout, /\|synthesis .*algorithm=owner-rank-frontier/u);
  assert.match(primeSeeds.stdout, /\|seed owner:src\/index\.ts,/u);
  assert.match(primeSeeds.stdout, /\|seed symbol:findOrderStatus,/u);
  assert.doesNotMatch(primeSeeds.stdout, /\|owner /u);

  const workspace = runCliCapture(["search", "workspace", "."], root);
  assert.equal(workspace.exitCode, 0);
  assert.match(workspace.stdout, /^\[search-workspace\] /u);
  assert.match(workspace.stdout, /\bmode=workspace-index\b/u);
  assert.match(workspace.stdout, /\|package packages\/core /u);
  assert.doesNotMatch(workspace.stdout, /\|edge /u);

  const workspaceJson = runCliCapture(["search", "workspace", "--json", "."], root);
  assert.equal(workspaceJson.exitCode, 0);
  const workspacePacket = JSON.parse(workspaceJson.stdout) as {
    readonly method: string;
    readonly view: string;
    readonly packages: readonly { readonly id: string }[];
    readonly edges: readonly { readonly kind: string; readonly to: string }[];
  };
  assert.equal(workspacePacket.method, "search/workspace");
  assert.equal(workspacePacket.view, "workspace");
  assert.ok(workspacePacket.packages.some((pkg) => pkg.id === "packages/core"));
  assert.ok(
    workspacePacket.edges.some(
      (edge) => edge.kind === "workspace" && edge.to === "P:packages/core",
    ),
  );

  const packagePrime = runCliCapture(["search", "prime", "--package", "packages/core", "."], root);
  assert.equal(packagePrime.exitCode, 0);
  assert.match(packagePrime.stdout, /^\[search-prime\] /u);
  assert.match(packagePrime.stdout, /\bpackage=@example\/core\b/u);
  assert.match(packagePrime.stdout, /\|owner src\/index\.ts/u);

  const packagePrimeJson = runCliCapture(
    ["search", "prime", "--package", "packages/core", "--json", "."],
    root,
  );
  assert.equal(packagePrimeJson.exitCode, 0);
  const packagePrimePacket = JSON.parse(packagePrimeJson.stdout) as {
    readonly method: string;
    readonly view: string;
    readonly packageName: string;
    readonly projectRoot: string;
  };
  assert.equal(packagePrimePacket.method, "search/prime");
  assert.equal(packagePrimePacket.view, "prime");
  assert.equal(packagePrimePacket.packageName, "@example/core");
  assert.equal(packagePrimePacket.projectRoot, path.join(root, "packages", "core"));

  const primeJson = runCliCapture(["search", "prime", "--json", "."], root);
  assert.equal(primeJson.exitCode, 0);
  const packet = JSON.parse(primeJson.stdout) as {
    readonly schemaId: string;
    readonly schemaVersion: string;
    readonly protocolId: string;
    readonly protocolVersion: string;
    readonly languageId: string;
    readonly providerId: string;
    readonly binary: string;
    readonly namespace: string;
    readonly method: string;
    readonly view: string;
    readonly header: {
      readonly fields: {
        readonly sourceFiles?: number;
        readonly extensions?: number;
        readonly buildTools?: number;
      };
    };
    readonly nodes: readonly {
      readonly kind: string;
      readonly path?: string;
      readonly fields: Record<string, unknown>;
    }[];
    readonly owners: readonly unknown[];
    readonly searchSynthesis?: {
      readonly algorithm?: string;
      readonly scope?: string;
      readonly summary?: string;
      readonly highImpactOwners?: readonly string[];
    };
  };
  assert.equal(packet.schemaId, "agent.semantic-protocols.semantic-search-packet");
  assert.equal(packet.schemaVersion, "1");
  assert.equal(packet.protocolId, "agent.semantic-protocols.semantic-language");
  assert.equal(packet.protocolVersion, "1");
  assert.equal(packet.languageId, "typescript");
  assert.equal(packet.providerId, "ts-harness");
  assert.equal(packet.binary, "ts-harness");
  assert.equal(packet.namespace, "agent.semantic-protocols.languages.typescript.ts-harness");
  assert.equal(packet.method, "search/prime");
  assert.equal(packet.view, "prime");
  assert.equal(packet.header.fields.extensions, 1);
  assert.equal(packet.header.fields.buildTools, 1);
  assert.ok((packet.header.fields.sourceFiles ?? 0) >= 1);
  assert.ok(
    packet.nodes.some(
      (node) =>
        node.kind === "tsconfig" && node.path === "tsconfig.json" && node.fields.pathAliases === 1,
    ),
  );
  assert.ok(
    packet.nodes.some(
      (node) =>
        node.kind === "extension" &&
        node.path === "react" &&
        node.fields.activation === "dependency",
    ),
  );
  assert.ok(
    packet.nodes.some(
      (node) =>
        node.kind === "build_tool" &&
        node.path === "rspack" &&
        Array.isArray(node.fields.scripts) &&
        node.fields.scripts.includes("build"),
    ),
  );
  assert.ok(
    packet.nodes.some(
      (node) => node.kind === "test_surface" && node.path === "." && node.fields.tests === 2,
    ),
  );
  assert.equal(packet.searchSynthesis?.algorithm, "owner-rank-frontier");
  assert.equal(packet.searchSynthesis?.scope, "prime");
  assert.ok(packet.searchSynthesis?.highImpactOwners?.includes("src/index.ts"));
  assert.equal(packet.owners.length, 2);

  const text = runCliCapture(["search", "text", "OrderStatus", "."], root);
  assert.equal(text.exitCode, 0);
  assert.match(text.stdout, /^\[search-text\] /u);
  assert.match(text.stdout, /\|hit path=src\/index\.ts\b/u);
  assert.match(text.stdout, /\bsurface=real-source\b/u);
  assert.match(text.stdout, /\bownerRole=source\b/u);
  assert.match(text.stdout, /\btext=.*findOrderStatus/u);

  const textOwnerTestsPipe = runCliCapture(
    ["search", "text", "findOrderStatus", "owner", "tests", "."],
    root,
  );
  assert.equal(textOwnerTestsPipe.exitCode, 0);
  assert.match(textOwnerTestsPipe.stdout, /^\[search-text\] /u);
  assert.match(textOwnerTestsPipe.stdout, /\bpipes=owner,tests\b/u);
  assert.match(textOwnerTestsPipe.stdout, /\|owner src\/index\.ts/u);
  assert.match(textOwnerTestsPipe.stdout, /\|hit path=tests\/index\.test\.ts line=1\b/u);
  assert.match(
    textOwnerTestsPipe.stdout,
    /\|edge O:src\/index\.ts -test-> T:tests\/index\.test\.ts/u,
  );

  const textOwnerTestsPipeSeeds = runCliCapture(
    ["search", "text", "findOrderStatus", "owner", "tests", "--view", "seeds", "."],
    root,
  );
  assert.equal(textOwnerTestsPipeSeeds.exitCode, 0);
  assert.match(textOwnerTestsPipeSeeds.stdout, /^\[search-text\] /u);
  assert.match(textOwnerTestsPipeSeeds.stdout, /\bpipes=owner,tests\b/u);
  assert.match(
    textOwnerTestsPipeSeeds.stdout,
    /\|seed owner:src\/index\.ts,tests\/index\.test\.ts/u,
  );
  assert.match(textOwnerTestsPipeSeeds.stdout, /\|seed tests:tests\/index\.test\.ts/u);
  assert.doesNotMatch(textOwnerTestsPipeSeeds.stdout, /\|hit /u);

  const textQuerySetSeeds = runCliCapture(
    [
      "search",
      "text",
      "--query-set",
      "findOrderStatus",
      "--query-set",
      "internalOrderToken",
      "owner",
      "tests",
      "--view",
      "seeds",
      ".",
    ],
    root,
  );
  assert.equal(textQuerySetSeeds.exitCode, 0);
  assert.match(textQuerySetSeeds.stdout, /^\[search-text\] /u);
  assert.match(textQuerySetSeeds.stdout, /\bquerySet=2\b/u);
  assert.match(textQuerySetSeeds.stdout, /\bselector=exact-set\b/u);
  assert.match(textQuerySetSeeds.stdout, /\|seed owner:.*src\/index\.ts/u);
  assert.match(textQuerySetSeeds.stdout, /\|seed owner:.*src\/consumer\.ts/u);
  assert.match(textQuerySetSeeds.stdout, /\|seed tests:tests\/index\.test\.ts/u);

  const scopedTextQuerySetJson = runCliCapture(
    [
      "search",
      "text",
      "--query-set",
      "findOrderStatus",
      "--query-set",
      "internalOrderToken",
      "--owner",
      "src/consumer.ts",
      "--json",
      ".",
    ],
    root,
  );
  assert.equal(scopedTextQuerySetJson.exitCode, 0);
  const scopedQuerySetPacket = JSON.parse(scopedTextQuerySetJson.stdout) as {
    readonly query: string;
    readonly querySet: readonly { readonly value: string; readonly kind: string }[];
    readonly queryComposition: {
      readonly mode: string;
      readonly selector: string;
      readonly scope?: { readonly ownerPath?: string };
    };
    readonly header: {
      readonly fields: { readonly querySet?: number; readonly scopeOwner?: string };
    };
    readonly hits: readonly {
      readonly ownerPath: string;
      readonly fields?: { readonly queryTerms?: readonly string[] };
    }[];
  };
  assert.equal(scopedQuerySetPacket.query, "findOrderStatus,internalOrderToken");
  assert.deepEqual(
    scopedQuerySetPacket.querySet.map((term) => [term.value, term.kind]),
    [
      ["findOrderStatus", "text"],
      ["internalOrderToken", "text"],
    ],
  );
  assert.equal(scopedQuerySetPacket.queryComposition.mode, "query-set");
  assert.equal(scopedQuerySetPacket.queryComposition.selector, "exact-set");
  assert.equal(scopedQuerySetPacket.queryComposition.scope?.ownerPath, "src/consumer.ts");
  assert.equal(scopedQuerySetPacket.header.fields.querySet, 2);
  assert.equal(scopedQuerySetPacket.header.fields.scopeOwner, "src/consumer.ts");
  assert.ok(scopedQuerySetPacket.hits.length > 0);
  assert.ok(scopedQuerySetPacket.hits.every((hit) => hit.ownerPath === "src/consumer.ts"));
  assert.ok(
    scopedQuerySetPacket.hits.some((hit) => hit.fields?.queryTerms?.includes("internalOrderToken")),
  );

  const flagLikeTextQuery = runCliCapture(
    ["search", "text", "--json", "--view", "seeds", "."],
    root,
  );
  assert.equal(flagLikeTextQuery.exitCode, 0);
  assert.match(flagLikeTextQuery.stdout, /^\[search-text\] q=--json\b/u);
  assert.match(flagLikeTextQuery.stdout, /\|seed ingest:--json/u);
  assert.doesNotMatch(flagLikeTextQuery.stdout, /^\{/u);

  const testOnlyTextPipe = runCliCapture(
    ["search", "text", "testOnlyMarker", "owner", "tests", "."],
    root,
  );
  assert.equal(testOnlyTextPipe.exitCode, 0);
  assert.match(testOnlyTextPipe.stdout, /^\[search-text\] /u);
  assert.match(testOnlyTextPipe.stdout, /\|owner tests\/index\.test\.ts/u);
  assert.match(testOnlyTextPipe.stdout, /\|hit path=tests\/index\.test\.ts line=2\b/u);
  assert.match(testOnlyTextPipe.stdout, /\bsurface=test\b/u);
  assert.match(testOnlyTextPipe.stdout, /\bownerRole=test\b/u);
  assert.match(testOnlyTextPipe.stdout, /\btext=.*testOnlyMarker/u);
  assert.doesNotMatch(testOnlyTextPipe.stdout, /\|owner src\/index\.ts/u);
  assert.doesNotMatch(testOnlyTextPipe.stdout, /\|edge O:src\/index\.ts -test->/u);

  const specText = runCliCapture(["search", "text", "specOnlyMarker", "."], root);
  assert.equal(specText.exitCode, 0);
  assert.match(specText.stdout, /\|hit path=tests\/flow\.spec\.ts line=1\b/u);
  assert.match(specText.stdout, /\bsurface=test\b/u);

  const invalidTextPipe = runCliCapture(
    ["search", "text", "findOrderStatus", "tests", "owner", "."],
    root,
  );
  assert.equal(invalidTextPipe.exitCode, 2);
  assert.match(invalidTextPipe.stderr, /expected pipes \(owner,tests\) before PROJECT_ROOT/u);

  const sourceText = runCliCapture(["search", "text", "internalOrderToken", "."], root);
  assert.equal(sourceText.exitCode, 0);
  assert.match(sourceText.stdout, /^\[search-text\] /u);
  assert.match(sourceText.stdout, /\|hit path=src\/consumer\.ts line=3 column=7\b/u);
  assert.match(sourceText.stdout, /\bkind=text\b/u);
  assert.match(sourceText.stdout, /\breason=source-text\b/u);
  assert.match(sourceText.stdout, /\bsource=parser-visible-source\b/u);

  const recencyText = runCliCapture(["search", "text", "sharedMtimeNeedle", "."], root);
  assert.equal(recencyText.exitCode, 0);
  assert.match(recencyText.stdout, /^\[search-text\] /u);
  assert.match(recencyText.stdout, /\|hit path=src\/z-new\.ts line=2\b/u);
  assert.match(recencyText.stdout, /\|hit path=src\/a-old\.ts line=2\b/u);
  assert.ok(
    recencyText.stdout.indexOf("|hit path=src/z-new.ts line=2") <
      recencyText.stdout.indexOf("|hit path=src/a-old.ts line=2"),
    recencyText.stdout,
  );

  const symbol = runCliCapture(["search", "symbol", "findOrderStatus", "."], root);
  assert.equal(symbol.exitCode, 0);
  assert.match(symbol.stdout, /^\[search-symbol\] /u);
  assert.match(symbol.stdout, /\|hit path=src\/index\.ts line=1\b/u);
  assert.match(symbol.stdout, /kind=symbol/u);

  const api = runCliCapture(["search", "api", "findOrderStatus", "."], root);
  assert.equal(api.exitCode, 0);
  assert.match(api.stdout, /^\[search-api\] /u);
  assert.match(api.stdout, /\bsource=native-parser\b/u);
  assert.match(api.stdout, /\|api path=src\/index\.ts line=1\b/u);
  assert.match(api.stdout, /\bkind=api\b/u);
  assert.match(api.stdout, /\bapiKind=function\b/u);
  assert.match(api.stdout, /\bparams=input:string,strict:boolean\b/u);
  assert.match(api.stdout, /\breason=api-return-shape\b/u);
  assert.match(api.stdout, /\breturns=object\b/u);
  assert.match(api.stdout, /\bfields=status,strict\b/u);

  const externalApi = runCliCapture(["search", "api", "react@18.0.0::jsx", "."], root);
  assert.equal(externalApi.exitCode, 0);
  assert.match(externalApi.stdout, /^\[search-api\] /u);
  assert.match(externalApi.stdout, /\bsource=external-provider-missing\b/u);
  assert.match(externalApi.stdout, /external docs\/API provider/u);

  const docs = runCliCapture(["search", "docs", "searchSynthesis", "."], root);
  assert.equal(docs.exitCode, 0);
  assert.match(docs.stdout, /^\[search-docs\] /u);
  assert.match(docs.stdout, /\bsurface=schema-json\b/u);
  assert.match(docs.stdout, /\|hit path=schemas\/semantic-search-packet\.v1\.schema\.json/u);
  assert.match(docs.stdout, /\breason=schema-contract\b/u);
  assert.match(docs.stdout, /\bsource=schema-json\b/u);
  assert.match(docs.stdout, /\bpointer=.*searchSynthesis/u);

  const callsite = runCliCapture(["search", "callsite", "findOrderStatus", "."], root);
  assert.equal(callsite.exitCode, 0);
  assert.match(callsite.stdout, /^\[search-callsite\] /u);
  assert.match(callsite.stdout, /\|hit path=src\/consumer\.ts line=1\b/u);
  assert.match(callsite.stdout, /reason=import-owner/u);

  const imports = runCliCapture(["search", "import", "./index", "."], root);
  assert.equal(imports.exitCode, 0);
  assert.match(imports.stdout, /^\[search-import\] /u);
  assert.match(imports.stdout, /\|hit path=src\/consumer\.ts line=1\b/u);
  assert.match(imports.stdout, /\|edge O:src\/consumer\.ts -import-> O:src\/index\.ts/u);

  const tests = runCliCapture(["search", "tests", "src/index.ts", "."], root);
  assert.equal(tests.exitCode, 0);
  assert.match(tests.stdout, /^\[search-tests\] /u);
  assert.match(tests.stdout, /\|hit path=tests\/index\.test\.ts line=1\b/u);
  assert.match(tests.stdout, /\|edge O:src\/index\.ts -test-> T:tests\/index\.test\.ts/u);

  const transitiveTestsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ts-transitive-tests-"));
  fs.mkdirSync(path.join(transitiveTestsRoot, "src", "cli"), { recursive: true });
  fs.mkdirSync(path.join(transitiveTestsRoot, "tests", "unit"), { recursive: true });
  fs.writeFileSync(
    path.join(transitiveTestsRoot, "tsconfig.json"),
    JSON.stringify({ include: ["src/**/*.ts", "tests/**/*.ts"] }),
  );
  fs.writeFileSync(
    path.join(transitiveTestsRoot, "src", "cli", "agent-hooks.ts"),
    "export function runCodexAgentHook(): string { return 'ok'; }\n",
  );
  fs.writeFileSync(
    path.join(transitiveTestsRoot, "src", "cli", "protocol.ts"),
    'import { runCodexAgentHook } from "./agent-hooks.js";\nexport function runProtocolCli(): string { return runCodexAgentHook(); }\n',
  );
  fs.writeFileSync(
    path.join(transitiveTestsRoot, "src", "cli", "main.ts"),
    'import { runProtocolCli } from "./protocol.js";\nexport const runCli = runProtocolCli;\n',
  );
  fs.writeFileSync(
    path.join(transitiveTestsRoot, "tests", "unit", "cli.test.ts"),
    'import { runCli } from "../../src/cli/main.js";\nrunCli();\n',
  );
  const transitiveTests = runCliCapture(
    ["search", "tests", "src/cli/agent-hooks.ts", "."],
    transitiveTestsRoot,
  );
  assert.equal(transitiveTests.exitCode, 0);
  assert.match(transitiveTests.stdout, /\|hit path=tests\/unit\/cli\.test\.ts line=1\b/u);
  assert.match(
    transitiveTests.stdout,
    /\|edge O:src\/cli\/agent-hooks\.ts -test-> T:tests\/unit\/cli\.test\.ts .*match=transitive-import/u,
  );

  const ownerSeeds = runCliCapture(
    ["search", "owner", "src/index.ts", "--view", "seeds", "."],
    root,
  );
  assert.equal(ownerSeeds.exitCode, 0);
  assert.match(ownerSeeds.stdout, /^\[search-owner\] /u);
  assert.match(ownerSeeds.stdout, /\|seed owner:src\/index\.ts/u);
  assert.match(ownerSeeds.stdout, /\|seed symbol:findOrderStatus/u);
  assert.doesNotMatch(ownerSeeds.stdout, /\|edge /u);

  fs.writeFileSync(
    path.join(root, "src", "protocol-types.ts"),
    [
      "/** Protocol item fixture for owner item search tests. */",
      "export const MAX_PACKET_ITEMS = 8;",
      "export interface SearchPacket { readonly owners: readonly SearchOwner[]; }",
      "export type SearchOwner = { readonly path: string };",
      "export function buildPacket(): SearchPacket { return { owners: [] }; }",
    ].join("\n"),
  );

  const ownerItemsSeeds = runCliCapture(
    ["search", "owner", "src/protocol-types.ts", "items", "--view", "seeds", "."],
    root,
  );
  assert.equal(ownerItemsSeeds.exitCode, 0);
  assert.match(ownerItemsSeeds.stdout, /^\[search-owner\] /u);
  assert.match(ownerItemsSeeds.stdout, /\bpipes=items\b/u);
  assert.match(
    ownerItemsSeeds.stdout,
    /\|item interface SearchPacket .*\bowner=src\/protocol-types\.ts\b/u,
  );
  assert.match(
    ownerItemsSeeds.stdout,
    /\|item type SearchOwner .*\bowner=src\/protocol-types\.ts\b/u,
  );
  assert.match(
    ownerItemsSeeds.stdout,
    /\|item function buildPacket .*\bowner=src\/protocol-types\.ts\b/u,
  );
  assert.match(
    ownerItemsSeeds.stdout,
    /\|item variable MAX_PACKET_ITEMS .*\bowner=src\/protocol-types\.ts\b/u,
  );
  assert.ok(
    ownerItemsSeeds.stdout.indexOf("|item interface SearchPacket") <
      ownerItemsSeeds.stdout.indexOf("|item variable MAX_PACKET_ITEMS"),
  );
  assert.match(
    ownerItemsSeeds.stdout,
    /\|seed item:interface:SearchPacket,type:SearchOwner,function:buildPacket,variable:MAX_PACKET_ITEMS/u,
  );
  assert.match(ownerItemsSeeds.stdout, /\|seed text:SearchPacket\b/u);
  assert.match(
    ownerItemsSeeds.stdout,
    /\|next-run ts-harness search text --query-set SearchPacket --query-set SearchOwner /u,
  );
  assert.doesNotMatch(ownerItemsSeeds.stdout, /\|edge /u);

  const ownerItemsJson = runCliCapture(
    ["search", "owner", "src/protocol-types.ts", "items", "--json", "."],
    root,
  );
  assert.equal(ownerItemsJson.exitCode, 0);
  const ownerItemsPacket = JSON.parse(ownerItemsJson.stdout) as {
    readonly items?: readonly {
      readonly name: string;
      readonly kind: string;
      readonly ownerPath: string;
      readonly fields: { readonly exported?: boolean; readonly exportKind?: string };
    }[];
  };
  assert.deepEqual(
    ownerItemsPacket.items?.map((item) => [item.kind, item.name]),
    [
      ["interface", "SearchPacket"],
      ["type", "SearchOwner"],
      ["function", "buildPacket"],
      ["variable", "MAX_PACKET_ITEMS"],
    ],
  );
  assert.equal(ownerItemsPacket.items?.[0]?.ownerPath, "src/protocol-types.ts");
  assert.equal(ownerItemsPacket.items?.[0]?.fields.exported, true);

  const parserVisibleTestOwner = runCliCapture(
    ["search", "owner", "tests/index.test.ts", "."],
    root,
  );
  assert.equal(parserVisibleTestOwner.exitCode, 0);
  assert.match(parserVisibleTestOwner.stdout, /^\[search-owner\] /u);
  assert.match(parserVisibleTestOwner.stdout, /\brole=test\b/u);
  assert.match(parserVisibleTestOwner.stdout, /\|owner tests\/index\.test\.ts/u);
  assert.match(parserVisibleTestOwner.stdout, /\bsource=parser-visible-module\b/u);
  assert.match(parserVisibleTestOwner.stdout, /\bparserOwner=false\b/u);
  assert.match(parserVisibleTestOwner.stdout, /\bvalid=true\b/u);
  assert.match(
    parserVisibleTestOwner.stdout,
    /module is parser-visible but not a reasoning owner/u,
  );
  assert.match(parserVisibleTestOwner.stdout, /\|next .*tests:tests\/index\.test\.ts/u);
  assert.doesNotMatch(parserVisibleTestOwner.stdout, /\|next ingest:tests\/index\.test\.ts/u);

  const pathOnlyOwner = runCliCapture(
    ["search", "owner", "test-fixtures/semantic_search_schema.test.ts", "."],
    root,
  );
  assert.equal(pathOnlyOwner.exitCode, 0);
  assert.match(pathOnlyOwner.stdout, /^\[search-owner\] /u);
  assert.match(pathOnlyOwner.stdout, /\brole=test\b/u);
  assert.match(pathOnlyOwner.stdout, /\|owner test-fixtures\/semantic_search_schema\.test\.ts/u);
  assert.match(pathOnlyOwner.stdout, /\bsource=path-only\b/u);
  assert.match(pathOnlyOwner.stdout, /\bparserOwner=false\b/u);
  assert.match(
    pathOnlyOwner.stdout,
    /\|next ingest:test-fixtures\/semantic_search_schema\.test\.ts/u,
  );
  assert.match(pathOnlyOwner.stdout, /path exists but is not parser-visible/u);

  const pathOnlyOwnerJson = runCliCapture(
    ["search", "owner", "test-fixtures/semantic_search_schema.test.ts", "--json", "."],
    root,
  );
  assert.equal(pathOnlyOwnerJson.exitCode, 0);
  const pathOnlyOwnerPacket = JSON.parse(pathOnlyOwnerJson.stdout) as {
    readonly owners: readonly {
      readonly path: string;
      readonly role: string;
      readonly fields: { readonly source?: string; readonly parserOwner?: boolean };
    }[];
    readonly nextActions: readonly { readonly kind: string; readonly target: string }[];
  };
  assert.equal(pathOnlyOwnerPacket.owners[0]?.path, "test-fixtures/semantic_search_schema.test.ts");
  assert.equal(pathOnlyOwnerPacket.owners[0]?.role, "test");
  assert.equal(pathOnlyOwnerPacket.owners[0]?.fields.source, "path-only");
  assert.equal(pathOnlyOwnerPacket.owners[0]?.fields.parserOwner, false);
  assert.deepEqual(pathOnlyOwnerPacket.nextActions, [
    { kind: "ingest", target: "test-fixtures/semantic_search_schema.test.ts" },
  ]);

  const textMiss = runCliCapture(["search", "text", "semantic-search-packet", "."], root);
  assert.equal(textMiss.exitCode, 0);
  assert.match(textMiss.stdout, /^\[search-text\] q=semantic-search-packet own=0 hit=0/u);
  assert.match(textMiss.stdout, /pipe rg output to search ingest/u);
  assert.match(textMiss.stdout, /\|next ingest:semantic-search-packet/u);

  const ingest = runCliCapture(["search", "ingest", "."], root, "src/index.ts:1:findOrderStatus\n");
  assert.equal(ingest.exitCode, 0);
  assert.match(ingest.stdout, /^\[search-ingest\] src=rg-n/u);
  assert.match(ingest.stdout, /\|hit path=src\/index\.ts line=1\b/u);

  const recencyIngest = runCliCapture(
    ["search", "ingest", "."],
    root,
    "src/a-old.ts:2:sharedMtimeNeedle\nsrc/z-new.ts:2:sharedMtimeNeedle\n",
  );
  assert.equal(recencyIngest.exitCode, 0);
  assert.ok(
    recencyIngest.stdout.indexOf("|hit path=src/z-new.ts line=2") <
      recencyIngest.stdout.indexOf("|hit path=src/a-old.ts line=2"),
    recencyIngest.stdout,
  );

  const check = runCliCapture(["check", "--changed", "."], root);
  assert.equal(check.exitCode, 0);
  assert.match(check.stdout, /^\[ok\] typescript/u);

  const doctor = runCliCapture(["agent", "doctor", "."], root);
  assert.equal(doctor.exitCode, 0);
  assert.match(
    doctor.stdout,
    /^\[agent-doctor\] status=ok protocol=agent\.semantic-protocols\.semantic-language/u,
  );
  assert.match(doctor.stdout, /\|language id=typescript provider=ts-harness binary=ts-harness/u);
  assert.match(
    doctor.stdout,
    /\|namespace agent\.semantic-protocols\.languages\.typescript\.ts-harness/u,
  );
  assert.match(doctor.stdout, /\|method search\/workspace,search\/prime,/u);

  const doctorJson = runCliCapture(["agent", "doctor", "--json", "."], root);
  assert.equal(doctorJson.exitCode, 0);
  const registry = JSON.parse(doctorJson.stdout) as {
    readonly registryId: string;
    readonly protocolId: string;
    readonly languages: readonly {
      readonly languageId: string;
      readonly providerId: string;
      readonly binary: string;
      readonly namespace: string;
      readonly methods: readonly string[];
      readonly methodDescriptors: readonly {
        readonly method: string;
        readonly command: string;
        readonly view?: string;
        readonly outputSchemaIds?: readonly string[];
        readonly requiresQuery?: boolean;
        readonly acceptsStdin?: boolean;
        readonly supportsPackageScope?: boolean;
        readonly acceptedPipes?: readonly string[];
        readonly capabilities?: readonly {
          readonly languageId: string;
          readonly namespace: string;
          readonly name: string;
        }[];
        readonly ingestRequiredFor?: readonly {
          readonly languageId: string;
          readonly namespace: string;
          readonly name: string;
        }[];
        readonly clients?: readonly string[];
        readonly requiredOptions?: readonly string[];
        readonly input?: string;
        readonly supportsJson: boolean;
        readonly supportsCompact: boolean;
      }[];
    }[];
  };
  assert.equal(registry.registryId, "agent.semantic-protocols.semantic-language-registry");
  assert.equal(registry.protocolId, "agent.semantic-protocols.semantic-language");
  const expectedMethods = [
    "search/workspace",
    "search/prime",
    "search/owner",
    "search/dependency",
    "search/deps",
    "search/docs",
    "search/api",
    "search/public-external-types",
    "search/symbol",
    "search/callsite",
    "search/import",
    "search/tests",
    "search/text",
    "search/ingest",
    "check/changed",
    "check/full",
    "agent/doctor",
    "agent/guide",
  ];
  assert.deepEqual(registry.languages[0], {
    languageId: "typescript",
    providerId: "ts-harness",
    binary: "ts-harness",
    namespace: "agent.semantic-protocols.languages.typescript.ts-harness",
    displayName: "TypeScript",
    methods: expectedMethods,
    methodDescriptors: [
      ...expectedMethods
        .filter((method) => method.startsWith("search/"))
        .map((method) => ({
          method,
          command: "search",
          view: method.slice("search/".length),
          outputSchemaIds: ["agent.semantic-protocols.semantic-search-packet"],
          requiresQuery: [
            "search/owner",
            "search/dependency",
            "search/deps",
            "search/docs",
            "search/api",
            "search/public-external-types",
            "search/symbol",
            "search/callsite",
            "search/import",
            "search/tests",
            "search/text",
          ].includes(method),
          acceptsStdin: method === "search/ingest",
          supportsPackageScope: true,
          ...(method === "search/text"
            ? { acceptedPipes: ["owner", "tests"] }
            : method === "search/owner"
              ? { acceptedPipes: ["items"] }
              : {}),
          ...(method === "search/text"
            ? {
                supportsQuerySet: true,
                acceptedQuerySetSelectors: ["exact-set"],
                querySetScopes: ["project", "owner"],
              }
            : {}),
          capabilities: expectedSearchCapabilities(method),
          ...(expectedSearchIngestRequiredFor(method).length === 0
            ? {}
            : { ingestRequiredFor: expectedSearchIngestRequiredFor(method) }),
          supportsJson: true,
          supportsCompact: true,
        })),
      ...expectedMethods
        .filter((method) => method.startsWith("check/"))
        .map((method) => ({
          method,
          command: "check",
          supportsJson: true,
          supportsCompact: true,
        })),
      {
        method: "agent/doctor",
        command: "agent",
        outputSchemaIds: ["agent.semantic-protocols.semantic-language-registry"],
        supportsJson: true,
        supportsCompact: true,
      },
      {
        method: "agent/guide",
        command: "agent",
        supportsJson: false,
        supportsCompact: true,
      },
    ],
    schemas: [
      {
        schemaId: "agent.semantic-protocols.semantic-search-packet",
        schemaVersion: "1",
        path: "schemas/semantic-search-packet.v1.schema.json",
      },
      {
        schemaId: "agent.semantic-protocols.semantic-language-registry",
        schemaVersion: "1",
        path: "schemas/semantic-language-registry.v1.schema.json",
      },
      {
        schemaId: "agent.semantic-protocols.languages.typescript.ts-harness.capabilities",
        schemaVersion: "1",
        path: "schemas/typescript-semantic-capabilities.v1.schema.json",
      },
    ],
  });

  const unknownProtocolCommand = runCliCapture(["agent-client", "doctor", "."], root);
  assert.equal(unknownProtocolCommand.exitCode, 2);
  assert.match(unknownProtocolCommand.stderr, /unknown command: agent-client/u);
});

function expectedSearchCapabilities(
  method: string,
): readonly { readonly languageId: string; readonly namespace: string; readonly name: string }[] {
  switch (method) {
    case "search/workspace":
      return [semanticCapability("workspace-router")];
    case "search/prime":
      return [semanticCapability("package-prime-map")];
    case "search/owner":
      return [
        semanticCapability("reasoning-owner-search"),
        typeScriptCapability("parser-visible-module-owner-search"),
        typeScriptCapability("test-owner-search"),
        semanticCapability("path-owner-fallback"),
      ];
    case "search/dependency":
      return [
        semanticCapability("dependency-manifest-search"),
        typeScriptCapability("dependency-local-usage-search"),
      ];
    case "search/deps":
      return [
        semanticCapability("dependency-manifest-search"),
        typeScriptCapability("dependency-local-usage-search"),
        semanticCapability("dependency-version-scope"),
        typeScriptCapability("dependency-api-token-usage-search"),
      ];
    case "search/docs":
      return [
        semanticCapability("local-docs-search"),
        semanticCapability("schema-contract-search"),
        typeScriptCapability("local-semantic-schema-search"),
      ];
    case "search/api":
      return [
        typeScriptCapability("exported-api-shape-search"),
        typeScriptCapability("public-function-api-shape-search"),
        typeScriptCapability("public-data-api-shape-search"),
        semanticCapability("dependency-version-scope"),
      ];
    case "search/public-external-types":
      return [
        semanticCapability("dependency-manifest-search"),
        typeScriptCapability("public-external-type-search"),
        typeScriptCapability("public-api-type-text-search"),
      ];
    case "search/symbol":
      return [typeScriptCapability("symbol-export-search")];
    case "search/callsite":
      return [typeScriptCapability("owner-callsite-search")];
    case "search/import":
      return [typeScriptCapability("import-edge-search")];
    case "search/tests":
      return [typeScriptCapability("test-owner-search")];
    case "search/text":
      return [
        semanticCapability("owner-path-text-search"),
        typeScriptCapability("export-text-search"),
        typeScriptCapability("parser-visible-source-text-search"),
      ];
    case "search/ingest":
      return [
        semanticCapability("external-candidate-ingest"),
        semanticCapability("stdin-shape-detection"),
        semanticCapability("owner-grouped-ingest"),
      ];
    default:
      return [];
  }
}

function expectedSearchIngestRequiredFor(
  method: string,
): readonly { readonly languageId: string; readonly namespace: string; readonly name: string }[] {
  switch (method) {
    case "search/owner":
      return [typeScriptCapability("non-parser-path")];
    case "search/text":
      return [
        typeScriptCapability("non-parser-text"),
        typeScriptCapability("docs-text"),
        typeScriptCapability("schema-json"),
        typeScriptCapability("generated-artifact"),
      ];
    case "search/docs":
      return [typeScriptCapability("external-docs")];
    case "search/api":
      return [typeScriptCapability("external-api-docs")];
    default:
      return [];
  }
}

function semanticCapability(name: string): {
  readonly languageId: string;
  readonly namespace: string;
  readonly name: string;
} {
  return { languageId: "typescript", namespace: "semantic", name };
}

function typeScriptCapability(name: string): {
  readonly languageId: string;
  readonly namespace: string;
  readonly name: string;
} {
  return { languageId: "typescript", namespace: "typescript", name };
}
