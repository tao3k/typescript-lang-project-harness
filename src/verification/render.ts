import path from "node:path";

import type {
  TypeScriptVerificationPlan,
  TypeScriptVerificationSkillDescriptor,
  TypeScriptVerificationTask,
} from "./model.js";

export function renderTypeScriptVerificationPlan(plan: TypeScriptVerificationPlan): string {
  const groups = new Map<string, TypeScriptVerificationTask[]>();
  for (const task of plan.tasks.filter(isActiveTask)) {
    const key = `${task.packageRoot}\0${task.ownerPath}\0${task.ownerNamespace}`;
    const tasks = groups.get(key);
    if (tasks === undefined) {
      groups.set(key, [task]);
      continue;
    }
    tasks.push(task);
  }
  const taskBlocks = [...groups.values()]
    .sort((left, right) => taskOwnerSortKey(left[0]).localeCompare(taskOwnerSortKey(right[0])))
    .map((tasks) => renderOwnerGroup(plan, tasks))
    .filter((rendered) => rendered.length > 0)
    .join("\n");
  return [taskBlocks, renderReportObligations(plan)]
    .filter((rendered) => rendered.length > 0)
    .join("\n");
}

export function renderTypeScriptVerificationPlanJson(plan: TypeScriptVerificationPlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

export function renderTypeScriptVerificationSkillContracts(
  plan: TypeScriptVerificationPlan,
): string {
  return plan.skillDescriptors.map(renderSkillDescriptor).join("\n");
}

function renderOwnerGroup(
  plan: TypeScriptVerificationPlan,
  tasks: readonly TypeScriptVerificationTask[],
): string {
  const firstTask = tasks[0];
  if (firstTask === undefined) {
    return "";
  }
  const lines = [`[verify] ${displayProjectPath(plan.projectRoot, firstTask.ownerPath)}`];
  if (firstTask.ownerNamespace.length > 0) {
    lines.push(`   |owner: ${firstTask.ownerNamespace}`);
  }
  for (const task of [...tasks].sort((left, right) =>
    taskSortKey(left).localeCompare(taskSortKey(right)),
  )) {
    renderTask(task, lines);
  }
  return lines.join("\n");
}

function renderTask(task: TypeScriptVerificationTask, lines: string[]): void {
  let taskLine = `   |${task.kind}: ${task.state} phase=${task.phase} fingerprint=${task.fingerprint}`;
  if (task.skillBinding !== undefined) {
    taskLine += ` skill=${skillBindingLabel(task.skillBinding)}`;
  }
  if (task.skillContractRef !== undefined) {
    taskLine += ` contract_ref=${task.skillContractRef}`;
  }
  lines.push(taskLine);
  if (task.line !== undefined) {
    lines.push(`   |line: ${task.kind}=${task.line}`);
  }
  if (task.skillBinding === undefined) {
    lines.push(`   |why: ${task.kind}=${task.reason}`);
  }
  if (task.receiptSummary !== undefined) {
    lines.push(`   |receipt: ${task.kind}=${task.receiptSummary}`);
  }
  for (const note of task.resolutionNotes) {
    lines.push(`   |resolution: ${task.kind}.${note.label}=${note.detail}`);
  }
  if (task.skillBinding !== undefined) {
    return;
  }
  if (task.requiredEvidence.length > 0) {
    lines.push(
      `   |requires: ${task.kind}=${task.requiredEvidence
        .map((requirement) => requirement.key)
        .join(",")}`,
    );
  }
  for (const fact of task.evidence) {
    lines.push(`   |fact: ${task.kind}.${fact.label}=${fact.value}`);
  }
  lines.push(`   |contract: ${task.kind}=${task.requiredReceipt}`);
}

function renderSkillDescriptor(descriptor: TypeScriptVerificationSkillDescriptor): string {
  const lines = [`[skill-contract] ${skillBindingLabel(descriptor)}`];
  pushOptionalLine(lines, "tool", descriptor.tool);
  pushOptionalLine(lines, "run", descriptor.command);
  pushOptionalLine(lines, "standard", descriptor.standard);
  pushListLine(lines, "inputs", descriptor.requiredInputs);
  pushListLine(lines, "pass", descriptor.passCriteria);
  pushListLine(lines, "receipt", descriptor.receiptFields);
  return lines.join("\n");
}

function renderReportObligations(plan: TypeScriptVerificationPlan): string {
  if (plan.reportObligations.length === 0) {
    return "";
  }
  const lines = [
    "[verify-report]",
    `   |bundle: renderer=renderTypeScriptVerificationReportBundleJson artifact=verification_report_bundle.json artifacts=${plan.reportObligations.length}`,
  ];
  for (const obligation of plan.reportObligations) {
    lines.push(
      `   |required: ${obligation.key} renderer=${obligation.renderer} artifact=${obligation.suggestedArtifactName} tasks=${obligation.taskFingerprints.length} kinds=${obligation.taskKinds.join(",")}`,
    );
  }
  return lines.join("\n");
}

function pushOptionalLine(lines: string[], label: string, value: string): void {
  if (value.trim().length > 0) {
    lines.push(`   |${label}: ${value}`);
  }
}

function pushListLine(lines: string[], label: string, values: readonly string[]): void {
  if (values.length > 0) {
    lines.push(`   |${label}: ${values.join(",")}`);
  }
}

function isActiveTask(task: TypeScriptVerificationTask): boolean {
  return task.state === "pending" || task.state === "failed";
}

function taskOwnerSortKey(task: TypeScriptVerificationTask | undefined): string {
  return task === undefined ? "" : `${task.packageRoot}\0${task.ownerPath}\0${task.ownerNamespace}`;
}

function taskSortKey(task: TypeScriptVerificationTask): string {
  return `${task.kind}\0${task.fingerprint}`;
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
