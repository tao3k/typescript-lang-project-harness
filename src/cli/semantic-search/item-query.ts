import {
  queryTypeScriptOwnerItems,
  type TypeScriptItemQueryMatch,
} from "../../parser/native_syntax/item-query.js";
import {
  SEMANTIC_LANGUAGE_PROTOCOL_ID,
  SEMANTIC_LANGUAGE_PROTOCOL_VERSION,
  SEMANTIC_QUERY_PACKET_SCHEMA_ID,
  SEMANTIC_READ_PACKET_SCHEMA_ID,
  SEMANTIC_SEARCH_PACKET_SCHEMA_ID,
  TYPE_SCRIPT_BINARY,
  TYPE_SCRIPT_LANGUAGE_ID,
  TYPE_SCRIPT_PROVIDER_ID,
  TYPE_SCRIPT_PROVIDER_NAMESPACE,
} from "../semantic-language.js";
import type { SemanticSearchItem, SemanticSearchPacket } from "./types.js";

export type OwnerItemQueryOutputMode = "code" | "names";

const MAX_EXACT_DIRECT_READ_LINES = 40;

export interface SemanticReadPacket {
  readonly schemaId: typeof SEMANTIC_READ_PACKET_SCHEMA_ID;
  readonly schemaVersion: "1";
  readonly protocolId: typeof SEMANTIC_LANGUAGE_PROTOCOL_ID;
  readonly protocolVersion: typeof SEMANTIC_LANGUAGE_PROTOCOL_VERSION;
  readonly languageId: typeof TYPE_SCRIPT_LANGUAGE_ID;
  readonly providerId: typeof TYPE_SCRIPT_PROVIDER_ID;
  readonly binary: typeof TYPE_SCRIPT_BINARY;
  readonly namespace: typeof TYPE_SCRIPT_PROVIDER_NAMESPACE;
  readonly method: "query/direct-source-read";
  readonly projectRoot: string;
  readonly ownerPath: string;
  readonly selector: string;
  readonly fromHook: "direct-source-read";
  readonly query?: string;
  readonly queryTerms?: readonly string[];
  readonly outputMode: "read-packet";
  readonly sourceWindows?: readonly SemanticReadWindow[];
  readonly readPlan?: SemanticReadPlan;
  readonly truncated: boolean;
  readonly notes?: readonly SemanticQueryNote[];
}

interface SemanticReadPlan {
  readonly mode: "range-outline" | "search-repair";
  readonly code: false;
  readonly reason:
    | "wide-selector"
    | "low-signal-window"
    | "broad-selector"
    | "missing-query-terms"
    | "low-confidence-selector";
  readonly ranges: readonly SemanticReadPlanRange[];
  readonly symbols: readonly SemanticReadPlanSymbol[];
}

interface SemanticReadPlanRange {
  readonly path: string;
  readonly requested: string;
  readonly selected: string;
  readonly matched: string;
  readonly coverage: "full" | "head-only" | "tail-only" | "middle";
  readonly density: "low" | "normal" | "mixed" | "unknown";
}

interface SemanticReadPlanSymbol {
  readonly itemName: string;
  readonly itemKind: string;
  readonly lineRange: string;
  readonly read: string;
}

interface SemanticReadWindow {
  readonly ownerPath: string;
  readonly itemName: string;
  readonly itemKind: string;
  readonly location: {
    readonly path: string;
    readonly lineRange: string;
  };
  readonly read: string;
  readonly lineCount: number;
  readonly reason: "direct-selector";
  readonly text: string;
  readonly truncated: boolean;
  readonly fields: {
    readonly exported: boolean;
    readonly typeOnly: boolean;
    readonly exportKind: string;
  };
}

export interface SemanticQueryPacket {
  readonly schemaId: typeof SEMANTIC_QUERY_PACKET_SCHEMA_ID;
  readonly schemaVersion: "1";
  readonly protocolId: typeof SEMANTIC_LANGUAGE_PROTOCOL_ID;
  readonly protocolVersion: typeof SEMANTIC_LANGUAGE_PROTOCOL_VERSION;
  readonly languageId: typeof TYPE_SCRIPT_LANGUAGE_ID;
  readonly providerId: typeof TYPE_SCRIPT_PROVIDER_ID;
  readonly binary: typeof TYPE_SCRIPT_BINARY;
  readonly namespace: typeof TYPE_SCRIPT_PROVIDER_NAMESPACE;
  readonly method: "query/owner-items";
  readonly projectRoot: string;
  readonly ownerPath: string;
  readonly query: string;
  readonly queryTerms: readonly string[];
  readonly matchMode: "exact" | "fallback-contains" | "mixed" | "unknown";
  readonly outputMode: OwnerItemQueryOutputMode;
  readonly queryCoverage: readonly SemanticQueryCoverage[];
  readonly matches: readonly SemanticQueryMatch[];
  readonly truncated: boolean;
  readonly notes?: readonly SemanticQueryNote[];
}

