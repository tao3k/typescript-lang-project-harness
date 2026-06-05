/**
 * Public runner facade for TypeScript harness execution.
 *
 * This module re-exports project run, assertion, and verification entrypoints
 * while keeping parser and policy internals behind stable APIs.
 */
export {
  runTypeScriptProjectHarness,
  runTypeScriptProjectHarnessAgentSnapshot,
  buildTypeScriptProjectHarnessAgentSnapshot,
} from "./runner/run-project.js";
export { runTypeScriptLangHarness, assertTypeScriptLangHarnessClean } from "./runner/run-paths.js";
export {
  assertTypeScriptProjectHarnessClean,
  assertTypeScriptProjectHarnessAgentClean,
  assertTypeScriptProjectHarnessEmbeddedClean,
} from "./runner/assert-clean.js";
export type { TypeScriptProjectHarnessEmbeddedOptions } from "./runner/run-project.js";
