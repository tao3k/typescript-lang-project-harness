import fs from "node:fs";
import path from "node:path";

import { buildKnowledgePacketPayloadForProject } from "./semantic-search/packet-knowledge.js";
import { buildPolicyPacketPayload } from "./semantic-search/policy.js";
import { typeScriptReasoningProfiles } from "./semantic-search/profiles.js";
import {
  SEMANTIC_LANGUAGE_PROTOCOL_ID,
  SEMANTIC_LANGUAGE_PROTOCOL_VERSION,
  TYPE_SCRIPT_BINARY,
  TYPE_SCRIPT_LANGUAGE_ID,
  TYPE_SCRIPT_PROVIDER_ID,
  TYPE_SCRIPT_PROVIDER_NAMESPACE,
} from "./semantic-language.js";

interface CliStreams {
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
  readonly stdin?: string;
}

type MetadataFastSearchView =
  | "env"
  | "runtime-source"
  | "lang"
  | "std"
  | "capability"
  | "extension"
  | "pattern"
  | "compare";

type FastSearchView =
  | "workspace"
  | "owner"
  | "deps"
  | "dependency"
  | "policy"
  | "prime"
  | "lexical"
  | MetadataFastSearchView;

interface FastSearchArgs {
  readonly view: FastSearchView;
  readonly query?: string;
  readonly packagePath?: string;
  readonly projectRoot?: string;
  readonly querySet: readonly string[];
  readonly pipes: readonly string[];
  readonly json: boolean;
  readonly renderMode?: string;
}

export function tryRunFastSearchCli(
  argv: readonly string[],
  streams: CliStreams,
  cwd: string,
): number | undefined {
  const args = parseFastSearchArgs(argv);
  if (args === undefined) return undefined;
  const output =
    tryRenderPolicyFastPath(cwd, args) ??
    tryRenderMetadataKnowledgeFastPath(cwd, args) ??
    tryRenderWorkspaceSeedFastPath(cwd, args) ??
    tryRenderOwnerSeedFastPath(cwd, args) ??
    tryRenderDependencySeedFastPath(cwd, args) ??
    tryRenderPackagePrimeSeedFastPath(cwd, args) ??
    tryRenderPackageLexicalSeedFastPath(cwd, args);
  if (output === undefined) return undefined;
  streams.stdout.write(output);
  return 0;
}

function parseFastSearchArgs(argv: readonly string[]): FastSearchArgs | undefined {
  if (argv[0] !== "search") return undefined;
  const view = argv[1];
  if (
    view !== "workspace" &&
    view !== "owner" &&
    view !== "deps" &&
    view !== "dependency" &&
    view !== "policy" &&
    view !== "prime" &&
    view !== "lexical" &&
    view !== "env" &&
    view !== "runtime-source" &&
    view !== "lang" &&
    view !== "std" &&
    view !== "capability" &&
    view !== "extension" &&
    view !== "pattern" &&
    view !== "compare"
  ) {
    return undefined;
  }
  let query: string | undefined;
  let packagePath: string | undefined;
  let projectRoot: string | undefined;
  let json = false;
  let renderMode: string | undefined;
  const querySet: string[] = [];
  const pipes: string[] = [];
  const positionals: string[] = [];
  for (let index = 2; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--json") {
      json = true;
    } else if (arg === "--view") {
      renderMode = argv[index + 1];
      index += 1;
    } else if (arg === "--package") {
      packagePath = argv[index + 1];
      index += 1;
    } else if (arg === "--workspace") {
      projectRoot = argv[index + 1];
      index += 1;
    } else if (arg === "--query-set") {
      const value = argv[index + 1];
      if (value !== undefined) querySet.push(value);
      index += 1;
    } else if (arg === "owner" || arg === "tests" || arg === "items") {
      pipes.push(arg);
    } else if (!arg.startsWith("-")) {
      positionals.push(arg);
    } else {
      return undefined;
    }
  }
  if (view === "lexical") {
    query = querySet.length === 0 ? positionals[0] : querySet.join(",");
  } else {
    query = positionals[0];
  }
  return {
    view,
    ...(query === undefined ? {} : { query }),
    ...(packagePath === undefined ? {} : { packagePath }),
    ...(projectRoot === undefined ? {} : { projectRoot }),
    querySet,
    pipes,
    json,
    ...(renderMode === undefined ? {} : { renderMode }),
  };
}

