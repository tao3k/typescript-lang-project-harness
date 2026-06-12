import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCliCapture } from "./cli_helpers.js";

function writeProject(root: string): void {
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "compact-punctuation-fixture", type: "module" }),
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
    path.join(root, "src", "chain.ts"),
    `
export function build(values: readonly string[]): readonly string[] {
  return values
    .map((value) => ({
      label: value.trim(),
    }))
    .filter((item) => {
      return item.label.length > 0;
    })
    .map((item) => item.label);
}
`,
  );
}

test("compact code omits standalone punctuation layout lines", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-compact-punctuation-"));
  writeProject(root);

  const result = runCliCapture(
    ["search", "owner", "src/chain.ts", "items", "--query", "build", "--json", "--workspace", "."],
    root,
  );

  assert.equal(result.exitCode, 0, result.stderr);
  const packet = JSON.parse(result.stdout) as {
    readonly items: readonly { readonly fields?: { readonly code?: string } }[];
  };
  const code = packet.items[0]?.fields?.code ?? "";
  const lines = code.split("\n");

  assert.ok(code.includes("return values"));
  assert.ok(code.includes(".map((value) => ({"));
  assert.ok(code.includes("label: value.trim(),"));
  assert.ok(code.includes("return item.label.length > 0;"));
  assert.equal(
    lines.some((line) => /^[{}()[\].,;:]+$/u.test(line)),
    false,
    code,
  );
  assert.equal(code.includes("\n})"), false, code);
  assert.equal(code.includes("\n);"), false, code);
});