interface SemanticQueryCoverage {
  readonly value: string;
  readonly status: "hit" | "miss" | "partial";
  readonly match: "exact" | "fallback-contains" | "candidate" | "none";
  readonly matchCount: number;
  readonly nextAction?: string;
}

interface SemanticQueryProjection {
  readonly mode: "compact" | "names" | "outline" | "exact";
  readonly syntax: "brace-block" | "token-compact" | "semantic-outline" | "exact-source" | "none";
  readonly sourceAuthority: "native-parser" | "parser-index" | "source-range";
  readonly sourceFingerprint?: string;
  readonly losslessStructure?: boolean;
  readonly exactRead?: string;
  readonly nodes?: readonly SemanticQueryProjectionNode[];
  readonly omitted?: readonly SemanticQueryProjectionOmission[];
  readonly expandActions?: readonly SemanticQueryExpandAction[];
}

interface SemanticQueryProjectionNode {
  readonly id: string;
  readonly parentId?: string;
  readonly kind: string;
  readonly role?:
    | "declaration"
    | "control-flow"
    | "call"
    | "terminal"
    | "mutation"
    | "effect"
    | "unknown";
  readonly label: string;
  readonly depth?: number;
  readonly read: string;
  readonly flags?: readonly string[];
}

interface SemanticQueryProjectionOmission {
  readonly kind: string;
  readonly reason: string;
  readonly count?: number;
  readonly read?: string;
}

interface SemanticQueryExpandAction {
  readonly kind: "exact-read" | "node-query" | "hot-block" | "owner-names";
  readonly target: string;
  readonly read?: string;
  readonly argv?: readonly string[];
  readonly reason?: string;
}

interface SemanticQueryMatch {
  readonly name: string;
  readonly kind: string;
  readonly visibility: "public" | "private" | "unknown";
  readonly location: {
    readonly path: string;
    readonly lineRange: string;
  };
  readonly read: string;
  readonly code?: string;
  readonly projection?: SemanticQueryProjection;
  readonly truncated: boolean;
  readonly fields: {
    readonly exported: boolean;
    readonly typeOnly: boolean;
    readonly exportKind: string;
  };
}

interface SemanticQueryNote {
  readonly kind: string;
  readonly message: string;
}

export function renderOwnerItemQuery(
  projectRoot: string,
  ownerPath: string,
  itemQuery: string,
  options: { readonly namesOnly?: boolean } = {},
): string {
  const result = queryTypeScriptOwnerItems(projectRoot, ownerPath, itemQuery);
  const matchMode = ownerItemQueryMatchMode(result.matches, result.queryTerms, result.fallback);
  const namesOnly =
    options.namesOnly === true || ownerItemQueryShouldAutoNamesOnly(result, matchMode);
  const revisionField = ownerItemQueryRevisionField(result);
  const nextAction = ownerItemQueryNextAction(result, namesOnly);
  const lines = [
    `[search-owner] q=${result.ownerPath} pkg=. own=1 item=${result.matches.length} itemQuery=${fieldValue(
      result.queryTerms.join("|"),
    )}${namesOnly ? " output=names" : ""}${
      result.fallback === undefined ? "" : " fallback=owner-top-items"
    }`,
    `|query itemQuery=${fieldValue(result.queryTerms.join("|"))} status=${
      result.fallback === undefined ? "hit" : "miss"
    } match=${matchMode} item=${result.matches.length} reason=parser-item-query${
      namesOnly ? " output=names" : ""
    }${revisionField} next=${nextAction}`,
    `|owner ${result.ownerPath} role=source source=parser-visible-module next=owner:${result.ownerPath}`,
  ];
  for (const item of result.matches) {
    const itemFields = [
      `owner=${result.ownerPath}`,
      `column=${item.column}`,
      item.exported ? "exported=true" : "",
      item.typeOnly ? "typeOnly=true" : "",
      `read=${result.ownerPath}:${item.lineStart}:${item.lineEnd}`,
    ].filter((field) => field.length > 0);
    lines.push(`|item ${item.kind} ${item.name} ${itemFields.join(" ")}`);
    if (namesOnly) continue;
    lines.push(
      `|code path=${result.ownerPath} lineRange=${item.lineStart}:${item.lineEnd} reason=item-query truncated=false text=${JSON.stringify(
        semanticOutlineCode(item),
      )}`,
    );
  }
  return lines.join("\n");
}

