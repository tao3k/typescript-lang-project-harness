import type {
  TypeScriptVerificationProfileCandidate,
  TypeScriptVerificationProfileHint,
  TypeScriptVerificationProfileIndex,
} from "../model.js";

export function typeScriptVerificationProfileIndexIsClear(
  index: TypeScriptVerificationProfileIndex,
): boolean {
  return activeTypeScriptVerificationProfileCandidates(index).length === 0;
}

export function activeTypeScriptVerificationProfileCandidates(
  index: TypeScriptVerificationProfileIndex,
): readonly TypeScriptVerificationProfileCandidate[] {
  return index.candidates.filter((candidate) => profileCandidateRequiresAction(candidate));
}

export function activeTypeScriptVerificationProfileHints(
  index: TypeScriptVerificationProfileIndex,
): readonly TypeScriptVerificationProfileHint[] {
  return activeTypeScriptVerificationProfileCandidates(index).map((candidate) => ({
    ownerPath: candidate.hintPath,
    responsibilities: [
      ...new Set([...candidate.configuredResponsibilities, ...candidate.suggestedResponsibilities]),
    ].sort(),
    taskContractOverrides: {},
  }));
}

function profileCandidateRequiresAction(
  candidate: TypeScriptVerificationProfileCandidate,
): boolean {
  return candidate.state === "missing_profile" || candidate.state === "profile_drift";
}
