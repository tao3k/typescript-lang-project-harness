import fs from "node:fs";
import path from "node:path";

import type {
  TypeScriptVerificationPlan,
  TypeScriptVerificationReportArtifact,
  TypeScriptVerificationReportBundle,
  TypeScriptVerificationReportOptions,
  TypeScriptVerificationReportWriteConfig,
  TypeScriptVerificationReportWriteReceipt,
} from "./model.js";
import {
  buildTypeScriptVerificationPerformanceIndex,
  renderTypeScriptVerificationPerformanceIndexJson,
} from "./performance.js";
import { renderTypeScriptVerificationPlanJson } from "./render.js";
import {
  buildTypeScriptVerificationTaskIndex,
  renderTypeScriptVerificationTaskIndexJson,
} from "./task_index.js";

const VERIFICATION_REPORT_MANIFEST = "verification_report_manifest.json";

export class TypeScriptVerificationReportWriteError extends Error {
  readonly path?: string;
  override readonly cause?: unknown;

  constructor(message: string, options: { readonly path?: string; readonly cause?: unknown } = {}) {
    super(message);
    this.name = "TypeScriptVerificationReportWriteError";
    if (options.path !== undefined) {
      this.path = options.path;
    }
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function defaultTypeScriptVerificationReportOptions(): TypeScriptVerificationReportOptions {
  return {
    defaultTrace: {
      profile: "standard",
      maxSeconds: 60,
      sampleIntervalMs: 1000,
      includeRawTraces: false,
    },
    artifactTraces: {
      performance_index_json: {
        profile: "performance",
        maxSeconds: 300,
        sampleIntervalMs: 250,
        includeRawTraces: true,
      },
    },
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
      performance_index_json: {
        templateId: "performance-index",
        schemaVersion: "1",
        requiredSections: [
          "benchmark_command",
          "baseline",
          "regression_threshold",
          "latency_or_throughput",
          "profile_artifact",
        ],
      },
    },
    artifactPersistence: {
      verification_plan_json: "runtime_cache",
      task_index_json: "source_baseline",
      performance_index_json: "source_baseline",
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
  if (key === "performance_index_json") {
    return renderTypeScriptVerificationPerformanceIndexJson(
      buildTypeScriptVerificationPerformanceIndex(plan),
    );
  }
  return undefined;
}

export function writeTypeScriptVerificationReports(
  plan: TypeScriptVerificationPlan,
  config: TypeScriptVerificationReportWriteConfig,
): TypeScriptVerificationReportWriteReceipt {
  prepareReportDirectories(config);
  const bundle = buildTypeScriptVerificationReportBundle(plan);
  const sourceArtifacts = bundle.artifacts.filter(
    (artifact) => artifact.persistence === "source_baseline",
  );
  const cacheArtifacts = bundle.artifacts.filter(
    (artifact) => artifact.persistence === "runtime_cache",
  );
  const sourceBaselinePaths: string[] = [];
  const runtimeCachePaths: string[] = [];

  writeReportManifest(
    { ...bundle, artifacts: sourceArtifacts },
    config.sourceBaselineDir,
    config,
    sourceBaselinePaths,
  );
  writeReportManifest(bundle, config.runtimeCacheDir, config, runtimeCachePaths);
  writeReportArtifacts(
    plan,
    sourceArtifacts,
    config.sourceBaselineDir,
    config,
    sourceBaselinePaths,
  );
  writeReportArtifacts(plan, cacheArtifacts, config.runtimeCacheDir, config, runtimeCachePaths);

  return { sourceBaselinePaths, runtimeCachePaths };
}

function prepareReportDirectories(config: TypeScriptVerificationReportWriteConfig): void {
  createDirAll(config.sourceBaselineDir);
  createDirAll(config.runtimeCacheDir);
}

function writeReportManifest(
  bundle: TypeScriptVerificationReportBundle,
  directory: string,
  config: TypeScriptVerificationReportWriteConfig,
  paths: string[],
): void {
  const manifestPath = path.join(directory, VERIFICATION_REPORT_MANIFEST);
  writeJson(manifestPath, compactProjectRoot(JSON.stringify(bundle, null, 2), config));
  paths.push(manifestPath);
}

function writeReportArtifacts(
  plan: TypeScriptVerificationPlan,
  artifacts: readonly TypeScriptVerificationReportArtifact[],
  directory: string,
  config: TypeScriptVerificationReportWriteConfig,
  paths: string[],
): void {
  for (const artifact of artifacts) {
    const payload = renderTypeScriptVerificationReportArtifactJson(plan, artifact.key);
    if (payload === undefined) {
      continue;
    }
    const artifactPath = path.join(directory, artifact.artifactName);
    writeJson(artifactPath, compactProjectRoot(payload, config));
    paths.push(artifactPath);
  }
}

function createDirAll(directory: string): void {
  try {
    fs.mkdirSync(directory, { recursive: true });
  } catch (error) {
    throw new TypeScriptVerificationReportWriteError(
      `failed to create verification report directory: ${directory}`,
      { path: directory, cause: error },
    );
  }
}

function writeJson(filePath: string, payload: string): void {
  try {
    fs.writeFileSync(filePath, payload);
  } catch (error) {
    throw new TypeScriptVerificationReportWriteError(
      `failed to write verification report: ${filePath}`,
      { path: filePath, cause: error },
    );
  }
}

function compactProjectRoot(
  payload: string,
  config: TypeScriptVerificationReportWriteConfig,
): string {
  const projectRoot = config.projectRoot;
  if (projectRoot.length === 0) {
    return payload;
  }
  const placeholder = config.projectRootPlaceholder ?? "$PROJECT_ROOT";
  const replacement = jsonStringFragment(placeholder);
  let compacted = payload;
  for (const candidate of projectRootCompactionCandidates(projectRoot)) {
    compacted = compacted.replaceAll(candidate, replacement);
  }
  return compacted;
}

function projectRootCompactionCandidates(projectRoot: string): readonly string[] {
  const normalized = projectRoot.replaceAll("\\", "/");
  return [
    ...new Set([
      projectRoot,
      normalized,
      jsonStringFragment(projectRoot),
      jsonStringFragment(normalized),
    ]),
  ]
    .filter((candidate) => candidate.length > 0)
    .sort((left, right) => right.length - left.length);
}

function jsonStringFragment(value: string): string {
  const encoded = JSON.stringify(value);
  return encoded.slice(1, -1);
}
