import type {
  TypeScriptHarnessFinding,
  TypeScriptHarnessRule,
  TypeScriptPublicDataFieldFact,
  TypeScriptReasoningModule,
  TypeScriptReasoningTree,
} from "../../model.js";

export const TS_AGENT_R009: TypeScriptHarnessRule = {
  ruleId: "TS-AGENT-R009",
  packId: "typescript.agent_policy",
  severity: "info",
  title: "Public data surface exposes primitive semantic fields",
  requirement:
    "Wrap repeated public semantic primitive fields in named domain types or make the raw DTO boundary explicit so agents preserve data invariants instead of extending stringly typed state.",
  labels: { surface: "agent", parser: "native-syntax" },
};

export function evaluateNativeDataShapeAdvice(
  reasoningTree: TypeScriptReasoningTree,
): TypeScriptHarnessFinding[] {
  return sourceModules(reasoningTree)
    .filter((moduleReport) => moduleReport.layer !== "model")
    .flatMap((moduleReport) => publicDataFieldAdvice(moduleReport))
    .sort((left, right) => findingSortKey(left).localeCompare(findingSortKey(right)));
}

function publicDataFieldAdvice(
  moduleReport: TypeScriptReasoningModule,
): TypeScriptHarnessFinding[] {
  const rule = TS_AGENT_R009;
  return groupedDataFields(moduleReport.publicDataFields).flatMap((fields) => {
    const semanticFields = fields.filter(publicDataFieldContractType);
    const first = semanticFields[0];
    if (first === undefined || semanticFields.length < 3) {
      return [];
    }
    return [
      {
        ruleId: rule.ruleId,
        packId: rule.packId,
        severity: rule.severity,
        title: rule.title,
        summary: `Public ${first.typeKind} '${first.typeName}' exposes primitive semantic fields: ${semanticFields
          .map((field) => `${field.fieldName}: ${publicDataFieldContractType(field)}`)
          .join(", ")}.`,
        location: first.location,
        requirement: rule.requirement,
        ...sourceLineField(first.sourceLine),
        label: "public primitive data fields",
        labels: rule.labels,
      },
    ];
  });
}

function publicDataFieldContractType(field: TypeScriptPublicDataFieldFact): string | undefined {
  if (isSemanticPublicDataField(field.fieldName)) {
    return field.primitiveContractType ?? field.flagContractType;
  }
  return field.flagContractType !== undefined && isPublicFlagField(field.fieldName)
    ? field.flagContractType
    : undefined;
}

function groupedDataFields(
  fields: readonly TypeScriptPublicDataFieldFact[],
): readonly (readonly TypeScriptPublicDataFieldFact[])[] {
  const groups = new Map<string, TypeScriptPublicDataFieldFact[]>();
  for (const field of fields) {
    const key = `${field.typeKind}\0${field.typeName}\0${field.typeLine}`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, [field]);
      continue;
    }
    existing.push(field);
  }
  return [...groups.values()];
}

function isSemanticPublicDataField(name: string): boolean {
  return (
    isSemanticIdentifier(name) ||
    matchesSemanticFieldName(name, ["path", "url", "uri", "key", "token"]) ||
    hasSemanticSuffix(name, [
      "path",
      "url",
      "uri",
      "key",
      "token",
      "ms",
      "secs",
      "seconds",
      "bytes",
    ])
  );
}

function isSemanticIdentifier(name: string): boolean {
  return name === "id" || name.endsWith("_id") || name.endsWith("Id");
}

function isPublicFlagField(name: string): boolean {
  return (
    name === "enabled" ||
    name === "disabled" ||
    startsWithAny(name, ["is_", "has_", "can_", "allow_", "include_", "should_"]) ||
    /^(is|has|can|allow|include|should|enable|disable)[A-Z]/u.test(name)
  );
}

function matchesSemanticFieldName(name: string, names: readonly string[]): boolean {
  return names.includes(name);
}

function hasSemanticSuffix(name: string, suffixes: readonly string[]): boolean {
  return suffixes.some(
    (suffix) => name.endsWith(`_${suffix}`) || endsWithPascalSuffix(name, suffix),
  );
}

function endsWithPascalSuffix(name: string, suffix: string): boolean {
  const pascalSuffix = `${suffix[0]?.toUpperCase() ?? ""}${suffix.slice(1)}`;
  return pascalSuffix.length > 0 && name.endsWith(pascalSuffix);
}

function startsWithAny(value: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function sourceModules(tree: TypeScriptReasoningTree): readonly TypeScriptReasoningModule[] {
  return tree.modules.filter(
    (moduleReport) =>
      moduleReport.isValid &&
      moduleReport.role !== "test" &&
      moduleReport.role !== "declaration" &&
      moduleReport.role !== "config",
  );
}

function findingSortKey(finding: TypeScriptHarnessFinding): string {
  return `${finding.ruleId}\0${finding.location.path ?? ""}\0${finding.location.line}\0${finding.summary}`;
}

function sourceLineField(sourceLine: string | undefined): { readonly sourceLine?: string } {
  return sourceLine === undefined ? {} : { sourceLine };
}
