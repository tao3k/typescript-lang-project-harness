import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  defaultTypeScriptHarnessConfig,
  isTypeScriptHarnessClean,
  renderTypeScriptProjectHarnessAgentCompactText,
  renderTypeScriptProjectHarness,
  renderTypeScriptReasoningTree,
  runTypeScriptProjectHarness,
  typeScriptExtensionPolicyRules,
  withDisabledTypeScriptRulePack,
} from "../../src/index.js";

test("Effect dependency activates extension snapshot and async domain advice", () => {
  const root = effectProject("dependency-active", {
    packageJson: {
      dependencies: { effect: "^3.0.0" },
    },
    source: [
      'import { Effect } from "effect";',
      "export function loadOwner(): Promise<string> {",
      "  return Promise.resolve('owner');",
      "}",
      "export declare function loadOwnerEffect(): Effect.Effect<string, Error>;",
    ],
  });

  const report = runTypeScriptProjectHarness(root);
  const rendered = renderTypeScriptProjectHarness(report);
  const snapshot = renderTypeScriptReasoningTree(report);

  assert.equal(isTypeScriptHarnessClean(report), true);
  assert.deepEqual(
    typeScriptExtensionPolicyRules().map((rule) => `${rule.ruleId}:${rule.severity}`),
    [
      "TS-EXT-EFFECT-R001:error",
      "TS-EXT-EFFECT-R002:info",
      "TS-EXT-EFFECT-R003:info",
      "TS-EXT-EFFECT-R004:info",
      "TS-EXT-EFFECT-R005:info",
      "TS-EXT-EFFECT-R006:info",
      "TS-EXT-EFFECT-R007:info",
    ],
  );
  assert.deepEqual(
    report.projectScope?.packageJson.packageExtensions.map((extension) => ({
      name: extension.name,
      activation: extension.activation,
      coverage: extension.coverage,
      dependencySource: extension.dependencySource,
    })),
    [
      {
        name: "effect",
        activation: "dependency",
        coverage: "project",
        dependencySource: "dependencies",
      },
    ],
  );
  assert.deepEqual(
    report.findings
      .filter((finding) => finding.ruleId.startsWith("TS-EXT-EFFECT"))
      .map((finding) => `${finding.ruleId}:${finding.severity}`),
    ["TS-EXT-EFFECT-R002:info"],
  );
  assert.match(rendered, /\[TS-EXT-EFFECT-R002\] info/u);
  assert.match(rendered, /Effect extension is active/u);
  assert.match(snapshot, /Extensions:/u);
  assert.match(
    snapshot,
    /effect activation=dependency capabilities=typed-async,domain-effects,policy/u,
  );
  assert.match(snapshot, /coverage=project/u);
});

