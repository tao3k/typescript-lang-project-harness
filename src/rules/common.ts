import path from "node:path";

import type {
  SourceLocation,
  TypeScriptHarnessFinding,
  TypeScriptHarnessRule,
  TypeScriptReasoningTree,
} from "../model.js";

export interface DiagnosticFactLike {
  readonly code: number;
  readonly message: string;
  readonly location: SourceLocation;
  readonly sourceLine?: string;
}

export function diagnosticFinding(
  rule: TypeScriptHarnessRule,
  diagnostic: DiagnosticFactLike,
  label: string,
): TypeScriptHarnessFinding {
  const finding: TypeScriptHarnessFinding = {
    ruleId: rule.ruleId,
    packId: rule.packId,
    severity: rule.severity,
    title: rule.title,
    summary: diagnosticSummary(diagnostic),
    location: diagnostic.location,
    requirement: rule.requirement,
    label,
    labels: rule.labels,
  };
  return diagnostic.sourceLine === undefined
    ? finding
    : { ...finding, sourceLine: diagnostic.sourceLine };
}

export function relativeToProject(
  reasoningTree: TypeScriptReasoningTree,
  filePath: string,
): string {
  return path.relative(reasoningTree.projectRoot, filePath) || ".";
}

function diagnosticSummary(diagnostic: DiagnosticFactLike): string {
  return `${diagnosticCodeLabel(diagnostic.code)}: ${diagnostic.message}`;
}

function diagnosticCodeLabel(code: number): string {
  return `TS${code}`;
}
