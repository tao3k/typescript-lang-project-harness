import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  defaultTypeScriptHarnessConfig,
  parseTypeScriptProjectFiles,
  parseTypeScriptSourceFile,
  readProjectScope,
} from "../../src/index.js";

test("parser extracts native import and export facts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-parser-"));
  const sourcePath = path.join(root, "module.ts");
  fs.writeFileSync(
    sourcePath,
    [
      'import { readFile } from "node:fs";',
      'import type { Stats } from "node:fs";',
      'import { type Dirent } from "node:fs";',
      'import { type BigIntStats, readFileSync } from "node:fs";',
      'export { writeFile } from "node:fs";',
      'export type { Stats } from "node:fs";',
      'export { type Dirent } from "node:fs";',
      'export { type BigIntStats, writeFileSync } from "node:fs";',
      'export * as fsRuntime from "node:fs";',
      'export type * as fsTypes from "node:fs";',
      "type Lazy = import('./lazy-type.js').Lazy;",
      "export interface User { id: string }",
      "export const answer = 42;",
      "export { answer as localAnswer };",
      'void import("./lazy.js");',
    ].join("\n"),
  );

  const report = parseTypeScriptSourceFile(sourcePath);

  assert.equal(report.isValid, true);
  assert.deepEqual(
    report.imports.map(
      (importFact) =>
        `${importFact.isTypeOnly ? "type-" : ""}${importFact.kind}:${importFact.moduleSpecifier}`,
    ),
    [
      "import:node:fs",
      "type-import:node:fs",
      "type-import:node:fs",
      "import:node:fs",
      "export:node:fs",
      "type-export:node:fs",
      "type-export:node:fs",
      "export:node:fs",
      "export:node:fs",
      "type-export:node:fs",
      "type-import:./lazy-type.js",
      "dynamic-import:./lazy.js",
    ],
  );
  assert.deepEqual(
    report.exports.map(
      (exportFact) =>
        `${exportFact.isTypeOnly ? "type-" : ""}${exportFact.kind}:${exportFact.name}`,
    ),
    [
      "reexport:writeFile",
      "type-reexport:Stats",
      "type-reexport:Dirent",
      "type-reexport:BigIntStats",
      "reexport:writeFileSync",
      "namespace-reexport:fsRuntime",
      "type-namespace-reexport:fsTypes",
      "type-interface:User",
      "variable:answer",
      "export-list:localAnswer",
    ],
  );
});

test("parser extracts declaration-only export assignment facts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-parser-dts-"));
  const sourcePath = path.join(root, "module.d.ts");
  fs.writeFileSync(
    sourcePath,
    [
      "export as namespace HarnessGlobal;",
      "export = harness;",
      "declare function harness(): void;",
    ].join("\n"),
  );

  const report = parseTypeScriptSourceFile(sourcePath);

  assert.equal(report.isDeclarationFile, true);
  assert.deepEqual(
    report.exports.map((exportFact) => `${exportFact.kind}:${exportFact.name}`),
    ["global-namespace:HarnessGlobal", "export-assignment:harness"],
  );
});

test("parser reports TypeScript syntax diagnostics", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-parser-bad-"));
  const sourcePath = path.join(root, "bad.ts");
  fs.writeFileSync(sourcePath, "export const broken = ;\n");

  const report = parseTypeScriptSourceFile(sourcePath);

  assert.equal(report.isValid, false);
  assert.equal(report.diagnostics.length, 1);
  assert.equal(report.diagnostics[0]?.code, 1109);
  assert.match(report.diagnostics[0]?.message ?? "", /Expression expected/);
});

test("parser classifies TSX script kind and module intent docs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-parser-tsx-"));
  const sourcePath = path.join(root, "view.tsx");
  fs.writeFileSync(
    sourcePath,
    ["/** Component owner for the parser fixture. */", "export const View = <main />;"].join("\n"),
  );

  const report = parseTypeScriptSourceFile(sourcePath);

  assert.equal(report.isValid, true);
  assert.equal(report.scriptKind, "tsx");
  assert.equal(report.hasIntentDoc, true);
});

