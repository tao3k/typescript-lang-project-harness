import type { TsCompactFinding } from "../model.js";
import { sourceOf, lineAt } from "./helpers.js";
import type { TsRule } from "./types.js";

export function advisoryRules(): readonly TsRule[] {
  return [agentTsR001, agentTsR003, agentTsR006, agentTsR008, agentTsR009, agentTsR012];
}

// ── AGENT-TS-R001: public module lacks intent doc ───────────

const agentTsR001: TsRule = {
  descriptor: {
    id: "AGENT-TS-R001",
    severity: "Info",
    title: "Public module lacks intent doc",
    contract:
      "Every public module must have a top-level JSDoc comment or leading comment explaining its purpose.",
  },
  evaluate(modules) {
    const findings: TsCompactFinding[] = [];
    for (const mod of modules) {
      if (!mod.isValid) continue;
      // A public module has exports
      if (mod.exports.length === 0 && mod.publicItems.filter((p) => p.exported).length === 0)
        continue;
      if (!hasModuleDoc(sourceOf(mod))) {
        findings.push({
          ruleId: "AGENT-TS-R001",
          severity: "Info",
          title: "Public module lacks intent doc",
          path: mod.path,
          line: 1,
          column: 1,
          fix: `add a JSDoc comment at the top of ${mod.path} describing the module's purpose`,
          sourceLine: lineAt(mod, 1) ?? "",
          help: `${mod.path} exports public items but has no module-level documentation.`,
          contract:
            "Every public module must have a top-level JSDoc comment or leading comment explaining its purpose.",
        });
      }
    }
    return findings;
  },
};

// ── AGENT-TS-R003: generic bucket path ─────────────────────

const GENERIC_BUCKETS = new Set([
  "utils",
  "common",
  "helpers",
  "shared",
  "misc",
  "lib",
  "core",
  "types",
]);

const agentTsR003: TsRule = {
  descriptor: {
    id: "AGENT-TS-R003",
    severity: "Info",
    title: "Module path uses generic bucket",
    contract:
      "Module paths must use domain-specific names, not generic buckets like utils, common, helpers, or shared.",
  },
  evaluate(modules) {
    const findings: TsCompactFinding[] = [];
    for (const mod of modules) {
      const segments = mod.path.split("/");
      const dir = segments.length >= 2 ? segments[segments.length - 2] : "";
      if (dir !== undefined && GENERIC_BUCKETS.has(dir)) {
        findings.push({
          ruleId: "AGENT-TS-R003",
          severity: "Info",
          title: "Module path uses generic bucket",
          path: mod.path,
          line: 1,
          column: 1,
          fix: `move ${mod.path} to a domain-named directory`,
          sourceLine: lineAt(mod, 1) ?? "",
          help: `${mod.path} lives under generic bucket \`${dir}\`. Use domain-specific names (e.g. \`parser\`, \`render\`, \`auth\`).`,
          contract:
            "Module paths must use domain-specific names, not generic buckets like utils, common, helpers, or shared.",
        });
      }
    }
    return findings;
  },
};

// ── AGENT-TS-R006: boolean flags ───────────────────────────

const agentTsR006: TsRule = {
  descriptor: {
    id: "AGENT-TS-R006",
    severity: "Info",
    title: "Exported function exposes multiple boolean flags",
    contract: "Functions with >1 boolean parameter should use a named options type or enum.",
  },
  evaluate(modules) {
    const findings: TsCompactFinding[] = [];
    for (const mod of modules) {
      for (const fn of mod.functions) {
        if (!fn.exported) continue;
        if (fn.booleanParamCount > 1) {
          findings.push({
            ruleId: "AGENT-TS-R006",
            severity: "Info",
            title: "Exported function exposes multiple boolean flags",
            path: mod.path,
            line: fn.line,
            column: 1,
            fix: `replace ${fn.booleanParamCount} boolean params in \`${fn.name}\` with a named options type or enum`,
            sourceLine: lineAt(mod, fn.line) ?? "",
            help: `${mod.path} exports function \`${fn.name}\` with ${fn.booleanParamCount} boolean parameters.`,
            contract:
              "Functions with >1 boolean parameter should use a named options type or enum.",
          });
        }
      }
    }
    return findings;
  },
};

