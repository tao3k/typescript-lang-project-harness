import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { HELP_TEXT, runCli } from "../../src/cli/main.js";
import {
  TYPE_SCRIPT_BINARY,
  TYPE_SCRIPT_PROVIDER_NAMESPACE,
  TYPE_SCRIPT_PROVIDER_ID,
  typeScriptSemanticLanguageRegistration,
} from "../../src/cli/semantic-language.js";

test("CLI exposes only search, check, and agent protocol entrypoints", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-cli-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
  fs.writeFileSync(path.join(root, "src", "index.ts"), "export const ok = 1;\n");

  const compact = runCliCapture(["check", "--full", "."], root);
  assert.equal(compact.exitCode, 0);
  assert.match(compact.stdout, /^\[ok\] typescript/u);

  const json = runCliCapture(["check", "--json", "."], root);
  assert.equal(json.exitCode, 0);
  const jsonReport = JSON.parse(json.stdout) as {
    readonly modules: readonly unknown[];
    readonly reasoningTree: { readonly runMode: string };
    readonly runMode: string;
  };
  assert.equal(jsonReport.runMode, "project");
  assert.equal(jsonReport.reasoningTree.runMode, "project");
  assert.equal(jsonReport.modules.length, 1);

  for (const legacyArgv of [
    ["."],
    ["--json", "."],
    ["--agent-compact", "."],
    ["--agent-snapshot", "."],
    ["--tree", "."],
    ["--stats", "."],
    ["--harness", "."],
  ]) {
    const invalid = runCliCapture(legacyArgv, root);
    assert.equal(invalid.exitCode, 2);
    assert.match(invalid.stderr, /unknown (command|option)/u);
  }
});

test("CLI search uses fast syntax reasoning while check keeps semantic diagnostics", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-search-fast-path-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }),
  );
  fs.writeFileSync(path.join(root, "src", "index.ts"), "export const value: string = 1;\n");

  const search = runCliCapture(["search", "prime", "--json", "."], root);
  assert.equal(search.exitCode, 0);
  const packet = JSON.parse(search.stdout) as {
    readonly findings: readonly { readonly ruleId: string }[];
  };
  assert.ok(
    packet.findings.every((finding) => finding.ruleId !== "TS-SEM-R001"),
    "search should not spend the fast path collecting semantic diagnostics",
  );

  const check = runCliCapture(["check", "--full", "."], root);
  assert.equal(check.exitCode, 0);
  assert.match(check.stdout, /TS-SEM-R001/u);
});