test("project parser reads tsconfig compiler and package metadata facts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-project-facts-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.mkdirSync(path.join(root, "generated"));
  fs.mkdirSync(path.join(root, "packages", "app"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "packages", "app", "package.json"),
    JSON.stringify({ name: "@example/app", type: "module" }),
  );
  fs.writeFileSync(
    path.join(root, "packages", "app", "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { composite: true, declaration: true },
      include: ["src/**/*.ts"],
    }),
  );
  fs.writeFileSync(path.join(root, "src", "domain.ts"), "export const domain = 1;\n");
  fs.writeFileSync(path.join(root, "src", "types.ts"), "export interface Domain { id: string }\n");
  fs.writeFileSync(path.join(root, "generated", "generated.ts"), "export const generated = 1;\n");
  fs.writeFileSync(
    path.join(root, "src", "index.ts"),
    [
      'import { domain } from "@facts/domain";',
      'import type { Domain } from "@facts/types";',
      'import "@facts/missing";',
      'import "#domain";',
      'import "#missing";',
      'import "./domain.js";',
      'import "./generated.js";',
      'import "react";',
      "export const value: Domain = { id: String(domain) };",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "@example/facts",
      type: "module",
      main: "./dist/src/index.js",
      module: "./dist/src/index.mjs",
      types: "./dist/src/index.d.ts",
      exports: { ".": "./dist/src/index.js" },
      imports: { "#domain": "./src/domain.ts" },
      bin: { facts: "./dist/src/bin/facts.js" },
      scripts: { build: "tsc -p tsconfig.json", test: "node --test" },
      workspaces: ["packages/*"],
    }),
  );
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      references: [{ path: "./packages/app" }],
      compilerOptions: {
        module: "NodeNext",
        baseUrl: ".",
        rootDir: ".",
        rootDirs: ["src", "generated"],
        outDir: "dist",
        paths: { "@facts/*": ["src/*"] },
        jsx: "react-jsx",
        target: "ES2022",
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        composite: true,
      },
      include: ["src/**/*.ts"],
    }),
  );

  const scope = readProjectScope(root, defaultTypeScriptHarnessConfig());

  assert.equal(scope.packageJson.name, "@example/facts");
  assert.deepEqual(
    scope.packageJson.entrypoints.map(({ subpath, targets }) => ({ subpath, targets })),
    [
      { subpath: "main", targets: ["./dist/src/index.js"] },
      { subpath: "module", targets: ["./dist/src/index.mjs"] },
      { subpath: "types", targets: ["./dist/src/index.d.ts"] },
    ],
  );
  assert.deepEqual(
    scope.packageJson.scripts.map(({ name, command }) => ({ name, command })),
    [
      { name: "build", command: "tsc -p tsconfig.json" },
      { name: "test", command: "node --test" },
    ],
  );
  assert.deepEqual(scope.packageJson.scriptNames, ["build", "test"]);
  assert.deepEqual(
    scope.packageJson.workspaces.map(({ pattern }) => pattern),
    ["packages/*"],
  );
  assert.deepEqual(scope.packageJson.workspacePatterns, ["packages/*"]);
  assert.deepEqual(
    scope.packageJson.bins.map(({ subpath, targets }) => ({ subpath, targets })),
    [{ subpath: "facts", targets: ["./dist/src/bin/facts.js"] }],
  );
  assert.deepEqual(
    scope.config.projectReferencePackages.map((referencePackage) => ({
      name: referencePackage.name,
      packageType: referencePackage.packageType,
      path: path.relative(root, referencePackage.path),
      configPath: path.relative(root, referencePackage.configPath ?? ""),
    })),
    [
      {
        name: "@example/app",
        packageType: "module",
        path: "packages/app",
        configPath: "packages/app/tsconfig.json",
      },
    ],
  );
  assert.deepEqual(
    scope.config.pathAliases.map((alias) => alias.pattern),
    ["@facts/*"],
  );
  assert.equal(scope.config.compilerOptions.module, "NodeNext");
  assert.equal(scope.config.compilerOptions.moduleResolution, "NodeNext");
  assert.equal(scope.config.compilerOptions.target, "ES2022");
  assert.equal(scope.config.compilerOptions.jsx, "react-jsx");
  assert.equal(scope.config.compilerOptions.composite, true);
  assert.equal(scope.config.compilerOptions.declaration, true);
  assert.equal(scope.config.compilerOptions.declarationMap, true);
  assert.equal(scope.config.compilerOptions.sourceMap, true);
  assert.equal(path.relative(root, scope.config.compilerOptions.outDir ?? ""), "dist");
  assert.deepEqual(
    scope.config.compilerOptions.rootDirs.map((dir) => path.relative(root, dir)),
    ["generated", "src"],
  );
  assert.deepEqual(
    scope.config.projectReferences.map((dir) => path.relative(root, dir)),
    ["packages/app"],
  );

  const [moduleReport] = parseTypeScriptProjectFiles(scope, [path.join(root, "src", "index.ts")]);
  assert.ok(moduleReport !== undefined);
  assert.deepEqual(
    moduleReport.importResolutions.map((resolution) => ({
      moduleSpecifier: resolution.moduleSpecifier,
      isTypeOnly: resolution.isTypeOnly,
      resolution: resolution.resolution,
      resolvedPath:
        resolution.resolvedPath === undefined
          ? undefined
          : path.relative(root, resolution.resolvedPath),
    })),
    [
      {
        moduleSpecifier: "@facts/domain",
        isTypeOnly: false,
        resolution: "path-alias",
        resolvedPath: "src/domain.ts",
      },
      {
        moduleSpecifier: "@facts/types",
        isTypeOnly: true,
        resolution: "path-alias",
        resolvedPath: "src/types.ts",
      },
      {
        moduleSpecifier: "@facts/missing",
        isTypeOnly: false,
        resolution: "unresolved",
        resolvedPath: undefined,
      },
      {
        moduleSpecifier: "#domain",
        isTypeOnly: false,
        resolution: "package-import",
        resolvedPath: "src/domain.ts",
      },
      {
        moduleSpecifier: "#missing",
        isTypeOnly: false,
        resolution: "unresolved",
        resolvedPath: undefined,
      },
      {
        moduleSpecifier: "./domain.js",
        isTypeOnly: false,
        resolution: "relative",
        resolvedPath: "src/domain.ts",
      },
      {
        moduleSpecifier: "./generated.js",
        isTypeOnly: false,
        resolution: "relative",
        resolvedPath: "generated/generated.ts",
      },
      {
        moduleSpecifier: "react",
        isTypeOnly: false,
        resolution: "external",
        resolvedPath: undefined,
      },
    ],
  );
});
