import type {
  TypeScriptVerificationTask,
  TypeScriptVerificationTaskIndex,
  TypeScriptVerificationTaskRecord,
} from "./model.js";

export function buildTypeScriptVerificationTaskIndex(plan: {
  readonly projectRoot: string;
  readonly tasks: readonly TypeScriptVerificationTask[];
}): TypeScriptVerificationTaskIndex {
  const records = plan.tasks
    .filter((task) => task.skillBinding !== undefined && isActiveTask(task))
    .map(taskRecord)
    .sort(
      (left, right) =>
        left.kind.localeCompare(right.kind) ||
        left.ownerPath.localeCompare(right.ownerPath) ||
        left.fingerprint.localeCompare(right.fingerprint),
    );
  return {
    projectRoot: plan.projectRoot,
    records,
  };
}

export function renderTypeScriptVerificationTaskIndexJson(
  index: TypeScriptVerificationTaskIndex,
): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}

function isActiveTask(task: TypeScriptVerificationTask): boolean {
  return task.state === "pending" || task.state === "failed";
}

function taskRecord(task: TypeScriptVerificationTask): TypeScriptVerificationTaskRecord {
  const skillFields =
    task.skillBinding === undefined ? {} : { skill: skillBindingLabel(task.skillBinding) };
  const contractRef =
    task.skillContractRef === undefined ? {} : { contractRef: task.skillContractRef };
  const line = task.line === undefined ? {} : { line: task.line };
  const receiptSummary =
    task.receiptSummary === undefined ? {} : { receiptSummary: task.receiptSummary };
  return {
    fingerprint: task.fingerprint,
    kind: task.kind,
    state: task.state,
    phase: task.phase,
    packageRoot: task.packageRoot,
    ownerPath: task.ownerPath,
    ownerNamespace: task.ownerNamespace,
    ...line,
    ...skillFields,
    ...contractRef,
    requiredEvidenceKeys: task.requiredEvidence.map((requirement) => requirement.key),
    taskEvidence: task.evidence,
    ...receiptSummary,
    receiptEvidence: task.receiptEvidence,
    missingReceiptEvidenceKeys: missingReceiptEvidenceKeys(task),
  };
}

function missingReceiptEvidenceKeys(task: TypeScriptVerificationTask): readonly string[] {
  const presentKeys = new Set(task.receiptEvidence.map((fact) => fact.label));
  return task.requiredEvidence
    .map((requirement) => requirement.key)
    .filter((key) => !presentKeys.has(key));
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
