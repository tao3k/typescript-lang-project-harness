/**
 * Public rendering facade for TypeScript harness output.
 *
 * This module re-exports compact text, agent snapshot, and verification
 * renderers used by the CLI and library consumers.
 */
export {
  renderTypeScriptProjectHarnessAdvice,
  renderTypeScriptProjectHarnessAgentCompactText,
} from "./render/agent_compact_text.js";
export type {
  TypeScriptAgentCompactTextFindingMode,
  TypeScriptAgentCompactTextOptions,
} from "./render/agent_compact_text.js";

export { renderTypeScriptProjectHarness, renderAssertionMessage } from "./render/agent-snapshot.js";
export { renderTypeScriptProjectHarnessJson } from "./render/json.js";
export {
  renderTypeScriptReasoningTree,
  renderTypeScriptProjectHarnessAgentSnapshot,
} from "./render/agent-snapshot.js";
export type { TypeScriptRenderOptions } from "./render/agent-snapshot.js";
