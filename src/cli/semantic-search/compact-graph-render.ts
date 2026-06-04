/**
 * Shared compact graph rendering adapter for TypeScript semantic search packets.
 *
 * The TypeScript provider owns packet construction, while the Rust protocol
 * binary owns graph projection and line rendering so providers do not drift.
 */
import { spawnSync } from "node:child_process";

import type { SemanticSearchFieldValue, SemanticSearchPacket } from "./types.js";

type RenderFields = (fields: Readonly<Record<string, SemanticSearchFieldValue>>) => string;

const DEFAULT_GRAPH_SEED_LIMIT = 8;
export const SEMANTIC_AGENT_PROTOCOL_BIN_ENV = "SEMANTIC_AGENT_PROTOCOL_BIN";

export class CompactGraphRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompactGraphRenderError";
  }
}

export function renderCompactGraphSeedPacket(
  packet: SemanticSearchPacket,
  renderFields: RenderFields,
): string {
  void renderFields;
  return renderCompactGraphPacket(packet, DEFAULT_GRAPH_SEED_LIMIT);
}

export function renderCompactGraphPacket(
  packet: SemanticSearchPacket,
  seedLimit = DEFAULT_GRAPH_SEED_LIMIT,
): string {
  const command = process.env[SEMANTIC_AGENT_PROTOCOL_BIN_ENV] ?? "asp";
  const result = spawnSync(
    command,
    ["graph", "render", "--packet", "-", "--view", "seeds", "--seeds", String(seedLimit)],
    {
      encoding: "utf8",
      input: JSON.stringify(packet),
    },
  );
  if (result.error !== undefined) {
    throw new CompactGraphRenderError(
      `asp graph renderer not found; set ${SEMANTIC_AGENT_PROTOCOL_BIN_ENV} or install asp on PATH`,
    );
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim();
    throw new CompactGraphRenderError(
      `asp graph render failed with exit code ${
        result.status ?? 1
      }${detail.length > 0 ? `: ${detail}` : ""}`,
    );
  }
  return result.stdout;
}
