import type { TsCompactFinding } from "../model.js";
import { lineAt } from "./helpers.js";
import type { TsRule } from "./types.js";
import { slashPath } from "../../reasoning/path_utils.js";

export function blockingRules(): readonly TsRule[] {
  return [tsSynR001, tsProjR001, tsProjR002, tsProjR003, tsModR001, tsModR002];
}

// ── TS-SYN-R001: source must parse ──────────────────────────

const tsSynR001: TsRule = {
  descriptor: {
    id: "TS-SYN-R001",
    severity: "Error",
    title: "TS/TSX source must parse",
    contract:
      "All TypeScript source files must parse without syntax errors. Broken syntax blocks downstream reasoning.",
  },
  evaluate(modules) {
    return modules
      .filter((m) => !m.isValid)
      .map((m) => ({
        ruleId: "TS-SYN-R001",
        severity: "Error" as const,
        title: "TS/TSX source must parse",
        path: m.path,
        line: 1,
        column: 1,
        fix: `fix syntax errors in ${m.path} then re-parse`,
        sourceLine: "",
        help: `${m.path} failed to parse${m.parseError ? `: ${m.parseError}` : ""}`,
        contract:
          "All TypeScript source files must parse without syntax errors. Broken syntax blocks downstream reasoning.",
      }));
  },
};

// ── TS-AGENT-PROJECT-001: package.json must expose stable library entry ──

const tsProjR001: TsRule = {
  descriptor: {
    id: "TS-AGENT-PROJECT-001",
    severity: "Error",
    title: "package.json must expose a stable library entry",
    contract:
      "Every package must declare `main`, `module`, or `exports` to expose a stable library entrypoint.",
  },
  evaluate(_modules) {
    // This rule needs package.json access. For the MVP, it's a no-op
    // since we only parse .ts/.tsx files.
    return [];
  },
};

// ── TS-AGENT-PROJECT-002: tsconfig must enable strict mode ──────────

const tsProjR002: TsRule = {
  descriptor: {
    id: "TS-AGENT-PROJECT-002",
    severity: "Error",
    title: "tsconfig must enable strict mode",
    contract: "tsconfig.json must set `strict: true` to enable full type-safety.",
  },
  evaluate(_modules) {
    // Needs tsconfig parsing — MVP no-op
    return [];
  },
};

// ── TS-AGENT-PROJECT-003: src/index.ts must stay facade-only ───────

const tsProjR003: TsRule = {
  descriptor: {
    id: "TS-AGENT-PROJECT-003",
    severity: "Error",
    title: "src/index.ts must stay facade-only",
    contract:
      "The public entrypoint `src/index.ts` must only re-export from submodules. No own business logic.",
  },
  evaluate(modules) {
    const indexModule = modules.find(
      (m) => slashPath(m.path).endsWith("/index.ts") || slashPath(m.path).endsWith("/index.tsx"),
    );
    if (indexModule === undefined) return [];

    const ownExports = indexModule.exports.filter(
      (e) => e.exportKind !== "reexport" && e.exportKind !== "star",
    );

    if (ownExports.length > 0) {
      return [
        {
          ruleId: "TS-AGENT-PROJECT-003",
          severity: "Error",
          title: "src/index.ts must stay facade-only",
          path: indexModule.path,
          line: ownExports[0]!.line,
          column: 1,
          fix: `remove own exports from ${indexModule.path} and re-export from submodules instead`,
          sourceLine: lineAt(indexModule, ownExports[0]!.line) ?? "",
          help: `${indexModule.path} has ${ownExports.length} own exports. Facade entrypoints must only re-export.`,
          contract:
            "The public entrypoint `src/index.ts` must only re-export from submodules. No own business logic.",
        },
      ];
    }

    return [];
  },
};

// ── TS-MOD-R001: owner must not import internal leaf ────────

const tsModR001: TsRule = {
  descriptor: {
    id: "TS-MOD-R001",
    severity: "Error",
    title: "Owner module must not import another owner's internal leaf",
    contract: "Internal modules (no public exports) must not be imported across owner boundaries.",
  },
  evaluate(modules) {
    const findings: TsCompactFinding[] = [];

    for (const mod of modules) {
      for (const imp of mod.imports) {
        if (!imp.moduleSpecifier.startsWith(".")) continue;
        // Simple check: if importing from a file that has no exports
        // In a real implementation, we'd resolve the specifier
      }
    }

    return findings;
  },
};

// ── TS-MOD-R002: owner dependency graph must be acyclic ─────

const tsModR002: TsRule = {
  descriptor: {
    id: "TS-MOD-R002",
    severity: "Error",
    title: "Owner dependency graph must be acyclic",
    contract: "The owner dependency graph must not contain cycles.",
  },
  evaluate(_modules) {
    // Build dep graph, detect cycles
    // MVP: simple stub — cycles need proper graph traversal
    return [];
  },
};