// ── AGENT-TS-R008: nested algorithm ────────────────────────

const agentTsR008: TsRule = {
  descriptor: {
    id: "AGENT-TS-R008",
    severity: "Info",
    title: "Exported function hides algorithm behind nested control flow",
    contract:
      "Deeply nested control flow (>4 levels) must be extracted into named helper functions.",
  },
  evaluate(modules) {
    const findings: TsCompactFinding[] = [];
    for (const mod of modules) {
      for (const fn of mod.functions) {
        if (!fn.exported) continue;
        if (fn.maxNestingDepth > 4) {
          findings.push({
            ruleId: "AGENT-TS-R008",
            severity: "Info",
            title: "Exported function hides algorithm behind nested control flow",
            path: mod.path,
            line: fn.line,
            column: 1,
            fix: `extract deeply nested blocks in \`${fn.name}\` into named helper functions`,
            sourceLine: lineAt(mod, fn.line) ?? "",
            help: `${mod.path} exports function \`${fn.name}\` with max nesting depth ${fn.maxNestingDepth} (> 4).`,
            contract:
              "Deeply nested control flow (>4 levels) must be extracted into named helper functions.",
          });
        }
      }
    }
    return findings;
  },
};

// ── AGENT-TS-R009: broad linear algorithm ──────────────────

const agentTsR009: TsRule = {
  descriptor: {
    id: "AGENT-TS-R009",
    severity: "Info",
    title: "Exported function owns broad linear algorithm surface",
    contract: "Functions with >30 statements should be split into smaller, composable units.",
  },
  evaluate(modules) {
    const findings: TsCompactFinding[] = [];
    for (const mod of modules) {
      for (const fn of mod.functions) {
        if (!fn.exported) continue;
        if (fn.statementCount > 30) {
          findings.push({
            ruleId: "AGENT-TS-R009",
            severity: "Info",
            title: "Exported function owns broad linear algorithm surface",
            path: mod.path,
            line: fn.line,
            column: 1,
            fix: `split \`${fn.name}\` (${fn.statementCount} statements) into smaller composable functions`,
            sourceLine: lineAt(mod, fn.line) ?? "",
            help: `${mod.path} exports function \`${fn.name}\` with ${fn.statementCount} statements (> 30).`,
            contract:
              "Functions with >30 statements should be split into smaller, composable units.",
          });
        }
      }
    }
    return findings;
  },
};

// ── AGENT-TS-R012: too many ungrouped facade exports ─────────

const agentTsR012: TsRule = {
  descriptor: {
    id: "AGENT-TS-R012",
    severity: "Info",
    title: "Facade exports too many ungrouped names",
    contract: "Facade modules should export ≤12 names. Group sub-namespace exports if exceeded.",
  },
  evaluate(modules) {
    const findings: TsCompactFinding[] = [];
    for (const mod of modules) {
      const totalExports = mod.exports.filter((e) => e.exportKind !== "star").length;
      if (totalExports > 12) {
        findings.push({
          ruleId: "AGENT-TS-R012",
          severity: "Info",
          title: "Facade exports too many ungrouped names",
          path: mod.path,
          line: 1,
          column: 1,
          fix: `group exports from ${mod.path} into sub-namespace re-exports`,
          sourceLine: lineAt(mod, 1) ?? "",
          help: `${mod.path} exports ${totalExports} names (> 12). Consider sub-namespace grouping.`,
          contract:
            "Facade modules should export ≤12 names. Group sub-namespace exports if exceeded.",
        });
      }
    }
    return findings;
  },
};

function hasModuleDoc(sourceText: string): boolean {
  const firstLines = sourceText.slice(0, 500);
  return /\/\*\*[\s\S]*?\*\//.test(firstLines) || /^\/\/\/\s/.test(firstLines);
}
