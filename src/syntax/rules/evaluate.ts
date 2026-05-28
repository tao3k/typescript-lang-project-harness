import type { TsCompactFinding, TsParsedModule } from "../model.js";
import { ruleCatalog } from "./catalog.js";

export function evaluateRules(modules: readonly TsParsedModule[]): readonly TsCompactFinding[] {
  const rules = ruleCatalog();
  const findings: TsCompactFinding[] = [];

  for (const rule of rules) {
    findings.push(...rule.evaluate(modules));
  }

  return findings.sort((a, b) =>
    a.severity === "Error" && b.severity !== "Error"
      ? -1
      : a.severity !== "Error" && b.severity === "Error"
        ? 1
        : a.ruleId.localeCompare(b.ruleId),
  );
}
