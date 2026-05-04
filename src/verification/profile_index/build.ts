import path from "node:path";

import { defaultTypeScriptHarnessConfig } from "../../config.js";
import type {
  TypeScriptHarnessConfig,
  TypeScriptHarnessReport,
  TypeScriptReasoningModule,
  TypeScriptReasoningOwnerBranchFact,
} from "../../model.js";
import { runTypeScriptProjectHarness } from "../../runner.js";
import { taskKindsForResponsibilities } from "../profile.js";
import type {
  TypeScriptOwnerResponsibility,
  TypeScriptVerificationEvidence,
  TypeScriptVerificationPolicy,
  TypeScriptVerificationProfileCandidate,
  TypeScriptVerificationProfileCandidateState,
  TypeScriptVerificationProfileHint,
  TypeScriptVerificationProfileIndex,
} from "../model.js";

interface ProfileSignals {
  readonly externalImports: number;
  readonly packageImportImports: number;
  readonly unresolvedImports: number;
  readonly ownerDeps: number;
  readonly packageEntries: readonly string[];
}

export function buildTypeScriptVerificationProfileIndex(
  projectRootInput: string | URL,
): TypeScriptVerificationProfileIndex {
  return buildTypeScriptVerificationProfileIndexWithConfig(
    projectRootInput,
    defaultTypeScriptHarnessConfig(),
  );
}

export function buildTypeScriptVerificationProfileIndexWithConfig(
  projectRootInput: string | URL,
  config: TypeScriptHarnessConfig,
): TypeScriptVerificationProfileIndex {
  return buildTypeScriptVerificationProfileIndexForReport(
    runTypeScriptProjectHarness(projectRootInput, config),
    config.verificationPolicy,
  );
}

export function buildTypeScriptVerificationProfileIndexForReport(
  report: TypeScriptHarnessReport,
  policy: TypeScriptVerificationPolicy,
): TypeScriptVerificationProfileIndex {
  const candidates = report.reasoningTree.modules
    .filter(isProfileCandidateModule)
    .map((moduleReport) => profileCandidate(report, policy, moduleReport))
    .filter(
      (candidate): candidate is TypeScriptVerificationProfileCandidate => candidate !== undefined,
    )
    .sort(
      (left, right) =>
        left.packageRoot.localeCompare(right.packageRoot) ||
        left.ownerPath.localeCompare(right.ownerPath),
    );
  return {
    projectRoot: report.reasoningTree.projectRoot,
    candidates,
  };
}

function profileCandidate(
  report: TypeScriptHarnessReport,
  policy: TypeScriptVerificationPolicy,
  moduleReport: TypeScriptReasoningModule,
): TypeScriptVerificationProfileCandidate | undefined {
  const branch = ownerBranchForModule(report, moduleReport);
  const signals = profileSignals(report, moduleReport, branch);
  const responsibilities = suggestedResponsibilities(moduleReport, signals);
  if (responsibilities.length === 0) {
    return undefined;
  }
  const matchingHint = matchingProfileHint(report, policy, moduleReport.path);
  const configuredResponsibilities = matchingHint?.responsibilities ?? [];
  return {
    packageRoot: report.reasoningTree.projectRoot,
    ownerPath: moduleReport.path,
    hintPath: compactPath(report, moduleReport.path),
    ownerNamespace: branch?.ownerNamespace ?? ownerNamespace(report, moduleReport),
    state: profileCandidateState(matchingHint, responsibilities),
    suggestedResponsibilities: responsibilities,
    configuredResponsibilities: [...configuredResponsibilities].sort(),
    suggestedTaskKinds: taskKindsForResponsibilities(responsibilities, policy),
    evidence: profileEvidence(moduleReport, signals),
  };
}

function isProfileCandidateModule(moduleReport: TypeScriptReasoningModule): boolean {
  return (
    moduleReport.role === "entrypoint" ||
    moduleReport.role === "facade" ||
    moduleReport.role === "source" ||
    moduleReport.role === "config"
  );
}

function suggestedResponsibilities(
  moduleReport: TypeScriptReasoningModule,
  signals: ProfileSignals,
): readonly TypeScriptOwnerResponsibility[] {
  return [
    isPublicSurface(moduleReport, signals) ? "public_api" : undefined,
    signals.externalImports > 0 || signals.packageImportImports > 0
      ? "external_dependency"
      : undefined,
  ]
    .filter(
      (responsibility): responsibility is TypeScriptOwnerResponsibility =>
        responsibility !== undefined,
    )
    .sort();
}

