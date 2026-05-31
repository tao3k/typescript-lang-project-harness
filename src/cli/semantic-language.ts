/**
 * Semantic language registry metadata for the TypeScript provider.
 */

export const SEMANTIC_LANGUAGE_REGISTRY_ID =
  "agent.semantic-protocols.semantic-language-registry" as const;
export const SEMANTIC_LANGUAGE_REGISTRY_VERSION = "1" as const;
export const SEMANTIC_LANGUAGE_PROTOCOL_ID = "agent.semantic-protocols.semantic-language" as const;
export const SEMANTIC_LANGUAGE_PROTOCOL_VERSION = "1" as const;
export const SEMANTIC_SEARCH_PACKET_SCHEMA_ID =
  "agent.semantic-protocols.semantic-search-packet" as const;
export const TYPE_SCRIPT_LANGUAGE_ID = "typescript" as const;
export const TYPE_SCRIPT_PROVIDER_ID = "ts-harness" as const;
export const TYPE_SCRIPT_BINARY = "ts-harness" as const;
export const TYPE_SCRIPT_PROVIDER_NAMESPACE =
  "agent.semantic-protocols.languages.typescript.ts-harness" as const;

export const TYPE_SCRIPT_SEARCH_VIEW_DESCRIPTORS = [
  searchView("workspace", { requiresQuery: false, acceptsStdin: false }),
  searchView("prime", { requiresQuery: false, acceptsStdin: false }),
  searchView("owner", { requiresQuery: true, acceptsStdin: false }),
  searchView("dependency", { requiresQuery: true, acceptsStdin: false }),
  searchView("deps", { requiresQuery: true, acceptsStdin: false }),
  searchView("symbol", { requiresQuery: true, acceptsStdin: false }),
  searchView("callsite", { requiresQuery: true, acceptsStdin: false }),
  searchView("import", { requiresQuery: true, acceptsStdin: false }),
  searchView("tests", { requiresQuery: true, acceptsStdin: false }),
  searchView("text", { requiresQuery: true, acceptsStdin: false }),
  searchView("ingest", { requiresQuery: false, acceptsStdin: true }),
] as const;
export const TYPE_SCRIPT_SEARCH_METHODS = TYPE_SCRIPT_SEARCH_VIEW_DESCRIPTORS.map(
  (descriptor) => descriptor.method,
);

export const TYPE_SCRIPT_CHECK_METHODS = ["check/changed", "check/full"] as const;
export const TYPE_SCRIPT_AGENT_METHODS = ["agent/doctor"] as const;

export type TypeScriptSemanticSearchView =
  (typeof TYPE_SCRIPT_SEARCH_VIEW_DESCRIPTORS)[number]["view"];
export type TypeScriptSemanticSearchMethod =
  (typeof TYPE_SCRIPT_SEARCH_VIEW_DESCRIPTORS)[number]["method"];
export type TypeScriptSemanticLanguageMethod =
  | TypeScriptSemanticSearchMethod
  | (typeof TYPE_SCRIPT_CHECK_METHODS)[number]
  | (typeof TYPE_SCRIPT_AGENT_METHODS)[number];
export type SemanticLanguageCommand = "search" | "check" | "agent";

export interface SemanticLanguageRegistryDocument {
  readonly registryId: typeof SEMANTIC_LANGUAGE_REGISTRY_ID;
  readonly registryVersion: typeof SEMANTIC_LANGUAGE_REGISTRY_VERSION;
  readonly protocolId: typeof SEMANTIC_LANGUAGE_PROTOCOL_ID;
  readonly protocolVersion: typeof SEMANTIC_LANGUAGE_PROTOCOL_VERSION;
  readonly projectRoot?: string;
  readonly languages: readonly SemanticLanguageRegistration[];
}

export interface SemanticLanguageRegistration {
  readonly languageId: typeof TYPE_SCRIPT_LANGUAGE_ID;
  readonly providerId: typeof TYPE_SCRIPT_PROVIDER_ID;
  readonly binary: typeof TYPE_SCRIPT_BINARY;
  readonly namespace: typeof TYPE_SCRIPT_PROVIDER_NAMESPACE;
  readonly displayName: "TypeScript";
  readonly methods: readonly TypeScriptSemanticLanguageMethod[];
  readonly methodDescriptors: readonly SemanticLanguageMethodDescriptor[];
  readonly schemas: readonly SemanticLanguageSchemaRegistration[];
}

