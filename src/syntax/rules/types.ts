import type { TsCompactFinding, TsParsedModule } from "../model.js";

export interface TsRuleDescriptor {
  readonly id: string;
  readonly severity: "Error" | "Info";
  readonly title: string;
  readonly contract: string;
}

export interface TsRule {
  readonly descriptor: TsRuleDescriptor;
  readonly evaluate: (modules: readonly TsParsedModule[]) => readonly TsCompactFinding[];
}
