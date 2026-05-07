import path from "node:path";

import { responsibilityLabels, taskKindLabels } from "../profile.js";
import { activeTypeScriptVerificationProfileCandidates } from "./model.js";
import type {
  TypeScriptVerificationProfileCandidate,
  TypeScriptVerificationProfileIndex,
} from "../model.js";

export function renderTypeScriptVerificationProfileIndex(
  index: TypeScriptVerificationProfileIndex,
): string {
  const activeCandidates = activeTypeScriptVerificationProfileCandidates(index);
  const candidates = activeCandidates
    .map((candidate) => renderProfileCandidate(index.projectRoot, candidate))
    .join("\n");
  if (activeCandidates.length === 0) {
    return candidates;
  }
  const reminder = renderProfileConfigurationReminder(activeCandidates.length);
  return [candidates, reminder].filter((rendered) => rendered.length > 0).join("\n");
}

export function renderTypeScriptVerificationProfileIndexJson(
  index: TypeScriptVerificationProfileIndex,
): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}

function renderProfileCandidate(
  projectRoot: string,
  candidate: TypeScriptVerificationProfileCandidate,
): string {
  const lines = [`[verify-profile] ${displayProjectPath(projectRoot, candidate.ownerPath)}`];
  if (candidate.ownerNamespace.length > 0) {
    lines.push(`   |owner: ${candidate.ownerNamespace}`);
  }
  lines.push(`   |state: ${candidate.state}`);
  if (candidate.configuredResponsibilities.length > 0) {
    lines.push(`   |configured: ${responsibilityLabels(candidate.configuredResponsibilities)}`);
  }
  lines.push(`   |suggest: ${responsibilityLabels(candidate.suggestedResponsibilities)}`);
  lines.push(`   |tasks: ${taskKindLabels(candidate.suggestedTaskKinds)}`);
  for (const fact of candidate.evidence.filter(compactFact)) {
    lines.push(`   |fact: ${fact.label}=${fact.value}`);
  }
  return lines.join("\n");
}

function compactFact(fact: TypeScriptVerificationProfileCandidate["evidence"][number]): boolean {
  return (fact.label !== "exports" || fact.value !== "0") && fact.label !== "dependency_roots";
}

function displayProjectPath(projectRoot: string, value: string): string {
  return path.relative(projectRoot, value).replaceAll("\\", "/") || ".";
}

function renderProfileConfigurationReminder(candidateCount: number): string {
  return [
    "[verify-profile] profile_hints",
    "   |state: missing_profile_config",
    "   |action: configure TypeScriptVerificationProfileHint entries",
    `   |candidates: ${candidateCount}`,
  ].join("\n");
}
