/**
 * Semantic-search hit helper facade.
 */

export {
  dependencyEdge,
  dependencyHit,
  dependencyImportMatch,
  dependencyImportMatches,
  dependencyManifestHit,
  dependencyManifestMatch,
  dependencyManifestMatches,
  dependencyMatchReasonAndScore,
  dependencyNodesForMatches,
  dependencyPackageRoots,
  isDependencyImport,
  packageRootFromSpecifier,
} from "./hit-dependency.js";
export type { DependencyImportMatch, DependencyManifestMatch } from "./hit-dependency.js";
export {
  callsiteHit,
  callsiteHits,
  importEdges,
  importHit,
  importHits,
  symbolHit,
  symbolHits,
  textHits,
  textQuerySetHits,
} from "./hit-search.js";
export { testEdges, testHits } from "./hit-tests.js";
export { ownersForHits, ownersForPaths, uniqueOwners } from "./owners.js";