function tryRenderPolicyFastPath(cwd: string, args: FastSearchArgs): string | undefined {
  if (args.view !== "policy" || args.query === undefined || args.pipes.length > 0) {
    return undefined;
  }
  const projectRoot = resolveProviderProjectRoot(cwd, args);
  const packageName = nearestPackageName(projectRoot, projectRoot) ?? path.basename(projectRoot);
  return renderFastSearchPacket(
    projectRoot,
    packageName,
    args,
    buildPolicyPacketPayload(args.query),
  );
}

function tryRenderMetadataKnowledgeFastPath(cwd: string, args: FastSearchArgs): string | undefined {
  if (!isMetadataFastSearchView(args.view) || args.pipes.length > 0) return undefined;
  const projectRoot = resolveProviderProjectRoot(cwd, args);
  const packageName = nearestPackageName(projectRoot, projectRoot) ?? path.basename(projectRoot);
  const payload = buildKnowledgePacketPayloadForProject(
    projectRoot,
    packageName,
    args.view,
    args.query,
  );
  return renderFastSearchPacket(projectRoot, packageName, args, payload);
}

function renderFastSearchPacket(
  projectRoot: string,
  packageName: string,
  args: FastSearchArgs,
  payload:
    | ReturnType<typeof buildKnowledgePacketPayloadForProject>
    | ReturnType<typeof buildPolicyPacketPayload>,
): string {
  if (args.json) {
    return `${JSON.stringify({
      schemaId: "agent.semantic-protocols.semantic-search-packet",
      schemaVersion: "1",
      protocolId: SEMANTIC_LANGUAGE_PROTOCOL_ID,
      protocolVersion: SEMANTIC_LANGUAGE_PROTOCOL_VERSION,
      languageId: TYPE_SCRIPT_LANGUAGE_ID,
      providerId: TYPE_SCRIPT_PROVIDER_ID,
      binary: TYPE_SCRIPT_BINARY,
      namespace: TYPE_SCRIPT_PROVIDER_NAMESPACE,
      method: `search/${args.view}`,
      projectRoot,
      packageName,
      view: args.view,
      renderMode: args.renderMode ?? "graph",
      ...(args.renderMode === "graph" || args.renderMode === "seeds" || args.renderMode === "both"
        ? { reasoningProfiles: typeScriptReasoningProfiles() }
        : {}),
      ...(args.query === undefined ? {} : { query: args.query }),
      ...(payload.queryCoverage === undefined ? {} : { queryCoverage: payload.queryCoverage }),
      ...(payload.searchSynthesis === undefined
        ? {}
        : { searchSynthesis: payload.searchSynthesis }),
      header: payload.header,
      ...(payload.packages === undefined ? {} : { packages: payload.packages }),
      nodes: payload.nodes,
      edges: payload.edges,
      owners: payload.owners,
      ...(payload.semanticHandles === undefined
        ? {}
        : { semanticHandles: payload.semanticHandles }),
      hits: payload.hits,
      findings: payload.findings,
      nextActions: payload.nextActions,
      notes: payload.notes,
    })}\n`;
  }
  const facts = payload.packages ?? [];
  const handles = payload.semanticHandles ?? [];
  const factIds =
    [...facts.map((fact) => fact.id), ...handles.map((handle) => handle.id)].join(",") || "none";
  const query = args.query ?? args.view;
  return [
    `[search-${args.view}] root=${packageName} alg=${args.view === "policy" ? "policy-handle-catalog" : "metadata-fast-path"}`,
    "legend: ID=kind:role(value)!next; edge SRC>{DST:rel}; frontier ID.next",
    "aliases: graph:{G=search,Q=query,M=metadata}",
    `Q=query:term(${query})!lexical;M=metadata:axis(${args.view}:${factIds})!metadata`,
    "G>{Q:matches,M:provides}",
    "rank=Q,M frontier=Q.lexical,M.metadata",
    `entries=${args.view === "policy" ? "provider-policy-catalog" : "metadata-only"}(projectRoot=${projectRoot})`,
    "",
  ].join("\n");
}

