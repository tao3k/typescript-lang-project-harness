export type TypeScriptVerificationTaskKind =
  | "stress"
  | "performance"
  | "chaos"
  | "security"
  | "regression"
  | "responsibility_review";

export type TypeScriptOwnerResponsibility =
  | "pure_domain_logic"
  | "public_api"
  | "external_dependency"
  | "persistence"
  | "security_boundary"
  | "latency_sensitive"
  | "availability_critical";

export type TypeScriptVerificationPhase =
  | "after_unit_tests_pass"
  | "before_release"
  | "scheduled_regression"
  | "before_verification";

export type TypeScriptVerificationTaskState = "pending" | "satisfied" | "failed" | "waived";

export type TypeScriptVerificationReceiptStatus = "passed" | "failed";

export interface TypeScriptVerificationEvidence {
  readonly label: string;
  readonly value: string;
}

export interface TypeScriptVerificationRequirement {
  readonly key: string;
  readonly description: string;
}

export interface TypeScriptVerificationTaskContract {
  readonly phase: TypeScriptVerificationPhase;
  readonly requiredReceipt: string;
  readonly requiredEvidence: readonly TypeScriptVerificationRequirement[];
}

export interface TypeScriptVerificationSkillBinding {
  readonly skillId: string;
  readonly adapter?: string;
}

export interface TypeScriptVerificationSkillDescriptor {
  readonly skillId: string;
  readonly adapter?: string;
  readonly tool: string;
  readonly command: string;
  readonly standard: string;
  readonly requiredInputs: readonly string[];
  readonly passCriteria: readonly string[];
  readonly receiptFields: readonly string[];
}

export interface TypeScriptVerificationProfileHint {
  readonly ownerPath: string;
  readonly responsibilities: readonly TypeScriptOwnerResponsibility[];
  readonly taskKinds?: readonly TypeScriptVerificationTaskKind[];
  readonly taskContractOverrides: Readonly<
    Partial<Record<TypeScriptVerificationTaskKind, TypeScriptVerificationTaskContract>>
  >;
  readonly rationale?: string;
}

export interface TypeScriptVerificationReceipt {
  readonly kind: TypeScriptVerificationTaskKind;
  readonly ownerPath: string;
  readonly fingerprint: string;
  readonly status: TypeScriptVerificationReceiptStatus;
  readonly summary?: string;
  readonly evidence: readonly TypeScriptVerificationEvidence[];
}

export interface TypeScriptVerificationWaiver {
  readonly kind: TypeScriptVerificationTaskKind;
  readonly ownerPath: string;
  readonly fingerprint: string;
  readonly owner?: string;
  readonly reason?: string;
  readonly expiresAt?: string;
}

export interface TypeScriptVerificationResolutionNote {
  readonly label: string;
  readonly detail: string;
}

export interface TypeScriptVerificationPolicy {
  readonly profileHints: readonly TypeScriptVerificationProfileHint[];
  readonly receipts: readonly TypeScriptVerificationReceipt[];
  readonly waivers: readonly TypeScriptVerificationWaiver[];
  readonly responsibilityTaskOverrides: Readonly<
    Partial<Record<TypeScriptOwnerResponsibility, readonly TypeScriptVerificationTaskKind[]>>
  >;
  readonly taskContractOverrides: Readonly<
    Partial<Record<TypeScriptVerificationTaskKind, TypeScriptVerificationTaskContract>>
  >;
  readonly skillBindings: Readonly<
    Partial<Record<TypeScriptVerificationTaskKind, TypeScriptVerificationSkillBinding>>
  >;
  readonly skillDescriptors: readonly TypeScriptVerificationSkillDescriptor[];
}

export interface TypeScriptVerificationTask {
  readonly kind: TypeScriptVerificationTaskKind;
  readonly state: TypeScriptVerificationTaskState;
  readonly packageRoot: string;
  readonly ownerPath: string;
  readonly ownerNamespace: string;
  readonly line?: number;
  readonly reason: string;
  readonly phase: TypeScriptVerificationPhase;
  readonly fingerprint: string;
  readonly evidence: readonly TypeScriptVerificationEvidence[];
  readonly requiredReceipt: string;
  readonly requiredEvidence: readonly TypeScriptVerificationRequirement[];
  readonly skillBinding?: TypeScriptVerificationSkillBinding;
  readonly skillContractRef?: string;
  readonly receiptSummary?: string;
  readonly resolutionNotes: readonly TypeScriptVerificationResolutionNote[];
}

export interface TypeScriptVerificationPlan {
  readonly projectRoot: string;
  readonly tasks: readonly TypeScriptVerificationTask[];
  readonly skillDescriptors: readonly TypeScriptVerificationSkillDescriptor[];
}

export type TypeScriptVerificationProfileCandidateState =
  | "missing_profile"
  | "profile_drift"
  | "configured";

export interface TypeScriptVerificationProfileCandidate {
  readonly packageRoot: string;
  readonly ownerPath: string;
  readonly hintPath: string;
  readonly ownerNamespace: string;
  readonly state: TypeScriptVerificationProfileCandidateState;
  readonly suggestedResponsibilities: readonly TypeScriptOwnerResponsibility[];
  readonly configuredResponsibilities: readonly TypeScriptOwnerResponsibility[];
  readonly suggestedTaskKinds: readonly TypeScriptVerificationTaskKind[];
  readonly evidence: readonly TypeScriptVerificationEvidence[];
}

export interface TypeScriptVerificationProfileIndex {
  readonly projectRoot: string;
  readonly candidates: readonly TypeScriptVerificationProfileCandidate[];
}
