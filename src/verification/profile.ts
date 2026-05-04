import type {
  TypeScriptOwnerResponsibility,
  TypeScriptVerificationEvidence,
  TypeScriptVerificationPhase,
  TypeScriptVerificationPolicy,
  TypeScriptVerificationProfileHint,
  TypeScriptVerificationTaskContract,
  TypeScriptVerificationTaskKind,
} from "./model.js";

export function responsibilityLabels(
  responsibilities: readonly TypeScriptOwnerResponsibility[],
): string {
  return responsibilities.length === 0 ? "<none>" : [...responsibilities].sort().join(",");
}

export function taskKindLabels(taskKinds: readonly TypeScriptVerificationTaskKind[]): string {
  return taskKinds.length === 0 ? "<none>" : [...taskKinds].sort().join(",");
}

export function profileEvidence(
  hint: TypeScriptVerificationProfileHint,
): TypeScriptVerificationEvidence[] {
  const evidence: TypeScriptVerificationEvidence[] = [
    {
      label: "profile",
      value: responsibilityLabels(hint.responsibilities),
    },
  ];
  const rationale = hint.rationale?.trim();
  if (rationale !== undefined && rationale.length > 0) {
    evidence.push({ label: "rationale", value: rationale });
  }
  return evidence;
}

export function taskKindsForProfile(
  hint: TypeScriptVerificationProfileHint,
  policy: TypeScriptVerificationPolicy,
): readonly TypeScriptVerificationTaskKind[] {
  return uniqueSortedTaskKinds(
    hint.taskKinds ?? taskKindsForResponsibilities(hint.responsibilities, policy),
  );
}

export function taskKindsForResponsibilities(
  responsibilities: readonly TypeScriptOwnerResponsibility[],
  policy: TypeScriptVerificationPolicy,
): readonly TypeScriptVerificationTaskKind[] {
  return uniqueSortedTaskKinds(
    responsibilities.flatMap(
      (responsibility) =>
        policy.responsibilityTaskOverrides[responsibility] ??
        defaultTaskKindsForResponsibility(responsibility),
    ),
  );
}

export function profileTaskReason(
  kind: TypeScriptVerificationTaskKind,
  responsibilities: readonly TypeScriptOwnerResponsibility[],
  usesOwnerTaskOverride: boolean,
): string {
  if (usesOwnerTaskOverride) {
    return `owner profile explicitly requests ${kind} verification`;
  }
  return responsibilities.some((responsibility) =>
    defaultTaskKindsForResponsibility(responsibility).includes(kind),
  )
    ? defaultProfileTaskReason(kind)
    : `profile config maps responsibilities to ${kind} verification`;
}

export function taskContractForProfile(
  policy: TypeScriptVerificationPolicy,
  hint: TypeScriptVerificationProfileHint | undefined,
  kind: TypeScriptVerificationTaskKind,
): TypeScriptVerificationTaskContract {
  return (
    hint?.taskContractOverrides[kind] ??
    policy.taskContractOverrides[kind] ??
    defaultTaskContract(kind)
  );
}

function defaultTaskKindsForResponsibility(
  responsibility: TypeScriptOwnerResponsibility,
): readonly TypeScriptVerificationTaskKind[] {
  switch (responsibility) {
    case "public_api":
      return ["stress"];
    case "latency_sensitive":
      return ["performance"];
    case "external_dependency":
    case "persistence":
    case "availability_critical":
      return ["chaos"];
    case "security_boundary":
      return ["security"];
    case "pure_domain_logic":
      return [];
  }
}

function defaultProfileTaskReason(kind: TypeScriptVerificationTaskKind): string {
  switch (kind) {
    case "stress":
      return "profile declares public API or integration surface";
    case "performance":
      return "profile declares latency-sensitive TypeScript owner";
    case "chaos":
      return "profile declares dependency, persistence, or availability responsibility";
    case "security":
      return "profile declares auth, authorization, secret, or trust-boundary logic";
    case "regression":
      return "profile config maps responsibilities to regression verification";
    case "responsibility_review":
      return "profile config maps responsibilities to responsibility review";
  }
}

function defaultTaskContract(
  kind: TypeScriptVerificationTaskKind,
): TypeScriptVerificationTaskContract {
  switch (kind) {
    case "stress":
      return taskContract(
        "after_unit_tests_pass",
        "stress skill must report p50/p99/p999, load steps, and SLA result for this fingerprint",
        [
          ["p50", "median latency under the chosen load step"],
          ["p99", "p99 latency under the chosen load step"],
          ["p999", "p999 latency when available or explicitly unsupported"],
          ["load_steps", "pressure staircase and concurrency/request rates"],
          ["sla_result", "whether the declared SLA was held or broken"],
        ],
      );
    case "performance":
      return taskContract(
        "after_unit_tests_pass",
        "performance skill must report benchmark command, baseline, regression threshold, latency or throughput, allocation profile, and profiling artifact for this fingerprint",
        [
          ["benchmark_command", "project-owned benchmark command that exercises this owner"],
          ["baseline", "baseline commit, release, or previous artifact used for comparison"],
          [
            "regression_threshold",
            "accepted slowdown, throughput drop, or allocation growth limit",
          ],
          ["latency_or_throughput", "ms/op, ops/sec, or domain-specific throughput result"],
          ["allocation_profile", "allocation count, bytes, or explicit unsupported result"],
          ["profile_artifact", "benchmark, trace, flamegraph, or equivalent artifact"],
        ],
      );
    case "chaos":
      return taskContract(
        "before_release",
        "chaos skill must report injected failures, degradation behavior, and recovery result for this fingerprint",
        [
          ["injected_failures", "dependencies and failure modes injected"],
          ["degradation", "observed degraded behavior during the fault"],
          ["recovery", "recovery signal and time after the fault is removed"],
        ],
      );
    case "security":
      return taskContract(
        "before_release",
        "security skill must report scanned attack classes and authorization-boundary result for this fingerprint",
        [
          ["attack_classes", "common attack classes scanned"],
          ["authorization_boundary", "authorization or trust-boundary result"],
          ["findings", "confirmed findings or explicit none result"],
        ],
      );
    case "regression":
      return taskContract(
        "scheduled_regression",
        "regression skill must report source growth, dependency drift, and owner-cycle status for this fingerprint",
        [
          ["source_growth", "source growth or owner bloat trend"],
          ["dependency_drift", "owner dependency drift or fan-out change"],
          ["owner_cycles", "owner-cycle status"],
        ],
      );
    case "responsibility_review":
      return taskContract(
        "before_verification",
        "update the verification profile hint to match parser facts, or attach a complete waiver",
        [["profile_resolution", "updated responsibility hint or complete waiver rationale"]],
      );
  }
}

function taskContract(
  phase: TypeScriptVerificationPhase,
  requiredReceipt: string,
  requirements: readonly (readonly [string, string])[],
): TypeScriptVerificationTaskContract {
  return {
    phase,
    requiredReceipt,
    requiredEvidence: requirements.map(([key, description]) => ({ key, description })),
  };
}

function uniqueSortedTaskKinds(
  taskKinds: readonly TypeScriptVerificationTaskKind[],
): readonly TypeScriptVerificationTaskKind[] {
  return [...new Set(taskKinds)].sort((left, right) => left.localeCompare(right));
}