function isMetadataFastSearchView(view: FastSearchView): view is MetadataFastSearchView {
  return [
    "env",
    "runtime-source",
    "lang",
    "std",
    "capability",
    "extension",
    "pattern",
    "compare",
  ].includes(view);
}

function tryRenderWorkspaceSeedFastPath(cwd: string, args: FastSearchArgs): string | undefined {
  if (
    args.view !== "workspace" ||
    args.query !== undefined ||
    args.pipes.length > 0 ||
    args.json ||
    args.renderMode !== "seeds"
  ) {
    return undefined;
  }
  const projectRoot = resolveProviderProjectRoot(cwd, args);
  const packageName = nearestPackageName(projectRoot, projectRoot) ?? path.basename(projectRoot);
  return [
    `[search-workspace] root=${packageName} mode=manifest-router nativeSyntaxFacts=skipped policyFindings=skipped alg=package-router`,
    "legend: ID=kind:role(value)!next; edge SRC>{DST:rel}; frontier ID.next",
    "aliases: graph:{G=search,P=package}",
    `P=package:pkg(${packageName})!prime`,
    "G>{P:selects}",
    "rank=P frontier=P.prime",
    "entries=search-prime(P=>package-map)",
    "",
  ].join("\n");
}

function tryRenderOwnerSeedFastPath(cwd: string, args: FastSearchArgs): string | undefined {
  if (
    args.view !== "owner" ||
    args.query === undefined ||
    args.pipes.length > 0 ||
    args.json ||
    args.renderMode !== "seeds"
  ) {
    return undefined;
  }
  const projectRoot = resolveProviderProjectRoot(cwd, args);
  const ownerPath = projectRelativeTypeScriptFile(projectRoot, args.query);
  if (ownerPath === undefined) return undefined;
  return [
    `[search-owner] q=${ownerPath} role=file public=false edge=0 find=0`,
    "legend: ID=kind:role(value)!next; edge SRC>{DST:rel}; frontier ID.next",
    "aliases: graph:{G=search,O=owner}",
    `O=owner:path(${ownerPath})!owner`,
    "G>{O:selects}",
    "rank=O frontier=O.owner",
    "entries=owner-tests(O=>covering-tests+test-entrypoints+fixtures)",
    "",
  ].join("\n");
}

function tryRenderDependencySeedFastPath(cwd: string, args: FastSearchArgs): string | undefined {
  const dependency = args.query;
  if (
    args.view !== "deps" ||
    dependency === undefined ||
    args.pipes.length > 0 ||
    args.json ||
    args.renderMode !== "seeds"
  ) {
    return undefined;
  }
  const projectRoot = resolveProviderProjectRoot(cwd, args);
  const ownerPath = manifestDependencyOwnerPath(projectRoot, dependency);
  if (ownerPath === undefined) return undefined;
  return [
    `[search-dependency] q=${dependency} view=hits alg=seed-frontier`,
    "legend: ID=kind:role(value)!next; edge SRC>{DST:rel}; frontier ID.next",
    "aliases: graph:{G=search,D=dependency,O=owner}",
    `D=dependency:pkg(${dependency})!dependency;O=owner:path(${ownerPath})!owner`,
    "G>{D:uses,O:selects}",
    "rank=D,O frontier=D.dependency,O.owner",
    "entries=owner-tests(O=>covering-tests+test-entrypoints+fixtures)",
    "",
  ].join("\n");
}

const MIN_FAST_SEED_PROJECT_FILES = 64;