export interface SemanticLanguageMethodDescriptor {
  readonly method: TypeScriptSemanticLanguageMethod;
  readonly command: SemanticLanguageCommand;
  readonly view?: string;
  readonly outputSchemaIds?: readonly string[];
  readonly requiresQuery?: boolean;
  readonly acceptsStdin?: boolean;
  readonly supportsPackageScope?: boolean;
  readonly supportsJson: boolean;
  readonly supportsCompact: boolean;
}

export interface TypeScriptSemanticSearchViewDescriptor {
  readonly method: TypeScriptSemanticSearchMethod;
  readonly command: "search";
  readonly view: TypeScriptSemanticSearchView;
  readonly requiresQuery: boolean;
  readonly acceptsStdin: boolean;
  readonly supportsPackageScope: true;
}

export interface SemanticLanguageSchemaRegistration {
  readonly schemaId: string;
  readonly schemaVersion: string;
  readonly path: string;
}

export function semanticLanguageRegistryDocument(
  projectRoot?: string,
): SemanticLanguageRegistryDocument {
  return {
    registryId: SEMANTIC_LANGUAGE_REGISTRY_ID,
    registryVersion: SEMANTIC_LANGUAGE_REGISTRY_VERSION,
    protocolId: SEMANTIC_LANGUAGE_PROTOCOL_ID,
    protocolVersion: SEMANTIC_LANGUAGE_PROTOCOL_VERSION,
    ...(projectRoot === undefined ? {} : { projectRoot }),
    languages: [typeScriptSemanticLanguageRegistration()],
  };
}

export function typeScriptSemanticLanguageRegistration(): SemanticLanguageRegistration {
  return {
    languageId: TYPE_SCRIPT_LANGUAGE_ID,
    providerId: TYPE_SCRIPT_PROVIDER_ID,
    binary: TYPE_SCRIPT_BINARY,
    namespace: TYPE_SCRIPT_PROVIDER_NAMESPACE,
    displayName: "TypeScript",
    methods: [
      ...TYPE_SCRIPT_SEARCH_METHODS,
      ...TYPE_SCRIPT_CHECK_METHODS,
      ...TYPE_SCRIPT_AGENT_METHODS,
    ],
    methodDescriptors: typeScriptSemanticLanguageMethodDescriptors(),
    schemas: [
      {
        schemaId: SEMANTIC_SEARCH_PACKET_SCHEMA_ID,
        schemaVersion: "1",
        path: "schemas/semantic-search-packet.v1.schema.json",
      },
      {
        schemaId: SEMANTIC_LANGUAGE_REGISTRY_ID,
        schemaVersion: SEMANTIC_LANGUAGE_REGISTRY_VERSION,
        path: "schemas/semantic-language-registry.v1.schema.json",
      },
    ],
  };
}

export function typeScriptSemanticSearchViewDescriptor(
  view: string,
): TypeScriptSemanticSearchViewDescriptor | undefined {
  return TYPE_SCRIPT_SEARCH_VIEW_DESCRIPTORS.find((descriptor) => descriptor.view === view);
}

export function isTypeScriptSemanticSearchView(view: string): view is TypeScriptSemanticSearchView {
  return typeScriptSemanticSearchViewDescriptor(view) !== undefined;
}

function typeScriptSemanticLanguageMethodDescriptors(): readonly SemanticLanguageMethodDescriptor[] {
  return [
    ...TYPE_SCRIPT_SEARCH_VIEW_DESCRIPTORS.map((descriptor) => ({
      ...descriptor,
      outputSchemaIds: [SEMANTIC_SEARCH_PACKET_SCHEMA_ID],
      supportsJson: true,
      supportsCompact: true,
    })),
    ...TYPE_SCRIPT_CHECK_METHODS.map((method) => ({
      method,
      command: "check" as const,
      supportsJson: true,
      supportsCompact: true,
    })),
    ...TYPE_SCRIPT_AGENT_METHODS.map((method) => ({
      method,
      command: "agent" as const,
      outputSchemaIds: [SEMANTIC_LANGUAGE_REGISTRY_ID],
      supportsJson: true,
      supportsCompact: true,
    })),
  ];
}

function searchView<const View extends string>(
  view: View,
  options: {
    readonly requiresQuery: boolean;
    readonly acceptsStdin: boolean;
  },
): {
  readonly method: `search/${View}`;
  readonly command: "search";
  readonly view: View;
  readonly requiresQuery: boolean;
  readonly acceptsStdin: boolean;
  readonly supportsPackageScope: true;
} {
  return {
    method: semanticSearchMethod(view),
    command: "search",
    view,
    ...options,
    supportsPackageScope: true,
  };
}

export function semanticSearchMethod<const View extends string>(view: View): `search/${View}` {
  return `search/${view}`;
}
