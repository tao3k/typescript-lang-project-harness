import type { VerifyPlan } from "./types.js";

/** Render verification plans in compact text format. */
export function renderVerifyPlans(plans: readonly VerifyPlan[]): string {
  if (plans.length === 0) return "[verify] ok";

  const lines: string[] = [];
  for (const plan of plans) {
    lines.push(`[verify] ${plan.modulePath}`);
    for (const task of plan.tasks) {
      const status = task.status === "pending" ? "pending" : task.status;
      lines.push(`|${task.kind}: ${status} phase=${task.phase} fingerprint=${task.fingerprint}`);
    }
  }
  return lines.join("\n");
}

/** Render a clean verification output for projects with no pending tasks. */
export function renderVerifyClean(plans: readonly VerifyPlan[]): string {
  const allClean = plans.every((p) => p.tasks.every((t) => t.status !== "pending"));
  if (allClean) return "[verify] ok";
  return renderVerifyPlans(plans);
}
