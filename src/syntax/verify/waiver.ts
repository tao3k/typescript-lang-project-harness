import type { VerifyTask, VerifyTaskKind, VerifyWaiver, WaiverScope } from "./types.js";

/** Create a waiver for a task. */
export function createWaiver(
  modulePath: string,
  kind: VerifyTaskKind,
  scope: WaiverScope,
  reason: string,
): VerifyWaiver {
  return { kind, modulePath, scope, reason };
}

/** Apply waivers to tasks — mark matching tasks as waived. */
export function applyWaivers(
  tasks: readonly VerifyTask[],
  waivers: readonly VerifyWaiver[],
): VerifyTask[] {
  return tasks.map((task) => {
    const waiver = findWaiver(waivers, task.kind);
    if (waiver === undefined) return task;
    if (waiver.scope === "complete") {
      return { ...task, status: "waived" as const };
    }
    // partial waiver does not change status, but is tracked for audit
    return task;
  });
}

/** Look up waiver for a task kind. */
export function findWaiver(
  waivers: readonly VerifyWaiver[],
  kind: VerifyTaskKind,
): VerifyWaiver | undefined {
  return waivers.find((w) => w.kind === kind);
}

/** Authority order resolution. Higher numbers mean stronger authority. */
export function authorityRank(
  source: "parser-fact" | "receipt" | "complete-waiver" | "config-hint" | "llm-prose",
): number {
  switch (source) {
    case "parser-fact":
      return 5;
    case "receipt":
      return 4;
    case "complete-waiver":
      return 3;
    case "config-hint":
      return 2;
    case "llm-prose":
      return 1;
  }
}
