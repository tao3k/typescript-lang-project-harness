import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { renderTypeScriptReasoningTree, runTypeScriptProjectHarness } from "../../src/index.js";

test("reasoning tree renders tsconfig paths, package entries, roles, and import edges", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-reasoning-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.mkdirSync(path.join(root, "tests"));
  fs.mkdirSync(path.join(root, "generated"));
  fs.mkdirSync(path.join(root, "packages", "core"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "@example/app",
      type: "module",
      main: "./dist/src/index.js",
      module: "./dist/src/consumer.js",
      types: "./dist/src/index.d.ts",
      browser: {
        "./dist/src/consumer.js": "./dist/src/browser.js",
      },
      exports: {
        ".": {
          types: "./dist/index.d.ts",
          import: "./dist/index.js",
        },
        "./feature": "./dist/feature.js",
      },
      imports: {
        "#internal": "./src/domain.ts",
      },
      bin: {
        app: "./dist/src/consumer.js",
      },
      scripts: {
        build: "tsc -p tsconfig.json",
        harness: "typescript-project-harness .",
      },
      workspaces: ["packages/*"],
    }),
  );
  fs.writeFileSync(
    path.join(root, "packages", "core", "package.json"),
    JSON.stringify({
      name: "@example/core",
      type: "module",
    }),
  );
  fs.writeFileSync(
    path.join(root, "packages", "core", "tsconfig.json"),
    JSON.stringify({ include: ["src/**/*.ts"] }),
  );
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      references: [{ path: "./packages/core" }],
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        baseUrl: ".",
        rootDir: ".",
        rootDirs: ["src", "generated"],
        outDir: "dist",
        paths: {
          "@app/*": ["src/*"],
        },
        declaration: true,
      },
      include: ["src/**/*.ts", "generated/**/*.ts", "tests/**/*.ts"],
    }),
  );
  fs.writeFileSync(
    path.join(root, "src", "domain.ts"),
    ["export interface Domain { id: string }", "export const domain = 1;"].join("\n"),
  );
  fs.writeFileSync(path.join(root, "generated", "generated.ts"), "export const generated = 1;\n");
  fs.writeFileSync(
    path.join(root, "src", "index.ts"),
    [
      'export { domain } from "./domain.js";',
      'export * as domainNs from "./domain.js";',
      'export type * as domainTypes from "./domain.js";',
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "src", "consumer.ts"),
    [
      'import { domain } from "@app/domain";',
      'import type { Domain } from "./domain.js";',
      'import "./domain.js";',
      'import "./generated.js";',
      'import "#internal";',
      'import "react";',
      'import "@example/core";',
      "export const consumed: Domain = { id: String(domain) };",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "tests", "consumer.test.ts"),
    'import { consumed } from "../src/consumer.js";\n',
  );

  const report = runTypeScriptProjectHarness(root);
  const tree = report.reasoningTree;
  assert.deepEqual(
    tree.pathAliases.map((alias) => alias.pattern),
    ["@app/*"],
  );
  assert.deepEqual(
    tree.packageEntrypoints.map((entry) => `${entry.subpath}:${entry.targets.join(",")}`),
    [
      "browser:./dist/src/browser.js",
      "main:./dist/src/index.js",
      "module:./dist/src/consumer.js",
      "types:./dist/src/index.d.ts",
    ],
  );
  assert.deepEqual(
    tree.packageExports.map((entry) => entry.subpath),
    [".", "./feature"],
  );
  assert.deepEqual(
    tree.packageImports.map((entry) => entry.subpath),
    ["#internal"],
  );
  assert.deepEqual(
    tree.packageBins.map((entry) => entry.subpath),
    ["app"],
  );
  assert.deepEqual(
    tree.packageScripts.map((script) => `${script.name}:${script.command}`),
    ["build:tsc -p tsconfig.json", "harness:typescript-project-harness ."],
  );
  assert.deepEqual(
    tree.packageWorkspaces.map((workspace) => workspace.pattern),
    ["packages/*"],
  );
  assert.deepEqual(tree.workspacePatterns, ["packages/*"]);
  assert.deepEqual(
    tree.workspacePackages.map((workspacePackage) => ({
      name: workspacePackage.name,
      path: path.relative(root, workspacePackage.path),
      pattern: workspacePackage.pattern,
      configPath: path.relative(root, workspacePackage.configPath ?? ""),
    })),
    [
      {
        name: "@example/core",
        path: "packages/core",
        pattern: "packages/*",
        configPath: "packages/core/tsconfig.json",
      },
    ],
  );
  assert.deepEqual(
    tree.projectReferences.map((reference) => path.relative(root, reference)),
    ["packages/core"],
  );
  assert.deepEqual(
    tree.projectReferencePackages.map((referencePackage) => ({
      name: referencePackage.name,
      path: path.relative(root, referencePackage.path),
      configPath: path.relative(root, referencePackage.configPath ?? ""),
    })),
    [
      {
        name: "@example/core",
        path: "packages/core",
        configPath: "packages/core/tsconfig.json",
      },
    ],
  );
  assert.deepEqual(
    tree.projectReferenceResolutions.map((reference) => ({
      referencePath: path.relative(root, reference.referencePath),
      packageName: reference.packageName,
      packagePath: path.relative(root, reference.packagePath ?? ""),
    })),
    [
      {
        referencePath: "packages/core",
        packageName: "@example/core",
        packagePath: "packages/core",
      },
    ],
  );
  assert.deepEqual(
    tree.packageImportOwners.map((owner) => ({
      fromPath: path.relative(root, owner.fromPath),
      moduleSpecifier: owner.moduleSpecifier,
      packageName: owner.packageName,
      ownerKind: owner.ownerKind,
      via: owner.via,
    })),
    [
      {
        fromPath: "src/consumer.ts",
        moduleSpecifier: "@example/core",
        packageName: "@example/core",
        ownerKind: "project-reference",
        via: "package-name",
      },
    ],
  );
  assert.equal(tree.compilerOptions.declaration, true);

  const roleByPath = new Map(
    tree.modules.map((moduleReport) => [path.relative(root, moduleReport.path), moduleReport.role]),
  );
  assert.equal(roleByPath.get("src/index.ts"), "facade");
  assert.equal(roleByPath.get("src/consumer.ts"), "entrypoint");
  assert.equal(roleByPath.get("tests/consumer.test.ts"), "test");
  assert.deepEqual(
    tree.ownerBranches.map((branch) => ({
      path: path.relative(root, branch.path),
      ownerNamespace: branch.ownerNamespace,
      roles: branch.roles,
      externalImports: branch.importSummary.externalImports,
      childEdges: branch.childEdges.map(
        (edge) => `${edge.kind}:${path.relative(root, edge.toPath ?? "")}`,
      ),
    })),
    [
      {
        path: "src/consumer.ts",
        ownerNamespace: "src/consumer",
        roles: ["root", "entrypoint"],
        externalImports: 2,
        childEdges: [],
      },
      {
        path: "src/index.ts",
        ownerNamespace: "src",
        roles: ["root", "facade"],
        externalImports: 0,
        childEdges: ["export:src/domain.ts", "export:src/domain.ts", "export:src/domain.ts"],
      },
    ],
  );
  assert.ok(
    tree.ownerDependencies.some(
      (dependency) =>
        path.relative(root, dependency.fromPath) === "src/consumer.ts" &&
        dependency.resolution === "path-alias" &&
        dependency.kind === "import" &&
        path.relative(root, dependency.toPath ?? "") === "src/domain.ts",
    ),
  );
  assert.equal(
    tree.ownerDependencies.some((dependency) => dependency.moduleSpecifier === "react"),
    false,
  );

  const rendered = renderTypeScriptReasoningTree(report);
  assert.match(rendered, /^Modules: source=4 roots=2 branches=2 deps=/u);
  assert.match(rendered, /OwnerBranches:/u);
  assert.match(rendered, /src\/index\.ts \[root, facade\] owner=src/u);
  assert.match(rendered, /src\/consumer\.ts \[root, entrypoint\] owner=src\/consumer/u);
  assert.match(rendered, /src\/consumer\.ts \[root, entrypoint\].*imports=.*external:2/u);
  assert.match(rendered, /OwnerDependencies:/u);
  assert.match(rendered, /package exports:\. \[types\] --unresolved--> \.\/dist\/index\.d\.ts/u);
  assert.match(rendered, /package field:main --owner--> src\/index\.ts/u);
  assert.match(rendered, /src\/consumer\.ts --path-alias\/import--> src\/domain\.ts/u);
  assert.match(
    rendered,
    /src\/consumer\.ts --package-name\/import--> packages\/core owner=project-reference/u,
  );
  assert.doesNotMatch(rendered, /src\/consumer\.ts --external\/import--> react/u);
});
