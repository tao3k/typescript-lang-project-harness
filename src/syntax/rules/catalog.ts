import type { TsCompactFinding, TsParsedModule } from "../model.js";
import { advisoryRules } from "./advisory.js";
import { blockingRules } from "./blocking.js";
import { effectRules } from "./effect.js";
import { reactRules } from "./react.js";
import type { TsRule } from "./types.js";

export type { TsRule, TsRuleDescriptor } from "./types.js";

export function ruleCatalog(): readonly TsRule[] {
  return [...blockingRules(), ...advisoryRules(), ...reactRules(), ...effectRules()];
}

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
