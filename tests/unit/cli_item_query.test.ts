import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCliCapture } from "./cli_helpers.js";

test("owner items --query emits compact parser-owned code", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-owner-item-query-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "owner-item-query-fixture", type: "module" }),
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
  fs.writeFileSync(
    path.join(root, "src", "demo.ts"),
    [
      "export function alpha() {",
      "  const value = 1;",
      "  return value;",
      "}",
      "",
      "export function beta() {",
      "  return alpha();",
      "}",
    ].join("\n"),
  );

  const result = runCliCapture(
    ["search", "owner", "src/demo.ts", "items", "--query", "alpha|missing", "."],
    root,
  );

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /^\[search-owner\].*item=1.*itemQuery=alpha\|missing/mu);
  assert.match(
    result.stdout,
    /\|item function alpha owner=src\/demo\.ts column=0 exported=true read=src\/demo\.ts:1-4/u,
  );
  assert.match(
    result.stdout,
    /\|code path=src\/demo\.ts startLine=1 endLine=4 reason=item-query truncated=false text="export function alpha\(\) \{ const value = 1; return value; \}"/u,
  );
  assert.doesNotMatch(result.stdout, /function beta/u);
});

test("owner items --json emits parser nodes and node expand actions", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-owner-item-json-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "owner-item-json-fixture", type: "module" }),
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
  fs.writeFileSync(
    path.join(root, "src", "demo.ts"),
    [
      "export function alpha(flag: boolean) {",
      "  const value = flag ? 1 : 0;",
      "  if (value > 0) {",
      "    return value;",
      "  }",
      "  return 0;",
      "}",
    ].join("\n"),
  );

  const result = runCliCapture(["query", "src/demo.ts", "--term", "alpha", "--json", "."], root);

  assert.equal(result.exitCode, 0, result.stderr);
  const packet = JSON.parse(result.stdout) as {
    readonly matches: readonly {
      readonly code: string;
      readonly projection: {
        readonly exactRead: string;
        readonly nodes: readonly {
          readonly parentId?: string;
          readonly read: string;
          readonly role: string;
        }[];
        readonly expandActions: readonly {
          readonly argv: readonly string[];
          readonly read?: string;
          readonly target: string;
        }[];
      };
    }[];
  };
  const match = packet.matches[0]!;
  const projection = match.projection;

  assert.equal(
    match.code,
    "export function alpha(flag: boolean) { const value = flag ? 1 : 0; if (value > 0) { return value; } return 0; }",
  );
  assert.ok(projection.nodes.some((node) => node.read !== projection.exactRead));
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
    const selectorIndex = action.argv.indexOf("--selector");
    assert.notEqual(selectorIndex, -1);
    assert.equal(action.argv[selectorIndex + 1], action.read);
  }
});