function isPublicSurface(
  moduleReport: TypeScriptReasoningModule,
  signals: ProfileSignals,
): boolean {
  return (
    moduleReport.role === "entrypoint" ||
    moduleReport.role === "facade" ||
    moduleReport.exportNames.length > 0 ||
    signals.packageEntries.length > 0
  );
}

function profileSignals(
  report: TypeScriptHarnessReport,
  moduleReport: TypeScriptReasoningModule,
  branch: TypeScriptReasoningOwnerBranchFact | undefined,
): ProfileSignals {
  const branchSummary = branch?.importSummary;
  const ownerDeps = report.reasoningTree.ownerDependencies.filter(
    (dependency) => dependency.fromPath === moduleReport.path && !dependency.isTestContext,
  ).length;
  const packageEntries = report.reasoningTree.packageEntryResolutions
    .filter((entry) => entry.resolution === "parser-visible" && entry.toPath === moduleReport.path)
    .map((entry) => `${entry.kind}:${entry.subpath}`);
  return {
    externalImports:
      branchSummary?.externalImports ?? countEdges(report, moduleReport.path, "external"),
    packageImportImports:
      branchSummary?.packageImportImports ??
      countEdges(report, moduleReport.path, "package-import"),
    unresolvedImports:
      branchSummary?.unresolvedImports ?? countEdges(report, moduleReport.path, "unresolved"),
    ownerDeps,
    packageEntries: [...new Set(packageEntries)].sort(),
  };
}

function profileEvidence(
  moduleReport: TypeScriptReasoningModule,
  signals: ProfileSignals,
): readonly TypeScriptVerificationEvidence[] {
  const evidence: TypeScriptVerificationEvidence[] = [
    { label: "module", value: `role=${moduleReport.role} layer=${moduleReport.layer}` },
    { label: "exports", value: String(moduleReport.exportNames.length) },
    {
      label: "imports",
      value: `external=${signals.externalImports} package_import=${signals.packageImportImports} unresolved=${signals.unresolvedImports}`,
    },
    { label: "owner_deps", value: String(signals.ownerDeps) },
  ];
  if (signals.packageEntries.length > 0) {
    evidence.push({ label: "package_entries", value: signals.packageEntries.join(",") });
  }
  return evidence;
}

function profileCandidateState(
  matchingHint: TypeScriptVerificationProfileHint | undefined,
  responsibilities: readonly TypeScriptOwnerResponsibility[],
): TypeScriptVerificationProfileCandidateState {
  if (matchingHint === undefined) {
    return "missing_profile";
  }
  const configured = new Set(matchingHint.responsibilities);
  return responsibilities.every((responsibility) => configured.has(responsibility))
    ? "configured"
    : "profile_drift";
}

function matchingProfileHint(
  report: TypeScriptHarnessReport,
  policy: TypeScriptVerificationPolicy,
  ownerPath: string,
): TypeScriptVerificationProfileHint | undefined {
  return policy.profileHints.find(
    (hint) => normalizeHintOwnerPath(report, hint.ownerPath) === ownerPath,
  );
}

function ownerBranchForModule(
  report: TypeScriptHarnessReport,
  moduleReport: TypeScriptReasoningModule,
): TypeScriptReasoningOwnerBranchFact | undefined {
  return report.reasoningTree.ownerBranches.find((branch) => branch.path === moduleReport.path);
}

function countEdges(
  report: TypeScriptHarnessReport,
  fromPath: string,
  resolution: TypeScriptHarnessReport["reasoningTree"]["edges"][number]["resolution"],
): number {
  return report.reasoningTree.edges.filter(
    (edge) => edge.fromPath === fromPath && edge.resolution === resolution,
  ).length;
}

function normalizeHintOwnerPath(report: TypeScriptHarnessReport, ownerPath: string): string {
  return path.isAbsolute(ownerPath)
    ? path.resolve(ownerPath)
    : path.resolve(report.reasoningTree.projectRoot, ownerPath);
}

function ownerNamespace(
  report: TypeScriptHarnessReport,
  moduleReport: TypeScriptReasoningModule,
): string {
  const relativePath = compactPath(report, moduleReport.path);
  const extension = path.extname(relativePath);
  return extension.length === 0 ? relativePath : relativePath.slice(0, -extension.length);
}

function compactPath(report: TypeScriptHarnessReport, value: string): string {
  return path.relative(report.reasoningTree.projectRoot, value).replaceAll("\\", "/") || ".";
}