function ownerItemQueryShouldAutoNamesOnly(
  result: {
    readonly queryTerms: readonly string[];
    readonly matches: readonly { readonly name: string }[];
    readonly fallback?: "owner-top-items";
  },
  matchMode: SemanticQueryPacket["matchMode"],
): boolean {
  if (result.fallback !== undefined) return true;
  if (result.matches.length > 3) return true;
  return result.queryTerms.length > 1 && matchMode !== "exact";
}

function ownerItemQueryNextAction(
  result: {
    readonly fallback?: "owner-top-items";
  },
  namesOnly: boolean,
): "code" | "revise-query" | "select-item" {
  if (!namesOnly) return "code";
  if (result.fallback !== undefined) return "revise-query";
  return "select-item";
}

function ownerItemQueryRevisionField(result: {
  readonly queryTerms: readonly string[];
  readonly matches: readonly { readonly name: string }[];
}): string {
  const revisions = result.queryTerms.flatMap((term) => {
    if (result.matches.some((item) => item.name === term)) return [];

    const normalizedTerm = normalizeItemQueryName(term);
    if (normalizedTerm.length === 0) return [];

    const candidate = result.matches.find((item) => {
      const normalizedName = normalizeItemQueryName(item.name);
      return normalizedName.includes(normalizedTerm) || normalizedTerm.includes(normalizedName);
    });

    return candidate === undefined ? [] : [`${term}->${candidate.name}`];
  });

  return revisions.length === 0 ? "" : ` revise=${fieldValue(revisions.join(","))}`;
}

function normalizeItemQueryName(value: string): string {
  return value.replace(/[^A-Za-z0-9]/gu, "").toLowerCase();
}

function compactTypeScriptCodeProjection(code: string): string {
  return code
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ");
}

function semanticOutlineCode(item: TypeScriptItemQueryMatch): string {
  if (item.projectionNodes.length === 0) return compactTypeScriptCodeProjection(item.code);
  const labels: string[] = [];
  for (const node of item.projectionNodes) {
    pushUniqueOutlineLabel(labels, `${"  ".repeat(node.depth)}${node.label}`);
  }
  return labels.join("\n");
}

function pushUniqueOutlineLabel(labels: string[], label: string): void {
  const trimmed = label.trim();
  if (trimmed.length === 0 || labels.some((line) => line.trim() === trimmed)) return;
  labels.push(label.trimEnd());
}

function compactProjection(
  ownerPath: string,
  item: TypeScriptItemQueryMatch,
): SemanticQueryProjection {
  const exactRead = `${ownerPath}:${item.lineStart}:${item.lineEnd}`;
  const compactCode = semanticOutlineCode(item);
  const nodes = compactProjectionNodes(item, ownerPath, exactRead, compactCode);
  return {
    mode: "outline",
    syntax: "semantic-outline",
    sourceAuthority: "native-parser",
    sourceFingerprint: sourceFingerprint(exactRead, item.code),
    losslessStructure: true,
    exactRead,
    nodes,
    omitted: compactProjectionOmissions(item, exactRead, compactCode),
    expandActions: compactExpandActions(ownerPath, item.name, exactRead, nodes),
  };
}

function compactProjectionNodes(
  item: TypeScriptItemQueryMatch,
  ownerPath: string,
  exactRead: string,
  compactCode: string,
): readonly SemanticQueryProjectionNode[] {
  if (item.projectionNodes.length > 0) {
    return item.projectionNodes.map((node) => ({
      id: node.id,
      ...(node.parentId === undefined ? {} : { parentId: node.parentId }),
      kind: node.kind,
      role: node.role,
      label: node.label,
      depth: node.depth,
      read: `${ownerPath}:${node.lineStart}:${node.lineEnd}`,
      ...(node.flags.length === 0 ? {} : { flags: node.flags }),
    }));
  }
  const flags = compactProjectionFlags(compactCode);
  const nodes: SemanticQueryProjectionNode[] = [
    {
      id: projectionNodeId(item.name),
      kind: item.kind,
      role: "declaration",
      label: item.name,
      depth: 0,
      read: exactRead,
      ...(flags.length === 0 ? {} : { flags }),
    },
  ];
  if (/\b(if|switch|case|for|while|try|catch)\b/u.test(compactCode)) {
    nodes.push({
      id: `${projectionNodeId(item.name)}:flow`,
      parentId: projectionNodeId(item.name),
      kind: "control-flow",
      role: "control-flow",
      label: "control flow",
      depth: 1,
      read: exactRead,
      flags: compactControlFlowFlags(compactCode),
    });
  }
  if (/\breturn\b/u.test(compactCode)) {
    nodes.push({
      id: `${projectionNodeId(item.name)}:return`,
      parentId: projectionNodeId(item.name),
      kind: "return",
      role: "terminal",
      label: "return",
      depth: 1,
      read: exactRead,
      flags: ["return"],
    });
  }
  return nodes;
}