function tryRenderPackagePrimeSeedFastPath(cwd: string, args: FastSearchArgs): string | undefined {
  if (args.view !== "prime" || args.pipes.length > 0 || args.json || args.renderMode !== "seeds") {
    return undefined;
  }
  const workspaceRoot = path.resolve(cwd, args.projectRoot ?? ".");
  const packageRoot = resolveProviderProjectRoot(cwd, args);
  const owners = collectPrimeSeedOwners(packageRoot, workspaceRoot, 4, MIN_FAST_SEED_PROJECT_FILES);
  if (owners.length === 0) return undefined;
  const packageName =
    nearestPackageName(packageRoot, workspaceRoot) ?? path.basename(workspaceRoot);
  const declarations: string[] = [];
  const edges: string[] = [];
  const rank: string[] = [];
  for (let index = 0; index < owners.length; index++) {
    const suffix = index === 0 ? "" : String(index + 1);
    const ownerId = `O${suffix}`;
    const queryId = `Q${suffix}`;
    const ownerPath = owners[index]!;
    const queryTerm = index === 0 ? "*" : queryTermFromOwnerPath(ownerPath);
    declarations.push(`${ownerId}=owner:path(${ownerPath})!owner`);
    declarations.push(`${queryId}=query:term(${queryTerm})!lexical`);
    edges.push(`${ownerId}:selects`, `${queryId}:matches`);
    rank.push(ownerId, queryId);
  }
  return [
    `[search-prime] root=${packageName} analysis=structure nativeSyntaxFacts=skipped policyFindings=skipped alg=budgeted-prime-frontier-v1 budget=handles:${owners.length * 2}`,
    "|decision purpose=decision-primer answer=false code=false capabilities=pipe,lexical,fd-query,rg-query,owner-items,selector-code,treesitter-query ladder=pipe>lexical>fd-query|rg-query>owner-items>selector-code history=asp-artifacts:directReadRisk,repeatedPrime,repeatedPipe,bestPath risk=broad-direct-read,manual-window-scan,repeat-prime next=\"asp typescript search pipe '<question-or-feature-term>' --workspace . --view seeds\"",
    "legend: ID=kind:role(value)!next; entries profile(selectors=>returns); frontier ID.next",
    "aliases: graph:{G=search,O=owner,Q=query}",
    declarations.join(";"),
    `G>{${edges.join(",")}}`,
    `rank=${rank.join(",")} frontier=${rank.map((id) => `${id}.${id.startsWith("O") ? "owner" : "lexical"}`).join(",")}`,
    "entries=owner-query(O,Q=>items+tests+dependency-usage),owner-tests(O=>covering-tests+test-entrypoints+fixtures)",
    "omit=items,blocks,code,full-test-list",
    "avoid=raw-read,full-json,broad-lexical",
    "",
  ].join("\n");
}

function tryRenderPackageLexicalSeedFastPath(
  cwd: string,
  args: FastSearchArgs,
): string | undefined {
  if (
    args.view !== "lexical" ||
    args.querySet.length === 0 ||
    args.json ||
    args.renderMode !== "seeds" ||
    !args.pipes.includes("owner")
  ) {
    return undefined;
  }
  const terms = args.querySet.map((term) => term.trim()).filter((term) => term.length > 0);
  if (terms.length === 0) return undefined;
  const workspaceRoot = path.resolve(cwd, args.projectRoot ?? ".");
  const packageRoot = resolveProviderProjectRoot(cwd, args);
  const owners = collectTextSearchOwners(
    packageRoot,
    workspaceRoot,
    terms,
    6,
    MIN_FAST_SEED_PROJECT_FILES,
  );
  if (owners.length === 0) return undefined;
  const query = terms.join(",");
  const declarations = [`Q=query:term(${query})!lexical`];
  const edges = ["Q:matches"];
  const rank = ["Q"];
  for (let index = 0; index < owners.length; index++) {
    const ownerId = `O${index === 0 ? "" : String(index + 1)}`;
    declarations.push(`${ownerId}=owner:path(${owners[index]!.path})!owner`);
    edges.push(`${ownerId}:selects`);
    rank.push(ownerId);
  }
  const symbolTerm = selectSymbolTerm(terms);
  if (symbolTerm !== undefined) {
    declarations.push(`S=symbol:symbol(${symbolTerm})!symbol`);
    edges.push("S:contains");
    rank.push("S");
  }
  return [
    `[search-lexical] q=${query} querySet=${terms.length} selector=lexical-set view=hits alg=query-set-owner-resolution`,
    "legend: ID=kind:role(value)!next; edge SRC>{DST:rel}; frontier ID.next",
    "aliases: graph:{G=search,Q=query,O=owner,S=symbol}",
    declarations.join(";"),
    `G>{${edges.join(",")}}`,
    `rank=${rank.join(",")} frontier=${rank.map((id) => `${id}.${id === "Q" ? "lexical" : id === "S" ? "symbol" : "owner"}`).join(",")}`,
    "entries=owner-query(O,Q=>items+tests+dependency-usage),owner-tests(O=>covering-tests+test-entrypoints+fixtures)",
    "",
  ].join("\n");
}

