/** Provider-owned package-manager workspace admission for TypeScript search. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { readPackageJsonFacts } from "../parser/package_json.js";

export const SEMANTIC_WORKSPACE_SCOPE_SCHEMA_ID =
  "agent.semantic-protocols.semantic-workspace-scope" as const;

const SOURCE_EXTENSIONS = [".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"];
const LOCKFILE_MANAGERS = [
  ["pnpm", "pnpm-lock.yaml"],
  ["yarn", "yarn.lock"],
  ["bun", "bun.lock"],
  ["bun", "bun.lockb"],
  ["npm", "package-lock.json"],
] as const;

interface WorkspacePackage {
  readonly packageId: string;
  readonly name: string;
  readonly languageId: "typescript";
  readonly root: string;
  readonly manifestPath: string;
}

interface WorkspaceAnchor {
  readonly kind: string;
  readonly path: string;
  readonly sha256: string;
}

export function renderTypeScriptWorkspaceScopeJson(projectRoot: string): string {
  return `${JSON.stringify(buildTypeScriptWorkspaceScope(projectRoot), undefined, 2)}\n`;
}

export function buildTypeScriptWorkspaceScope(projectRoot: string): Record<string, unknown> {
  const discoveryRoot = fs.realpathSync(projectRoot);
  const facts = readPackageJsonFacts(discoveryRoot);
  const rootManifest = path.join(discoveryRoot, "package.json");
  if (!fs.existsSync(rootManifest)) {
    throw new Error(`TypeScript workspace at ${discoveryRoot} has no package.json`);
  }
  const packageManager = packageManagerForRoot(discoveryRoot);
  const packages = workspacePackages(discoveryRoot, rootManifest, facts);
  const anchors = workspaceAnchors(discoveryRoot, rootManifest);
  const admittedRoots = packages.map((pkg) => pkg.root);
  const packet = {
    schemaId: SEMANTIC_WORKSPACE_SCOPE_SCHEMA_ID,
    schemaVersion: "1",
    workspaceId: `${packageManager}:${discoveryRoot}`,
    languageId: "typescript",
    providerId: "ts-harness",
    packageManager,
    sourceExtensions: SOURCE_EXTENSIONS,
    discoveryRoot,
    anchors,
    packages,
    admittedRoots,
  };
  return { ...packet, fingerprint: digestText(JSON.stringify(packet)) };
}

function workspacePackages(
  discoveryRoot: string,
  rootManifest: string,
  facts: ReturnType<typeof readPackageJsonFacts>,
): WorkspacePackage[] {
  const packages = new Map<string, WorkspacePackage>();
  addWorkspacePackage(packages, discoveryRoot, rootManifest, facts.name);
  for (const workspacePackage of facts.workspacePackages) {
    addWorkspacePackage(
      packages,
      fs.realpathSync(workspacePackage.path),
      fs.realpathSync(workspacePackage.packageJsonPath),
      workspacePackage.name,
    );
  }
  return [...packages.values()].sort((left, right) => left.root.localeCompare(right.root));
}

function addWorkspacePackage(
  packages: Map<string, WorkspacePackage>,
  root: string,
  manifestPath: string,
  name: string | undefined,
): void {
  const packageName = name ?? path.basename(root);
  packages.set(root, {
    packageId: `${packageName}:${root}`,
    name: packageName,
    languageId: "typescript",
    root,
    manifestPath,
  });
}

function workspaceAnchors(discoveryRoot: string, rootManifest: string): WorkspaceAnchor[] {
  const anchors = [workspaceAnchor("package-manifest", rootManifest)];
  for (const [manager, fileName] of LOCKFILE_MANAGERS) {
    const candidate = path.join(discoveryRoot, fileName);
    if (fs.existsSync(candidate)) anchors.push(workspaceAnchor(`${manager}-lock`, candidate));
  }
  return anchors.sort((left, right) => left.path.localeCompare(right.path));
}

function workspaceAnchor(kind: string, filePath: string): WorkspaceAnchor {
  return { kind, path: fs.realpathSync(filePath), sha256: digestBytes(fs.readFileSync(filePath)) };
}

function packageManagerForRoot(discoveryRoot: string): string {
  return (
    LOCKFILE_MANAGERS.find(([, fileName]) =>
      fs.existsSync(path.join(discoveryRoot, fileName)),
    )?.[0] ?? "npm"
  );
}

function digestBytes(bytes: crypto.BinaryLike): string {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function digestText(text: string): string {
  return digestBytes(text);
}
