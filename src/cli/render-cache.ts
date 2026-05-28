import fs from "node:fs";
import path from "node:path";

interface CacheFileInfo {
  name: string;
  size: number;
  exists: boolean;
}

/** Render cache status as compact text. */
export function renderCache(root: string): string {
  const cacheDir = path.resolve(root, ".cache", "ts-harness");
  const files: CacheFileInfo[] = [
    { name: "file-hashes.json", size: 0, exists: false },
    { name: "parsed-modules.json", size: 0, exists: false },
    { name: "findings.json", size: 0, exists: false },
    { name: "owner-graph.json", size: 0, exists: false },
  ];

  if (fs.existsSync(cacheDir)) {
    for (const f of files) {
      const fp = path.join(cacheDir, f.name);
      try {
        const stat = fs.statSync(fp);
        f.exists = true;
        f.size = stat.size;
      } catch {
        // file doesn't exist
      }
    }
  }

  const existing = files.filter((f) => f.exists);
  const totalSize = existing.reduce((s, f) => s + f.size, 0);

  if (existing.length === 0) {
    return "[cache] empty — run harness to populate\n";
  }

  const lines = ["[cache]:"];
  for (const f of existing) {
    lines.push(`  ${f.name} ${formatSize(f.size)}`);
  }
  lines.push(`  total ${formatSize(totalSize)} (${existing.length}/${files.length} files)`);
  return lines.join("\n") + "\n";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
