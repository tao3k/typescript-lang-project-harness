import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runCliCapture } from "./cli_helpers.js";

type JsonObject = Record<string, unknown>;

export function semanticSearchFixture(): string {
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
    [
      "export type OrderStatus = 'ok';",
      "export function findOrderStatus(input: string): string { return input; }",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "src", "consumer.ts"),
    [
      'import { findOrderStatus } from "./index.js";',
      'import type { ReactNode } from "react";',
      'import type { Core } from "@example/core";',
      'export const status = findOrderStatus("ok");',
      "export function renderNode(node: ReactNode): ReactNode { return node; }",
      'export function renderImported(node: import("react").ReactNode): import("react").ReactNode { return node; }',
      "export type StatusNode = ReactNode;",
      "export type CoreStatus = Core;",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "tests", "index.test.ts"),
    'import { findOrderStatus } from "../src/index.js";\nfindOrderStatus("ok");\n',
  );
  return root;
}

export function jsonPacket(root: string, argv: readonly string[], stdin = ""): JsonObject {
  const result = runCliCapture(schemaTestWorkspaceArgs(argv), root, stdin);
  assert.equal(result.exitCode, 0, result.stderr);
  return JSON.parse(result.stdout) as JsonObject;
}

function schemaTestWorkspaceArgs(argv: readonly string[]): readonly string[] {
  if (argv.includes("--workspace")) return argv;
  const command = argv[0];
  if (command !== "search" && command !== "query") return argv;
  if (argv.at(-1) !== ".") return argv;
  return [...argv.slice(0, -1), "--workspace", "."];
}
