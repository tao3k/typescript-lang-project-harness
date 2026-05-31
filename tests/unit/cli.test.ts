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

test("CLI exposes semantic-search protocol commands", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-semantic-search-cli-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.mkdirSync(path.join(root, "tests"));
  fs.mkdirSync(path.join(root, "packages", "core", "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "@example/search-cli",
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
    "export function findOrderStatus() { return 'ok'; }\n",
  );
  fs.writeFileSync(
    path.join(root, "src", "consumer.ts"),
    [
      'import { findOrderStatus } from "./index.js";',
      'import type { Core } from "@example/core";',
      "export const status = findOrderStatus();",
      "export type CoreStatus = Core;",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "tests", "index.test.ts"),
    'import { findOrderStatus } from "../src/index.js";\nfindOrderStatus();\n',
  );

  const prime = runCliCapture(["search", "prime", "."], root);
  assert.equal(prime.exitCode, 0);
  assert.match(prime.stdout, /^\[search-prime\] /u);
  assert.match(prime.stdout, /\|owner src\/index\.ts/u);

  const workspace = runCliCapture(["search", "workspace", "."], root);
  assert.equal(workspace.exitCode, 0);
  assert.match(workspace.stdout, /^\[search-workspace\] /u);
  assert.match(workspace.stdout, /\bmode=workspace-index\b/u);
  assert.match(workspace.stdout, /\|package packages\/core /u);
  assert.match(workspace.stdout, /\|edge P:\. -workspace-> P:packages\/core/u);

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
  assert.equal(packet.owners.length, 2);

  const text = runCliCapture(["search", "text", "OrderStatus", "."], root);
  assert.equal(text.exitCode, 0);
  assert.match(text.stdout, /^\[search-text\] /u);
  assert.match(text.stdout, /\|hit src\/index\.ts/u);

  const symbol = runCliCapture(["search", "symbol", "findOrderStatus", "."], root);
  assert.equal(symbol.exitCode, 0);
  assert.match(symbol.stdout, /^\[search-symbol\] /u);
  assert.match(symbol.stdout, /\|hit src\/index\.ts:1/u);
  assert.match(symbol.stdout, /kind=symbol/u);

  const callsite = runCliCapture(["search", "callsite", "findOrderStatus", "."], root);
  assert.equal(callsite.exitCode, 0);
  assert.match(callsite.stdout, /^\[search-callsite\] /u);
  assert.match(callsite.stdout, /\|hit src\/consumer\.ts:1/u);
  assert.match(callsite.stdout, /reason=import-owner/u);

  const imports = runCliCapture(["search", "import", "./index", "."], root);
  assert.equal(imports.exitCode, 0);
  assert.match(imports.stdout, /^\[search-import\] /u);
  assert.match(imports.stdout, /\|hit src\/consumer\.ts:1/u);
  assert.match(imports.stdout, /\|edge O:src\/consumer\.ts -import-> O:src\/index\.ts/u);

  const tests = runCliCapture(["search", "tests", "src/index.ts", "."], root);
  assert.equal(tests.exitCode, 0);
  assert.match(tests.stdout, /^\[search-tests\] /u);
  assert.match(tests.stdout, /\|hit tests\/index\.test\.ts:1/u);
  assert.match(tests.stdout, /\|edge O:src\/index\.ts -test-> T:tests\/index\.test\.ts/u);

  const ingest = runCliCapture(["search", "ingest", "."], root, "src/index.ts:1:findOrderStatus\n");
  assert.equal(ingest.exitCode, 0);
  assert.match(ingest.stdout, /^\[search-ingest\] src=rg-n/u);
  assert.match(ingest.stdout, /\|hit src\/index\.ts:1/u);

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
            "search/symbol",
            "search/callsite",
            "search/import",
            "search/tests",
            "search/text",
          ].includes(method),
          acceptsStdin: method === "search/ingest",
          supportsPackageScope: true,
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
    ],
  });

  const unknownProtocolCommand = runCliCapture(["agent-client", "doctor", "."], root);
  assert.equal(unknownProtocolCommand.exitCode, 2);
  assert.match(unknownProtocolCommand.stderr, /unknown command: agent-client/u);
});

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
      "export const render = jsx;",
    ].join("\n"),
  );

  const dependency = runCliCapture(["search", "dependency", "react", "."], root);
  assert.equal(dependency.exitCode, 0);
  assert.match(dependency.stdout, /^\[search-dependency\] /u);
  assert.match(dependency.stdout, /\|hit package\.json:1:\d+ .*reason=manifest-package-exact/u);
  assert.match(dependency.stdout, /source=dependencies/u);
  assert.match(dependency.stdout, /\|hit src\/index\.ts:1/u);
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

  const deps = runCliCapture(["search", "deps", "react/jsx-runtime@19.0.0::jsx", "."], root);
  assert.equal(deps.exitCode, 0);
  assert.match(deps.stdout, /^\[search-deps\] /u);
  assert.match(deps.stdout, /\bpackage=react\b/u);
  assert.match(deps.stdout, /\brequestedVersion=19\.0\.0\b/u);
  assert.match(deps.stdout, /\bcurrentWorkspaceVersion=19\.0\.0\b/u);
  assert.match(deps.stdout, /\bversionStatus=matched\b/u);
  assert.match(deps.stdout, /\bapi=jsx\b/u);
  assert.match(deps.stdout, /\|hit src\/index\.ts:2/u);
  assert.match(deps.stdout, /moduleSpecifier=react\/jsx-runtime/u);
  assert.match(deps.stdout, /\|next dependency:react,text:jsx,tests:jsx/u);

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
  assert.deepEqual(mismatchPacket.nextActions, [{ kind: "dependency", target: "react" }]);
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
  assert.match(scoped.stdout, /\|next dependency:@scope\/sdk,text:Client,tests:Client/u);

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
