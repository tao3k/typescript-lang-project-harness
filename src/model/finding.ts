/**
 * Finding model facade for TypeScript harness diagnostics.
 *
 * This module re-exports diagnostic, rule, and finding types that form the
 * public advice payload boundary.
 */
export type {
  SourceLocation,
  TypeScriptDiagnosticSeverity,
  TypeScriptHarnessFinding,
} from "../model.js";
export {
  blockingFindings,
  advisoryFindings,
  isTypeScriptHarnessClean,
  fileCount,
  parsedCount,
} from "../model.js";
