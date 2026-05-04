import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import * as api from "../../src/index.js";
import type {
  PackageJsonEntryFact,
  PackageJsonEntryTargetFact,
  PackageJsonFacts,
  PackageJsonScriptFact,
  PackageJsonWorkspaceFact,
  RulePackDescriptor,
  SourceLocation,
  TypeScriptCompilerOptionFacts,
  TypeScriptDiagnosticSeverity,
  TypeScriptExportFact,
  TypeScriptHarnessConfig,
  TypeScriptHarnessFinding,
  TypeScriptHarnessReport,
  TypeScriptHarnessRule,
  TypeScriptHarnessRunMode,
  TypeScriptRulePack,
  TypeScriptImportEdgeFact,
  TypeScriptImportFact,
  TypeScriptModuleLayer,
  TypeScriptModuleReport,
  TypeScriptModuleRole,
  TypeScriptNativeDiagnostic,
  TypeScriptNativeDiagnosticRelatedInformation,
  TypeScriptNativeImportResolutionFact,
  TypeScriptPackageImportOwnerFact,
  TypeScriptPackageEntryResolutionFact,
  TypeScriptPathAliasFact,
  TypeScriptProjectHarnessAgentSnapshot,
  TypeScriptProjectHarnessAgentSnapshotPackage,
  TypeScriptProjectConfigFacts,
  TypeScriptProjectHarnessScope,
  TypeScriptProjectReferencePackageFact,
  TypeScriptProjectReferenceResolutionFact,
  TypeScriptReasoningDiagnosticFact,
  TypeScriptReasoningImportSummaryFact,
  TypeScriptReasoningModule,
  TypeScriptReasoningOwnerBranchFact,
  TypeScriptReasoningOwnerBranchRole,
  TypeScriptReasoningOwnerDependencyFact,
  TypeScriptReasoningSourceShadowFact,
  TypeScriptReasoningTree,
  TypeScriptOwnerResponsibility,
  TypeScriptRenderOptions,
  TypeScriptVerificationEvidence,
  TypeScriptVerificationPhase,
  TypeScriptVerificationPlan,
  TypeScriptVerificationPolicy,
  TypeScriptVerificationProfileCandidate,
  TypeScriptVerificationProfileCandidateState,
  TypeScriptVerificationProfileHint,
  TypeScriptVerificationProfileIndex,
  TypeScriptVerificationReceipt,
  TypeScriptVerificationReceiptStatus,
  TypeScriptVerificationRequirement,
  TypeScriptVerificationResolutionNote,
  TypeScriptVerificationSkillBinding,
  TypeScriptVerificationSkillDescriptor,
  TypeScriptVerificationTask,
  TypeScriptVerificationTaskContract,
  TypeScriptVerificationTaskKind,
  TypeScriptVerificationTaskState,
  TypeScriptVerificationWaiver,
  TypeScriptWorkspacePackageFact,
} from "../../src/index.js";

type PublicModelContract = readonly [
  PackageJsonFacts,
  PackageJsonEntryFact,
  PackageJsonEntryTargetFact,
  PackageJsonScriptFact,
  PackageJsonWorkspaceFact,
  TypeScriptCompilerOptionFacts,
  RulePackDescriptor,
  SourceLocation,
  TypeScriptDiagnosticSeverity,
  TypeScriptExportFact,
  TypeScriptHarnessConfig,
  TypeScriptHarnessFinding,
  TypeScriptHarnessReport,
  TypeScriptHarnessRule,
  TypeScriptHarnessRunMode,
  TypeScriptRulePack,
  TypeScriptImportFact,
  TypeScriptImportEdgeFact,
  TypeScriptModuleLayer,
  TypeScriptModuleReport,
  TypeScriptModuleRole,
  TypeScriptNativeImportResolutionFact,
  TypeScriptNativeDiagnostic,
  TypeScriptNativeDiagnosticRelatedInformation,
  TypeScriptPackageImportOwnerFact,
  TypeScriptPackageEntryResolutionFact,
  TypeScriptPathAliasFact,
  TypeScriptProjectHarnessAgentSnapshot,
  TypeScriptProjectHarnessAgentSnapshotPackage,
  TypeScriptProjectConfigFacts,
  TypeScriptProjectHarnessScope,
  TypeScriptProjectReferencePackageFact,
  TypeScriptProjectReferenceResolutionFact,
  TypeScriptReasoningDiagnosticFact,
  TypeScriptReasoningImportSummaryFact,
  TypeScriptReasoningModule,
  TypeScriptReasoningOwnerBranchFact,
  TypeScriptReasoningOwnerBranchRole,
  TypeScriptReasoningOwnerDependencyFact,
  TypeScriptReasoningSourceShadowFact,
  TypeScriptReasoningTree,
  TypeScriptOwnerResponsibility,
  TypeScriptRenderOptions,
  TypeScriptVerificationEvidence,
  TypeScriptVerificationPhase,
  TypeScriptVerificationPlan,
  TypeScriptVerificationPolicy,
  TypeScriptVerificationProfileCandidate,
  TypeScriptVerificationProfileCandidateState,
  TypeScriptVerificationProfileHint,
  TypeScriptVerificationProfileIndex,
  TypeScriptVerificationReceipt,
  TypeScriptVerificationReceiptStatus,
  TypeScriptVerificationRequirement,
  TypeScriptVerificationResolutionNote,
  TypeScriptVerificationSkillBinding,
  TypeScriptVerificationSkillDescriptor,
  TypeScriptVerificationTask,
  TypeScriptVerificationTaskContract,
  TypeScriptVerificationTaskKind,
  TypeScriptVerificationTaskState,
  TypeScriptVerificationWaiver,
  TypeScriptWorkspacePackageFact,
];