function compactProjectionOmissions(
  item: TypeScriptItemQueryMatch,
  exactRead: string,
  compactCode: string,
): readonly SemanticQueryProjectionOmission[] {
  const lineCount = item.lineEnd - item.lineStart + 1;
  const omitted: SemanticQueryProjectionOmission[] = [];
  if (lineCount > 1) {
    omitted.push({
      kind: "source-formatting",
      reason: "compact projection removes original whitespace and comments",
      count: lineCount,
      read: exactRead,
    });
  }
  if (compactCode.length > 900) {
    omitted.push({
      kind: "nested-detail",
      reason: "large compact item should be expanded through exact read before editing",
      read: exactRead,
    });
  }
  return omitted;
}

function compactExpandActions(
  ownerPath: string,
  itemName: string,
  exactRead: string,
  nodes: readonly SemanticQueryProjectionNode[],
): readonly SemanticQueryExpandAction[] {
  const actions: SemanticQueryExpandAction[] = [
    {
      kind: "exact-read",
      target: projectionNodeId(itemName),
      read: exactRead,
      argv: [
        "ts-harness",
        "query",
        "--from-hook",
        "direct-source-read",
        "--selector",
        exactRead,
        ".",
      ],
      reason: "read exact source before editing",
    },
  ];
  const seenReads = new Set<string>([exactRead]);
  for (const node of nodes.filter(isHotProjectionNode)) {
    if (seenReads.has(node.read)) continue;
    seenReads.add(node.read);
    actions.push({
      kind: "exact-read",
      target: node.id,
      read: node.read,
      argv: [
        "ts-harness",
        "query",
        "--from-hook",
        "direct-source-read",
        "--selector",
        node.read,
        ".",
      ],
      reason: `expand ${node.kind} node before editing`,
    });
    if (actions.length >= 8) break;
  }
  actions.push({
    kind: "owner-names",
    target: ownerPath,
    argv: [
      "ts-harness",
      "query",
      "--from-hook",
      "direct-source-read",
      "--selector",
      ownerPath,
      ".",
    ],
    reason: "return owner-local item names without code windows",
  });
  return actions;
}

function isHotProjectionNode(node: SemanticQueryProjectionNode): boolean {
  return (
    node.role === "control-flow" ||
    node.role === "terminal" ||
    node.role === "call" ||
    node.role === "mutation" ||
    node.role === "effect"
  );
}

function compactProjectionFlags(compactCode: string): readonly string[] {
  const flags = new Set<string>();
  if (/\b(if|switch|case)\b/u.test(compactCode)) flags.add("branch");
  if (/\b(for|while)\b/u.test(compactCode)) flags.add("loop");
  if (/\breturn\b/u.test(compactCode)) flags.add("return");
  if (/\bthrow\b/u.test(compactCode)) flags.add("throw");
  if (/\bawait\b/u.test(compactCode)) flags.add("await");
  if (/\b[A-Za-z_$][\w$]*\s*\(/u.test(compactCode)) flags.add("call");
  if (/\b(let|var)\b|(?:\+\+|--|[^=!<>]=[^=>])/u.test(compactCode)) flags.add("mutation");
  return [...flags];
}

function compactControlFlowFlags(compactCode: string): readonly string[] {
  return compactProjectionFlags(compactCode).filter((flag) =>
    ["branch", "loop", "return", "throw", "await"].includes(flag),
  );
}

function sourceFingerprint(exactRead: string, code: string): string {
  return `${exactRead}:${code.length}:${hashString(code)}`;
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}

function projectionNodeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.:-]+/gu, "_");
}

export function renderOwnerItemSemanticQueryPacketJson(packet: SemanticQueryPacket): string {
  return JSON.stringify(packet);
}

export function renderOwnerItemSemanticReadPacketJson(packet: SemanticReadPacket): string {
  return JSON.stringify(packet);
}

