import fs from "node:fs";
import path from "node:path";
import type { TsParsedModule, TsParsedProject } from "./model.js";
import { parseModule } from "./parse-module.js";
export { parseModule };

const TS_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);

export function discoverModules(
  root: string,
  ignoreDirs: readonly string[] = ["node_modules", "dist", ".git", "build"],
): string[] {
  const files: string[] = [];
  const ignoreSet = new Set(ignoreDirs);

  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoreSet.has(entry.name) && !entry.name.startsWith(".")) {
          walk(path.join(dir, entry.name));
        }
        continue;
      }
      if (TS_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(path.join(dir, entry.name));
      }
    }
  };

  walk(path.resolve(root));
  return files.sort();
}

export function parseProject(
  projectRoot: string,
  options: { readonly ignoreDirs?: readonly string[] } = {},
): TsParsedProject {
  const root = path.resolve(projectRoot);
  const files = discoverModules(root, options.ignoreDirs);
  const modules = files.map(parseModule);
  return { projectRoot: root, modules };
}

export function parseFiles(filePaths: readonly string[]): TsParsedModule[] {
  return filePaths.map(parseModule);
}
