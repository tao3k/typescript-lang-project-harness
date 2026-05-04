import { DEFAULT_IGNORED_DIR_NAMES } from "./parser.js";
import type {
  TypeScriptDiagnosticSeverity,
  TypeScriptHarnessConfig,
  TypeScriptRulePack,
} from "./model.js";

export function defaultTypeScriptHarnessConfig(): TypeScriptHarnessConfig {
  return {
    ignoredDirNames: [...DEFAULT_IGNORED_DIR_NAMES],
    includeTests: true,
    sourceDirNames: ["src"],
    testDirNames: ["tests"],
    blockingSeverities: ["warning", "error"],
    disabledRuleIds: [],
    disabledRulePacks: [],
    ruleSeverityOverrides: {},
    rulePackSeverityOverrides: {},
    blockingRuleIds: [],
  };
}

export function withDisabledTypeScriptRule(
  config: TypeScriptHarnessConfig,
  ruleId: string,
): TypeScriptHarnessConfig {
  return cloneTypeScriptHarnessConfig(config, {
    disabledRuleIds: appendUnique(config.disabledRuleIds, ruleId),
  });
}

export function withDisabledTypeScriptRules(
  config: TypeScriptHarnessConfig,
  ruleIds: readonly string[],
): TypeScriptHarnessConfig {
  return cloneTypeScriptHarnessConfig(config, {
    disabledRuleIds: appendUniqueMany(config.disabledRuleIds, ruleIds),
  });
}

export function withDisabledTypeScriptRulePack(
  config: TypeScriptHarnessConfig,
  rulePack: TypeScriptRulePack,
): TypeScriptHarnessConfig {
  return cloneTypeScriptHarnessConfig(config, {
    disabledRulePacks: appendUnique(config.disabledRulePacks, rulePack),
  });
}

export function withTypeScriptRuleSeverity(
  config: TypeScriptHarnessConfig,
  ruleId: string,
  severity: TypeScriptDiagnosticSeverity,
): TypeScriptHarnessConfig {
  return cloneTypeScriptHarnessConfig(config, {
    ruleSeverityOverrides: { ...config.ruleSeverityOverrides, [ruleId]: severity },
  });
}

export function withTypeScriptRulePackSeverity(
  config: TypeScriptHarnessConfig,
  rulePack: TypeScriptRulePack,
  severity: TypeScriptDiagnosticSeverity,
): TypeScriptHarnessConfig {
  return cloneTypeScriptHarnessConfig(config, {
    rulePackSeverityOverrides: { ...config.rulePackSeverityOverrides, [rulePack]: severity },
  });
}

export function withTypeScriptBlockingSeverities(
  config: TypeScriptHarnessConfig,
  severities: readonly TypeScriptDiagnosticSeverity[],
): TypeScriptHarnessConfig {
  return cloneTypeScriptHarnessConfig(config, {
    blockingSeverities: [...severities],
  });
}

function cloneTypeScriptHarnessConfig(
  config: TypeScriptHarnessConfig,
  overrides: Partial<TypeScriptHarnessConfig> = {},
): TypeScriptHarnessConfig {
  return {
    ignoredDirNames: [...(overrides.ignoredDirNames ?? config.ignoredDirNames)],
    includeTests: overrides.includeTests ?? config.includeTests,
    sourceDirNames: [...(overrides.sourceDirNames ?? config.sourceDirNames)],
    testDirNames: [...(overrides.testDirNames ?? config.testDirNames)],
    blockingSeverities: [...(overrides.blockingSeverities ?? config.blockingSeverities)],
    disabledRuleIds: [...(overrides.disabledRuleIds ?? config.disabledRuleIds)],
    disabledRulePacks: [...(overrides.disabledRulePacks ?? config.disabledRulePacks)],
    ruleSeverityOverrides: {
      ...(overrides.ruleSeverityOverrides ?? config.ruleSeverityOverrides),
    },
    rulePackSeverityOverrides: {
      ...(overrides.rulePackSeverityOverrides ?? config.rulePackSeverityOverrides),
    },
    blockingRuleIds: [...(overrides.blockingRuleIds ?? config.blockingRuleIds)],
  };
}

function appendUnique<T>(values: readonly T[], value: T): readonly T[] {
  return values.includes(value) ? [...values] : [...values, value];
}

function appendUniqueMany<T>(values: readonly T[], newValues: readonly T[]): readonly T[] {
  let merged = [...values];
  for (const value of newValues) {
    if (!merged.includes(value)) {
      merged = [...merged, value];
    }
  }
  return merged;
}