test("CLI exposes semantic-search protocol commands", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-semantic-search-cli-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.mkdirSync(path.join(root, "tests"));
  fs.mkdirSync(path.join(root, "test-fixtures"));
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
    "export function findOrderStatus(input: string, strict: boolean): string { return strict ? input : 'ok'; }\n",
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
  assert.match(prime.stdout, /\|owner src\/index\.ts/u);

  const primeSeeds = runCliCapture(["search", "prime", "--view", "seeds", "."], root);
  assert.equal(primeSeeds.exitCode, 0);
  assert.match(primeSeeds.stdout, /^\[search-prime\] /u);
  assert.match(primeSeeds.stdout, /\|flow prime->owner\|deps\|symbol\|tests/u);
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
  assert.equal(packet.owners.length, 2);

  const text = runCliCapture(["search", "text", "OrderStatus", "."], root);
  assert.equal(text.exitCode, 0);
  assert.match(text.stdout, /^\[search-text\] /u);
  assert.match(text.stdout, /\|hit path=src\/index\.ts\b/u);
  assert.match(text.stdout, /\bsurface=source\b/u);
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

  const externalApi = runCliCapture(["search", "api", "react@18.0.0::jsx", "."], root);
  assert.equal(externalApi.exitCode, 0);
  assert.match(externalApi.stdout, /^\[search-api\] /u);
  assert.match(externalApi.stdout, /\bsource=external-provider-missing\b/u);
  assert.match(externalApi.stdout, /external docs\/API provider/u);

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
          ...(method === "search/text" ? { acceptedPipes: ["owner", "tests"] } : {}),
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

test("CLI ranks workspace packages before test fixtures", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-workspace-ranking-cli-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "index.ts"), "export const ok = 1;\n");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "@example/root" }));
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
  fs.writeFileSync(
    path.join(root, "pnpm-workspace.yaml"),
    ["packages:", "  - 'packages/*'", "  - 'packages/**/__tests__/**'"].join("\n"),
  );
  for (const name of ["core", "vite", "z-alpha", "z-beta"]) {
    const packageRoot = path.join(root, "packages", name);
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(
      path.join(packageRoot, "package.json"),
      JSON.stringify({ name: `@example/${name}` }),
    );
  }
  for (let index = 0; index < 30; index += 1) {
    const fixtureRoot = path.join(
      root,
      "packages",
      "vite",
      "src",
      "node",
      "__tests__",
      "fixtures",
      `fixture-${String(index).padStart(2, "0")}`,
    );
    fs.mkdirSync(fixtureRoot, { recursive: true });
    fs.writeFileSync(
      path.join(fixtureRoot, "package.json"),
      JSON.stringify({ name: `@example/fixture-${index}` }),
    );
  }

  const workspace = runCliCapture(["search", "workspace", "."], root);

  assert.equal(workspace.exitCode, 0);
  assert.match(workspace.stdout, /\bmode=workspace-index\b/u);
  const packageIds = workspace.stdout
    .split("\n")
    .filter((line) => line.startsWith("|package ") && !line.startsWith("|package . "))
    .map((line) => line.split(" ")[1]);
  assert.deepEqual(packageIds.slice(0, 4), [
    "packages/core",
    "packages/vite",
    "packages/z-alpha",
    "packages/z-beta",
  ]);
  assert.match(workspace.stdout, /\|package packages\/z-alpha .*surface=source/u);
  assert.match(
    workspace.stdout,
    /\|package packages\/vite\/src\/node\/__tests__\/fixtures\/fixture-00 .*surface=test/u,
  );
});

