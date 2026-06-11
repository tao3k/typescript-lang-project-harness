import crypto from "node:crypto";
import type { TsParsedModule } from "../model.js";
import type { VerifyPlan, VerifyTask, VerifyTaskKind } from "./types.js";
import { slashPath } from "../../reasoning/path_utils.js";

export function planVerification(modules: readonly TsParsedModule[]): readonly VerifyPlan[] {
  return modules.filter((m) => m.isValid).map((mod) => planModule(mod));
}

function planModule(mod: TsParsedModule): VerifyPlan {
  const tasks: VerifyTask[] = [];

  // Always: typecheck + snapshot
  addTask(tasks, mod, "typecheck", fingerprintModule(mod));
  addTask(tasks, mod, "snapshot", fingerprintModule(mod));

  // Unit: if module exports functions
  if (hasExportedFunction(mod)) {
    addTask(tasks, mod, "unit", fingerprintExportedFunctions(mod));
  }

  // React-render: if module has React components
  if (mod.reactFacts.some((f) => f.factKind === "component" && f.isComponent)) {
    addTask(tasks, mod, "react-render", fingerprintModule(mod));
  }

  // Effect-layer: if module has Effect layers
  if (mod.effectFacts.some((f) => f.factKind === "layer" || f.factKind === "runtime")) {
    addTask(tasks, mod, "effect-layer", fingerprintModule(mod));
  }

  // Performance: if any exported function has broad metrics
  if (hasPerformanceRisk(mod)) {
    addTask(tasks, mod, "performance", fingerprintModule(mod));
  }

  // Bundle-size: if module is a package entry
  if (isPackageEntry(mod)) {
    addTask(tasks, mod, "bundle-size", fingerprintModule(mod));
  }

  return { modulePath: mod.path, tasks };
}

// ── Relevance rules ─────────────────────────────────────────

function hasExportedFunction(mod: TsParsedModule): boolean {
  return mod.functions.some((f) => f.exported);
}

function hasPerformanceRisk(mod: TsParsedModule): boolean {
  return mod.functions.some((f) => f.exported && (f.statementCount > 30 || f.maxNestingDepth > 4));
}

function isPackageEntry(mod: TsParsedModule): boolean {
  const modulePath = slashPath(mod.path);
  return modulePath.endsWith("/index.ts") || modulePath.endsWith("/index.tsx");
}

// ── Fingerprint ────────────────────────────────────────────

function fingerprintModule(mod: TsParsedModule): string {
  const content = mod.path + "::" + mod.imports.length + "::" + mod.exports.length;
  return sha256(content);
}

function fingerprintExportedFunctions(mod: TsParsedModule): string {
  const exported = mod.functions.filter((f) => f.exported);
  const content = exported.map((f) => `${f.name}:${f.line}:${f.statementCount}`).join(";");
  return sha256(content);
}

function addTask(
  tasks: VerifyTask[],
  mod: TsParsedModule,
  kind: VerifyTaskKind,
  fingerprint: string,
): void {
  // Avoid duplicate tasks
  if (tasks.some((t) => t.kind === kind)) return;

  const phase = getPhase(kind);
  tasks.push({ kind, status: "pending", phase, fingerprint });
}

function getPhase(kind: VerifyTaskKind): VerifyTask["phase"] {
  switch (kind) {
    case "typecheck":
    case "snapshot":
      return "after_code_change";
    case "unit":
    case "effect-layer":
      return "after_typecheck_pass";
    case "react-render":
    case "performance":
      return "after_unit_tests_pass";
    case "bundle-size":
      return "after_release_build";
  }
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}