const publicModelContract: PublicModelContract | undefined = undefined;

test("public facade exposes the stable M6 runtime surface", () => {
  assert.deepEqual(Object.keys(api).sort(), [
    "DEFAULT_IGNORED_DIR_NAMES",
    "activeTypeScriptVerificationProfileCandidates",
    "activeTypeScriptVerificationProfileHints",
    "advisoryFindings",
    "assertTypeScriptLangHarnessClean",
    "assertTypeScriptProjectHarnessClean",
    "blockingFindings",
    "buildTypeScriptProjectHarnessAgentSnapshot",
    "buildTypeScriptVerificationProfileIndex",
    "buildTypeScriptVerificationProfileIndexForReport",
    "buildTypeScriptVerificationProfileIndexWithConfig",
    "defaultTypeScriptHarnessConfig",
    "defaultTypeScriptVerificationPolicy",
    "discoverTypeScriptFiles",
    "fileCount",
    "isTypeScriptHarnessClean",
    "parseTypeScriptProjectFiles",
    "parseTypeScriptSourceFile",
    "parsedCount",
    "planTypeScriptProjectVerification",
    "planTypeScriptProjectVerificationForReport",
    "planTypeScriptProjectVerificationWithConfig",
    "readProjectScope",
    "renderAssertionMessage",
    "renderTypeScriptProjectHarness",
    "renderTypeScriptProjectHarnessAdvice",
    "renderTypeScriptProjectHarnessAgentSnapshot",
    "renderTypeScriptProjectHarnessJson",
    "renderTypeScriptReasoningTree",
    "renderTypeScriptVerificationPlan",
    "renderTypeScriptVerificationPlanJson",
    "renderTypeScriptVerificationProfileIndex",
    "renderTypeScriptVerificationProfileIndexJson",
    "renderTypeScriptVerificationSkillContracts",
    "runTypeScriptLangHarness",
    "runTypeScriptProjectHarness",
    "runTypeScriptProjectHarnessAgentSnapshot",
    "typeScriptAgentPolicyRules",
    "typeScriptModularityRules",
    "typeScriptProjectPolicyRules",
    "typeScriptRulePackDescriptors",
    "typeScriptRulePackRuleIds",
    "typeScriptSemanticRules",
    "typeScriptSyntaxRules",
    "typeScriptTestLayoutRules",
    "typeScriptVerificationProfileIndexIsClear",
    "withDisabledTypeScriptRule",
    "withDisabledTypeScriptRulePack",
    "withDisabledTypeScriptRules",
    "withTypeScriptBlockingSeverities",
    "withTypeScriptRulePackSeverity",
    "withTypeScriptRuleSeverity",
    "withTypeScriptVerificationProfileHint",
    "withTypeScriptVerificationReceipt",
    "withTypeScriptVerificationResponsibilityTaskKinds",
    "withTypeScriptVerificationSkillBinding",
    "withTypeScriptVerificationSkillDescriptor",
    "withTypeScriptVerificationTaskContract",
    "withTypeScriptVerificationWaiver",
  ]);
  assert.equal("buildTypeScriptReasoningTree" in api, false);
  assert.equal("evaluateDefaultRulePacks" in api, false);
  assert.equal(publicModelContract, undefined);
});

test("public runner renders compact agent snapshots from parser-native facts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-public-api-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.mkdirSync(path.join(root, "generated"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "@example/public-api",
      type: "module",
    }),
  );
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        baseUrl: ".",
        rootDirs: ["src", "generated"],
        paths: {
          "@app/*": ["src/*"],
        },
      },
      include: ["src/**/*.ts", "generated/**/*.ts"],
    }),
  );
  fs.writeFileSync(
    path.join(root, "src", "domain.ts"),
    ["export interface Domain { id: string }", "export const domain = 1;"].join("\n"),
  );
  fs.writeFileSync(path.join(root, "generated", "generated.ts"), "export const generated = 1;\n");
  fs.writeFileSync(
    path.join(root, "src", "index.ts"),
    [
      'import { generated } from "./generated.js";',
      'export { domain } from "@app/domain";',
      'export type { Domain } from "@app/domain";',
      "export const indexed = generated;",
    ].join("\n"),
  );

  const report = api.runTypeScriptProjectHarness(root);
  const snapshot = api.renderTypeScriptReasoningTree(report);
  const projectSnapshot = api.runTypeScriptProjectHarnessAgentSnapshot(root);
  const renderedProjectSnapshot = api.renderTypeScriptProjectHarnessAgentSnapshot(projectSnapshot);

  assert.equal(api.isTypeScriptHarnessClean(report), true);
  assert.equal(renderedProjectSnapshot, snapshot);
  assert.match(snapshot, /^Modules: source=3 branches=1 deps=3 paths=1/u);
  assert.match(snapshot, /OwnerBranches:/u);
  assert.match(snapshot, /src\/index\.ts \[root, facade\] owner=src/u);
  assert.match(snapshot, /OwnerDependencies:/u);
  assert.match(snapshot, /src\/index\.ts --relative\/import--> generated\/generated\.ts/u);
  assert.match(snapshot, /src\/index\.ts --path-alias\/export--> src\/domain\.ts/u);
  assert.match(snapshot, /src\/index\.ts --path-alias\/type-export--> src\/domain\.ts/u);
  assert.doesNotMatch(snapshot, /^\{/u);
  assert.doesNotMatch(snapshot, /"modules":/u);
});
