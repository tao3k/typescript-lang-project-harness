/**
 * Export parser facade for TypeScript public API facts.
 *
 * This module re-exports export and public data shape collectors owned by the
 * native parser layer.
 */
export type { TypeScriptExportFact } from "../model.js";
export type {
  TypeScriptPublicDataFieldFact,
  TypeScriptPublicTypeAliasFact,
  TypeScriptPublicDiscriminatedUnionVariantFieldFact,
  TypeScriptPublicTupleApiSurfaceFact,
} from "../model.js";
export {
  collectPublicDataFields,
  collectPublicTypeAliases,
  collectPublicDiscriminatedUnionVariantFields,
} from "./native_syntax/data_shape.js";
