import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCliCapture } from "./cli_helpers.js";

interface CompactSnapshotPacket {
  readonly matches: readonly {
    readonly name: string;
    readonly kind: string;
    readonly read: string;
    readonly code?: string;
    readonly projection?: unknown;
  }[];
}

function compactQuerySnapshot(packet: CompactSnapshotPacket): unknown {
  return {
    matches: packet.matches.map((match) => ({
      name: match.name,
      kind: match.kind,
      read: match.read,
      code: match.code,
      projection: match.projection,
    })),
  };
}

function readJsonFixture(relativePath: string): unknown {
  const fixturePath = path.resolve(
    new URL(`../../../tests/fixtures/${relativePath}`, import.meta.url).pathname,
  );
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

function writeSnapshotProject(
  root: string,
  fileName: string,
  sourceLines: readonly string[],
): void {
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "compact-query-snapshot-fixture", type: "module" }),
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
  fs.writeFileSync(path.join(root, "src", fileName), sourceLines.join("\n"));
}

function querySnapshot(root: string, ownerPath: string, term: string): unknown {
  const result = runCliCapture(["query", ownerPath, "--term", term, "--json", "."], root);
  assert.equal(result.exitCode, 0, result.stderr);
  return compactQuerySnapshot(JSON.parse(result.stdout) as CompactSnapshotPacket);
}

test("owner item query compact packet matches branch parser snapshot", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-owner-item-snapshot-"));
  writeSnapshotProject(root, "demo.ts", [
    "export function alpha(flag: boolean) {",
    "  const value = flag ? 1 : 0;",
    "  if (value > 0) {",
    "    return value;",
    "  }",
    "  return 0;",
    "}",
  ]);

  assert.deepEqual(
    querySnapshot(root, "src/demo.ts", "alpha"),
    readJsonFixture("compact-query/ts-alpha.json"),
  );
});

test("owner item query compact packet matches flow parser snapshot", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-owner-flow-snapshot-"));
  writeSnapshotProject(root, "flow.ts", [
    "export async function beta(values: string[], mapper: (value: string) => Promise<string>) {",
    "  const output: string[] = [];",
    "  for (const value of values) {",
    '    if (value.trim() === "") {',
    "      continue;",
    "    }",
    "    output.push(await mapper(value));",
    "  }",
    "  return output;",
    "}",
  ]);

  assert.deepEqual(
    querySnapshot(root, "src/flow.ts", "beta"),
    readJsonFixture("compact-query/ts-flow.json"),
  );
});
