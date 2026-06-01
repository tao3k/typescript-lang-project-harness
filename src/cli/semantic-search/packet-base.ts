/**
 * Shared semantic-search packet envelope builders.
 */

import type { TypeScriptHarnessReport } from "../../model.js";
import {
  SEMANTIC_LANGUAGE_PROTOCOL_ID,
  SEMANTIC_LANGUAGE_PROTOCOL_VERSION,
  TYPE_SCRIPT_BINARY,
  TYPE_SCRIPT_LANGUAGE_ID,
  TYPE_SCRIPT_PROVIDER_ID,
  TYPE_SCRIPT_PROVIDER_NAMESPACE,
  semanticSearchMethod,
} from "../semantic-language.js";
import type {
  SemanticSearchBuildOptions,
  SemanticSearchPacket,
  SemanticSearchPacketPayload,
  SemanticSearchQueryTerm,
} from "./types.js";

export function basePacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
  packet: SemanticSearchPacketPayload,
): SemanticSearchPacket {
  const querySet = semanticSearchQueryTerms(options);
  return {
    schemaId: "agent.semantic-protocols.semantic-search-packet",
    schemaVersion: "1",
    protocolId: SEMANTIC_LANGUAGE_PROTOCOL_ID,
    protocolVersion: SEMANTIC_LANGUAGE_PROTOCOL_VERSION,
    languageId: TYPE_SCRIPT_LANGUAGE_ID,
    providerId: TYPE_SCRIPT_PROVIDER_ID,
    binary: TYPE_SCRIPT_BINARY,
    namespace: TYPE_SCRIPT_PROVIDER_NAMESPACE,
    method: semanticSearchMethod(options.view),
    projectRoot: report.reasoningTree.projectRoot,
    ...(report.reasoningTree.packageName ? { packageName: report.reasoningTree.packageName } : {}),
    view: options.view,
    renderMode: options.renderMode ?? (options.view === "text" ? "hits" : "graph"),
    ...(options.query ? { query: options.query } : {}),
    ...(querySet.length === 0
      ? {}
      : {
          querySet,
          queryComposition: {
            mode: "query-set" as const,
            view: options.view,
            selector: "exact-set" as const,
            ...(options.queryScope === undefined ? {} : { scope: options.queryScope }),
            merge: ["nodes", "edges", "owners", "hits", "nextActions", "notes"] as const,
          },
        }),
    header: packet.header,
    ...(packet.inputDetection ? { inputDetection: packet.inputDetection } : {}),
    ...(packet.packages ? { packages: packet.packages } : {}),
    nodes: packet.nodes,
    edges: packet.edges,
    owners: packet.owners,
    hits: packet.hits,
    findings: packet.findings,
    nextActions: packet.nextActions,
    notes: packet.notes,
  };
}

export function normalizedQuerySet(querySet: readonly string[] | undefined): readonly string[] {
  const terms: string[] = [];
  for (const rawTerm of querySet ?? []) {
    const term = rawTerm.trim();
    if (term === "" || terms.includes(term)) continue;
    terms.push(term);
  }
  return terms;
}

function semanticSearchQueryTerms(
  options: SemanticSearchBuildOptions,
): readonly SemanticSearchQueryTerm[] {
  return normalizedQuerySet(options.querySet).map((value) => ({
    value,
    kind: options.view === "tests" ? "path" : "text",
    selector: "exact",
  }));
}