test("CLI reports root semantic-agent-hook owner for hook install and runtime", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-agent-hooks-cli-"));

  const install = runCliCapture(["agent", "install", "--client", "codex", "."], root);
  assert.equal(install.exitCode, 2);
  assert.equal(install.stdout, "");
  assert.match(install.stderr, /ts-harness agent install moved to semantic-agent-hook/u);
  assert.match(install.stderr, /semantic-agent-hook install --client codex/u);

  const hook = runCliCapture(
    ["agent", "hook", "--client", "codex", "pre-tool", "."],
    root,
    JSON.stringify({ tool_name: "Read", tool_input: { file_path: "src/index.ts" } }),
  );
  assert.equal(hook.exitCode, 2);
  assert.equal(hook.stdout, "");
  assert.match(hook.stderr, /ts-harness agent hook moved to semantic-agent-hook/u);
  assert.match(hook.stderr, /semantic-agent-hook hook --client codex/u);

  const guide = runCliCapture(["agent", "guide", "--client", "codex", "."], root);
  assert.equal(guide.exitCode, 0);
  assert.match(guide.stdout, /^\[ts-harness-guide\] project=/u);
  assert.match(guide.stdout, /agent hook install\/runtime is owned by semantic-agent-hook/u);
  assert.doesNotMatch(guide.stdout, /README|SKILL|docs\/|src\/cli\/agent-hooks/u);
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

test("CLI searches external dependency usage", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-semantic-search-dependency-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "@example/dependency-search",
      dependencies: { react: "^19.0.0" },
    }),
  );
  fs.writeFileSync(
    path.join(root, "package-lock.json"),
    JSON.stringify({
      name: "@example/dependency-search",
      lockfileVersion: 3,
      packages: {
        "": {
          name: "@example/dependency-search",
          dependencies: { react: "^19.0.0" },
        },
        "node_modules/react": { version: "19.0.0" },
      },
    }),
  );
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
  fs.writeFileSync(
    path.join(root, "src", "index.ts"),
    [
      'import type { ReactNode } from "react";',
      'import { jsx } from "react/jsx-runtime";',
      "export type StatusNode = ReactNode;",
      "export function renderNode(node: ReactNode): ReactNode { return node; }",
      'export function renderImported(node: import("react").ReactNode): import("react").ReactNode { return node; }',
      "export const render = jsx;",
    ].join("\n"),
  );

  const dependency = runCliCapture(["search", "dependency", "react", "."], root);
  assert.equal(dependency.exitCode, 0);
  assert.match(dependency.stdout, /^\[search-dependency\] /u);
  assert.match(
    dependency.stdout,
    /\|hit path=package\.json line=1 column=\d+ .*reason=manifest-package-exact/u,
  );
  assert.match(dependency.stdout, /source=dependencies/u);
  assert.match(dependency.stdout, /\|hit path=src\/index\.ts line=1\b/u);
  assert.match(dependency.stdout, /moduleSpecifier=react/u);
  assert.match(dependency.stdout, /\|edge O:src\/index\.ts -dependency-> C:react/u);

  const dependencyJson = runCliCapture(["search", "dependency", "react", "--json", "."], root);
  assert.equal(dependencyJson.exitCode, 0);
  const packet = JSON.parse(dependencyJson.stdout) as {
    readonly method: string;
    readonly view: string;
    readonly nodes: readonly { readonly id: string; readonly kind: string }[];
    readonly edges: readonly { readonly kind: string; readonly to: string }[];
    readonly hits: readonly {
      readonly reason: string;
      readonly fields?: { readonly packageRoot?: string };
    }[];
  };
  assert.equal(packet.method, "search/dependency");
  assert.equal(packet.view, "dependency");
  assert.ok(packet.nodes.some((node) => node.id === "C:react" && node.kind === "dependency"));
  assert.ok(packet.edges.some((edge) => edge.kind === "dependency" && edge.to === "C:react"));
  assert.ok(packet.hits.some((hit) => hit.fields?.packageRoot === "react"));
  assert.ok(packet.hits.some((hit) => hit.reason === "manifest-package-exact"));

  const publicExternalTypes = runCliCapture(
    ["search", "public-external-types", "react", "."],
    root,
  );
  assert.equal(publicExternalTypes.exitCode, 0);
  assert.match(publicExternalTypes.stdout, /^\[search-public-external-types\] /u);
  assert.match(publicExternalTypes.stdout, /\bpackage=react\b/u);
  assert.match(publicExternalTypes.stdout, /\|api path=src\/index\.ts line=5\b/u);
  assert.match(publicExternalTypes.stdout, /\breason=public-external-type\b/u);
  assert.match(publicExternalTypes.stdout, /\bconfidence=direct\b/u);
  assert.match(publicExternalTypes.stdout, /\btypeText=import\("react"\)\.ReactNode\b/u);
  assert.match(publicExternalTypes.stdout, /\|api path=src\/index\.ts line=4\b/u);
  assert.match(publicExternalTypes.stdout, /\breason=possible-public-external-type\b/u);
  assert.match(publicExternalTypes.stdout, /\bconfidence=possible\b/u);

  const publicExternalTypesJson = runCliCapture(
    ["search", "public-external-types", "react", "--json", "."],
    root,
  );
  assert.equal(publicExternalTypesJson.exitCode, 0);
  const publicExternalTypesPacket = JSON.parse(publicExternalTypesJson.stdout) as {
    readonly method: string;
    readonly view: string;
    readonly header: {
      readonly fields: { readonly package?: string; readonly hit?: number };
    };
    readonly nodes: readonly {
      readonly id: string;
      readonly fields: { readonly confirmed?: number; readonly possible?: number };
    }[];
    readonly hits: readonly {
      readonly reason: string;
      readonly fields?: {
        readonly dependency?: string;
        readonly confidence?: string;
        readonly typeText?: string;
      };
    }[];
  };
  assert.equal(publicExternalTypesPacket.method, "search/public-external-types");
  assert.equal(publicExternalTypesPacket.view, "public-external-types");
  assert.equal(publicExternalTypesPacket.header.fields.package, "react");
  assert.ok((publicExternalTypesPacket.header.fields.hit ?? 0) >= 2);
  assert.ok(
    publicExternalTypesPacket.nodes.some(
      (node) =>
        node.id === "C:react" &&
        (node.fields.confirmed ?? 0) >= 1 &&
        (node.fields.possible ?? 0) >= 1,
    ),
  );
  assert.ok(
    publicExternalTypesPacket.hits.some(
      (hit) =>
        hit.reason === "public-external-type" &&
        hit.fields?.dependency === "react" &&
        hit.fields.confidence === "direct" &&
        hit.fields.typeText === 'import("react").ReactNode',
    ),
  );
  assert.ok(
    publicExternalTypesPacket.hits.some(
      (hit) =>
        hit.reason === "possible-public-external-type" &&
        hit.fields?.dependency === "react" &&
        hit.fields.confidence === "possible" &&
        hit.fields.typeText === "ReactNode",
    ),
  );

  const deps = runCliCapture(["search", "deps", "react/jsx-runtime@19.0.0::jsx", "."], root);
  assert.equal(deps.exitCode, 0);
  assert.match(deps.stdout, /^\[search-deps\] /u);
  assert.match(deps.stdout, /\bpackage=react\b/u);
  assert.match(deps.stdout, /\brequestedVersion=19\.0\.0\b/u);
  assert.match(deps.stdout, /\bcurrentWorkspaceVersion=19\.0\.0\b/u);
  assert.match(deps.stdout, /\bversionStatus=matched\b/u);
  assert.match(deps.stdout, /\bapi=jsx\b/u);
  assert.match(deps.stdout, /\|hit path=src\/index\.ts line=2\b/u);
  assert.match(deps.stdout, /moduleSpecifier=react\/jsx-runtime/u);
  assert.match(
    deps.stdout,
    /\|next dependency:react,public-external-types:react,api:react\/jsx-runtime@19\.0\.0::jsx,text:jsx,tests:jsx/u,
  );

  const depsJson = runCliCapture(
    ["search", "deps", "react/jsx-runtime@19.0.0::jsx", "--json", "."],
    root,
  );
  assert.equal(depsJson.exitCode, 0);
  const depsPacket = JSON.parse(depsJson.stdout) as {
    readonly method: string;
    readonly view: string;
    readonly header: {
      readonly fields: {
        readonly requestedVersion?: string;
        readonly currentWorkspaceVersion?: string;
        readonly versionStatus?: string;
        readonly versionScope?: string;
        readonly api?: string;
        readonly usage?: number;
      };
    };
    readonly nodes: readonly {
      readonly id: string;
      readonly fields: {
        readonly currentWorkspaceVersion?: string;
        readonly versionStatus?: string;
        readonly versionScope?: string;
        readonly apiQuery?: string;
      };
    }[];
    readonly hits: readonly {
      readonly fields?: {
        readonly apiQuery?: string;
        readonly currentWorkspaceVersion?: string;
        readonly versionStatus?: string;
        readonly versionScope?: string;
      };
    }[];
  };
  assert.equal(depsPacket.method, "search/deps");
  assert.equal(depsPacket.view, "deps");
  assert.equal(depsPacket.header.fields.requestedVersion, "19.0.0");
  assert.equal(depsPacket.header.fields.currentWorkspaceVersion, "19.0.0");
  assert.equal(Object.hasOwn(depsPacket.header.fields, "resolvedVersion"), false);
  assert.equal(depsPacket.header.fields.versionStatus, "matched");
  assert.equal(depsPacket.header.fields.versionScope, "current");
  assert.equal(depsPacket.header.fields.api, "jsx");
  assert.ok(
    depsPacket.nodes.some(
      (node) =>
        node.id === "C:react" &&
        node.fields.currentWorkspaceVersion === "19.0.0" &&
        node.fields.versionStatus === "matched",
    ),
  );
  assert.ok(
    depsPacket.hits.some(
      (hit) =>
        hit.fields?.apiQuery === "jsx" &&
        hit.fields.currentWorkspaceVersion === "19.0.0" &&
        hit.fields.versionStatus === "matched" &&
        hit.fields.versionScope === "current",
    ),
  );

  const mismatch = runCliCapture(["search", "deps", "react@18.0.0::jsx", "--json", "."], root);
  assert.equal(mismatch.exitCode, 0);
  const mismatchPacket = JSON.parse(mismatch.stdout) as {
    readonly header: {
      readonly fields: {
        readonly requestedVersion?: string;
        readonly currentWorkspaceVersion?: string;
        readonly versionStatus?: string;
        readonly versionScope?: string;
        readonly usage?: number;
      };
    };
    readonly hits: readonly { readonly fields?: { readonly moduleSpecifier?: string } }[];
    readonly nextActions: readonly { readonly kind: string; readonly target: string }[];
  };
  assert.equal(mismatchPacket.header.fields.requestedVersion, "18.0.0");
  assert.equal(mismatchPacket.header.fields.currentWorkspaceVersion, "19.0.0");
  assert.equal(Object.hasOwn(mismatchPacket.header.fields, "resolvedVersion"), false);
  assert.equal(mismatchPacket.header.fields.versionStatus, "external-version");
  assert.equal(mismatchPacket.header.fields.versionScope, "external");
  assert.equal(mismatchPacket.header.fields.usage, 0);
  assert.ok(mismatchPacket.hits.every((hit) => hit.fields?.moduleSpecifier === undefined));
  assert.deepEqual(mismatchPacket.nextActions, [
    { kind: "dependency", target: "react" },
    { kind: "public-external-types", target: "react" },
    { kind: "api", target: "react@18.0.0::jsx" },
  ]);
});

