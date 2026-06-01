/**
 * Compact and JSON renderers for semantic-search packets.
 */

import type {
  SemanticSearchFieldValue,
  SemanticSearchFields,
  SemanticSearchLocation,
  SemanticSearchNextAction,
  SemanticSearchPacket,
} from "./types.js";
import { isTestOwnerPath } from "./test-path.js";
import { ownerId, stripNodePrefix } from "./utils.js";

export function renderSemanticSearchPacketJson(packet: SemanticSearchPacket): string {
  return `${JSON.stringify(packet, null, 2)}\n`;
}

export function renderSemanticSearchPacket(packet: SemanticSearchPacket): string {
  if (packet.renderMode === "seeds") {
    return renderSemanticSearchSeedPacket(packet);
  }

  const lines = [`[${packet.header.kind}] ${renderFields(packet.header.fields)}`];
  const ownerByPath = new Map(packet.owners.map((owner) => [owner.path, owner]));
  for (const pkg of packet.packages ?? []) {
    lines.push(`|package ${pkg.id} ${renderFields(pkg.fields)}`.trimEnd());
  }
  for (const node of packet.nodes.filter(isPrimeAxisNode)) {
    lines.push(`|${node.kind} ${node.path ?? node.id} ${renderFields(node.fields)}`.trimEnd());
  }
  for (const owner of packet.owners) {
    const ownerNext = renderOwnerNextActions(owner.path, owner.nextActions ?? []);
    const fields: SemanticSearchFields = {
      role: owner.role,
      public: owner.public,
      exp: owner.exports?.slice(0, 8) ?? [],
      ...owner.fields,
      ...(ownerNext.length > 0 ? { next: ownerNext } : {}),
    };
    lines.push(`|owner ${owner.path} ${renderFields(fields)}`.trimEnd());
  }
  for (const hit of packet.hits) {
    const fields: SemanticSearchFields = {
      owner: hit.ownerPath,
      kind: hit.kind,
      score: hit.score,
      reason: hit.reason,
      ...(hit.symbol ? { symbol: hit.symbol } : {}),
      ...hitEvidenceFields(packet, ownerByPath.get(hit.ownerPath)?.role, hit),
      ...hit.fields,
    };
    const lineKind = hit.kind === "api" ? "api" : "hit";
    lines.push(`|${lineKind} ${renderLocation(hit.location)} ${renderFields(fields)}`.trimEnd());
  }
  if (packet.view !== "workspace" && packet.view !== "prime") {
    for (const edge of packet.edges) {
      const fields = edge.fields ? ` ${renderFields(edge.fields)}` : "";
      lines.push(`|edge ${edge.from} -${edge.kind}-> ${edge.to}${fields}`.trimEnd());
    }
  }
  if (packet.view !== "workspace" && packet.view !== "prime") {
    for (const finding of packet.findings) {
      lines.push(
        `|find ${finding.ruleId} x${finding.count} at=${ownerId(finding.location.path)} severity=${finding.severity}`,
      );
    }
  }
  for (const note of packet.notes) {
    lines.push(`|note kind=${note.kind} message=${escapeFieldValue(note.message)}`);
  }
  if (packet.nextActions.length > 0) {
    lines.push(
      `|next ${packet.nextActions.map((action) => renderNextActionFragment(action)).join(",")}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function renderSemanticSearchSeedPacket(packet: SemanticSearchPacket): string {
  const lines = [`[${packet.header.kind}] ${renderFields(packet.header.fields)}`];
  lines.push("|flow prime->owner|deps|symbol|tests pipe=text:owner,tests ingest=stdin");
  for (const [kind, targets] of seedGroups(packet)) {
    lines.push(`|seed ${kind}:${targets.join(",")}`);
  }
  for (const note of packet.notes) {
    lines.push(`|note kind=${note.kind} message=${escapeFieldValue(note.message)}`);
  }
  return `${lines.join("\n")}\n`;
}

function seedGroups(packet: SemanticSearchPacket): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const owner of packet.owners) {
    addSeed(groups, "owner", owner.path);
    for (const exportName of owner.exports ?? []) {
      addSeed(groups, "symbol", exportName);
    }
    for (const action of owner.nextActions ?? []) {
      addSeed(groups, action.kind, action.target);
    }
  }
  for (const hit of packet.hits) {
    addSeed(groups, "owner", hit.ownerPath);
    if (hit.symbol !== undefined) {
      addSeed(groups, "symbol", hit.symbol);
    }
    if (hit.kind === "api") {
      addSeed(groups, "api", hit.symbol ?? hit.ownerPath);
    }
  }
  for (const action of packet.nextActions) {
    addSeed(groups, action.kind, action.target);
  }
  for (const edge of packet.edges) {
    if (edge.kind === "test") {
      addSeed(groups, "tests", stripNodePrefix(edge.to));
    } else if (edge.kind === "dependency" && edge.to.startsWith("C:")) {
      addSeed(groups, "deps", stripNodePrefix(edge.to));
    }
  }
  return groups;
}

function addSeed(groups: Map<string, string[]>, kind: string, target: string): void {
  const values = groups.get(kind) ?? [];
  if (values.length >= 8 || values.includes(target)) return;
  values.push(target);
  groups.set(kind, values);
}

function hitEvidenceFields(
  packet: SemanticSearchPacket,
  ownerRole: string | undefined,
  hit: SemanticSearchPacket["hits"][number],
): SemanticSearchFields {
  if (packet.view !== "text" && packet.view !== "ingest") {
    return {};
  }
  const surface =
    hit.ownerPath === "."
      ? "workspace"
      : ownerRole?.includes("test") === true || isTestOwnerPath(hit.ownerPath)
        ? "test"
        : "source";
  return {
    surface,
    ...(ownerRole ? { ownerRole } : {}),
    ...(hit.snippet ? { text: hit.snippet } : {}),
  };
}

function isPrimeAxisNode(node: { readonly kind: string }): boolean {
  return (
    node.kind === "tsconfig" ||
    node.kind === "extension" ||
    node.kind === "build_tool" ||
    node.kind === "test_surface"
  );
}

function renderFields(fields: SemanticSearchFields): string {
  return Object.entries(fields)
    .filter(([, value]) => !isEmptyFieldValue(value))
    .map(([key, value]) => `${key}=${escapeFieldValue(value)}`)
    .join(" ");
}

function isEmptyFieldValue(value: SemanticSearchFieldValue): boolean {
  return Array.isArray(value) && value.length === 0;
}

function escapeFieldValue(value: SemanticSearchFieldValue): string {
  if (Array.isArray(value)) {
    return value.map((item) => escapeScalar(item)).join(",");
  }
  return escapeScalar(value as string | number | boolean);
}

function escapeScalar(value: string | number | boolean): string {
  const text = String(value);
  return /[\s,=]/u.test(text) ? JSON.stringify(text) : text;
}

function renderLocation(location: SemanticSearchLocation): string {
  const fields: Record<string, SemanticSearchFieldValue> = { path: location.path };
  if (location.line !== undefined) {
    fields.line = location.line;
  }
  if (location.column !== undefined) {
    fields.column = location.column;
  }
  return renderFields(fields);
}

function renderOwnerNextActions(
  ownerPath: string,
  actions: readonly SemanticSearchNextAction[],
): string[] {
  return actions
    .filter((action) => action.kind !== "owner" || action.target !== ownerPath)
    .map((action) => renderNextActionFragment(action, ownerPath));
}

function renderNextActionFragment(
  action: SemanticSearchNextAction,
  contextOwnerPath?: string,
): string {
  const suffix =
    action.ownerPath !== undefined && action.ownerPath !== contextOwnerPath
      ? `(owner=${action.ownerPath})`
      : action.scope !== undefined
        ? `(scope=${action.scope})`
        : "";
  return `${action.kind}:${escapeScalar(action.target)}${suffix}`;
}
