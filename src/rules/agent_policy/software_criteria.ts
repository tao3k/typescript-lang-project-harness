/**
 * Shared software-criterion vocabulary for agent policy findings.
 *
 * This module keeps criterion labels stable across renderer and schema tests
 * while policy rules remain responsible for deciding when a criterion applies.
 */
export const SOFTWARE_CRITERIA_LABEL = "softwareCriteria";
const SOFTWARE_CRITERION_COMPACT_PREFIX = "software-criterion/";
export const CONTROL_FLOW_BROAD_LINEAR_PHASE = "control-flow.broad-linear-phase";
export const CONTROL_FLOW_DECISION_STACK = "control-flow.decision-stack";
export const CONTROL_FLOW_LITERAL_DISPATCH_CHAIN = "control-flow.literal-dispatch-chain";
export const CONTROL_FLOW_TRAVERSAL_KNOT = "control-flow.traversal-knot";
export const NATIVE_IDIOM_MANUAL_TRANSFORM_LOOP = "native-idiom.manual-transform-loop";

export function withAgentSoftwareCriteria(
  labels: Readonly<Record<string, string>>,
  criterionIds: readonly string[],
): Readonly<Record<string, string>> {
  const deduplicated = [...new Set(criterionIds)];
  if (deduplicated.length === 0) {
    return labels;
  }
  return {
    ...labels,
    [SOFTWARE_CRITERIA_LABEL]: deduplicated.join(","),
  };
}

export function formatAgentSoftwareCriteria(criterionIds: readonly string[]): string {
  return criterionIds.map(formatSoftwareCriterion).join(", ");
}

function formatSoftwareCriterion(criterionId: string): string {
  if (criterionId.startsWith(SOFTWARE_CRITERION_COMPACT_PREFIX)) {
    return criterionId;
  }
  return `${SOFTWARE_CRITERION_COMPACT_PREFIX}${criterionId}`;
}
