type CapabilityExpectation = {
  readonly languageId: string;
  readonly namespace: string;
  readonly name: string;
};

export function expectedSearchCapabilities(method: string): readonly CapabilityExpectation[] {
  switch (method) {
    case "search/workspace":
      return [semanticCapability("workspace-router")];
    case "search/prime":
      return [semanticCapability("package-prime-map")];
    case "search/owner":
      return [
        semanticCapability("reasoning-owner-search"),
        typeScriptCapability("parser-visible-module-owner-search"),
        typeScriptCapability("test-owner-search"),
        semanticCapability("path-owner-fallback"),
        typeScriptCapability("owner-item-query"),
        typeScriptCapability("owner-item-code-projection"),
        typeScriptCapability("owner-top-items-fallback"),
      ];
    case "search/dependency":
      return [
        semanticCapability("dependency-manifest-search"),
        typeScriptCapability("dependency-local-usage-search"),
      ];
    case "search/deps":
      return [
        semanticCapability("dependency-manifest-search"),
        typeScriptCapability("dependency-local-usage-search"),
        semanticCapability("dependency-version-scope"),
        typeScriptCapability("dependency-api-token-usage-search"),
      ];
    case "search/docs":
      return [
        semanticCapability("local-docs-search"),
        semanticCapability("schema-contract-search"),
        typeScriptCapability("local-semantic-schema-search"),
      ];
    case "search/api":
      return [
        typeScriptCapability("exported-api-shape-search"),
        typeScriptCapability("public-function-api-shape-search"),
        typeScriptCapability("public-data-api-shape-search"),
        semanticCapability("dependency-version-scope"),
      ];
    case "search/public-external-types":
      return [
        semanticCapability("dependency-manifest-search"),
        typeScriptCapability("public-external-type-search"),
        typeScriptCapability("public-api-type-text-search"),
      ];
    case "search/policy":
      return [
        semanticCapability("policy-rule-handle-search"),
        typeScriptCapability("typescript-project-policy-rule-handle-search"),
        typeScriptCapability("typescript-agent-policy-rule-handle-search"),
        typeScriptCapability("typescript-extension-policy-rule-handle-search"),
      ];
    case "search/symbol":
      return [typeScriptCapability("symbol-export-search")];
    case "search/callsite":
      return [typeScriptCapability("owner-callsite-search")];
    case "search/import":
      return [typeScriptCapability("import-edge-search")];
    case "search/tests":
      return [typeScriptCapability("test-owner-search")];
    case "search/fzf":
      return [
        semanticCapability("finder-fuzzy-candidate-search"),
        typeScriptCapability("parser-visible-source-fuzzy-search"),
      ];
    case "search/ingest":
      return [
        semanticCapability("external-candidate-ingest"),
        semanticCapability("stdin-shape-detection"),
        semanticCapability("owner-grouped-ingest"),
      ];
    default:
      return [];
  }
}

export function expectedSearchIngestRequiredFor(method: string): readonly CapabilityExpectation[] {
  switch (method) {
    case "search/owner":
      return [typeScriptCapability("non-parser-path")];
    case "search/fzf":
      return [
        typeScriptCapability("non-parser-text"),
        typeScriptCapability("docs-text"),
        typeScriptCapability("schema-json"),
        typeScriptCapability("generated-artifact"),
      ];
    case "search/docs":
      return [typeScriptCapability("external-docs")];
    case "search/api":
      return [typeScriptCapability("external-api-docs")];
    default:
      return [];
  }
}

function semanticCapability(name: string): CapabilityExpectation {
  return { languageId: "typescript", namespace: "semantic", name };
}

function typeScriptCapability(name: string): CapabilityExpectation {
  return { languageId: "typescript", namespace: "typescript", name };
}
