import fs from "node:fs";
import path from "node:path";
import type { TsOwnerDependency, TsParsedModule } from "./model.js";
import { moduleOwner } from "./owners.js";

const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];

export function buildOwnerDependencies(
  projectRoot: string,
  modules: readonly TsParsedModule[],
): readonly TsOwnerDependency[] {
  const ownerMap = buildOwnerMap(projectRoot, modules);
  const edgeMap = buildEdgeMap(projectRoot, modules, ownerMap);
  return deduplicateEdges(edgeMap);
}

function buildOwnerMap(
  projectRoot: string,
  modules: readonly TsParsedModule[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const mod of modules) {
    map.set(mod.path, moduleOwner(projectRoot, mod.path));
  }
  return map;
}

function buildEdgeMap(
  projectRoot: string,
  modules: readonly TsParsedModule[],
  ownerMap: Map<string, string>,
): Map<string, TsOwnerDependency> {
  const edges = new Map<string, TsOwnerDependency>();

  for (const mod of modules) {
    const fromOwner = ownerMap.get(mod.path)!;
    for (const edge of moduleEdges(mod, fromOwner, ownerMap)) {
      const existing = edges.get(edge.key);
      if (existing !== undefined) {
        edges.set(edge.key, { ...existing, weight: existing.weight + edge.dep.weight });
      } else {
        edges.set(edge.key, edge.dep);
      }
    }
  }

  return edges;
}

interface ModuleEdge {
  key: string;
  dep: TsOwnerDependency;
}

function moduleEdges(
  mod: TsParsedModule,
  fromOwner: string,
  ownerMap: Map<string, string>,
): ModuleEdge[] {
  const edges: ModuleEdge[] = [];
  for (const imp of mod.imports) {
    if (!imp.moduleSpecifier.startsWith(".")) continue;
    const resolved = resolveModuleSpecifier(mod.path, imp.moduleSpecifier);
    if (resolved === undefined) continue;
    const toOwner = ownerMap.get(resolved) ?? moduleOwner("", resolved);
    if (fromOwner === toOwner) continue;
    edges.push({
      key: `${fromOwner}→${toOwner}`,
      dep: { fromOwner, toOwner, edgeKind: "owner", weight: 1 },
    });
  }
  return edges;
}

function deduplicateEdges(edgeMap: Map<string, TsOwnerDependency>): readonly TsOwnerDependency[] {
  return [...edgeMap.values()].sort(
    (a, b) => a.fromOwner.localeCompare(b.fromOwner) || a.toOwner.localeCompare(b.toOwner),
  );
}

export function resolveModuleSpecifier(fromPath: string, specifier: string): string | undefined {
  const dir = path.dirname(fromPath);
  const resolved = path.resolve(dir, specifier);

  if (isFile(resolved)) return resolved;
  for (const ext of RESOLVE_EXTENSIONS) {
    if (isFile(resolved + ext)) return resolved + ext;
  }
  for (const ext of RESOLVE_EXTENSIONS) {
    if (isFile(path.join(resolved, "index" + ext))) return path.join(resolved, "index" + ext);
  }
  return undefined;
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}
