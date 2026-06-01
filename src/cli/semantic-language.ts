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
export const TYPE_SCRIPT_CAPABILITIES_SCHEMA_ID =
  "agent.semantic-protocols.languages.typescript.ts-harness.capabilities" as const;
export const TYPE_SCRIPT_LANGUAGE_ID = "typescript" as const;
export const TYPE_SCRIPT_PROVIDER_ID = "ts-harness" as const;
export const TYPE_SCRIPT_BINARY = "ts-harness" as const;
export const TYPE_SCRIPT_PROVIDER_NAMESPACE =
  "agent.semantic-protocols.languages.typescript.ts-harness" as const;

export type TypeScriptSemanticSearchView =
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
export type TypeScriptSemanticSearchMethod = `search/${TypeScriptSemanticSearchView}`;

export const TYPE_SCRIPT_SEARCH_VIEW_DESCRIPTORS = [
  searchView("workspace", {
    requiresQuery: false,
    acceptsStdin: false,
    capabilities: [semanticCapability("workspace-router")],
  }),
  searchView("prime", {
    requiresQuery: false,
    acceptsStdin: false,
    capabilities: [semanticCapability("package-prime-map")],
  }),
  searchView("owner", {
    requiresQuery: true,
    acceptsStdin: false,
    capabilities: [
      semanticCapability("reasoning-owner-search"),
      typeScriptCapability("parser-visible-module-owner-search"),
      typeScriptCapability("test-owner-search"),
      semanticCapability("path-owner-fallback"),
    ],
    ingestRequiredFor: [typeScriptIngestSurface("non-parser-path")],
  }),
  searchView("dependency", {
    requiresQuery: true,
    acceptsStdin: false,
    capabilities: [
      semanticCapability("dependency-manifest-search"),
      typeScriptCapability("dependency-local-usage-search"),
    ],
  }),
  searchView("deps", {
    requiresQuery: true,
    acceptsStdin: false,
    capabilities: [
      semanticCapability("dependency-manifest-search"),
      typeScriptCapability("dependency-local-usage-search"),
      semanticCapability("dependency-version-scope"),
      typeScriptCapability("dependency-api-token-usage-search"),
    ],
  }),
  searchView("api", {
    requiresQuery: true,
    acceptsStdin: false,
    capabilities: [
      typeScriptCapability("exported-api-shape-search"),
      typeScriptCapability("public-function-api-shape-search"),
      typeScriptCapability("public-data-api-shape-search"),
      semanticCapability("dependency-version-scope"),
    ],
    ingestRequiredFor: [typeScriptIngestSurface("external-api-docs")],
  }),
  searchView("public-external-types", {
    requiresQuery: true,
    acceptsStdin: false,
    capabilities: [
      semanticCapability("dependency-manifest-search"),
      typeScriptCapability("public-external-type-search"),
      typeScriptCapability("public-api-type-text-search"),
    ],
  }),
  searchView("symbol", {
    requiresQuery: true,
    acceptsStdin: false,
    capabilities: [typeScriptCapability("symbol-export-search")],
  }),
  searchView("callsite", {
    requiresQuery: true,
    acceptsStdin: false,
    capabilities: [typeScriptCapability("owner-callsite-search")],
  }),
  searchView("import", {
    requiresQuery: true,
    acceptsStdin: false,
    capabilities: [typeScriptCapability("import-edge-search")],
  }),
  searchView("tests", {
    requiresQuery: true,
    acceptsStdin: false,
    capabilities: [typeScriptCapability("test-owner-search")],
  }),
  searchView("text", {
    requiresQuery: true,
    acceptsStdin: false,
    acceptedPipes: ["owner", "tests"],
    supportsQuerySet: true,
    acceptedQuerySetSelectors: ["exact-set"],
    querySetScopes: ["project", "owner"],
    capabilities: [
      semanticCapability("owner-path-text-search"),
      typeScriptCapability("export-text-search"),
      typeScriptCapability("parser-visible-source-text-search"),
    ],
    ingestRequiredFor: [
      typeScriptIngestSurface("non-parser-text"),
      typeScriptIngestSurface("docs-text"),
      typeScriptIngestSurface("schema-json"),
      typeScriptIngestSurface("generated-artifact"),
    ],
  }),
  searchView("ingest", {
    requiresQuery: false,
    acceptsStdin: true,
    capabilities: [
      semanticCapability("external-candidate-ingest"),
      semanticCapability("stdin-shape-detection"),
      semanticCapability("owner-grouped-ingest"),
    ],
  }),
] as const;
export const TYPE_SCRIPT_SEARCH_METHODS = TYPE_SCRIPT_SEARCH_VIEW_DESCRIPTORS.map(
  (descriptor) => descriptor.method,
);

