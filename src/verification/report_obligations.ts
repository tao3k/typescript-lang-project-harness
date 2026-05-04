import type {
  TypeScriptVerificationReportObligation,
  TypeScriptVerificationTask,
  TypeScriptVerificationTaskKind,
} from "./model.js";

export function verificationReportObligationsForTasks(
  tasks: readonly TypeScriptVerificationTask[],
): readonly TypeScriptVerificationReportObligation[] {
  const activeTasks = tasks.filter(isActiveTask);
  if (activeTasks.length === 0) {
    return [];
  }

  const obligations: TypeScriptVerificationReportObligation[] = [
    {
      key: "verification_plan_json",
      renderer: "renderTypeScriptVerificationPlanJson",
      suggestedArtifactName: "verification_plan.json",
      reason:
        "persist active TypeScript verification policy state so receipts, waivers, and task drift stay comparable",
      taskKinds: uniqueSortedTaskKinds(activeTasks),
      taskFingerprints: activeTasks.map((task) => task.fingerprint),
    },
  ];
  const configuredSkillTasks = activeTasks.filter((task) => task.skillBinding !== undefined);
  if (configuredSkillTasks.length > 0) {
    obligations.push({
      key: "task_index_json",
      renderer: "buildTypeScriptVerificationTaskIndex + renderTypeScriptVerificationTaskIndexJson",
      suggestedArtifactName: "task_index.json",
      reason:
        "persist compact configured-skill task state for security, performance, stress, chaos, and regression",
      taskKinds: uniqueSortedTaskKinds(configuredSkillTasks),
      taskFingerprints: configuredSkillTasks.map((task) => task.fingerprint),
    });
  }
  return obligations;
}

function isActiveTask(task: TypeScriptVerificationTask): boolean {
  return task.state === "pending" || task.state === "failed";
}

function uniqueSortedTaskKinds(
  tasks: readonly TypeScriptVerificationTask[],
): readonly TypeScriptVerificationTaskKind[] {
  return [...new Set(tasks.map((task) => task.kind))].sort((left, right) =>
    left.localeCompare(right),
  );
}
