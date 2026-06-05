/**
 * Import parser facade for TypeScript modules.
 *
 * This module exposes import and resolution fact collection without requiring
 * callers to know the source-file parser layout.
 */
export type { TypeScriptImportFact, TypeScriptNativeImportResolutionFact } from "../model.js";
export { collectImportFacts } from "./source_file.js";