export const TYPE_SCRIPT_CHECK_METHODS = ["check/changed", "check/full"] as const;
export const TYPE_SCRIPT_AGENT_METHODS = ["agent/doctor"] as const;

export type TypeScriptSemanticLanguageMethod =
  | TypeScriptSemanticSearchMethod
  | (typeof TYPE_SCRIPT_CHECK_METHODS)[number]
  | (typeof TYPE_SCRIPT_AGENT_METHODS)[number];
export type SemanticLanguageCommand = "search" | "check" | "agent";
export type SemanticLanguageCapabilityNamespace = "semantic" | typeof TYPE_SCRIPT_LANGUAGE_ID;

export interface SemanticLanguageCapabilityDescriptor {
  readonly languageId: typeof TYPE_SCRIPT_LANGUAGE_ID;
  readonly namespace: SemanticLanguageCapabilityNamespace;
  readonly name: string;
}

export interface SemanticLanguageIngestSurfaceDescriptor {
  readonly languageId: typeof TYPE_SCRIPT_LANGUAGE_ID;
  readonly namespace: SemanticLanguageCapabilityNamespace;
  readonly name: string;
}

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
  readonly supportsQuerySet?: boolean;
  readonly acceptedQuerySetSelectors?: readonly ("exact-set" | "prefix-set" | "stdin-path-set")[];
  readonly querySetScopes?: readonly ("project" | "package" | "owner")[];
  readonly acceptedPipes?: readonly TypeScriptSemanticSearchView[];
  readonly capabilities?: readonly SemanticLanguageCapabilityDescriptor[];
  readonly ingestRequiredFor?: readonly SemanticLanguageIngestSurfaceDescriptor[];
  readonly clients?: readonly string[];
  readonly requiredOptions?: readonly string[];
  readonly input?: string;
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
  readonly supportsQuerySet?: boolean;
  readonly acceptedQuerySetSelectors?: readonly ("exact-set" | "prefix-set" | "stdin-path-set")[];
  readonly querySetScopes?: readonly ("project" | "package" | "owner")[];
  readonly acceptedPipes?: readonly TypeScriptSemanticSearchView[];
  readonly capabilities: readonly SemanticLanguageCapabilityDescriptor[];
  readonly ingestRequiredFor?: readonly SemanticLanguageIngestSurfaceDescriptor[];
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
      {
        schemaId: TYPE_SCRIPT_CAPABILITIES_SCHEMA_ID,
        schemaVersion: "1",
        path: "schemas/typescript-semantic-capabilities.v1.schema.json",
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
      supportsCompact: true,
      supportsJson: true,
    })),
  ];
}

function searchView<const View extends string>(
  view: View,
  options: {
    readonly requiresQuery: boolean;
    readonly acceptsStdin: boolean;
    readonly acceptedPipes?: readonly TypeScriptSemanticSearchView[];
    readonly supportsQuerySet?: boolean;
    readonly acceptedQuerySetSelectors?: readonly ("exact-set" | "prefix-set" | "stdin-path-set")[];
    readonly querySetScopes?: readonly ("project" | "package" | "owner")[];
    readonly capabilities: readonly SemanticLanguageCapabilityDescriptor[];
    readonly ingestRequiredFor?: readonly SemanticLanguageIngestSurfaceDescriptor[];
  },
): {
  readonly method: `search/${View}`;
  readonly command: "search";
  readonly view: View;
  readonly requiresQuery: boolean;
  readonly acceptsStdin: boolean;
  readonly supportsPackageScope: true;
  readonly supportsQuerySet?: boolean;
  readonly acceptedQuerySetSelectors?: readonly ("exact-set" | "prefix-set" | "stdin-path-set")[];
  readonly querySetScopes?: readonly ("project" | "package" | "owner")[];
  readonly acceptedPipes?: readonly TypeScriptSemanticSearchView[];
  readonly capabilities: readonly SemanticLanguageCapabilityDescriptor[];
  readonly ingestRequiredFor?: readonly SemanticLanguageIngestSurfaceDescriptor[];
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

function semanticCapability(name: string): SemanticLanguageCapabilityDescriptor {
  return capability("semantic", name);
}

function typeScriptCapability(name: string): SemanticLanguageCapabilityDescriptor {
  return capability(TYPE_SCRIPT_LANGUAGE_ID, name);
}

function typeScriptIngestSurface(name: string): SemanticLanguageIngestSurfaceDescriptor {
  return capability(TYPE_SCRIPT_LANGUAGE_ID, name);
}

function capability(
  namespace: SemanticLanguageCapabilityNamespace,
  name: string,
): SemanticLanguageCapabilityDescriptor {
  return {
    languageId: TYPE_SCRIPT_LANGUAGE_ID,
    namespace,
    name,
  };
}
