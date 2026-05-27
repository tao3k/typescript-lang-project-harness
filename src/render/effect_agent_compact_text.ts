import type { TypeScriptHarnessFinding } from "../model.js";

export function effectAgentTaskTitle(finding: TypeScriptHarnessFinding): string | undefined {
  switch (finding.ruleId) {
    case "TS-EXT-EFFECT-R001":
      return "Make explicit Effect extension config match package dependencies";
    case "TS-EXT-EFFECT-R002":
      return "Migrate public async domain APIs to Effect";
    case "TS-EXT-EFFECT-R003":
      return "Move Effect runtime execution to entrypoint or adapter boundaries";
    case "TS-EXT-EFFECT-R004":
      return "Move Effect service dependencies into Layer/runtime construction";
    case "TS-EXT-EFFECT-R005":
      return "Use typed domain errors in Effect error channels";
    case "TS-EXT-EFFECT-R006":
      return "Wrap rejection-capable Promise interop with Effect.tryPromise";
    case "TS-EXT-EFFECT-R007":
      return "Make Effect resource lifetime and Scope boundaries explicit";
    case "TS-EXT-EFFECT-R008":
      return "Declare Effect concurrency and failure policy for async batches";
    default:
      return undefined;
  }
}

export function effectAdviceFixSteps(
  finding: TypeScriptHarnessFinding,
): readonly string[] | undefined {
  switch (finding.ruleId) {
    case "TS-EXT-EFFECT-R001":
      return [
        "if Effect policy is intended, add `effect` to package dependencies and keep `typescriptProjectHarness.extensions.effect` enabled",
        "otherwise remove the explicit extension config",
      ];
    case "TS-EXT-EFFECT-R002":
      return [
        'add `import { Effect } from "effect"` where the target module needs Effect types or constructors',
        "change public async/Promise domain API signatures to return `Effect.Effect<Success, DomainError, Requirements>`",
        "replace rejecting async work with `Effect.tryPromise({ try: () => promise, catch: (cause) => new DomainError({ cause }) })`",
        "keep `Effect.run*` only in parser-owned entrypoints, CLI handlers, or runtime integration modules",
      ];
    case "TS-EXT-EFFECT-R003":
      return [
        "move `Effect.run*` or `Runtime.run*` out of source modules",
        "return Effect descriptions from source owners and execute them in entrypoints/adapters",
      ];
    case "TS-EXT-EFFECT-R004":
      return [
        "move service dependencies into `Layer` or runtime construction",
        "expose public service methods as `Effect.Effect<Success, Error, never>` when possible",
      ];
    case "TS-EXT-EFFECT-R005":
      return [
        "replace primitive, any, unknown, or void Effect error channels with tagged or domain error types",
        "make the error type catchable with `Effect.catchTag` or the project recovery policy",
      ];
    case "TS-EXT-EFFECT-R006":
      return [
        "replace rejection-capable `Effect.promise` calls with `Effect.tryPromise({ try: () => promise, catch: (cause) => new DomainError({ cause }) })`",
        "map failures into a typed domain error",
      ];
    case "TS-EXT-EFFECT-R007":
      return [
        "make resource lifetime explicit with `Effect.scoped(Effect.acquireRelease(...))`",
        "or expose/document a `Scope` or `Layer` resource boundary",
      ];
    case "TS-EXT-EFFECT-R008":
      return [
        "replace `Promise.all` fan-out or await loops with `Effect.forEach(items, item => workEffect(item), { concurrency: n })`",
        "for prebuilt effects, use `Effect.all(effects, { concurrency: n })` or `Effect.allWith({ concurrency: n })`",
        "choose failure behavior explicitly: fail fast with `Effect.all`/`forEach`, collect successes with `Effect.allSuccesses`, or validate/partition when partial failure is expected",
        "name the concurrency budget as a domain constant instead of leaving unbounded Promise fan-out",
      ];
    default:
      return undefined;
  }
}

export function effectProblemText(finding: TypeScriptHarnessFinding): string | undefined {
  switch (finding.ruleId) {
    case "TS-EXT-EFFECT-R001":
      return "package config enables Effect policy but package dependencies do not provide Effect";
    case "TS-EXT-EFFECT-R002":
      return "public async/Promise domain API exposes raw Promise instead of Effect.Effect";
    case "TS-EXT-EFFECT-R003":
      return "source module executes Effect runtime instead of returning an Effect description";
    case "TS-EXT-EFFECT-R004":
      return "public Effect service method leaks implementation requirements";
    case "TS-EXT-EFFECT-R005":
      return "public Effect API uses a weak error channel";
    case "TS-EXT-EFFECT-R006":
      return "Effect.promise wraps rejection-capable async interop without typed error mapping";
    case "TS-EXT-EFFECT-R007":
      return "Effect.acquireRelease resource lacks an explicit local Scope boundary";
    case "TS-EXT-EFFECT-R008":
      return "async batch lacks explicit Effect concurrency and failure policy";
    default:
      return undefined;
  }
}

export function effectParserEvidenceText(finding: TypeScriptHarnessFinding): string | undefined {
  switch (finding.ruleId) {
    case "TS-EXT-EFFECT-R001":
      return "package.json extension config + dependency facts";
    case "TS-EXT-EFFECT-R002":
      return "package.json Effect activation + native async/Promise return facts";
    case "TS-EXT-EFFECT-R003":
      return "native Effect.run*/Runtime.run* calls + module role";
    case "TS-EXT-EFFECT-R004":
      return "native public Effect service method return types";
    case "TS-EXT-EFFECT-R005":
      return "native public Effect error-channel types";
    case "TS-EXT-EFFECT-R006":
      return "native Effect.promise calls inside public Effect surfaces";
    case "TS-EXT-EFFECT-R007":
      return "native Effect.acquireRelease + Effect.scoped calls";
    case "TS-EXT-EFFECT-R008":
      return "native Promise combinators, await loops, and Effect collection calls";
    default:
      return undefined;
  }
}
