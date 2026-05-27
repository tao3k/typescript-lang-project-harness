import path from "node:path";

import { advisoryFindings, blockingFindings } from "../model.js";
import type { TypeScriptHarnessFinding, TypeScriptHarnessReport } from "../model.js";

const MAX_ADVICE_ACTIONS = 8;
const MAX_TARGET_EXAMPLES = 4;

export type TypeScriptAgentCompactTextFindingMode = "advice" | "blocking" | "all";

export interface TypeScriptAgentCompactTextOptions {
  readonly findings?: TypeScriptAgentCompactTextFindingMode;
  readonly maxActionGroups?: number;
  readonly maxTargetExamples?: number;
}

interface AdviceGroup {
  readonly count: number;
  readonly finding: TypeScriptHarnessFinding;
  readonly findings: readonly TypeScriptHarnessFinding[];
}

export function renderTypeScriptProjectHarnessAgentCompactText(
  report: TypeScriptHarnessReport,
  options: TypeScriptAgentCompactTextOptions = {},
): string {
  const findingMode = options.findings ?? "advice";
  const findings = selectAgentCompactFindings(report, findingMode);
  if (findings.length === 0) {
    return "";
  }
  const groups = groupedAdviceFindings(findings);
  const maxActionGroups = options.maxActionGroups ?? MAX_ADVICE_ACTIONS;
  const maxTargetExamples = options.maxTargetExamples ?? MAX_TARGET_EXAMPLES;
  return [
    `AgentCompactText: mode=${findingMode} findings=${findings.length} tasks=${groups.length}`,
    "Directive: edit listed targets, apply fix steps, rerun harness.",
    "RepairTasks:",
    ...compactLines(
      groups.map((group, index) => renderRepairTask(report, group, index + 1, maxTargetExamples)),
      maxActionGroups,
      "repair tasks",
    ),
  ].join("\n");
}

export function renderTypeScriptProjectHarnessAdvice(report: TypeScriptHarnessReport): string {
  return renderTypeScriptProjectHarnessAgentCompactText(report, { findings: "advice" });
}

function selectAgentCompactFindings(
  report: TypeScriptHarnessReport,
  findingMode: TypeScriptAgentCompactTextFindingMode,
): readonly TypeScriptHarnessFinding[] {
  switch (findingMode) {
    case "advice":
      return advisoryFindings(report);
    case "blocking":
      return blockingFindings(report);
    case "all":
      return report.findings;
  }
}

