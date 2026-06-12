import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { runCliCapture } from "./cli_helpers.js";

function fixturePath(relativePath: string): string {
  return fileURLToPath(new URL(`../../../tests/fixtures/${relativePath}`, import.meta.url));
}

function readTextFixture(relativePath: string): string {
  return fs.readFileSync(fixturePath(relativePath), "utf8").replace(/\r\n/gu, "\n");
}

function writeTsProject(root: string, packageName: string, sourceText: string): void {
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: packageName, type: "module" }),
  );
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        strict: true,
      },
      include: ["src/**/*.ts"],
    }),
  );
  fs.writeFileSync(path.join(root, "src", "demo.ts"), sourceText);
}

test("owner items --query emits compact item locators", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-owner-item-query-"));
  writeTsProject(
    root,
    "owner-item-query-fixture",
    readTextFixture("compact-query/sources/owner-item-demo.ts"),
  );

  const result = runCliCapture(
    ["search", "owner", "src/demo.ts", "items", "--query", "alpha", "--workspace", "."],
    root,
  );

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /^\[search-owner\].*item=1.*itemQuery=alpha/mu);
  assert.match(result.stdout, /next=query-code/u);
  assert.match(
    result.stdout,
    /\|item function alpha owner=src\/demo\.ts column=0 exported=true read=src\/demo\.ts:1:4/u,
  );
  assert.doesNotMatch(result.stdout, /\|code /u);
  assert.doesNotMatch(result.stdout, / text=/u);
  assert.doesNotMatch(result.stdout, /function beta/u);
});

test("query --names-only exact owner emits locator-only output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-query-names-only-"));
  writeTsProject(
    root,
    "query-names-only-fixture",
    readTextFixture("compact-query/sources/owner-item-demo.ts"),
  );

  const result = runCliCapture(
    ["query", "src/demo.ts", "--term", "alpha", "--names-only", "--workspace", "."],
    root,
  );

  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /^\[search-owner\].*item=1.*itemQuery=alpha.*output=names/mu);
  assert.match(
    result.stdout,
    /\|query itemQuery=alpha status=hit match=exact item=1 reason=parser-item-query output=names next=query-code/u,
  );
  assert.match(
    result.stdout,
    /\|item function alpha owner=src\/demo\.ts column=0 exported=true read=src\/demo\.ts:1:4/u,
  );
  assert.doesNotMatch(result.stdout, /\|code | text=|function beta/u);
});

test("query --names-only --json exact owner emits query packet without code", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-query-names-only-json-"));
  writeTsProject(
    root,
    "query-names-only-json-fixture",
    readTextFixture("compact-query/sources/owner-item-demo.ts"),
  );

  const result = runCliCapture(
    ["query", "src/demo.ts", "--term", "alpha", "--names-only", "--json", "--workspace", "."],
    root,
  );

  assert.equal(result.exitCode, 0, result.stderr);
  const packet = JSON.parse(result.stdout) as {
    readonly method: string;
    readonly ownerPath: string;
    readonly outputMode: string;
    readonly syntaxQueryRef: string;
    readonly queryCoverage: readonly {
      readonly value: string;
      readonly status: string;
      readonly match: string;
    }[];
    readonly matches: readonly {
      readonly name: string;
      readonly kind: string;
      readonly code?: string;
      readonly fields: { readonly exported: boolean };
    }[];
  };
  assert.equal(packet.method, "query/owner-items");
  assert.equal(packet.ownerPath, "src/demo.ts");
  assert.equal(packet.outputMode, "names");
  assert.equal(packet.queryCoverage[0]!.value, "alpha");
  assert.equal(packet.queryCoverage[0]!.status, "hit");
  assert.equal(packet.queryCoverage[0]!.match, "exact");
  assert.match(packet.syntaxQueryRef, /^semantic-tree-sitter-query\/typescript-owner-items:/u);
  assert.equal(packet.matches[0]!.name, "alpha");
  assert.equal(packet.matches[0]!.kind, "function");
  assert.equal(packet.matches[0]!.fields.exported, true);
  assert.equal(Object.hasOwn(packet.matches[0]!, "code"), false);
});

test("owner items --json emits parser nodes and node expand actions", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-owner-item-json-"));
  writeTsProject(
    root,
    "owner-item-json-fixture",
    readTextFixture("compact-query/sources/ts-alpha.ts"),
  );

  const result = runCliCapture(
    ["query", "src/demo.ts", "--term", "alpha", "--json", "--workspace", "."],
    root,
  );

  assert.equal(result.exitCode, 0, result.stderr);
  const packet = JSON.parse(result.stdout) as {
    readonly syntaxQueryRef: string;
    readonly syntaxMatchRefs: readonly string[];
    readonly syntaxCaptureRefs: readonly string[];
    readonly syntaxAnchor: {
      readonly nodeType: string;
      readonly field: string;
      readonly capture: string;
      readonly location: { readonly path: string; readonly lineRange: string };
    };
    readonly matches: readonly {
      readonly code: string;
      readonly projection: {
        readonly exactRead: string;
        readonly mode: string;
        readonly syntax: string;
        readonly nodes: readonly {
          readonly parentId?: string;
          readonly read: string;
          readonly role: string;
        }[];
        readonly expandActions: readonly {
          readonly kind: string;
          readonly read?: string;
          readonly target: string;
        }[];
      };
    }[];
  };
  assert.equal(
    packet.syntaxQueryRef,
    "semantic-tree-sitter-query/typescript-owner-items:src_demo.ts:alpha",
  );
  assert.deepEqual(packet.syntaxMatchRefs, ["match:1"]);
  assert.deepEqual(packet.syntaxCaptureRefs, ["capture:1"]);
  assert.deepEqual(packet.syntaxAnchor, {
    nodeType: "function_declaration",
    field: "name",
    capture: "function.name",
    location: { path: "src/demo.ts", lineRange: "1:7" },
  });
  const match = packet.matches[0]!;
  const projection = match.projection;

  assert.equal(match.code, readTextFixture("compact-query/ts-alpha.code.txt").trimEnd());
  assert.equal(projection.mode, "compact");
  assert.equal(projection.syntax, "save-token-typescript");
  assert.ok(projection.nodes.some((node) => node.read !== projection.exactRead));
  assert.ok(projection.nodes.some((node) => node.role === "delimiter"));
  assert.ok(
    projection.nodes.some((node) => node.parentId !== undefined && node.parentId !== "alpha"),
  );
  assert.ok(
    projection.expandActions.some(
      (action) => action.target !== "alpha" && action.read !== projection.exactRead,
    ),
  );
  for (const action of projection.expandActions) {
    if (action.read === undefined) continue;
    assert.equal(action.kind, "exact-read");
    assert.match(action.read, /^src\/demo\.ts(?::\d+:\d+)?$/u);
  }
});
