import path from "node:path";
import type { TsOwnerBranch, TsParsedModule } from "./model.js";
import { classifyRole } from "./roles.js";

export function buildOwnerBranches(
  projectRoot: string,
  modules: readonly TsParsedModule[],
): readonly TsOwnerBranch[] {
  // Group modules by owner namespace
  const byOwner = new Map<string, TsParsedModule[]>();
  for (const mod of modules) {
    const owner = moduleOwner(projectRoot, mod.path);
    const list = byOwner.get(owner) ?? [];
    list.push(mod);
    byOwner.set(owner, list);
  }

  // Build branches
  const branches: TsOwnerBranch[] = [];
  for (const [owner, mods] of byOwner) {
    // Primary module: the one with the highest "importance"
    const primary = selectPrimary(mods);
    const role = classifyRole(primary);
    branches.push({
      path: primary.path,
      owner,
      role,
      modules: mods.map((m) => m.path).sort(),
      isRoot: false, // filled later
    });
  }

  // Determine roots: owners with no inbound deps from sibling owners
  // This requires the dep graph — filled outside this function
  return branches.sort((a, b) => a.owner.localeCompare(b.owner));
}

/** Compute the owner namespace from a module path. */
export function moduleOwner(projectRoot: string, modulePath: string): string {
  const relative = path.relative(projectRoot, modulePath);
  // Strip src/ prefix if present
  const stripped = relative.startsWith("src/") ? relative.slice(4) : relative;
  // Remove the filename to get the directory
  const dir = path.dirname(stripped);
  if (dir === ".") {
    // Root-level file
    return stripped.replace(/\.[^.]+$/, "");
  }
  // Join dir + filename stem
  const stem = path.basename(stripped, path.extname(stripped));
  return dir === stem ? dir : path.join(dir, stem);
}

function selectPrimary(mods: readonly TsParsedModule[]): TsParsedModule {
  // Prefer index.ts, then the one with most exports
  const index = mods.find((m) => m.path.endsWith("/index.ts") || m.path.endsWith("/index.tsx"));
  if (index !== undefined) return index;

  // Most exports
  return mods.reduce((best, curr) => (curr.exports.length > best.exports.length ? curr : best));
}

/** Mark roots: owners with no structural inbound dependency. */
export function markRoots(
  branches: readonly TsOwnerBranch[],
  deps: readonly { readonly fromOwner: string; readonly toOwner: string }[],
): TsOwnerBranch[] {
  const inbounds = new Set(deps.map((d) => d.toOwner));
  return branches.map((b) => ({
    ...b,
    isRoot: !inbounds.has(b.owner),
  }));
}
