import path from "node:path";

import type {
  TypeScriptVerificationPerformanceIndex,
  TypeScriptVerificationPerformanceRecord,
  TypeScriptVerificationTask,
} from "./model.js";

export function buildTypeScriptVerificationPerformanceIndex(plan: {
  readonly projectRoot: string;
  readonly tasks: readonly TypeScriptVerificationTask[];
}): TypeScriptVerificationPerformanceIndex {
  const records = plan.tasks
    .filter((task) => task.kind === "performance" && isActiveTask(task))
    .map(performanceRecord)
    .sort(
      (left, right) =>
        left.ownerPath.localeCompare(right.ownerPath) ||
        left.fingerprint.localeCompare(right.fingerprint),
    );
  return {
    projectRoot: plan.projectRoot,
    records,
  };
}

export function renderTypeScriptVerificationPerformanceIndex(
  index: TypeScriptVerificationPerformanceIndex,
): string {
  return index.records
    .map((record) => renderPerformanceRecord(index.projectRoot, record))
    .join("\n");
}

export function renderTypeScriptVerificationPerformanceIndexJson(
  index: TypeScriptVerificationPerformanceIndex,
): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}

function performanceRecord(
  task: TypeScriptVerificationTask,
): TypeScriptVerificationPerformanceRecord {
  const skillFields =
    task.skillBinding === undefined ? {} : { skill: skillBindingLabel(task.skillBinding) };
  const contractRef =
    task.skillContractRef === undefined ? {} : { contractRef: task.skillContractRef };
  const receiptSummary =
    task.receiptSummary === undefined ? {} : { receiptSummary: task.receiptSummary };
  const receiptEvidenceUri =
    task.receiptEvidenceUri === undefined ? {} : { receiptEvidenceUri: task.receiptEvidenceUri };
  const receiptObservedAt =
    task.receiptObservedAt === undefined ? {} : { receiptObservedAt: task.receiptObservedAt };
  return {
    fingerprint: task.fingerprint,
    state: task.state,
    phase: task.phase,
    packageRoot: task.packageRoot,
    ownerPath: task.ownerPath,
    ownerNamespace: task.ownerNamespace,
    ...skillFields,
    ...contractRef,
    requiredEvidenceKeys: task.requiredEvidence.map((requirement) => requirement.key),
    taskEvidence: task.evidence,
    ...receiptSummary,
    ...receiptEvidenceUri,
    ...receiptObservedAt,
    receiptEvidence: task.receiptEvidence,
  };
}

function renderPerformanceRecord(
  projectRoot: string,
  record: TypeScriptVerificationPerformanceRecord,
): string {
  const lines = [`[perf-state] ${displayProjectPath(projectRoot, record.ownerPath)}`];
  if (record.ownerNamespace.length > 0) {
    lines.push(`   |owner: ${record.ownerNamespace}`);
  }
  let stateLine = `   |state: ${record.state} phase=${record.phase} fingerprint=${record.fingerprint}`;
  if (record.skill !== undefined) {
    stateLine += ` skill=${record.skill}`;
  }
  if (record.contractRef !== undefined) {
    stateLine += ` contract_ref=${record.contractRef}`;
  }
  lines.push(stateLine);
  if (record.receiptSummary !== undefined) {
    lines.push(`   |receipt: ${record.receiptSummary}`);
  }
  if (record.receiptObservedAt !== undefined) {
    lines.push(`   |observed_at: ${record.receiptObservedAt}`);
  }
  if (record.receiptEvidence.length > 0) {
    lines.push(
      `   |evidence: ${record.receiptEvidence
        .map((fact) => `${fact.label}=${fact.value}`)
        .join(",")}`,
    );
  }
  const missing = missingReceiptEvidenceKeys(record);
  if (isActiveRecord(record) && missing.length > 0) {
    lines.push(`   |missing: ${missing.join(",")}`);
  }
  if (record.receiptEvidenceUri !== undefined) {
    lines.push(`   |artifact: ${record.receiptEvidenceUri}`);
  }
  return lines.join("\n");
}

function missingReceiptEvidenceKeys(
  record: TypeScriptVerificationPerformanceRecord,
): readonly string[] {
  const presentKeys = new Set(record.receiptEvidence.map((fact) => fact.label));
  return record.requiredEvidenceKeys.filter((key) => !presentKeys.has(key));
}

function isActiveTask(task: TypeScriptVerificationTask): boolean {
  return task.state === "pending" || task.state === "failed";
}

function isActiveRecord(record: TypeScriptVerificationPerformanceRecord): boolean {
  return record.state === "pending" || record.state === "failed";
}

function displayProjectPath(projectRoot: string, value: string): string {
  return path.relative(projectRoot, value).replaceAll("\\", "/") || ".";
}

function skillBindingLabel(binding: {
  readonly skillId: string;
  readonly adapter?: string;
}): string {
  const adapter = binding.adapter?.trim();
  return adapter === undefined || adapter.length === 0
    ? binding.skillId
    : `${binding.skillId}@${adapter}`;
}