export function renderOwnerItemSemanticReadPacket(packet: SemanticReadPacket): string {
  if (packet.readPlan !== undefined) {
    const lines = [
      `[read-plan] q=${fieldValue(packet.ownerPath)} selector=${fieldValue(packet.selector)} mode=${packet.readPlan.mode} code=false reason=${packet.readPlan.reason} window=${packet.readPlan.symbols.length}`,
    ];
    for (const [index, range] of packet.readPlan.ranges.entries()) {
      lines.push(
        `|range path=${fieldValue(range.path)} requested=${range.requested} selected=${range.selected} matched=${range.matched} coverage=${range.coverage} density=${range.density}`,
      );
      const symbol = packet.readPlan.symbols[index];
      if (symbol !== undefined) {
        lines.push(
          `|symbol item=${fieldValue(symbol.itemName)} kind=${fieldValue(symbol.itemKind)} lineRange=${symbol.lineRange} read=${fieldValue(symbol.read)}`,
        );
      }
    }
    return lines.join("\n");
  }
  const sourceWindows = packet.sourceWindows ?? [];
  const lines = [
    `[read-owner] q=${packet.ownerPath} selector=${fieldValue(packet.selector)} window=${sourceWindows.length}`,
  ];
  for (const window of sourceWindows) {
    lines.push(
      `|read path=${window.ownerPath} item=${window.itemName} kind=${window.itemKind} lineRange=${window.location.lineRange} reason=${window.reason} truncated=${window.truncated}`,
    );
    lines.push(
      `|code path=${window.ownerPath} lineRange=${window.location.lineRange} reason=direct-source-read text=${JSON.stringify(window.text)}`,
    );
  }
  return lines.join("\n");
}

export function buildOwnerItemSemanticQueryPacket(
  projectRoot: string,
  ownerPath: string,
  itemQuery: string,
  outputMode: OwnerItemQueryOutputMode,
): SemanticQueryPacket {
  const result = queryTypeScriptOwnerItems(projectRoot, ownerPath, itemQuery);
  const matchMode = ownerItemQueryMatchMode(result.matches, result.queryTerms, result.fallback);
  return {
    schemaId: SEMANTIC_QUERY_PACKET_SCHEMA_ID,
    schemaVersion: "1",
    protocolId: SEMANTIC_LANGUAGE_PROTOCOL_ID,
    protocolVersion: SEMANTIC_LANGUAGE_PROTOCOL_VERSION,
    languageId: TYPE_SCRIPT_LANGUAGE_ID,
    providerId: TYPE_SCRIPT_PROVIDER_ID,
    binary: TYPE_SCRIPT_BINARY,
    namespace: TYPE_SCRIPT_PROVIDER_NAMESPACE,
    method: "query/owner-items",
    projectRoot,
    ownerPath: result.ownerPath,
    query: result.queryTerms.join("|"),
    queryTerms: result.queryTerms,
    matchMode,
    outputMode,
    queryCoverage: result.queryTerms.map((term) =>
      ownerItemQueryCoverage(term, result.matches, result.fallback),
    ),
    matches: result.matches.map((item) => ({
      name: item.name,
      kind: item.kind,
      visibility: item.exported ? "public" : "private",
      location: {
        path: result.ownerPath,
        lineRange: `${item.lineStart}:${item.lineEnd}`,
      },
      read: `${result.ownerPath}:${item.lineStart}:${item.lineEnd}`,
      ...(outputMode === "names"
        ? {}
        : {
            code: semanticOutlineCode(item),
            projection: compactProjection(result.ownerPath, item),
          }),
      truncated: false,
      fields: {
        exported: item.exported,
        typeOnly: item.typeOnly,
        exportKind: item.kind,
      },
    })),
    truncated: false,
    ...(result.fallback === undefined
      ? {}
      : {
          notes: [
            {
              kind: "owner-top-items",
              message: "item query missed; returned bounded owner top-level items",
            },
          ],
        }),
  };
}

export function renderOwnerItemQueryCode(
  projectRoot: string,
  ownerPath: string,
  itemQuery: string,
  selector?: string,
): string {
  const result = queryTypeScriptOwnerItems(projectRoot, ownerPath, itemQuery);
  const range =
    selector === undefined ? undefined : sourceSelectorLineRange(selector, result.ownerPath);
  if (range !== undefined && sourceRangeLineCount(range) > MAX_EXACT_DIRECT_READ_LINES) {
    return renderSemanticReadPlanLines(
      result.ownerPath,
      selector ?? result.ownerPath,
      "wide-selector",
      range,
      [],
      "unknown",
    );
  }
  const matches =
    range === undefined
      ? result.matches
      : result.matches.filter(
          (item) => item.lineEnd >= range.lineStart && item.lineStart <= range.lineEnd,
        );
  if (range !== undefined && matches.length > 0) {
    const selectedText = matches
      .map((item) =>
        sourceWindowText(
          item,
          Math.max(item.lineStart, range.lineStart),
          Math.min(item.lineEnd, range.lineEnd),
        ),
      )
      .join("\n");
    if (selectedText.length > 0 && isLowSignalSourceText(selectedText)) {
      return renderSemanticReadPlanLines(
        result.ownerPath,
        selector ?? result.ownerPath,
        "low-signal-window",
        range,
        matches,
        "low",
      );
    }
  }
  return matches.map((item) => itemProjectionCode(item, range)).join("\n");
}

