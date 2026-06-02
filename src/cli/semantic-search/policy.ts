import type { TypeScriptHarnessReport, TypeScriptHarnessRule } from "../../model.js";
import { typeScriptAgentPolicyRules } from "../../rules/agent_policy/pack.js";
import { typeScriptExtensionPolicyRules } from "../../rules/extension_policy/pack.js";
import { typeScriptModularityRules } from "../../rules/modularity/pack.js";
import { typeScriptProjectPolicyRules } from "../../rules/project_policy/pack.js";
import { basePacket } from "./packet-base.js";
import type {
  SemanticSearchBuildOptions,
  SemanticSearchHandle,
  SemanticSearchNextAction,
  SemanticSearchNode,
  SemanticSearchOwner,
  SemanticSearchPacket,
} from "./types.js";

import { semanticSearchHandleId, semanticSearchHandlePath } from "./types.js";

interface PolicyRuleSource {
  readonly ownerPath: string;
  readonly tests: readonly string[];
  readonly rules: readonly TypeScriptHarnessRule[];
}

interface PolicyHandleMatch {
  readonly rule: TypeScriptHarnessRule;
  readonly ownerPath: string;
  readonly tests: readonly string[];
}

const POLICY_RULE_SOURCES: readonly PolicyRuleSource[] = [
  {
    ownerPath: "src/rules/project_policy/pack.ts",
    tests: [
      "tests/unit/package_json.test.ts",
      "tests/unit/runner.test.ts",
      "tests/unit/policy_config.test.ts",
    ],
    rules: typeScriptProjectPolicyRules(),
  },
  {
    ownerPath: "src/rules/modularity/pack.ts",
    tests: ["tests/unit/syntax-rules.test.ts", "tests/unit/public_api.test.ts"],
    rules: typeScriptModularityRules(),
  },
  {
    ownerPath: "src/rules/agent_policy/pack.ts",
    tests: [
      "tests/unit/agent_policy.test.ts",
      "tests/unit/public_api.test.ts",
      "tests/unit/policy_config.test.ts",
    ],
    rules: typeScriptAgentPolicyRules(),
  },
  {
    ownerPath: "src/rules/extension_policy/pack.ts",
    tests: [
      "tests/unit/effect_extension.test.ts",
      "tests/unit/public_api.test.ts",
      "tests/unit/policy_config.test.ts",
    ],
    rules: typeScriptExtensionPolicyRules(),
  },
];

export function buildPolicyPacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacket {
  const query = options.query ?? "";
  const matches = policyHandleMatches(query);
  const ownerPaths = unique(matches.map((match) => match.ownerPath));
  const testPaths = unique(matches.flatMap((match) => match.tests));
  const handles = matches.map((match) => policySemanticHandle(match, query));
  const owners = ownerPaths.map(policyOwner);
  const nextActions: SemanticSearchNextAction[] = [
    ...ownerPaths.map((target) => ({ kind: "owner" as const, target })),
    ...testPaths.map((target) => ({ kind: "tests" as const, target })),
  ];
  return basePacket(report, options, {
    header: {
      kind: "search-policy",
      fields: {
        q: query,
        handle: handles.length,
        owner: ownerPaths.length,
        tests: testPaths.length,
        pipes: options.pipes ?? [],
      },
    },
    nodes: [...owners.map(policyOwnerNode), ...testPaths.map((path) => policyTestNode(path))],
    edges: [],
    owners,
    semanticHandles: handles,
    hits: [],
    queryCoverage: [
      {
        value: query,
        kind: "custom",
        selector: "exact",
        status: handles.length === 0 ? "miss" : "hit",
        hitCount: handles.length,
        ownerPaths,
      },
    ],
    searchSynthesis: {
      algorithm: "policy-handle-catalog",
      scope: "policy",
      summary:
        handles.length === 0
          ? "no provider-owned policy handles matched"
          : "resolved provider-owned policy handles",
      selectedOwners: ownerPaths.length,
      testFrontier: testPaths,
    },
    findings: [],
    nextActions,
    notes:
      handles.length === 0
        ? [
            {
              kind: "not-found",
              message: "policy search matched no TypeScript policy rule ids or aliases",
            },
          ]
        : [],
  });
}

function policyHandleMatches(query: string): readonly PolicyHandleMatch[] {
  const normalizedQuery = normalizedMatchText(query);
  if (normalizedQuery === "") return [];
  return POLICY_RULE_SOURCES.flatMap((source) =>
    source.rules
      .filter((rule) => policyRuleMatches(rule, normalizedQuery))
      .map((rule) => ({
        rule,
        ownerPath: source.ownerPath,
        tests: source.tests,
      })),
  );
}

function policyRuleMatches(rule: TypeScriptHarnessRule, normalizedQuery: string): boolean {
  const haystack = normalizedMatchText(
    [rule.ruleId, rule.packId, rule.title, rule.requirement, ...Object.values(rule.labels)].join(
      " ",
    ),
  );
  return haystack.includes(normalizedQuery);
}

function policySemanticHandle(match: PolicyHandleMatch, query: string): SemanticSearchHandle {
  return {
    id: semanticSearchHandleId(match.rule.ruleId),
    kind: "policy-rule",
    source: "provider-policy",
    title: match.rule.title,
    languageName: "typescript",
    labels: unique([match.rule.packId, match.rule.severity, ...Object.values(match.rule.labels)]),
    status: match.rule.severity === "info" ? "advisory" : "active",
    ownerPath: semanticSearchHandlePath(match.ownerPath),
    implementationOwnerPath: semanticSearchHandlePath(match.ownerPath),
    testPaths: match.tests.map(semanticSearchHandlePath),
    locations: [{ path: match.ownerPath, lineRange: "1:1" }],
    queryTerms: [query],
    fields: {
      packId: match.rule.packId,
      severity: match.rule.severity,
      requirement: match.rule.requirement,
    },
  };
}

function policyOwner(path: string): SemanticSearchOwner {
  return {
    path,
    role: "source",
    public: false,
    fields: {
      source: "provider-policy",
    },
  };
}

function policyOwnerNode(owner: SemanticSearchOwner): SemanticSearchNode {
  return {
    id: `O:${owner.path}`,
    kind: "owner",
    path: owner.path,
    fields: owner.fields,
  };
}

function policyTestNode(path: string): SemanticSearchNode {
  return {
    id: `T:${path}`,
    kind: "test",
    path,
    fields: {
      role: "test",
      source: "provider-policy",
    },
  };
}

function normalizedMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value !== ""))];
}
