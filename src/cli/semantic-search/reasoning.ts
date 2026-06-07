/**
 * Typed reasoning-entry packets for TypeScript semantic search.
 */

import type { TypeScriptHarnessReport } from "../../model.js";
import { typeScriptReasoningProfiles } from "./profiles.js";
import { buildOwnerItemQueryPacket } from "./item-query.js";
import { basePacket } from "./packet-base.js";
import { buildDepsPacketPayload } from "./dependency.js";
import { buildTestsPacket } from "./packet-views.js";
import type {
  SemanticSearchBuildOptions,
  SemanticSearchFieldValue,
  SemanticSearchPacket,
} from "./types.js";

const OWNER_TESTS_RETURNS = ["covering-tests", "test-entrypoints", "fixtures"] as const;
const OWNER_QUERY_RETURNS = ["items", "tests", "dependency-usage"] as const;
const QUERY_DEPS_RETURNS = ["owners", "imports", "usage-tests"] as const;

export function buildReasoningPacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacket {
  const profile = options.query ?? "";
  if (profile === "owner-tests") {
    const ownerPath = requiredSelector(options.queryScope?.ownerPath, "--owner", profile);
    const packet = buildTestsPacket(report, { ...options, view: "tests", query: ownerPath });
    return withReasoningHeader(withOwnerSelectorFirst(packet, ownerPath), options, {
      profile,
      ownerPath,
      returns: OWNER_TESTS_RETURNS,
    });
  }
  if (profile === "owner-query") {
    const ownerPath = requiredSelector(options.queryScope?.ownerPath, "--owner", profile);
    const query = requiredSelector(options.itemQuery, "--query", profile);
    const packet = buildOwnerItemQueryPacket(report.reasoningTree.projectRoot, ownerPath, query);
    return withReasoningHeader(packet, options, {
      profile,
      ownerPath,
      query,
      returns: OWNER_QUERY_RETURNS,
    });
  }
  if (profile === "query-deps") {
    const query = requiredSelector(options.itemQuery, "--query", profile);
    const dependency = requiredSelector(options.dependency, "--dependency", profile);
    const depsQuery = `${dependency}::${query}`;
    const packet = basePacket(
      report,
      { ...options, view: "deps", query: depsQuery },
      buildDepsPacketPayload(report, { ...options, view: "deps", query: depsQuery }),
    );
    return withReasoningHeader(packet, options, {
      profile,
      query,
      dependency,
      returns: QUERY_DEPS_RETURNS,
    });
  }
  throw new Error(
    `unknown reasoning profile: ${profile}; expected owner-tests, owner-query, or query-deps`,
  );
}

function withReasoningHeader(
  packet: SemanticSearchPacket,
  options: SemanticSearchBuildOptions,
  fields: {
    readonly profile: string;
    readonly ownerPath?: string;
    readonly query?: string;
    readonly dependency?: string;
    readonly returns: readonly string[];
  },
): SemanticSearchPacket {
  const renderMode = options.renderMode ?? packet.renderMode;
  return {
    ...packet,
    method: "search/reasoning",
    view: "reasoning",
    renderMode,
    query: fields.profile,
    reasoningProfiles: typeScriptReasoningProfiles().filter(
      (profile) => profile.profile === fields.profile,
    ),
    header: {
      kind: "search-reasoning",
      fields: compactReasoningFields({
        profile: fields.profile,
        ownerPath: fields.ownerPath,
        query: fields.query,
        dependency: fields.dependency,
        returns: fields.returns,
        owner: packet.owners.length,
        hit: packet.hits.length,
        item: packet.items?.length ?? 0,
      }),
    },
  };
}

function withOwnerSelectorFirst(
  packet: SemanticSearchPacket,
  ownerPath: string,
): SemanticSearchPacket {
  return {
    ...packet,
    owners: [
      ...packet.owners.filter((owner) => owner.path === ownerPath),
      ...packet.owners.filter((owner) => owner.path !== ownerPath),
    ],
    nextActions: [
      { kind: "owner", target: ownerPath },
      ...packet.nextActions.filter(
        (action) => action.kind !== "owner" || action.target !== ownerPath,
      ),
    ],
  };
}

function compactReasoningFields(
  fields: Record<string, SemanticSearchFieldValue | readonly string[] | undefined>,
): Record<string, SemanticSearchFieldValue> {
  return Object.fromEntries(
    Object.entries(fields).filter(
      ([, value]) =>
        value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0),
    ),
  ) as Record<string, SemanticSearchFieldValue>;
}

function requiredSelector(value: string | undefined, flag: string, profile: string): string {
  if (value === undefined || value === "") {
    throw new Error(`search reasoning ${profile} requires ${flag}`);
  }
  return value;
}
