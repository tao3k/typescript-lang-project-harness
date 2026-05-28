import { defaultTypeScriptHarnessConfig } from "../config.js";
import {
  renderAssertionMessage,
  renderTypeScriptProjectHarnessAgentCompactText,
} from "../render.js";
import { advisoryFindings, isTypeScriptHarnessClean } from "../model.js";
import { runTypeScriptProjectHarness } from "./run-project.js";
import type { TypeScriptProjectHarnessEmbeddedOptions } from "./run-project.js";
import type { TypeScriptHarnessConfig, TypeScriptHarnessReport } from "../model.js";

export { type TypeScriptProjectHarnessEmbeddedOptions } from "./run-project.js";

export function assertTypeScriptProjectHarnessClean(
  projectRootInput: string | URL,
  config: TypeScriptHarnessConfig = defaultTypeScriptHarnessConfig(),
): TypeScriptHarnessReport {
  const report = runTypeScriptProjectHarness(projectRootInput, config);
  if (!isTypeScriptHarnessClean(report)) {
    throw new Error(renderAssertionMessage(report));
  }
  return report;
}

export function assertTypeScriptProjectHarnessAgentClean(
  projectRootInput: string | URL,
  config: TypeScriptHarnessConfig = defaultTypeScriptHarnessConfig(),
): TypeScriptHarnessReport {
  const report = assertTypeScriptProjectHarnessClean(projectRootInput, config);
  if (advisoryFindings(report).length > 0) {
    throw new Error(renderTypeScriptProjectHarnessAgentCompactText(report));
  }
  return report;
}

export function assertTypeScriptProjectHarnessEmbeddedClean(
  projectRootInput: string | URL,
  options: TypeScriptProjectHarnessEmbeddedOptions = {},
): TypeScriptHarnessReport {
  const report = runTypeScriptProjectHarness(
    projectRootInput,
    options.config ?? defaultTypeScriptHarnessConfig(),
    { collectSemanticDiagnostics: options.collectSemanticDiagnostics ?? false },
  );
  if (!isTypeScriptHarnessClean(report)) {
    throw new Error(renderAssertionMessage(report));
  }
  if (options.emitAdvice !== false) {
    const advice = renderTypeScriptProjectHarnessAgentCompactText(report, {
      findings: "advice",
    });
    if (advice) {
      const writeAdvice = options.writeAdvice ?? ((message: string) => console.error(message));
      writeAdvice(advice);
    }
  }
  return report;
}
