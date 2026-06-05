import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCliCapture } from "./cli_helpers.js";

interface QueryPacket {
  readonly matches: Array<{
    readonly name: string;
    readonly code: string;
    readonly projection: {
      readonly renderedRows: Array<{ readonly text: string }>;
    };
  }>;
}

function writeDescriptorProject(root: string): void {
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "demo-ts", type: "module" }));
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        target: "ES2022",
      },
      include: ["src/**/*.ts"],
    }),
  );
  writeFileSync(
    join(root, "src", "catalog.ts"),
    `
export interface ViewDescriptor {
  name: string;
  capabilities?: string[];
  requiresQuery?: boolean;
  acceptedPipes?: string[];
}

export function typescriptViewDescriptors(): ViewDescriptor[] {
  return [
    { name: "workspace", capabilities: ["workspace-router"], requiresQuery: false },
    { name: "prime", capabilities: ["package-prime-map"], requiresQuery: false },
    { name: "owner", acceptedPipes: ["items"], requiresQuery: true },
    { name: "dependency", acceptedPipes: ["deps"], requiresQuery: true },
    { name: "policy", acceptedPipes: ["tests"], requiresQuery: true },
  ];
}

export function typescriptViewIndex(): Record<string, Partial<ViewDescriptor>> {
  return {
    workspace: { capabilities: ["workspace-router"] },
    prime: { capabilities: ["package-prime-map"] },
    owner: { acceptedPipes: ["items"] },
    dependency: { acceptedPipes: ["deps"] },
    policy: { acceptedPipes: ["tests"] },
  };
}
`,
  );
}

test("item query compacts descriptor arrays and object maps structurally", () => {
  const root = mkdtempSync(join(tmpdir(), "ts-item-query-compact-"));
  writeDescriptorProject(root);

  const textResult = runCliCapture(
    [
      "query",
      "src/catalog.ts",
      "--term",
      "typescriptViewDescriptors|typescriptViewIndex",
      "--code",
      root,
    ],
    root,
  );

  assert.equal(textResult.exitCode, 0, textResult.stderr);
  assert.match(textResult.stdout, /return array\[5\] items=object\[3\] name=workspace/u);
  assert.match(textResult.stdout, /workspace-router/u);
  assert.match(textResult.stdout, /return object\[5\] workspace=object\[1\] prime=object\[1\]/u);
  assert.doesNotMatch(textResult.stdout, /return array;/u);
  assert.doesNotMatch(textResult.stdout, /\{ name: "workspace"/u);

  const jsonResult = runCliCapture(
    [
      "query",
      "src/catalog.ts",
      "--term",
      "typescriptViewDescriptors|typescriptViewIndex",
      "--json",
      root,
    ],
    root,
  );

  assert.equal(jsonResult.exitCode, 0, jsonResult.stderr);
  const packet = JSON.parse(jsonResult.stdout) as QueryPacket;
  const codeByName = new Map(packet.matches.map((match) => [match.name, match.code]));
  assert.match(
    codeByName.get("typescriptViewDescriptors") ?? "",
    /return array\[5\] items=object\[3\] name=workspace/u,
  );
  assert.match(
    codeByName.get("typescriptViewIndex") ?? "",
    /return object\[5\] workspace=object\[1\] prime=object\[1\]/u,
  );

  for (const match of packet.matches) {
    assert.equal(match.projection.renderedRows.map((row) => row.text).join("\n"), match.code);
  }
});
