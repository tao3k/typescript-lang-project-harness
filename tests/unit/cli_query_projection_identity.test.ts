import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cliPath = fileURLToPath(new URL("../../src/cli/main.js", import.meta.url));

function runCliJson(args: readonly string[], cwd: string): unknown {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return JSON.parse(result.stdout) as unknown;
}

function writeProject(root: string): void {
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "projection-identity-fixture", type: "module" }),
  );
  writeFileSync(
    join(root, "tsconfig.json"),
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
  writeFileSync(
    join(root, "src", "projection.ts"),
    `
export function build(values: readonly number[]): readonly number[] {
  const projected = values
    .map((value) => ({ value, next: value + 1 }))
    .filter((item) => {
      if (item.next > 10) {
        return true;
      }
      return item.value % 2 === 0;
    })
    .map((item) => item.next);

  return projected;
}
`,
  );
}

function firstProjection(packet: unknown): Record<string, unknown> {
  assert.equal(typeof packet, "object");
  assert(packet !== null);
  const matches = (packet as { matches?: unknown }).matches;
  assert(Array.isArray(matches));
  assert(matches.length > 0);
  const projection = (matches[0] as { projection?: unknown }).projection;
  assert.equal(typeof projection, "object");
  assert(projection !== null);
  return projection as Record<string, unknown>;
}

test("query projection exposes unique parser-owned rendered node ids", () => {
  const root = mkdtempSync(join(tmpdir(), "ts-projection-identity-"));
  writeProject(root);

  const packet = runCliJson(
    ["query", "src/projection.ts", "--term", "build", "--json", "--workspace", "."],
    root,
  );
  const projection = firstProjection(packet);
  const nodes = projection.nodes;
  const renderedNodeIds = projection.renderedNodeIds;

  assert(Array.isArray(nodes));
  assert(Array.isArray(renderedNodeIds));
  assert(nodes.length > 0);
  assert(renderedNodeIds.length > 0);

  const nodeIds = new Set<string>();
  for (const node of nodes as Array<Record<string, unknown>>) {
    assert.equal(typeof node.id, "string");
    assert.equal(typeof node.nativeId, "string");
    assert.equal(typeof node.structuralFingerprint, "string");
    assert(!nodeIds.has(node.id as string), `duplicate node id ${node.id}`);
    nodeIds.add(node.id as string);
  }

  for (const node of nodes as Array<Record<string, unknown>>) {
    if (node.parentId !== undefined) {
      assert(nodeIds.has(node.parentId as string), `unknown parent ${node.parentId}`);
    }
  }

  const renderedUnique = new Set(renderedNodeIds as string[]);
  assert.equal(renderedUnique.size, renderedNodeIds.length);
  for (const nodeId of renderedNodeIds as string[]) {
    assert(nodeIds.has(nodeId), `rendered id ${nodeId} missing from nodes`);
  }

  for (const omission of (projection.omitted ?? []) as Array<Record<string, unknown>>) {
    if (omission.nodeId !== undefined) {
      assert(nodeIds.has(omission.nodeId as string), `unknown omitted node ${omission.nodeId}`);
    } else {
      assert.equal(typeof omission.read, "string");
    }
  }
});
