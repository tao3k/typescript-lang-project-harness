/**
 * Public semantic-search packet model shared by TypeScript CLI views.
 *
 * The model mirrors the language-neutral JSON Schema while retaining
 * TypeScript literal unions for agent-visible states.
 */

export type SemanticSearchView =
  | "workspace"
  | "prime"
  | "owner"
  | "dependency"
  | "deps"
  | "api"
  | "public-external-types"
  | "symbol"
  | "callsite"
  | "import"
  | "tests"
  | "text"
  | "ingest";
export type SemanticSearchRenderMode = "graph" | "hits" | "both" | "seeds";
export type SemanticSearchInputSource =
  | "rg-n"
  | "vimgrep"
  | "rg-json"
  | "path-list"
  | "path-list-nul"
  | "diff-paths"
  | "unknown";

export interface SemanticSearchBuildOptions {
  readonly view: SemanticSearchView;
  readonly renderMode?: SemanticSearchRenderMode;
  readonly query?: string;
  readonly pipes?: readonly SemanticSearchView[];
  readonly stdin?: string;
}

export interface SemanticSearchPacket {
  readonly schemaId: "agent.semantic-protocols.semantic-search-packet";
  readonly schemaVersion: "1";
  readonly protocolId: "agent.semantic-protocols.semantic-language";
  readonly protocolVersion: "1";
  readonly languageId: "typescript";
  readonly providerId: "ts-harness";
  readonly binary: "ts-harness";
  readonly namespace: "agent.semantic-protocols.languages.typescript.ts-harness";
  readonly method: `search/${SemanticSearchView}`;
  readonly projectRoot: string;
  readonly packageName?: string;
  readonly view: SemanticSearchView;
  readonly renderMode: SemanticSearchRenderMode;
  readonly query?: string;
  readonly header: SemanticSearchHeader;
  readonly inputDetection?: SemanticSearchInputDetection;
  readonly packages?: readonly SemanticSearchFact[];
  readonly nodes: readonly SemanticSearchNode[];
  readonly edges: readonly SemanticSearchEdge[];
  readonly owners: readonly SemanticSearchOwner[];
  readonly items?: readonly SemanticSearchItem[];
  readonly hits: readonly SemanticSearchHit[];
  readonly findings: readonly SemanticSearchFinding[];
  readonly nextActions: readonly SemanticSearchNextAction[];
  readonly notes: readonly SemanticSearchNote[];
}

export interface SemanticSearchPacketPayload {
  readonly header: SemanticSearchHeader;
  readonly inputDetection?: SemanticSearchInputDetection;
  readonly packages?: readonly SemanticSearchFact[];
  readonly nodes: readonly SemanticSearchNode[];
  readonly edges: readonly SemanticSearchEdge[];
  readonly owners: readonly SemanticSearchOwner[];
  readonly hits: readonly SemanticSearchHit[];
  readonly findings: readonly SemanticSearchFinding[];
  readonly nextActions: readonly SemanticSearchNextAction[];
  readonly notes: readonly SemanticSearchNote[];
}

export interface SemanticSearchHeader {
  readonly kind: `search-${SemanticSearchView}`;
  readonly fields: SemanticSearchFields;
}

export interface SemanticSearchInputDetection {
  readonly source: SemanticSearchInputSource;
  readonly lineCount: number;
  readonly byteCount: number;
  readonly sample?: string;
}

export type SemanticSearchFieldValue =
  | string
  | number
  | boolean
  | readonly (string | number | boolean)[];
export type SemanticSearchFields = Readonly<Record<string, SemanticSearchFieldValue>>;

export interface SemanticSearchFact {
  readonly id: string;
  readonly fields: SemanticSearchFields;
}

export interface SemanticSearchNode {
  readonly id: string;
  readonly kind: "package" | "owner" | "dependency" | "test" | "finding" | "symbol";
  readonly path?: string;
  readonly fields: SemanticSearchFields;
}

export type SemanticSearchEdgeKind =
  | "import"
  | "unresolved-import"
  | "dependency"
  | "workspace"
  | "test";

export interface SemanticSearchEdge {
  readonly from: string;
  readonly kind: SemanticSearchEdgeKind;
  readonly to: string;
  readonly label?: string;
  readonly location?: SemanticSearchLocation;
  readonly fields?: SemanticSearchFields;
}

export interface SemanticSearchOwner {
  readonly path: string;
  readonly namespace?: string;
  readonly role: string;
  readonly public: boolean;
  readonly exports?: readonly string[];
  readonly nextActions?: readonly SemanticSearchNextAction[];
  readonly fields: SemanticSearchFields;
}

export type SemanticSearchItemKind =
  | "symbol"
  | "path"
  | "export"
  | "dependency"
  | "test"
  | "finding";

export interface SemanticSearchItem {
  readonly name: string;
  readonly kind: SemanticSearchItemKind;
  readonly ownerPath: string;
  readonly location?: SemanticSearchLocation;
  readonly fields: SemanticSearchFields;
}

export type SemanticSearchHitKind =
  | "path"
  | "export"
  | "symbol"
  | "callsite"
  | "import"
  | "dependency"
  | "api"
  | "test"
  | "text";

export interface SemanticSearchHit {
  readonly kind: SemanticSearchHitKind;
  readonly ownerPath: string;
  readonly symbol?: string;
  readonly location: SemanticSearchLocation;
  readonly score: number;
  readonly reason: string;
  readonly snippet?: string;
  readonly fields?: SemanticSearchFields;
}

export interface SemanticSearchFinding {
  readonly ruleId: string;
  readonly severity: "info" | "warning" | "error";
  readonly count: number;
  readonly title?: string;
  readonly location: SemanticSearchLocation;
  readonly fields?: SemanticSearchFields;
}

export type SemanticSearchNextActionKind =
  | "workspace"
  | "prime"
  | "owner"
  | "dependency"
  | "deps"
  | "api"
  | "public-external-types"
  | "symbol"
  | "callsite"
  | "import"
  | "tests"
  | "text"
  | "ingest";

export interface SemanticSearchNextAction {
  readonly kind: SemanticSearchNextActionKind;
  readonly target: string;
  readonly scope?: string;
  readonly ownerPath?: string;
  readonly fields?: SemanticSearchFields;
}

export type SemanticSearchNoteKind =
  | "not-found"
  | "empty-query"
  | "fact-scope"
  | "owner-level"
  | "owner-not-found"
  | "unrecognized-input";

export interface SemanticSearchNote {
  readonly kind: SemanticSearchNoteKind;
  readonly message: string;
  readonly fields?: SemanticSearchFields;
}

export interface SemanticSearchLocation {
  readonly path: string;
  readonly line?: number;
  readonly column?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
}

export const MAX_PRIME_OWNERS = 12;
export const MAX_PRIME_EDGES = 24;
export const MAX_FINDINGS = 8;
export const MAX_WORKSPACE_PACKAGES = 24;
export const MAX_WORKSPACE_EDGES = 32;
export const MAX_TEXT_HITS = 20;
export const MAX_SYMBOL_HITS = 20;
export const MAX_IMPORT_HITS = 30;
