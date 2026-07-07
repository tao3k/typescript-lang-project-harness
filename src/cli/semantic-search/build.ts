/**
 * Semantic-search packet dispatcher for TypeScript CLI search views.
 */

import type { TypeScriptHarnessReport } from "../../model.js";
import { buildApiPacketPayload } from "./api.js";
import { buildDependencyPacketPayload, buildDepsPacketPayload } from "./dependency.js";
import { buildDocsPacketPayload } from "./packet-docs.js";
import { buildKnowledgePacketPayload } from "./packet-knowledge.js";
import { basePacket } from "./packet-base.js";
import { buildOwnerPacket, buildPrimePacket, buildWorkspacePacket } from "./packet-overview.js";
import { buildLexicalPacket } from "./packet-lexical.js";
import {
  buildCallsitePacket,
  buildImportPacket,
  buildIngestPacket,
  buildSymbolPacket,
  buildTestsPacket,
} from "./packet-views.js";
import { buildPublicExternalTypesPacketPayload } from "./public-external-types.js";
import { buildReasoningPacket } from "./reasoning.js";
import type { SemanticSearchBuildOptions, SemanticSearchPacket } from "./types.js";

import { buildPolicyPacket } from "./policy.js";

export function buildSemanticSearchPacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacket {
  switch (options.view) {
    case "workspace":
      return buildWorkspacePacket(report, options);
    case "prime":
      return buildPrimePacket(report, options);
    case "owner":
      return buildOwnerPacket(report, options);
    case "dependency":
      return basePacket(report, options, buildDependencyPacketPayload(report, options));
    case "deps":
      return basePacket(report, options, buildDepsPacketPayload(report, options));
    case "docs":
      return basePacket(report, options, buildDocsPacketPayload(report, options));
    case "api":
      return basePacket(report, options, buildApiPacketPayload(report, options));
    case "public-external-types":
      return basePacket(report, options, buildPublicExternalTypesPacketPayload(report, options));
    case "policy":
      return buildPolicyPacket(report, options);
    case "symbol":
      return buildSymbolPacket(report, options);
    case "callsite":
      return buildCallsitePacket(report, options);
    case "import":
      return buildImportPacket(report, options);
    case "tests":
      return buildTestsPacket(report, options);
    case "lexical":
      return buildLexicalPacket(report, options);
    case "reasoning":
      return buildReasoningPacket(report, options);
    case "env":
    case "runtime-source":
    case "lang":
    case "std":
    case "capability":
    case "extension":
    case "pattern":
    case "compare":
      return basePacket(report, options, buildKnowledgePacketPayload(report, options));
    case "ingest":
      return buildIngestPacket(report, options);
  }
}
