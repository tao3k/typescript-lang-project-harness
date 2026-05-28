import fs from "node:fs";
import path from "node:path";
import type { TsCompactFinding } from "../syntax/model.js";

/** Load cached findings by module path. */
export function loadFindingsCache(cachePath: string): Map<string, TsCompactFinding[]> {
  const result = new Map<string, TsCompactFinding[]>();
  if (!fs.existsSync(cachePath)) return result;

  try {
    const raw = fs.readFileSync(cachePath, "utf8");
    const cached = JSON.parse(raw) as Record<string, TsCompactFinding[]>;
    for (const [modPath, findings] of Object.entries(cached)) {
      result.set(modPath, findings);
    }
  } catch {
    // corrupted
  }

  return result;
}

/** Save findings cache. */
export function saveFindingsCache(
  findings: Map<string, TsCompactFinding[]>,
  cachePath: string,
): void {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const obj: Record<string, TsCompactFinding[]> = {};
  for (const [modPath, f] of findings) {
    obj[modPath] = f;
  }
  fs.writeFileSync(cachePath, JSON.stringify(obj, null, 2), "utf8");
}
