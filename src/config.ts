import { DEFAULT_IGNORED_DIR_NAMES } from "./parser.js";
import type {
  TypeScriptDiagnosticSeverity,
  TypeScriptHarnessConfig,
  TypeScriptRulePack,
} from "./model.js";
import type {
  TypeScriptVerificationDependencySignal,
  TypeScriptOwnerResponsibility,
  TypeScriptVerificationProfileHint,
  TypeScriptVerificationReceipt,
  TypeScriptVerificationSkillBinding,
  TypeScriptVerificationSkillDescriptor,
  TypeScriptVerificationTaskContract,
  TypeScriptVerificationTaskKind,
  TypeScriptVerificationWaiver,
} from "./verification/model.js";

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
    verificationPolicy: defaultTypeScriptVerificationPolicy(),
  };
}

export function defaultTypeScriptVerificationPolicy(): TypeScriptHarnessConfig["verificationPolicy"] {
  return {
    profileHints: [],
    receipts: [],
    waivers: [],
    disabledTaskKinds: [],
    responsibilityTaskOverrides: {},
    taskContractOverrides: {},
    skillBindings: {},
    skillDescriptors: [],
    dependencySignals: [],
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

export function withTypeScriptVerificationProfileHint(
  config: TypeScriptHarnessConfig,
  hint: TypeScriptVerificationProfileHint,
): TypeScriptHarnessConfig {
  return cloneTypeScriptHarnessConfig(config, {
    verificationPolicy: {
      ...config.verificationPolicy,
      profileHints: [...config.verificationPolicy.profileHints, cloneProfileHint(hint)],
    },
  });
}

export function withTypeScriptVerificationReceipt(
  config: TypeScriptHarnessConfig,
  receipt: TypeScriptVerificationReceipt,
): TypeScriptHarnessConfig {
  return cloneTypeScriptHarnessConfig(config, {
    verificationPolicy: {
      ...config.verificationPolicy,
      receipts: [...config.verificationPolicy.receipts, cloneVerificationReceipt(receipt)],
    },
  });
}

export function withTypeScriptVerificationWaiver(
  config: TypeScriptHarnessConfig,
  waiver: TypeScriptVerificationWaiver,
): TypeScriptHarnessConfig {
  return cloneTypeScriptHarnessConfig(config, {
    verificationPolicy: {
      ...config.verificationPolicy,
      waivers: [...config.verificationPolicy.waivers, { ...waiver }],
    },
  });
}

export function withDisabledTypeScriptVerificationTaskKind(
  config: TypeScriptHarnessConfig,
  kind: TypeScriptVerificationTaskKind,
): TypeScriptHarnessConfig {
  return withDisabledTypeScriptVerificationTaskKinds(config, [kind]);
}

export function withDisabledTypeScriptVerificationTaskKinds(
  config: TypeScriptHarnessConfig,
  kinds: readonly TypeScriptVerificationTaskKind[],
): TypeScriptHarnessConfig {
  return cloneTypeScriptHarnessConfig(config, {
    verificationPolicy: {
      ...config.verificationPolicy,
      disabledTaskKinds: appendUniqueMany(config.verificationPolicy.disabledTaskKinds, kinds),
    },
  });
}

export function withTypeScriptVerificationTaskContract(
  config: TypeScriptHarnessConfig,
  kind: TypeScriptVerificationTaskKind,
  contract: TypeScriptVerificationTaskContract,
): TypeScriptHarnessConfig {
  return cloneTypeScriptHarnessConfig(config, {
    verificationPolicy: {
      ...config.verificationPolicy,
      taskContractOverrides: {
        ...config.verificationPolicy.taskContractOverrides,
        [kind]: cloneTaskContract(contract),
      },
    },
  });
}

export function withTypeScriptVerificationResponsibilityTaskKinds(
  config: TypeScriptHarnessConfig,
  responsibility: TypeScriptOwnerResponsibility,
  taskKinds: readonly TypeScriptVerificationTaskKind[],
): TypeScriptHarnessConfig {
  return cloneTypeScriptHarnessConfig(config, {
    verificationPolicy: {
      ...config.verificationPolicy,
      responsibilityTaskOverrides: {
        ...config.verificationPolicy.responsibilityTaskOverrides,
        [responsibility]: [...taskKinds],
      },
    },
  });
}

export function withTypeScriptVerificationSkillBinding(
  config: TypeScriptHarnessConfig,
  kind: TypeScriptVerificationTaskKind,
  binding: TypeScriptVerificationSkillBinding,
): TypeScriptHarnessConfig {
  return cloneTypeScriptHarnessConfig(config, {
    verificationPolicy: {
      ...config.verificationPolicy,
      skillBindings: {
        ...config.verificationPolicy.skillBindings,
        [kind]: { ...binding },
      },
    },
  });
}

export function withTypeScriptVerificationSkillDescriptor(
  config: TypeScriptHarnessConfig,
  descriptor: TypeScriptVerificationSkillDescriptor,
): TypeScriptHarnessConfig {
  return cloneTypeScriptHarnessConfig(config, {
    verificationPolicy: {
      ...config.verificationPolicy,
      skillDescriptors: [
        ...config.verificationPolicy.skillDescriptors.filter(
          (candidate) => skillBindingLabel(candidate) !== skillBindingLabel(descriptor),
        ),
        cloneSkillDescriptor(descriptor),
      ],
    },
  });
}

export function withTypeScriptVerificationDependencySignal(
  config: TypeScriptHarnessConfig,
  signal: TypeScriptVerificationDependencySignal,
): TypeScriptHarnessConfig {
  return cloneTypeScriptHarnessConfig(config, {
    verificationPolicy: {
      ...config.verificationPolicy,
      dependencySignals: [
        ...config.verificationPolicy.dependencySignals,
        cloneDependencySignal(signal),
      ],
    },
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
    verificationPolicy: cloneVerificationPolicy(
      overrides.verificationPolicy ?? config.verificationPolicy,
    ),
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

function cloneVerificationPolicy(
  policy: TypeScriptHarnessConfig["verificationPolicy"],
): TypeScriptHarnessConfig["verificationPolicy"] {
  return {
    profileHints: policy.profileHints.map(cloneProfileHint),
    receipts: policy.receipts.map(cloneVerificationReceipt),
    waivers: policy.waivers.map((waiver) => ({ ...waiver })),
    disabledTaskKinds: [...policy.disabledTaskKinds],
    responsibilityTaskOverrides: Object.fromEntries(
      Object.entries(policy.responsibilityTaskOverrides).map(([responsibility, taskKinds]) => [
        responsibility,
        [...(taskKinds ?? [])],
      ]),
    ),
    taskContractOverrides: Object.fromEntries(
      Object.entries(policy.taskContractOverrides).map(([kind, contract]) => [
        kind,
        contract === undefined ? undefined : cloneTaskContract(contract),
      ]),
    ),
    skillBindings: Object.fromEntries(
      Object.entries(policy.skillBindings).map(([kind, binding]) => [
        kind,
        binding === undefined ? undefined : { ...binding },
      ]),
    ),
    skillDescriptors: policy.skillDescriptors.map(cloneSkillDescriptor),
    dependencySignals: policy.dependencySignals.map(cloneDependencySignal),
  };
}

function cloneProfileHint(
  hint: TypeScriptVerificationProfileHint,
): TypeScriptVerificationProfileHint {
  const cloned: TypeScriptVerificationProfileHint = {
    ownerPath: hint.ownerPath,
    responsibilities: [...hint.responsibilities],
    taskContractOverrides: Object.fromEntries(
      Object.entries(hint.taskContractOverrides).map(([kind, contract]) => [
        kind,
        contract === undefined ? undefined : cloneTaskContract(contract),
      ]),
    ),
  };
  const taskKinds = hint.taskKinds === undefined ? {} : { taskKinds: [...hint.taskKinds] };
  const rationale = hint.rationale === undefined ? {} : { rationale: hint.rationale };
  return { ...cloned, ...taskKinds, ...rationale };
}

function cloneVerificationReceipt(
  receipt: TypeScriptVerificationReceipt,
): TypeScriptVerificationReceipt {
  const summary = receipt.summary === undefined ? {} : { summary: receipt.summary };
  const evidenceUri = receipt.evidenceUri === undefined ? {} : { evidenceUri: receipt.evidenceUri };
  const observedAt = receipt.observedAt === undefined ? {} : { observedAt: receipt.observedAt };
  return {
    ...receipt,
    ...summary,
    ...evidenceUri,
    ...observedAt,
    evidence: receipt.evidence.map((fact) => ({ ...fact })),
  };
}

function cloneTaskContract(
  contract: TypeScriptVerificationTaskContract,
): TypeScriptVerificationTaskContract {
  return {
    phase: contract.phase,
    requiredReceipt: contract.requiredReceipt,
    requiredEvidence: contract.requiredEvidence.map((requirement) => ({ ...requirement })),
  };
}

function cloneSkillDescriptor(
  descriptor: TypeScriptVerificationSkillDescriptor,
): TypeScriptVerificationSkillDescriptor {
  const adapter = descriptor.adapter === undefined ? {} : { adapter: descriptor.adapter };
  return {
    skillId: descriptor.skillId,
    ...adapter,
    tool: descriptor.tool,
    command: descriptor.command,
    standard: descriptor.standard,
    requiredInputs: [...descriptor.requiredInputs],
    passCriteria: [...descriptor.passCriteria],
    receiptFields: [...descriptor.receiptFields],
  };
}

function cloneDependencySignal(
  signal: TypeScriptVerificationDependencySignal,
): TypeScriptVerificationDependencySignal {
  return {
    dependency: signal.dependency,
    responsibilities: [...signal.responsibilities],
  };
}

function skillBindingLabel(binding: {
  readonly skillId: string;
  readonly adapter?: string;
}): string {
  const adapter = binding.adapter?.trim();
  return adapter === undefined || adapter.length === 0
    ? binding.skillId
    : `${binding.skillId}@${adapter}`;
}