function groupedAdviceFindings(findings: readonly TypeScriptHarnessFinding[]): AdviceGroup[] {
  const groups = new Map<
    string,
    { count: number; finding: TypeScriptHarnessFinding; findings: TypeScriptHarnessFinding[] }
  >();
  for (const finding of findings) {
    const key = `${finding.severity}\0${finding.ruleId}\0${finding.title}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { count: 1, finding, findings: [finding] });
      continue;
    }
    group.count += 1;
    group.findings.push(finding);
  }
  return [...groups.values()].sort(compareAdviceGroups);
}

function compareAdviceGroups(left: AdviceGroup, right: AdviceGroup): number {
  const priority = adviceGroupPriority(left.finding) - adviceGroupPriority(right.finding);
  if (priority !== 0) {
    return priority;
  }
  return `${left.finding.severity}:${left.finding.ruleId}:${left.finding.title}`.localeCompare(
    `${right.finding.severity}:${right.finding.ruleId}:${right.finding.title}`,
  );
}

function adviceGroupPriority(finding: TypeScriptHarnessFinding): number {
  return severityPriority(finding.severity) * 100 + packPriority(finding.packId);
}

function severityPriority(severity: TypeScriptHarnessFinding["severity"]): number {
  switch (severity) {
    case "error":
      return 0;
    case "warning":
      return 1;
    case "info":
      return 2;
  }
}

function packPriority(packId: TypeScriptHarnessFinding["packId"]): number {
  switch (packId) {
    case "typescript.extension_policy":
      return 0;
    case "typescript.agent_policy":
      return 1;
    case "typescript.modularity":
      return 2;
    case "typescript.test_layout":
      return 3;
    case "typescript.semantic":
      return 4;
    case "typescript.project_policy":
      return 5;
    case "typescript.syntax":
      return 6;
    default:
      return 9;
  }
}

function renderRepairTask(
  report: TypeScriptHarnessReport,
  group: AdviceGroup,
  index: number,
  maxTargetExamples: number,
): string {
  const finding = group.finding;
  const lines = [`- ${renderTaskHeader(finding, group.count, index)}`];
  lines.push(
    "  fix:",
    ...adviceFixSteps(finding).map((step) => `   - ${step}`),
    "  targets:",
    ...compactTargetLines(
      group.findings.map((target) => renderTargetExample(report, target)),
      maxTargetExamples,
    ),
  );
  return lines.join("\n");
}

function renderTaskHeader(finding: TypeScriptHarnessFinding, count: number, index: number): string {
  const context = compactTaskContext(finding);
  const contextSuffix = context === "" ? "" : ` (${context})`;
  return `[${finding.ruleId}] ${finding.severity} x${count}: ${agentTaskTitle(
    finding,
  )}${contextSuffix} task=${index}`;
}

function agentTaskTitle(finding: TypeScriptHarnessFinding): string {
  switch (finding.ruleId) {
    case "TS-AGENT-R009":
      return "Make public DTO/domain fields carry typed meaning";
    case "TS-AGENT-R010":
      return "Replace primitive semantic aliases with real domain types";
    case "TS-AGENT-R011":
      return "Replace stringly state fields with finite typed states";
    case "TS-AGENT-R012":
      return "Give discriminated-union payloads named domain shapes";
    case "TS-EXT-EFFECT-R001":
      return "Make explicit Effect extension config match package dependencies";
    case "TS-EXT-EFFECT-R002":
      return "Migrate public async domain APIs to Effect";
    case "TS-EXT-EFFECT-R003":
      return "Move Effect runtime execution to entrypoint or adapter boundaries";
    case "TS-EXT-EFFECT-R004":
      return "Move Effect service dependencies into Layer/runtime construction";
    case "TS-EXT-EFFECT-R005":
      return "Use typed domain errors in Effect error channels";
    case "TS-EXT-EFFECT-R006":
      return "Wrap rejection-capable Promise interop with Effect.tryPromise";
    case "TS-EXT-EFFECT-R007":
      return "Make Effect resource lifetime and Scope boundaries explicit";
    default:
      return finding.title;
  }
}

function adviceFixSteps(finding: TypeScriptHarnessFinding): readonly string[] {
  switch (finding.ruleId) {
    case "TS-AGENT-R009":
      return [
        "edit the exported interface/type/class fields named in targets",
        "replace repeated primitive ids, paths, flags, and urls with branded aliases or named domain objects",
        "if raw JSON is intentional, name the boundary as DTO/Payload and keep the raw shape at the adapter edge",
      ];
    case "TS-AGENT-R010":
      return [
        "replace aliases such as `export type OwnerId = string` with branded/opaque aliases or named value objects",
        "keep finite literal-union catalog aliases as the typed boundary",
      ];
    case "TS-AGENT-R011":
      return [
        "replace raw `status: string`, `kind: string`, `mode: string`, or similar state fields",
        "use string-literal unions, public enums, branded state types, or typed catalog boundaries",
      ];
    case "TS-AGENT-R012":
      return [
        "move primitive discriminated-union payload fields into named payload/domain types",
        "prefer a named payload object such as `UserLoadedPayload` with branded ids",
      ];
    case "TS-EXT-EFFECT-R001":
      return [
        "if Effect policy is intended, add `effect` to package dependencies and keep `typescriptProjectHarness.extensions.effect` enabled",
        "otherwise remove the explicit extension config",
      ];
    case "TS-EXT-EFFECT-R002":
      return [
        'add `import { Effect } from "effect"` where the target module needs Effect types or constructors',
        "change public async/Promise domain API signatures to return `Effect.Effect<Success, DomainError, Requirements>`",
        "replace rejecting async work with `Effect.tryPromise({ try: () => promise, catch: (cause) => new DomainError({ cause }) })`",
        "keep `Effect.run*` only in entrypoints, framework adapters, CLI handlers, or runtime integration modules",
      ];
    case "TS-EXT-EFFECT-R003":
      return [
        "move `Effect.run*` or `Runtime.run*` out of source modules",
        "return Effect descriptions from source owners and execute them in entrypoints/adapters",
      ];
    case "TS-EXT-EFFECT-R004":
      return [
        "move service dependencies into `Layer` or runtime construction",
        "expose public service methods as `Effect.Effect<Success, Error, never>` when possible",
      ];
    case "TS-EXT-EFFECT-R005":
      return [
        "replace primitive, any, unknown, or void Effect error channels with tagged or domain error types",
        "make the error type catchable with `Effect.catchTag` or the project recovery policy",
      ];
    case "TS-EXT-EFFECT-R006":
      return [
        "replace rejection-capable `Effect.promise` calls with `Effect.tryPromise({ try: () => promise, catch: (cause) => new DomainError({ cause }) })`",
        "map failures into a typed domain error",
      ];
    case "TS-EXT-EFFECT-R007":
      return [
        "make resource lifetime explicit with `Effect.scoped(Effect.acquireRelease(...))`",
        "or expose/document a `Scope` or `Layer` resource boundary",
      ];
    default:
      return ["open the target, apply the rule contract in source, and rerun harness"];
  }
}

function problemText(finding: TypeScriptHarnessFinding): string {
  switch (finding.ruleId) {
    case "TS-AGENT-R009":
      return "public exported data shape uses primitive fields for domain meaning";
    case "TS-AGENT-R010":
      return "public semantic type alias is only a primitive carrier";
    case "TS-AGENT-R011":
      return "public data shape uses raw string for finite state/kind/mode";
    case "TS-AGENT-R012":
      return "public discriminated-union variant carries primitive semantic payload fields";
    case "TS-EXT-EFFECT-R001":
      return "package config enables Effect policy but package dependencies do not provide Effect";
    case "TS-EXT-EFFECT-R002":
      return "public async/Promise domain API exposes raw Promise instead of Effect.Effect";
    case "TS-EXT-EFFECT-R003":
      return "source module executes Effect runtime instead of returning an Effect description";
    case "TS-EXT-EFFECT-R004":
      return "public Effect service method leaks implementation requirements";
    case "TS-EXT-EFFECT-R005":
      return "public Effect API uses a weak error channel";
    case "TS-EXT-EFFECT-R006":
      return "Effect.promise wraps rejection-capable async interop without typed error mapping";
    case "TS-EXT-EFFECT-R007":
      return "Effect.acquireRelease resource lacks an explicit local Scope boundary";
    default:
      return finding.label;
  }
}

function adviceParserEvidenceText(finding: TypeScriptHarnessFinding): string {
  switch (finding.ruleId) {
    case "TS-EXT-EFFECT-R001":
      return "package.json extension config + dependency facts";
    case "TS-EXT-EFFECT-R002":
      return "package.json Effect activation + native async/Promise return facts";
    case "TS-EXT-EFFECT-R003":
      return "native Effect.run*/Runtime.run* calls + module role";
    case "TS-EXT-EFFECT-R004":
      return "native public Effect service method return types";
    case "TS-EXT-EFFECT-R005":
      return "native public Effect error-channel types";
    case "TS-EXT-EFFECT-R006":
      return "native Effect.promise calls inside public Effect surfaces";
    case "TS-EXT-EFFECT-R007":
      return "native Effect.acquireRelease + Effect.scoped calls";
    case "TS-AGENT-R009":
    case "TS-AGENT-R010":
    case "TS-AGENT-R011":
    case "TS-AGENT-R012":
      return "native exported TypeScript type/API facts";
    default:
      return "";
  }
}

function compactTaskContext(finding: TypeScriptHarnessFinding): string {
  const parts = [problemText(finding)];
  const parserEvidence = adviceParserEvidenceText(finding);
  if (parserEvidence !== "") {
    parts.push(`facts: ${parserEvidence}`);
  }
  return parts.join("; ");
}

function renderTargetExample(
  report: TypeScriptHarnessReport,
  finding: TypeScriptHarnessFinding,
): string {
  return `   - @ ${renderLocation(report, finding)} ${targetDetailText(finding)}`;
}

function targetDetailText(finding: TypeScriptHarnessFinding): string {
  switch (finding.ruleId) {
    case "TS-EXT-EFFECT-R002":
      return labelValue("apis", finding.labels.async_surfaces) ?? finding.label;
    case "TS-EXT-EFFECT-R003":
      return labelValue("calls", finding.labels.runtime_calls) ?? finding.label;
    case "TS-EXT-EFFECT-R004":
      return labelValue("method", finding.labels.method) ?? finding.label;
    case "TS-EXT-EFFECT-R005":
      return labelValue("surfaces", finding.labels.error_surfaces) ?? finding.label;
    case "TS-EXT-EFFECT-R006":
      return labelValue("interop", finding.labels.promise_interop) ?? finding.label;
    case "TS-EXT-EFFECT-R007":
      return labelValue("resource", finding.labels.resource_scope) ?? finding.label;
    case "TS-AGENT-R010":
      return labelValue("alias", finding.labels.alias) ?? finding.label;
    default:
      return finding.label;
  }
}

function labelValue(label: string, value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : `${label}=${value}`;
}

function renderLocation(
  report: TypeScriptHarnessReport,
  finding: TypeScriptHarnessFinding,
): string {
  const rawPath = finding.location.path ?? "<project>";
  const displayPath =
    rawPath === "<project>"
      ? rawPath
      : path.relative(report.reasoningTree.projectRoot, rawPath) || ".";
  return `${displayPath}:${finding.location.line}:${finding.location.column + 1}`;
}

function compactLines(lines: readonly string[], maxLines: number, label: string): string[] {
  if (lines.length <= maxLines) {
    return [...lines];
  }
  return [...lines.slice(0, maxLines), ` - ... +${lines.length - maxLines} ${label}`];
}

function compactTargetLines(lines: readonly string[], maxLines: number): string[] {
  if (lines.length <= maxLines) {
    return [...lines];
  }
  return [...lines.slice(0, maxLines), `   - ... +${lines.length - maxLines} target examples`];
}
