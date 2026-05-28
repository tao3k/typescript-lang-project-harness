import fs from "node:fs";
import path from "node:path";

export function renderCache(projectRoot: string): string {
  const cacheDir = path.join(projectRoot, ".cache", "ts-harness");
  if (!fs.existsSync(cacheDir)) {
    return `[cache] dir=${cacheDir}\n  empty\n`;
  }
  const entries = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json"));
  if (entries.length === 0) {
    return `[cache] dir=${cacheDir}\n  empty\n`;
  }
  return `[cache]:\n  ${entries.join("\n  ")}\n`;
}
