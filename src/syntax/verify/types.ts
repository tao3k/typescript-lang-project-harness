/**
 * Syntax verification task model.
 *
 * This module defines verification task, receipt, waiver, and authority types
 * used by the syntax verification planner.
 */
// ── Verification Task Kinds ────────────────────────────────
//
// Authority order:
//   parser facts > receipts > complete waivers > config hints > LLM prose

export type VerifyTaskKind =
  | "typecheck"
  | "unit"
  | "snapshot"
  | "react-render"
  | "effect-layer"
  | "performance"
  | "bundle-size";

export type VerifyPhase =
  | "after_code_change"
  | "after_typecheck_pass"
  | "after_unit_tests_pass"
  | "after_release_build";

export type VerifyStatus = "pending" | "waived" | "completed";

export interface VerifyTask {
  readonly kind: VerifyTaskKind;
  readonly status: VerifyStatus;
  readonly phase: VerifyPhase;
  /** Content-addressable fingerprint for the task obligation */
  readonly fingerprint: string;
}

export interface VerifyPlan {
  readonly modulePath: string;
  readonly tasks: readonly VerifyTask[];
}

// ── Receipt ────────────────────────────────────────────────

export interface VerifyReceipt {
  readonly kind: VerifyTaskKind;
  readonly fingerprint: string;
  readonly modulePath: string;
  readonly completedAt: string; // ISO-8601
  /** Optional evidence: e.g. snapshot hash, test pass count */
  readonly evidence?: Record<string, unknown>;
}

// ── Waiver ─────────────────────────────────────────────────

export type WaiverScope = "complete" | "partial" | "config-hint";

export interface VerifyWaiver {
  readonly kind: VerifyTaskKind;
  readonly modulePath: string;
  readonly scope: WaiverScope;
  /** Human-written justification */
  readonly reason: string;
  /** Override the default authority level */
  readonly authorityOverride?: "receipt" | "config-hint" | "llm-prose";
}

// ── Task relevance rules ───────────────────────────────────

export function taskKindPhases(kind: VerifyTaskKind): VerifyPhase {
  switch (kind) {
    case "typecheck":
    case "snapshot":
      return "after_code_change";
    case "unit":
      return "after_typecheck_pass";
    case "react-render":
    case "performance":
      return "after_unit_tests_pass";
    case "effect-layer":
      return "after_typecheck_pass";
    case "bundle-size":
      return "after_release_build";
  }
}
