import type { VerifyReceipt, VerifyTask, VerifyTaskKind } from "./types.js";

/** Check if a receipt matches a pending task obligation. */
export function receiptMatches(receipt: VerifyReceipt, task: VerifyTask): boolean {
  return receipt.kind === task.kind && receipt.fingerprint === task.fingerprint;
}

/** Create a receipt from a completed task. */
export function createReceipt(
  modulePath: string,
  kind: VerifyTaskKind,
  fingerprint: string,
  evidence?: Record<string, unknown>,
): VerifyReceipt {
  return {
    kind,
    fingerprint,
    modulePath,
    completedAt: new Date().toISOString(),
    ...(evidence !== undefined ? { evidence } : {}),
  };
}

/** Apply receipts to a task list — mark matching tasks as completed. */
export function applyReceipts(
  tasks: readonly VerifyTask[],
  receipts: readonly VerifyReceipt[],
): VerifyTask[] {
  return tasks.map((task) => {
    const matched = receipts.some((r) => receiptMatches(r, task));
    return matched ? { ...task, status: "completed" as const } : task;
  });
}
