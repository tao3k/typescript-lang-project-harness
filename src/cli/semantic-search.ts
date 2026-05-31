/**
 * Public facade for TypeScript semantic-search packet building and rendering.
 */

export { buildSemanticSearchPacket } from "./semantic-search/build.js";
export {
  renderSemanticSearchPacket,
  renderSemanticSearchPacketJson,
} from "./semantic-search/render.js";
export type {
  SemanticSearchBuildOptions,
  SemanticSearchEdge,
  SemanticSearchEdgeKind,
  SemanticSearchFact,
  SemanticSearchFieldValue,
  SemanticSearchFields,
  SemanticSearchFinding,
  SemanticSearchHeader,
  SemanticSearchHit,
  SemanticSearchHitKind,
  SemanticSearchInputDetection,
  SemanticSearchInputSource,
  SemanticSearchItem,
  SemanticSearchItemKind,
  SemanticSearchLocation,
  SemanticSearchNextAction,
  SemanticSearchNextActionKind,
  SemanticSearchNode,
  SemanticSearchNote,
  SemanticSearchNoteKind,
  SemanticSearchOwner,
  SemanticSearchPacket,
  SemanticSearchRenderMode,
  SemanticSearchView,
} from "./semantic-search/types.js";
