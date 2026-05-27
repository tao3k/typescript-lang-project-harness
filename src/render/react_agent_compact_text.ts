import type { TypeScriptHarnessFinding } from "../model.js";

export function reactAgentTaskTitle(finding: TypeScriptHarnessFinding): string | undefined {
  switch (finding.ruleId) {
    case "TS-EXT-REACT-R001":
      return "Make explicit React extension config match package dependencies";
    case "TS-EXT-REACT-R002":
      return "Keep React component and hook render paths pure";
    default:
      return undefined;
  }
}

export function reactAdviceFixSteps(
  finding: TypeScriptHarnessFinding,
): readonly string[] | undefined {
  switch (finding.ruleId) {
    case "TS-EXT-REACT-R001":
      return [
        "if React policy is intended, add `react` to package dependencies and keep `typescriptProjectHarness.extensions.react` enabled",
        "otherwise remove the explicit extension config",
      ];
    case "TS-EXT-REACT-R002":
      return [
        "move `new Date`, `Date.now`, and `Math.random` out of component or hook render paths",
        "use a lazy `useState` initializer, event handler, server-provided value, or Effect/domain boundary for non-idempotent values",
        "move `document` or `window` writes into `useEffect` or an event handler, with cleanup when the write has lifetime",
        "keep exported components and hooks idempotent so React can re-render and React Compiler can optimize safely",
      ];
    default:
      return undefined;
  }
}

export function reactProblemText(finding: TypeScriptHarnessFinding): string | undefined {
  switch (finding.ruleId) {
    case "TS-EXT-REACT-R001":
      return "package config enables React policy but package dependencies do not provide React";
    case "TS-EXT-REACT-R002":
      return "public React component or hook render path has non-idempotent work or browser side effects";
    default:
      return undefined;
  }
}

export function reactParserEvidenceText(finding: TypeScriptHarnessFinding): string | undefined {
  switch (finding.ruleId) {
    case "TS-EXT-REACT-R001":
      return "package.json extension config + dependency facts";
    case "TS-EXT-REACT-R002":
      return "package.json React activation + native component/hook render purity signals";
    default:
      return undefined;
  }
}