function itemProjectionCode(
  item: TypeScriptItemQueryMatch,
  range: { readonly lineStart: number; readonly lineEnd: number } | undefined,
): string {
  if (range === undefined) return semanticOutlineCode(item);
  const labels: string[] = [];
  const header = item.projectionNodes[0];
  if (header !== undefined) pushUniqueProjectionLabel(labels, header.label);
  for (const node of item.projectionNodes.slice(1)) {
    if (node.lineEnd < range.lineStart || node.lineStart > range.lineEnd) continue;
    pushUniqueProjectionLabel(labels, node.label);
  }
  return labels.join("\n");
}

function pushUniqueProjectionLabel(labels: string[], label: string): void {
  const trimmed = label.trim();
  if (trimmed.length === 0 || labels.includes(trimmed)) return;
  labels.push(trimmed);
}

export function buildOwnerItemQueryPacket(
  projectRoot: string,
  ownerPath: string,
  itemQuery: string,
): SemanticSearchPacket {
  const result = queryTypeScriptOwnerItems(projectRoot, ownerPath, itemQuery);
  const fallbackFields = result.fallback === undefined ? {} : { fallback: result.fallback };
  const itemQueryValue = result.queryTerms.join("|");
  return {
    schemaId: SEMANTIC_SEARCH_PACKET_SCHEMA_ID,
    schemaVersion: "1",
    protocolId: SEMANTIC_LANGUAGE_PROTOCOL_ID,
    protocolVersion: SEMANTIC_LANGUAGE_PROTOCOL_VERSION,
    languageId: TYPE_SCRIPT_LANGUAGE_ID,
    providerId: TYPE_SCRIPT_PROVIDER_ID,
    binary: TYPE_SCRIPT_BINARY,
    namespace: TYPE_SCRIPT_PROVIDER_NAMESPACE,
    method: "search/owner",
    projectRoot,
    view: "owner",
    renderMode: "both",
    query: result.ownerPath,
    querySet: result.queryTerms.map((term) => ({
      value: term,
      kind: "symbol" as const,
      selector: "exact" as const,
      fields: { scope: "owner-item" },
    })),
    queryCoverage: result.queryTerms.map((term) => ({
      value: term,
      kind: "symbol" as const,
      selector: "exact" as const,
      status: result.fallback === undefined ? ("hit" as const) : ("miss" as const),
      hitCount: result.fallback === undefined ? result.matches.length : 0,
      ownerPaths: [result.ownerPath],
      fields: fallbackFields,
    })),
    header: {
      kind: "search-owner",
      fields: {
        q: result.ownerPath,
        pkg: ".",
        own: 1,
        item: result.matches.length,
        itemQuery: itemQueryValue,
        ...fallbackFields,
      },
    },
    nodes: [],
    edges: [],
    owners: [
      {
        path: result.ownerPath,
        role: "source",
        public: result.matches.some((item) => item.exported),
        fields: {
          source: "parser-visible-module",
          ...fallbackFields,
        },
      },
    ],
    items: result.matches.map<SemanticSearchItem>((item) => ({
      name: item.name,
      kind: semanticSearchItemKind(item.kind),
      ownerPath: result.ownerPath,
      location: {
        path: result.ownerPath,
        lineRange: `${item.lineStart}:${item.lineEnd}`,
      },
      fields: {
        exported: item.exported,
        exportKind: item.kind,
        typeOnly: item.typeOnly,
        read: `${result.ownerPath}:${item.lineStart}:${item.lineEnd}`,
        code: item.code,
        ...fallbackFields,
      },
    })),
    hits: [],
    findings: [],
    nextActions: [],
    notes:
      result.fallback === undefined
        ? []
        : [
            {
              kind: "fact-scope",
              message: "item query missed; returned bounded owner top-level items",
              fields: fallbackFields,
            },
          ],
  };
}

