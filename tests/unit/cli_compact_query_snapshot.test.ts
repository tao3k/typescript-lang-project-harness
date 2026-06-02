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
      projection: match.projection,
    })),
  };
}

function compactCodeSnapshot(packet: CompactSnapshotPacket): readonly string[] {
  return packet.matches.map((match) => {
    if (match.code === undefined) {
      throw new Error(`missing compact code for ${match.name}`);
    }
    return match.code;
  });
}

function fixturePath(relativePath: string): string {
  return path.resolve(new URL(`../../../tests/fixtures/${relativePath}`, import.meta.url).pathname);
}

function readJsonFixture(relativePath: string): unknown {
  return JSON.parse(fs.readFileSync(fixturePath(relativePath), "utf8"));
}

function readTextFixture(relativePath: string): string {
  return fs.readFileSync(fixturePath(relativePath), "utf8").replace(/\r\n/gu, "\n");
}

function writeSnapshotProject(
  root: string,
  fileName: string,
  sourceText: string,
  compilerOptions: Record<string, unknown> = {},
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
        ...compilerOptions,
      },
      include: ["src/**/*.ts"],
    }),
  );
  fs.writeFileSync(path.join(root, "src", fileName), sourceText);
}

function queryPacket(root: string, ownerPath: string, term: string): CompactSnapshotPacket {
  const result = runCliCapture(["query", ownerPath, "--term", term, "--json", "."], root);
  assert.equal(result.exitCode, 0, result.stderr);
  return JSON.parse(result.stdout) as CompactSnapshotPacket;
}

test("owner item query compact packet matches branch parser snapshot", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-owner-item-snapshot-"));
  writeSnapshotProject(root, "demo.ts", readTextFixture("compact-query/sources/ts-alpha.ts"));
  const packet = queryPacket(root, "src/demo.ts", "alpha");

  assert.deepEqual(compactQuerySnapshot(packet), readJsonFixture("compact-query/ts-alpha.json"));
  assert.deepEqual(compactCodeSnapshot(packet), [
    readTextFixture("compact-query/ts-alpha.code.txt").trimEnd(),
  ]);
});

test("owner item query compact packet matches flow parser snapshot", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-owner-flow-snapshot-"));
  writeSnapshotProject(root, "flow.ts", readTextFixture("compact-query/sources/ts-flow.ts"));
  const packet = queryPacket(root, "src/flow.ts", "beta");

  assert.deepEqual(compactQuerySnapshot(packet), readJsonFixture("compact-query/ts-flow.json"));
  assert.deepEqual(compactCodeSnapshot(packet), [
    readTextFixture("compact-query/ts-flow.code.txt").trimEnd(),
  ]);
});

test("query class compact packet matches parser snapshot", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-compact-class-"));
  writeSnapshotProject(root, "service.ts", readTextFixture("compact-query/sources/ts-class.ts"), {
    experimentalDecorators: true,
  });
  const packet = queryPacket(root, "src/service.ts", "Service");

  assert.deepEqual(compactQuerySnapshot(packet), readJsonFixture("compact-query/ts-class.json"));
  assert.deepEqual(compactCodeSnapshot(packet), [
    readTextFixture("compact-query/ts-class.code.txt").trimEnd(),
  ]);
});