function resolveProviderProjectRoot(
  cwd: string,
  args: Pick<FastSearchArgs, "projectRoot" | "packagePath">,
): string {
  const projectRoot = path.resolve(cwd, args.projectRoot ?? ".");
  if (args.packagePath !== undefined) return path.resolve(projectRoot, args.packagePath);
  return projectRoot;
}

function projectRelativeTypeScriptFile(projectRoot: string, query: string): string | undefined {
  const filePath = path.resolve(projectRoot, query);
  const relativePath = path.relative(projectRoot, filePath);
  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    !isTypeScriptSourcePath(filePath)
  ) {
    return undefined;
  }
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return undefined;
  } catch {
    return undefined;
  }
  return relativePath.split(path.sep).join("/");
}

function isTypeScriptSourcePath(filePath: string): boolean {
  return [".ts", ".tsx", ".mts", ".cts"].includes(path.extname(filePath));
}

function manifestDependencyOwnerPath(projectRoot: string, dependency: string): string | undefined {
  const manifestPath = path.join(projectRoot, "package.json");
  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
  } catch {
    return undefined;
  }
  if (!isJsonObject(manifest)) return undefined;
  if (manifest.name === dependency || manifestHasDependency(manifest, dependency)) return ".";
  return undefined;
}

function manifestHasDependency(manifest: Record<string, unknown>, dependency: string): boolean {
  return ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].some(
    (field) => {
      const value = manifest[field];
      return isJsonObject(value) && Object.hasOwn(value, dependency);
    },
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectPrimeSeedOwners(
  packageRoot: string,
  workspaceRoot: string,
  limit: number,
  minFastFiles = 0,
): string[] {
  const files: { readonly path: string; readonly size: number }[] = [];
  collectTypeScriptFiles(packageRoot, files, Math.max(limit, minFastFiles));
  if (files.length < minFastFiles) return [];
  return files
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, limit)
    .map((file) => path.relative(workspaceRoot, file.path).split(path.sep).join("/"));
}

function collectTypeScriptFiles(
  directory: string,
  files: { readonly path: string; readonly size: number }[],
  limit = Number.POSITIVE_INFINITY,
): void {
  if (files.length >= limit) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || ["node_modules", "dist", "build"].includes(entry.name)) {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectTypeScriptFiles(entryPath, files, limit);
    } else if (entry.isFile() && isPrimeSeedSourcePath(entryPath)) {
      files.push({ path: entryPath, size: 0 });
      if (files.length >= limit) return;
    }
  }
}

function isPrimeSeedSourcePath(filePath: string): boolean {
  return isTypeScriptSourcePath(filePath) && !filePath.endsWith(".d.ts");
}

function nearestPackageName(packageRoot: string, workspaceRoot: string): string | undefined {
  let current = packageRoot;
  while (true) {
    const packageName = packageNameAt(current);
    if (packageName !== undefined) return packageName;
    if (current === workspaceRoot) return undefined;
    const parent = path.dirname(current);
    if (parent === current || !isPathWithin(parent, workspaceRoot)) return undefined;
    current = parent;
  }
}

function packageNameAt(directory: string): string | undefined {
  const manifestPath = path.join(directory, "package.json");
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
    return isJsonObject(manifest) && typeof manifest.name === "string" ? manifest.name : undefined;
  } catch {
    return undefined;
  }
}

