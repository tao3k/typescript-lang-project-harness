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
