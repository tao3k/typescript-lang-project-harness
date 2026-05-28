import fs from "node:fs";
import path from "node:path";
import type { TsParsedModule } from "../syntax/model.js";

/** Cache read: load cached modules, keeping only valid ones whose hash matches. */
export function loadModuleCache(
  cachePath: string,
  validHashes: Set<string>, // files whose current hash matches cached hash
): Map<string, TsParsedModule> {
  const result = new Map<string, TsParsedModule>();
  if (!fs.existsSync(cachePath)) return result;

  try {
    const raw = fs.readFileSync(cachePath, "utf8");
    const cached = JSON.parse(raw) as Record<string, TsParsedModule>;
    for (const [modPath, mod] of Object.entries(cached)) {
      // only reuse valid modules whose file hasn't changed
      if (mod.isValid && validHashes.has(modPath)) {
        result.set(modPath, mod);
      }
    }
  } catch {
    // corrupted — return empty
  }

  return result;
}

/** Cache write: serialize all valid modules to JSON. */
export function saveModuleCache(modules: readonly TsParsedModule[], cachePath: string): void {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const valid = modules.filter((m) => m.isValid);
  if (valid.length === 0) return;

  const obj: Record<string, TsParsedModule> = {};
  for (const mod of valid) {
    obj[mod.path] = mod;
  }
  fs.writeFileSync(cachePath, JSON.stringify(obj, null, 2), "utf8");
}
