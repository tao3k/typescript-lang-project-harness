import type { TypeScriptHarnessReport } from "../model.js";

export function renderTypeScriptProjectHarnessJson(report: TypeScriptHarnessReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
