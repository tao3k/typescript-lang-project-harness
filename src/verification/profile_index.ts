/**
 * Public verification profile index facade.
 *
 * This module re-exports profile-index builders and renderers that summarize
 * parser-owned verification responsibility hints.
 */
export {
  buildTypeScriptVerificationProfileIndex,
  buildTypeScriptVerificationProfileIndexForReport,
  buildTypeScriptVerificationProfileIndexWithConfig,
} from "./profile_index/build.js";
export {
  activeTypeScriptVerificationProfileCandidates,
  activeTypeScriptVerificationProfileHints,
  typeScriptVerificationProfileIndexIsClear,
} from "./profile_index/model.js";
export {
  renderTypeScriptVerificationProfileIndex,
  renderTypeScriptVerificationProfileIndexJson,
} from "./profile_index/render.js";
