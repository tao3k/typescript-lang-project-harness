export const AGENT_QUALITY_SIGNALS_LABEL = "agentQualitySignals";
const AGENT_QUALITY_SIGNAL_COMPACT_PREFIX = "agent-coding-quality/";
export const CONTROL_FLOW_BROAD_LINEAR_PHASE = "control-flow.broad-linear-phase";
export const CONTROL_FLOW_DECISION_STACK = "control-flow.decision-stack";
export const CONTROL_FLOW_LITERAL_DISPATCH_CHAIN = "control-flow.literal-dispatch-chain";
export const CONTROL_FLOW_TRAVERSAL_KNOT = "control-flow.traversal-knot";
export const NATIVE_IDIOM_MANUAL_TRANSFORM_LOOP = "native-idiom.manual-transform-loop";

export function withAgentQualitySignals(
  labels: Readonly<Record<string, string>>,
  signalIds: readonly string[],
): Readonly<Record<string, string>> {
  const deduplicated = [...new Set(signalIds)];
  if (deduplicated.length === 0) {
    return labels;
  }
  return {
    ...labels,
    [AGENT_QUALITY_SIGNALS_LABEL]: deduplicated.join(","),
  };
}

export function formatAgentQualitySignals(signalIds: readonly string[]): string {
  return signalIds.map(formatAgentQualitySignal).join(", ");
}

function formatAgentQualitySignal(signalId: string): string {
  if (signalId.startsWith(AGENT_QUALITY_SIGNAL_COMPACT_PREFIX)) {
    return signalId;
  }
  return `${AGENT_QUALITY_SIGNAL_COMPACT_PREFIX}${signalId}`;
}