test("Effect dependency gives project-wide async migration advice", () => {
  const root = effectProject("dependency-project-wide", {
    packageJson: {
      dependencies: { effect: "^3.0.0" },
    },
    source: {
      "legacy.ts": [
        "export async function loadLegacyOwner(): Promise<string> {",
        "  return 'owner';",
        "}",
      ],
      "effect-owner.ts": [
        'import { Effect } from "effect";',
        "export async function loadEffectOwner(): Promise<string> {",
        "  return 'owner';",
        "}",
      ],
    },
  });

  const report = runTypeScriptProjectHarness(root);
  const advice = renderTypeScriptProjectHarnessAgentCompactText(report);

  assert.equal(isTypeScriptHarnessClean(report), true);
  assert.deepEqual(
    report.findings
      .filter((finding) => finding.ruleId === "TS-EXT-EFFECT-R002")
      .map((finding) => `${path.basename(finding.location.path ?? "")}:${finding.severity}`),
    ["effect-owner.ts:info", "legacy.ts:info"],
  );
  assert.match(advice, /AgentCompactText: mode=advice findings=2 tasks=1/u);
  assert.match(
    advice,
    /\[TS-EXT-EFFECT-R002\] info x2: Migrate public async domain APIs to Effect/u,
  );
  assert.match(advice, /raw Promise instead of Effect\.Effect; facts: package\.json Effect/u);
  assert.match(advice, /coverage: project activation=dependency dependency=dependencies/u);
  assert.match(advice, /target_groups:\n   - src\/effect-owner\.ts x1 first=loadEffectOwner/u);
  assert.match(advice, /\n   - src\/legacy\.ts x1 first=loadLegacyOwner/u);
  assert.match(advice, /add `import \{ Effect \} from "effect"`/u);
  assert.match(advice, /Effect\.Effect<Success, DomainError, Requirements>/u);
  assert.match(advice, /Effect\.tryPromise\(\{ try: \(\) => promise, catch:/u);
  assert.match(advice, /targets:\n   - @ src\/effect-owner\.ts:\d+:\d+ apis=loadEffectOwner/u);
  assert.doesNotMatch(advice, /RuleIndex:/u);
  assert.doesNotMatch(advice, /Help:/u);
  assert.doesNotMatch(advice, /Contract:/u);
  assert.doesNotMatch(advice, /\n  rule:/u);
  assert.doesNotMatch(advice, /\n  problem:/u);
  assert.doesNotMatch(advice, /\n  facts:/u);
});

test("Effect compact advice is prioritized before generic agent shape advice", () => {
  const root = effectProject("effect-advice-priority", {
    packageJson: {
      dependencies: { effect: "^3.0.0" },
    },
    source: [
      "export type OwnerId = string;",
      "export async function loadOwner(ownerId: OwnerId): Promise<string> {",
      "  return ownerId;",
      "}",
    ],
  });

  const report = runTypeScriptProjectHarness(root);
  const advice = renderTypeScriptProjectHarnessAgentCompactText(report);

  assert.deepEqual(
    report.findings
      .filter(
        (finding) => finding.ruleId === "TS-EXT-EFFECT-R002" || finding.ruleId === "TS-AGENT-R010",
      )
      .map((finding) => finding.ruleId)
      .sort(),
    ["TS-AGENT-R010", "TS-EXT-EFFECT-R002"],
  );
  assert.match(
    advice,
    /RepairTasks:\n- \[TS-EXT-EFFECT-R002\] info x1: Migrate public async domain APIs to Effect/u,
  );
  assert.match(advice, /\n- \[TS-AGENT-R010\] info x1:/u);
});

test("explicit Effect enablement without dependency is an error-level blocking finding", () => {
  const root = effectProject("config-missing-dependency", {
    packageJson: {
      typescriptProjectHarness: { extensions: { Effect: "enable" } },
    },
    source: "export const ok = 1;\n",
  });

  const report = runTypeScriptProjectHarness(root);
  const rendered = renderTypeScriptProjectHarness(report);
  const snapshot = renderTypeScriptReasoningTree(report);

  assert.equal(isTypeScriptHarnessClean(report), false);
  assert.deepEqual(
    report.findings
      .filter((finding) => finding.ruleId.startsWith("TS-EXT-EFFECT"))
      .map((finding) => `${finding.ruleId}:${finding.severity}:${finding.label}`),
    ["TS-EXT-EFFECT-R001:error:declare effect before enforcing Effect extension policy"],
  );
  assert.match(rendered, /\[TS-EXT-EFFECT-R001\] error/u);
  assert.match(rendered, /package\.json enables the Effect extension/u);
  assert.match(snapshot, /effect activation=config-enabled-missing-dependency/u);
});

test("configured Effect dependency is active and can be disabled through the extension pack", () => {
  const root = effectProject("config-active", {
    packageJson: {
      dependencies: { effect: "^3.0.0" },
      typescriptProjectHarness: { extensions: { effect: "enable" } },
    },
    source: ["export async function loadOwner(): Promise<string> {", "  return 'owner';", "}"],
  });
  const defaultReport = runTypeScriptProjectHarness(root);
  const configuredReport = runTypeScriptProjectHarness(
    root,
    withDisabledTypeScriptRulePack(defaultTypeScriptHarnessConfig(), "extension_policy"),
  );

  assert.equal(isTypeScriptHarnessClean(defaultReport), true);
  assert.deepEqual(
    defaultReport.projectScope?.packageJson.packageExtensions.map((extension) => ({
      activation: extension.activation,
      coverage: extension.coverage,
      configSource: extension.configSource,
    })),
    [
      {
        activation: "config-enabled",
        coverage: "project",
        configSource: "typescriptProjectHarness",
      },
    ],
  );
  assert.ok(defaultReport.findings.some((finding) => finding.ruleId === "TS-EXT-EFFECT-R002"));
  assert.ok(
    configuredReport.findings.every((finding) => !finding.ruleId.startsWith("TS-EXT-EFFECT")),
  );
});

test("Effect runtime execution advice stays out of entrypoints", () => {
  const root = effectProject("runtime-boundary", {
    packageJson: {
      dependencies: { effect: "^3.0.0" },
    },
    source: {
      "domain.ts": [
        'import { Effect } from "effect";',
        "declare const program: Effect.Effect<string>;",
        "export function loadOwner(): Promise<string> {",
        "  return Effect.runPromise(program);",
        "}",
      ],
      "main.ts": [
        'import { Effect } from "effect";',
        "declare const program: Effect.Effect<void>;",
        "export function main(): Promise<void> {",
        "  return Effect.runPromise(program);",
        "}",
      ],
    },
  });

  const report = runTypeScriptProjectHarness(root);

  assert.equal(isTypeScriptHarnessClean(report), true);
  assert.deepEqual(
    report.findings
      .filter((finding) => finding.ruleId.startsWith("TS-EXT-EFFECT"))
      .map(
        (finding) => `${finding.ruleId}:${finding.severity}:${finding.labels.module_role ?? ""}`,
      ),
    ["TS-EXT-EFFECT-R002:info:source", "TS-EXT-EFFECT-R003:info:source"],
  );
});

test("Effect policy treats package script TypeScript targets as entrypoint adapters", () => {
  const root = effectProject("script-entrypoint", {
    packageJson: {
      dependencies: { effect: "^3.0.0" },
      scripts: {
        bench: 'RUN_LIVE=1 jiti src/cli/bench.ts --live "$@"',
      },
    },
    source: {
      "cli/bench.ts": [
        'import { Effect } from "effect";',
        "declare const program: Effect.Effect<void, Error>;",
        "export function runBench(): Promise<void> {",
        "  return Effect.runPromise(program);",
        "}",
      ],
      "cli/bench-helper.ts": [
        "export async function prepareBench(): Promise<string> {",
        "  return 'ready';",
        "}",
      ],
      "domain.ts": [
        "export async function loadDomainOwner(): Promise<string> {",
        "  return 'owner';",
        "}",
      ],
    },
  });

  const report = runTypeScriptProjectHarness(root);
  const roleByPath = new Map(
    report.reasoningTree.modules.map((moduleReport) => [
      path.relative(root, moduleReport.path),
      moduleReport.role,
    ]),
  );

  assert.equal(isTypeScriptHarnessClean(report), true);
  assert.equal(roleByPath.get("src/cli/bench.ts"), "entrypoint");
  assert.equal(roleByPath.get("src/cli/bench-helper.ts"), "entrypoint");
  assert.equal(roleByPath.get("src/domain.ts"), "source");
  assert.deepEqual(
    report.findings
      .filter((finding) => finding.ruleId.startsWith("TS-EXT-EFFECT"))
      .map((finding) =>
        [
          finding.ruleId,
          finding.severity,
          path.relative(root, finding.location.path ?? ""),
          finding.labels.module_role ?? "",
        ].join(":"),
      ),
    ["TS-EXT-EFFECT-R002:info:src/domain.ts:source"],
  );
});

test("Effect policy respects package-configured adapter module patterns", () => {
  const root = effectProject("configured-adapter-modules", {
    packageJson: {
      dependencies: { effect: "^3.0.0" },
      typescriptProjectHarness: {
        extensions: {
          effect: {
            enabled: true,
            adapterModules: ["src/adapters/**/*.ts", "src/*.functions.ts"],
          },
        },
      },
    },
    source: {
      "adapters/http.ts": [
        'import { Effect } from "effect";',
        "declare const program: Effect.Effect<string, Error>;",
        "export function handleHttp(): Promise<string> {",
        "  return Effect.runPromise(program);",
        "}",
      ],
      "domain.ts": [
        'import { Effect } from "effect";',
        "declare const program: Effect.Effect<string, Error>;",
        "export function loadDomain(): Promise<string> {",
        "  return Effect.runPromise(program);",
        "}",
      ],
      "query.functions.ts": [
        "export async function loadQuery(): Promise<string> {",
        "  return 'query';",
        "}",
      ],
    },
  });

  const report = runTypeScriptProjectHarness(root);
  const snapshot = renderTypeScriptReasoningTree(report);

  assert.equal(isTypeScriptHarnessClean(report), true);
  assert.deepEqual(
    report.projectScope?.packageJson.packageExtensions.map((extension) => ({
      activation: extension.activation,
      adapterModulePatterns: extension.adapterModulePatterns,
    })),
    [
      {
        activation: "config-enabled",
        adapterModulePatterns: ["src/adapters/**/*.ts", "src/*.functions.ts"],
      },
    ],
  );
  assert.deepEqual(
    report.findings
      .filter((finding) => finding.ruleId.startsWith("TS-EXT-EFFECT"))
      .map((finding) =>
        [
          finding.ruleId,
          finding.severity,
          path.relative(root, finding.location.path ?? ""),
          finding.labels.module_role ?? "",
        ].join(":"),
      ),
    [
      "TS-EXT-EFFECT-R002:info:src/domain.ts:source",
      "TS-EXT-EFFECT-R003:info:src/domain.ts:source",
    ],
  );
  assert.match(snapshot, /config=typescriptProjectHarness/u);
  assert.match(snapshot, /adapters=src\/adapters\/\*\*\/\*\.ts,src\/\*\.functions\.ts/u);
});

test("Effect service methods with requirement leaks receive layer-boundary advice", () => {
  const root = effectProject("service-requirements", {
    packageJson: {
      dependencies: { effect: "^3.0.0" },
    },
    source: [
      'import { Effect } from "effect";',
      "export interface OwnerService {",
      "  load(id: string): Effect.Effect<string, Error, OwnerRepository>;",
      "  save(id: string): Effect.Effect<void, Error, never>;",
      "}",
    ],
  });

  const report = runTypeScriptProjectHarness(root);

  assert.equal(isTypeScriptHarnessClean(report), true);
  assert.deepEqual(
    report.findings
      .filter((finding) => finding.ruleId.startsWith("TS-EXT-EFFECT"))
      .map((finding) => `${finding.ruleId}:${finding.severity}:${finding.labels.method ?? ""}`),
    ["TS-EXT-EFFECT-R004:info:load"],
  );
});

test("Effect public APIs with weak error channels receive typed-error advice", () => {
  const root = effectProject("typed-errors", {
    packageJson: {
      dependencies: { effect: "^3.0.0" },
    },
    source: [
      'import { Effect } from "effect";',
      "export declare function loadOwner(): Effect.Effect<string, string, never>;",
      "export interface OwnerService {",
      "  save(id: string): Effect.Effect<void, unknown, never>;",
      "  remove(id: string): Effect.Effect<void, OwnerError, never>;",
      "}",
    ],
  });

  const report = runTypeScriptProjectHarness(root);

  assert.equal(isTypeScriptHarnessClean(report), true);
  assert.deepEqual(
    report.findings
      .filter((finding) => finding.ruleId.startsWith("TS-EXT-EFFECT"))
      .map(
        (finding) => `${finding.ruleId}:${finding.severity}:${finding.labels.error_surfaces ?? ""}`,
      ),
    ["TS-EXT-EFFECT-R005:info:loadOwner,OwnerService.save"],
  );
});

test("Effect.promise rejection-capable interop receives tryPromise advice", () => {
  const root = effectProject("promise-interop", {
    packageJson: {
      dependencies: { effect: "^3.0.0" },
    },
    source: [
      'import { Effect } from "effect";',
      "export const loadOwner = Effect.promise(async () => {",
      "  if (Math.random() > 0.5) {",
      "    throw new Error('boom');",
      "  }",
      "  return 'owner';",
      "});",
    ],
  });

  const report = runTypeScriptProjectHarness(root);

  assert.equal(isTypeScriptHarnessClean(report), true);
  assert.deepEqual(
    report.findings
      .filter((finding) => finding.ruleId.startsWith("TS-EXT-EFFECT"))
      .map(
        (finding) =>
          `${finding.ruleId}:${finding.severity}:${finding.labels.promise_interop ?? ""}`,
      ),
    ["TS-EXT-EFFECT-R006:info:loadOwner"],
  );
});

test("Effect.acquireRelease without local scoped boundary receives resource advice", () => {
  const root = effectProject("resource-scope", {
    packageJson: {
      dependencies: { effect: "^3.0.0" },
    },
    source: [
      'import { Effect } from "effect";',
      "declare const acquireOwner: Effect.Effect<string, OwnerOpenError, never>;",
      "declare const releaseOwner: (owner: string) => Effect.Effect<void, never, never>;",
      "export const ownerResource = Effect.acquireRelease(acquireOwner, releaseOwner);",
      "export const scopedOwnerResource = Effect.scoped(",
      "  Effect.acquireRelease(acquireOwner, releaseOwner)",
      ");",
    ],
  });

  const report = runTypeScriptProjectHarness(root);

  assert.equal(isTypeScriptHarnessClean(report), true);
  assert.deepEqual(
    report.findings
      .filter((finding) => finding.ruleId.startsWith("TS-EXT-EFFECT"))
      .map(
        (finding) => `${finding.ruleId}:${finding.severity}:${finding.labels.resource_scope ?? ""}`,
      ),
    ["TS-EXT-EFFECT-R007:info:ownerResource"],
  );
});

function effectProject(
  name: string,
  options: {
    readonly packageJson: Record<string, unknown>;
    readonly source:
      | string
      | readonly string[]
      | Readonly<Record<string, string | readonly string[]>>;
  },
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ts-harness-effect-${name}-`));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: `@example/${name}`, type: "module", ...options.packageJson }),
  );
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        lib: ["ES2020"],
        module: "ESNext",
        moduleResolution: "Bundler",
        target: "ES2020",
      },
      include: ["src/**/*.ts"],
    }),
  );
  fs.writeFileSync(
    path.join(root, "src", "effect.d.ts"),
    [
      'declare module "effect" {',
      "  export namespace Effect {",
      "    export type Effect<Success = unknown, Failure = never, Requirements = never> = {",
      "      readonly _success?: Success;",
      "      readonly _failure?: Failure;",
      "      readonly _requirements?: Requirements;",
      "    };",
      "    export function runPromise<Success>(effect: Effect<Success, unknown, unknown>): Promise<Success>;",
      "    export function promise<Success>(thunk: () => Promise<Success>): Effect<Success, unknown, never>;",
      "    export function tryPromise<Success, Failure>(options: {",
      "      readonly try: () => Promise<Success>;",
      "      readonly catch: (cause: unknown) => Failure;",
      "    }): Effect<Success, Failure, never>;",
      "    export function acquireRelease<Success, Failure, Requirements>(",
      "      acquire: Effect<Success, Failure, Requirements>,",
      "      release: (value: Success) => Effect<void, never, never>,",
      "    ): Effect<Success, Failure, Requirements>;",
      "    export function scoped<Success, Failure, Requirements>(",
      "      effect: Effect<Success, Failure, Requirements>,",
      "    ): Effect<Success, Failure, Requirements>;",
      "  }",
      "  export namespace Runtime {",
      "    export function runPromise<Success>(effect: Effect.Effect<Success, unknown, unknown>): Promise<Success>;",
      "  }",
      "}",
      "",
    ].join("\n"),
  );
  if (isSourceFileMap(options.source)) {
    for (const [fileName, source] of Object.entries(options.source)) {
      fs.mkdirSync(path.dirname(path.join(root, "src", fileName)), { recursive: true });
      fs.writeFileSync(path.join(root, "src", fileName), sourceText(source));
    }
  } else {
    fs.writeFileSync(path.join(root, "src", "index.ts"), sourceText(options.source));
  }
  return root;
}

function sourceText(source: string | readonly string[]): string {
  return typeof source === "string" ? source : source.join("\n");
}

function isSourceFileMap(
  source: string | readonly string[] | Readonly<Record<string, string | readonly string[]>>,
): source is Readonly<Record<string, string | readonly string[]>> {
  return typeof source === "object" && !Array.isArray(source);
}