export function buildOwnerItemSemanticReadPacket(
  projectRoot: string,
  ownerPath: string,
  itemQuery: string,
  selector: string = ownerPath,
): SemanticReadPacket {
  const result = queryTypeScriptOwnerItems(projectRoot, ownerPath, itemQuery);
  const range = sourceSelectorLineRange(selector, result.ownerPath);
  const query = result.queryTerms.join("|");
  const basePacket = {
    schemaId: SEMANTIC_READ_PACKET_SCHEMA_ID,
    schemaVersion: "1",
    protocolId: SEMANTIC_LANGUAGE_PROTOCOL_ID,
    protocolVersion: SEMANTIC_LANGUAGE_PROTOCOL_VERSION,
    languageId: TYPE_SCRIPT_LANGUAGE_ID,
    providerId: TYPE_SCRIPT_PROVIDER_ID,
    binary: TYPE_SCRIPT_BINARY,
    namespace: TYPE_SCRIPT_PROVIDER_NAMESPACE,
    method: "query/direct-source-read",
    projectRoot,
    ownerPath: result.ownerPath,
    selector,
    fromHook: "direct-source-read",
    ...(query.length === 0 ? {} : { query, queryTerms: result.queryTerms }),
    outputMode: "read-packet",
    truncated: false,
    ...(result.fallback === undefined
      ? {}
      : {
          notes: [
            {
              kind: "owner-top-items",
              message: "item query missed; returned bounded owner top-level items",
            },
          ],
        }),
  } satisfies Omit<SemanticReadPacket, "sourceWindows" | "readPlan">;
  if (range !== undefined && sourceRangeLineCount(range) > MAX_EXACT_DIRECT_READ_LINES) {
    return {
      ...basePacket,
      readPlan: semanticReadPlanForRange(result.ownerPath, "wide-selector", range, [], "unknown"),
    };
  }
  const matches =
    range === undefined
      ? result.matches
      : result.matches.filter(
          (item) => item.lineEnd >= range.lineStart && item.lineStart <= range.lineEnd,
        );
  if (matches.length === 0) {
    throw new Error(
      `direct-source-read selector resolved to no parser-owned items: ${result.ownerPath}`,
    );
  }
  return {
    ...basePacket,
    sourceWindows: matches.map((item) => semanticReadWindowForItem(result.ownerPath, item, range)),
  };
}

function semanticReadWindowForItem(
  ownerPath: string,
  item: TypeScriptItemQueryMatch,
  range: { readonly lineStart: number; readonly lineEnd: number } | undefined,
): SemanticReadWindow {
  const lineStart =
    range === undefined ? item.lineStart : Math.max(item.lineStart, range.lineStart);
  const lineEnd = range === undefined ? item.lineEnd : Math.min(item.lineEnd, range.lineEnd);
  return {
    ownerPath,
    itemName: item.name,
    itemKind: item.kind,
    location: {
      path: ownerPath,
      lineRange: `${lineStart}:${lineEnd}`,
    },
    read: `${ownerPath}:${lineStart}:${lineEnd}`,
    lineCount: Math.max(1, lineEnd - lineStart + 1),
    reason: "direct-selector",
    text: sourceWindowText(item, lineStart, lineEnd),
    truncated: false,
    fields: {
      exported: item.exported,
      typeOnly: item.typeOnly,
      exportKind: item.kind,
    },
  };
}

function sourceWindowText(
  item: TypeScriptItemQueryMatch,
  lineStart: number,
  lineEnd: number,
): string {
  return item.sourceLines
    .slice(lineStart - 1, lineEnd)
    .join("\n")
    .trimEnd();
}

function sourceRangeLineCount(range: {
  readonly lineStart: number;
  readonly lineEnd: number;
}): number {
  return Math.max(1, range.lineEnd - range.lineStart + 1);
}

function isLowSignalSourceText(text: string): boolean {
  return !/[A-Za-z0-9_]/u.test(text);
}

function renderSemanticReadPlanLines(
  ownerPath: string,
  selector: string,
  reason: SemanticReadPlan["reason"],
  range: { readonly lineStart: number; readonly lineEnd: number },
  matches: readonly TypeScriptItemQueryMatch[],
  density: SemanticReadPlanRange["density"],
): string {
  const plan = semanticReadPlanForRange(ownerPath, reason, range, matches, density);
  const lines = [
    `[read-plan] q=${fieldValue(ownerPath)} selector=${fieldValue(selector)} mode=${plan.mode} code=false reason=${plan.reason} window=${plan.symbols.length}`,
  ];
  for (const [index, rangeItem] of plan.ranges.entries()) {
    lines.push(
      `|range path=${fieldValue(rangeItem.path)} requested=${rangeItem.requested} selected=${rangeItem.selected} matched=${rangeItem.matched} coverage=${rangeItem.coverage} density=${rangeItem.density}`,
    );
    const symbol = plan.symbols[index];
    if (symbol !== undefined) {
      lines.push(
        `|symbol item=${fieldValue(symbol.itemName)} kind=${fieldValue(symbol.itemKind)} lineRange=${symbol.lineRange} read=${fieldValue(symbol.read)}`,
      );
    }
  }
  return lines.join("\n");
}

