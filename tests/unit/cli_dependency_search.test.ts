import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCliCapture } from "./cli_helpers.js";

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
