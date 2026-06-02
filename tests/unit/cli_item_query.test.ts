import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCliCapture } from "./cli_helpers.js";

function fixturePath(relativePath: string): string {
  return path.resolve(new URL(`../../../tests/fixtures/${relativePath}`, import.meta.url).pathname);
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

test("owner items --query emits compact parser-owned code", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-owner-item-query-"));
  writeTsProject(
    root,
    "owner-item-query-fixture",
    readTextFixture("compact-query/sources/owner-item-demo.ts"),
  );
  const expectedCode = readTextFixture("compact-query/owner-item-alpha.code.txt").trimEnd();

  const result = runCliCapture(
    ["search", "owner", "src/demo.ts", "items", "--query", "alpha", "."],
    root,
  );

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /^\[search-owner\].*item=1.*itemQuery=alpha/mu);
  assert.match(
    result.stdout,
    /\|item function alpha owner=src\/demo\.ts column=0 exported=true read=src\/demo\.ts:1:4/u,
  );
  assert.ok(
    result.stdout
      .split("\n")
      .some(
        (line) =>
          line.startsWith(
            "|code path=src/demo.ts lineRange=1:4 reason=item-query truncated=false ",
          ) && line.includes(`text=${JSON.stringify(expectedCode)}`),
      ),
    result.stdout,
  );
  assert.doesNotMatch(result.stdout, /function beta/u);
});

test("owner items --json emits parser nodes and node expand actions", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-owner-item-json-"));
  writeTsProject(
    root,
    "owner-item-json-fixture",
    readTextFixture("compact-query/sources/ts-alpha.ts"),
  );

  const result = runCliCapture(["query", "src/demo.ts", "--term", "alpha", "--json", "."], root);

  assert.equal(result.exitCode, 0, result.stderr);
  const packet = JSON.parse(result.stdout) as {
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
          readonly argv: readonly string[];
          readonly read?: string;
          readonly target: string;
        }[];
      };
    }[];
  };
  const match = packet.matches[0]!;
  const projection = match.projection;

  assert.equal(match.code, readTextFixture("compact-query/ts-alpha.code.txt").trimEnd());
  assert.equal(projection.mode, "outline");
  assert.equal(projection.syntax, "semantic-outline");
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