function semanticReadPlanForRange(
  ownerPath: string,
  reason: SemanticReadPlan["reason"],
  range: { readonly lineStart: number; readonly lineEnd: number },
  matches: readonly TypeScriptItemQueryMatch[],
  density: SemanticReadPlanRange["density"],
): SemanticReadPlan {
  const selectedMatches =
    matches.length === 0
      ? [
          {
            name: "local-window",
            kind: "range",
            lineStart: range.lineStart,
            lineEnd: range.lineEnd,
          },
        ]
      : matches;
  return {
    mode: "range-outline",
    code: false,
    reason,
    ranges: selectedMatches.map((item) => {
      const selectedStart = Math.max(item.lineStart, range.lineStart);
      const selectedEnd = Math.min(item.lineEnd, range.lineEnd);
      return {
        path: ownerPath,
        requested: `${range.lineStart}:${range.lineEnd}`,
        selected: `${selectedStart}:${selectedEnd}`,
        matched: `${item.lineStart}:${item.lineEnd}`,
        coverage: rangeCoverage(item.lineStart, item.lineEnd, selectedStart, selectedEnd),
        density,
      };
    }),
    symbols: selectedMatches.map((item) => ({
      itemName: item.name,
      itemKind: item.kind,
      lineRange: `${item.lineStart}:${item.lineEnd}`,
      read: `${ownerPath}:${item.lineStart}:${item.lineEnd}`,
    })),
  };
}

function rangeCoverage(
  itemStart: number,
  itemEnd: number,
  selectedStart: number,
  selectedEnd: number,
): SemanticReadPlanRange["coverage"] {
  if (selectedStart <= itemStart && selectedEnd >= itemEnd) return "full";
  if (selectedStart > itemStart && selectedEnd >= itemEnd) return "tail-only";
  if (selectedStart <= itemStart && selectedEnd < itemEnd) return "head-only";
  return "middle";
}

function sourceSelectorLineRange(
  selector: string,
  ownerPath: string,
): { readonly lineStart: number; readonly lineEnd: number } | undefined {
  const normalized = selector.replace(/\\/gu, "/").replace(/^owner:/u, "");
  const match = /:(\d+)(?::|-)(\d+)$/u.exec(normalized);
  if (match === null) return undefined;
  const selectedOwnerPath = normalized.slice(0, match.index);
  if (selectedOwnerPath !== ownerPath) return undefined;
  const lineStart = Number.parseInt(match[1]!, 10);
  const lineEnd = Number.parseInt(match[2]!, 10);
  if (!Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) return undefined;
  return {
    lineStart: Math.min(lineStart, lineEnd),
    lineEnd: Math.max(lineStart, lineEnd),
  };
}

function fieldValue(value: string): string {
  return /^[A-Za-z0-9_./:@|,>-]+$/u.test(value) ? value : JSON.stringify(value);
}

function ownerItemQueryCoverage(
  term: string,
  matches: readonly { readonly name: string }[],
  fallback: "owner-top-items" | undefined,
): SemanticQueryCoverage {
  if (fallback !== undefined) {
    return {
      value: term,
      status: "miss",
      match: "none",
      matchCount: 0,
      nextAction: "query:broader-owner-item",
    };
  }
  const exactCount = matches.filter((item) => item.name === term).length;
  if (exactCount > 0) {
    return { value: term, status: "hit", match: "exact", matchCount: exactCount };
  }
  const lowerTerm = term.toLowerCase();
  const containsCount = matches.filter((item) =>
    item.name.toLowerCase().includes(lowerTerm),
  ).length;
  return {
    value: term,
    status: containsCount > 0 ? "hit" : "miss",
    match: containsCount > 0 ? "fallback-contains" : "none",
    matchCount: containsCount,
  };
}

function ownerItemQueryMatchMode(
  matches: readonly { readonly name: string }[],
  terms: readonly string[],
  fallback: "owner-top-items" | undefined,
): SemanticQueryPacket["matchMode"] {
  if (fallback !== undefined || terms.length === 0) return "unknown";
  const coverage = terms.map((term) => ownerItemQueryCoverage(term, matches, fallback));
  const exact = coverage.filter((item) => item.match === "exact").length;
  const contains = coverage.filter((item) => item.match === "fallback-contains").length;
  if (exact === coverage.length) return "exact";
  if (contains === coverage.length) return "fallback-contains";
  return "mixed";
}

function semanticSearchItemKind(kind: string): SemanticSearchItem["kind"] {
  switch (kind) {
    case "class":
    case "enum":
    case "function":
    case "interface":
    case "namespace":
    case "type":
    case "variable":
      return kind;
    default:
      return "symbol";
  }
}