function queryTermFromOwnerPath(ownerPath: string): string {
  return path.basename(ownerPath).replace(/\.[cm]?tsx?$/u, "") || "*";
}

function isPathWithin(pathToCheck: string, root: string): boolean {
  const relativePath = path.relative(root, pathToCheck);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function collectTextSearchOwners(
  packageRoot: string,
  workspaceRoot: string,
  terms: readonly string[],
  limit: number,
  minFastFiles = 0,
): { readonly path: string; readonly score: number }[] {
  const files: { readonly path: string; readonly size: number }[] = [];
  collectTypeScriptFiles(packageRoot, files);
  if (files.length < minFastFiles) return [];
  const filenameMatches = collectFilenameSearchOwners(files, workspaceRoot, terms, limit);
  if (filenameMatches.length > 0) return filenameMatches;
  const loweredTerms = terms.map((term) => term.toLowerCase());
  const scored: { readonly path: string; readonly score: number; readonly size: number }[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = fs.readFileSync(file.path, "utf8");
    } catch {
      continue;
    }
    const lowerText = text.toLowerCase();
    const lowerName = path.basename(file.path).toLowerCase();
    let score = 0;
    for (let index = 0; index < terms.length; index++) {
      const term = terms[index]!;
      const lowerTerm = loweredTerms[index]!;
      if (lowerName.includes(lowerTerm)) score += 40;
      score += countOccurrences(lowerText, lowerTerm, 8) * 10;
      if (text.includes(`function ${term}`) || text.includes(`const ${term}`)) score += 30;
      if (text.includes(`export ${term}`) || text.includes(`export function ${term}`)) score += 20;
    }
    if (score > 0) {
      scored.push({
        path: path.relative(workspaceRoot, file.path).split(path.sep).join("/"),
        score,
        size: text.length,
      });
    }
  }
  return scored
    .sort(
      (left, right) =>
        right.score - left.score || right.size - left.size || left.path.localeCompare(right.path),
    )
    .slice(0, limit)
    .map(({ path: ownerPath, score }) => ({ path: ownerPath, score }));
}

function collectFilenameSearchOwners(
  files: readonly { readonly path: string; readonly size: number }[],
  workspaceRoot: string,
  terms: readonly string[],
  limit: number,
): { readonly path: string; readonly score: number }[] {
  const termTokens = terms.map(queryTokens);
  const primaryTokens = queryTokens(selectSymbolTerm(terms) ?? "");
  const scored: { readonly path: string; readonly score: number; readonly size: number }[] = [];
  for (const file of files) {
    const lowerName = path.basename(file.path).toLowerCase();
    let score = 0;
    for (let index = 0; index < terms.length; index++) {
      const lowerTerm = terms[index]!.toLowerCase();
      if (lowerName.includes(lowerTerm)) score += 80;
      for (const token of termTokens[index]!) {
        if (lowerName.includes(token)) score += 25;
      }
    }
    for (const token of primaryTokens) {
      if (lowerName.includes(token)) score += 70;
    }
    if (score > 0) {
      scored.push({
        path: path.relative(workspaceRoot, file.path).split(path.sep).join("/"),
        score,
        size: file.size,
      });
    }
  }
  return scored
    .sort(
      (left, right) =>
        right.score - left.score || right.size - left.size || left.path.localeCompare(right.path),
    )
    .slice(0, limit)
    .map(({ path: ownerPath, score }) => ({ path: ownerPath, score }));
}

function queryTokens(term: string): string[] {
  return term
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .split(/[^A-Za-z0-9_$]+/u)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 2);
}

function countOccurrences(text: string, term: string, limit: number): number {
  if (term.length === 0) return 0;
  let count = 0;
  let offset = 0;
  while (count < limit) {
    const index = text.indexOf(term, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + term.length;
  }
  return count;
}

function selectSymbolTerm(terms: readonly string[]): string | undefined {
  return (
    terms.find((term) => queryTokens(term).some((token) => token === "program")) ??
    terms.find(isIdentifierTerm)
  );
}

function isIdentifierTerm(term: string): boolean {
  return /^[A-Za-z_$][\w$]*$/u.test(term);
}
