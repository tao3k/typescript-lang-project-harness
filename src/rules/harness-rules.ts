import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function harnessRulesPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(moduleDir, "harness-rules.md"),
    path.join(moduleDir, "..", "..", "src", "rules", "harness-rules.md"),
    path.join(moduleDir, "..", "..", "..", "src", "rules", "harness-rules.md"),
  ];
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  if (existing === undefined) {
    throw new Error("Unable to locate embedded TypeScript harness rules markdown");
  }
  return existing;
}

export function typeScriptHarnessRulesMarkdown(): string {
  return fs.readFileSync(harnessRulesPath(), "utf8");
}

export function renderTypeScriptHarnessRulesMarkdown(): string {
  const output = [
    "# typescript-lang-project-harness",
    "",
    "## Harness Rules",
    "",
    "Generated from embedded `src/rules/harness-rules.md`.",
    "",
  ];
  for (const line of typeScriptHarnessRulesMarkdown().split(/\r?\n/)) {
    if (!line.startsWith("- ")) continue;
    const item = line.slice(2);
    const separator = item.indexOf(": ");
    if (separator === -1) continue;
    output.push(`- **${item.slice(0, separator)}**: ${item.slice(separator + 2)}`);
  }
  return `${output.join("\n")}\n`;
}

export function writeTypeScriptHarnessRulesToUnitTests(unitTestDir: string): string {
  const outputPath = path.join(unitTestDir, "harness-rules.generated.md");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, renderTypeScriptHarnessRulesMarkdown(), "utf8");
  return outputPath;
}
