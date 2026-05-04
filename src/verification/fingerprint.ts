import { createHash } from "node:crypto";

import type {
  TypeScriptVerificationEvidence,
  TypeScriptVerificationRequirement,
  TypeScriptVerificationSkillBinding,
  TypeScriptVerificationTaskKind,
} from "./model.js";

export interface TypeScriptVerificationFingerprintInput {
  readonly kind: TypeScriptVerificationTaskKind;
  readonly packageRoot: string;
  readonly ownerPath: string;
  readonly ownerNamespace: string;
  readonly reason: string;
  readonly evidence: readonly TypeScriptVerificationEvidence[];
  readonly requiredEvidence: readonly TypeScriptVerificationRequirement[];
  readonly skillBinding?: TypeScriptVerificationSkillBinding;
}

export function typeScriptVerificationTaskFingerprint(
  input: TypeScriptVerificationFingerprintInput,
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(stableFingerprintInput(input)))
    .digest("hex")
    .slice(0, 16);
  return `tsv:${digest}`;
}

function stableFingerprintInput(input: TypeScriptVerificationFingerprintInput) {
  const skillBinding =
    input.skillBinding === undefined
      ? {}
      : {
          skillBinding: {
            skillId: input.skillBinding.skillId,
            adapter: input.skillBinding.adapter ?? "",
          },
        };
  return {
    kind: input.kind,
    packageRoot: input.packageRoot,
    ownerPath: input.ownerPath,
    ownerNamespace: input.ownerNamespace,
    reason: input.reason,
    evidence: input.evidence
      .map((fact) => ({ label: fact.label, value: fact.value }))
      .sort((left, right) =>
        `${left.label}\0${left.value}`.localeCompare(`${right.label}\0${right.value}`),
      ),
    requiredEvidence: input.requiredEvidence
      .map((requirement) => ({
        key: requirement.key,
        description: requirement.description,
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    ...skillBinding,
  };
}