test("CLI deps search handles scoped packages and range-only versions", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-semantic-search-deps-scoped-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "@example/scoped-deps-search",
      dependencies: { "@scope/sdk": "2.0.0", "@scope/range-sdk": "^3.0.0" },
    }),
  );
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
  fs.writeFileSync(
    path.join(root, "src", "index.ts"),
    [
      'import { Client } from "@scope/sdk/client";',
      'import { RangeClient } from "@scope/range-sdk/client";',
      "export const client = new Client();",
      "export const rangeClient = new RangeClient();",
    ].join("\n"),
  );

  const scoped = runCliCapture(["search", "deps", "@scope/sdk/client@2.0.0::Client", "."], root);
  assert.equal(scoped.exitCode, 0);
  assert.match(scoped.stdout, /^\[search-deps\] /u);
  assert.match(scoped.stdout, /\bpackage=@scope\/sdk\b/u);
  assert.match(scoped.stdout, /\brequestedVersion=2\.0\.0\b/u);
  assert.match(scoped.stdout, /\bcurrentWorkspaceVersion=2\.0\.0\b/u);
  assert.match(scoped.stdout, /\bworkspaceVersionSource=package-json\b/u);
  assert.match(scoped.stdout, /\bversionStatus=matched\b/u);
  assert.match(scoped.stdout, /\bversionScope=current\b/u);
  assert.match(scoped.stdout, /moduleSpecifier=@scope\/sdk\/client/u);
  assert.match(
    scoped.stdout,
    /\|next dependency:@scope\/sdk,public-external-types:@scope\/sdk,api:@scope\/sdk\/client@2\.0\.0::Client,text:Client,tests:Client/u,
  );

  const scopedJson = runCliCapture(
    ["search", "deps", "@scope/range-sdk/client::RangeClient", "--json", "."],
    root,
  );
  assert.equal(scopedJson.exitCode, 0);
  const packet = JSON.parse(scopedJson.stdout) as {
    readonly header: {
      readonly fields: {
        readonly package?: string;
        readonly versionStatus?: string;
        readonly versionScope?: string;
        readonly api?: string;
        readonly usage?: number;
      };
    };
    readonly nodes: readonly {
      readonly id: string;
      readonly fields: {
        readonly versionRanges?: readonly string[];
        readonly versionStatus?: string;
        readonly versionScope?: string;
      };
    }[];
  };
  assert.equal(packet.header.fields.package, "@scope/range-sdk");
  assert.equal(packet.header.fields.versionStatus, "range-only");
  assert.equal(packet.header.fields.versionScope, "current");
  assert.equal(packet.header.fields.api, "RangeClient");
  assert.equal(packet.header.fields.usage, 1);
  assert.ok(
    packet.nodes.some(
      (node) =>
        node.id === "C:@scope/range-sdk" &&
        node.fields.versionStatus === "range-only" &&
        node.fields.versionScope === "current" &&
        node.fields.versionRanges?.includes("^3.0.0"),
    ),
  );
});

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
