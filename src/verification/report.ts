import type {
  TypeScriptVerificationPlan,
  TypeScriptVerificationReportArtifact,
  TypeScriptVerificationReportBundle,
  TypeScriptVerificationReportOptions,
} from "./model.js";
import { renderTypeScriptVerificationPlanJson } from "./render.js";
import {
  buildTypeScriptVerificationTaskIndex,
  renderTypeScriptVerificationTaskIndexJson,
} from "./task_index.js";

export function defaultTypeScriptVerificationReportOptions(): TypeScriptVerificationReportOptions {
  return {
    defaultTrace: {
      profile: "standard",
      maxSeconds: 60,
      sampleIntervalMs: 1000,
      includeRawTraces: false,
    },
    artifactTraces: {},
    artifactTemplates: {
      verification_plan_json: {
        templateId: "verification-plan",
        schemaVersion: "1",
        requiredSections: ["tasks", "reportObligations", "skillDescriptors"],
      },
      task_index_json: {
        templateId: "verification-task-index",
        schemaVersion: "1",
        requiredSections: ["kind", "state", "skill", "requiredEvidenceKeys", "taskEvidence"],
      },
    },
    artifactPersistence: {
      verification_plan_json: "runtime_cache",
      task_index_json: "source_baseline",
    },
  };
}

export function buildTypeScriptVerificationReportBundle(
  plan: TypeScriptVerificationPlan,
): TypeScriptVerificationReportBundle {
  return buildTypeScriptVerificationReportBundleWithOptions(
    plan,
    defaultTypeScriptVerificationReportOptions(),
  );
}

export function buildTypeScriptVerificationReportBundleWithOptions(
  plan: TypeScriptVerificationPlan,
  options: TypeScriptVerificationReportOptions,
): TypeScriptVerificationReportBundle {
  const artifacts: TypeScriptVerificationReportArtifact[] = plan.reportObligations.map(
    (obligation) => ({
      key: obligation.key,
      artifactName: obligation.suggestedArtifactName,
      renderer: obligation.renderer,
      reason: obligation.reason,
      taskKinds: obligation.taskKinds,
      taskFingerprints: obligation.taskFingerprints,
      persistence: options.artifactPersistence[obligation.key] ?? "runtime_cache",
      ...(options.artifactTemplates[obligation.key] === undefined
        ? {}
        : { template: options.artifactTemplates[obligation.key] }),
      ...(options.artifactTraces[obligation.key] === undefined && options.defaultTrace === undefined
        ? {}
        : { trace: options.artifactTraces[obligation.key] ?? options.defaultTrace }),
    }),
  );
  return {
    projectRoot: plan.projectRoot,
    artifacts,
  };
}

export function renderTypeScriptVerificationReportBundleJson(
  plan: TypeScriptVerificationPlan,
): string {
  return `${JSON.stringify(buildTypeScriptVerificationReportBundle(plan), null, 2)}\n`;
}

export function renderTypeScriptVerificationReportArtifactJson(
  plan: TypeScriptVerificationPlan,
  key: string,
): string | undefined {
  if (key === "verification_plan_json") {
    return renderTypeScriptVerificationPlanJson(plan);
  }
  if (key === "task_index_json") {
    return renderTypeScriptVerificationTaskIndexJson(buildTypeScriptVerificationTaskIndex(plan));
  }
  return undefined;
}
