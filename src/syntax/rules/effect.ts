import type { TsCompactFinding, TsParsedModule } from "../model.js";
import { sourceOf, lineAt } from "./helpers.js";
import type { TsRule } from "./types.js";

export function effectRules(): readonly TsRule[] {
  return [
    tsEffectR001,
    tsEffectR002,
    tsEffectR003,
    tsEffectR004,
    tsEffectR005,
    tsEffectR006,
    tsEffectR007,
  ];
}

// ── R001: Service interface leaks implementation dependency ─

const tsEffectR001: TsRule = {
  descriptor: {
    id: "TS-EFFECT-R001",
    severity: "Info",
    title: "Service interface must not expose implementation dependency",
    contract:
      "Effect service interfaces must only expose context tags and service types. Implementation dependencies stay in the layer.",
  },
  evaluate(modules) {
    const findings: TsCompactFinding[] = [];
    for (const mod of modules) {
      if (!mod.isValid) continue;
      // Detect tag+layer co-location from effect facts OR source scanning
      const hasLayer = mod.effectFacts.some((f) => f.factKind === "layer");
      const hasContext = mod.effectFacts.some((f) => f.factKind === "context");
      const sourceCoLocated = detectTagLayerCoLocation(mod);
      const effectiveCoLocated = (hasLayer && hasContext) || sourceCoLocated;
      if (effectiveCoLocated) {
        const lineNo = sourceCoLocated?.line ?? 1;
        findings.push({
          ruleId: "TS-EFFECT-R001",
          severity: "Info",
          title: "Service interface must not expose implementation dependency",
          path: mod.path,
          line: lineNo,
          column: 1,
          fix: `extract context tag and service interface into a separate module`,
          sourceLine: lineAt(mod, lineNo) ?? "",
          help: `${mod.path} defines both context tag and layer. Separate interface from implementation.`,
          contract:
            "Effect service interfaces must only expose context tags and service types. Implementation dependencies stay in the layer.",
        });
      }
    }
    return findings;
  },
};

// ── R002: Service reads process.env / global config ────────

const tsEffectR002: TsRule = {
  descriptor: {
    id: "TS-EFFECT-R002",
    severity: "Info",
    title: "Effect service reads global environment",
    contract:
      "Effect service implementations should receive runtime configuration through layers, not read process.env directly.",
  },
  evaluate(modules) {
    const findings: TsCompactFinding[] = [];
    for (const mod of modules) {
      if (!mod.isValid) continue;
      if (!isEffectModule(mod)) continue;
      const source = sourceOf(mod);
      const envPatterns = [
        { re: /process\.env\./, label: "process.env" },
        { re: /global\./, label: "global" },
        { re: /import\.meta\.env/, label: "import.meta.env" },
      ];
      for (const { re, label } of envPatterns) {
        const match = re.exec(source);
        if (match) {
          const lineNo = source.slice(0, match.index).split("\n").length;
          findings.push({
            ruleId: "TS-EFFECT-R002",
            severity: "Info",
            title: "Effect service reads global environment",
            path: mod.path,
            line: lineNo,
            column: 1,
            fix: `move this environment read into a config layer`,
            sourceLine: lineAt(mod, lineNo) ?? "",
            help: `${mod.path} reads \`${label}\` inside an Effect service module.`,
            contract:
              "Effect service implementations should receive runtime configuration through layers, not read process.env directly.",
          });
          break;
        }
      }
    }
    return findings;
  },
};

// ── R003: Live layer imports test/mock dependency ──────────

const tsEffectR003: TsRule = {
  descriptor: {
    id: "TS-EFFECT-R003",
    severity: "Info",
    title: "Live layer must not import test/mock dependency",
    contract:
      "Effect live layers must only depend on production modules. Test doubles belong in test-scoped layers.",
  },
  evaluate(modules) {
    const findings: TsCompactFinding[] = [];
    for (const mod of modules) {
      if (!mod.isValid) continue;
      const isEffectModule = mod.effectFacts.some(
        (f) => f.factKind === "layer" || f.factKind === "runtime",
      );
      if (!isEffectModule) continue;
      for (const imp of mod.imports) {
        const spec = imp.moduleSpecifier;
        if (isTestImport(spec)) {
          findings.push({
            ruleId: "TS-EFFECT-R003",
            severity: "Info",
            title: "Live layer must not import test/mock dependency",
            path: mod.path,
            line: imp.line,
            column: 1,
            fix: `replace the test/mock import \`${spec}\` with a production dependency`,
            sourceLine: lineAt(mod, imp.line) ?? "",
            help: `${mod.path} imports \`${spec}\` which looks like a test or mock module.`,
            contract:
              "Effect live layers must only depend on production modules. Test doubles belong in test-scoped layers.",
          });
          break;
        }
      }
    }
    return findings;
  },
};

// ── R004: Error channel uses any/unknown ───────────────────

const tsEffectR004: TsRule = {
  descriptor: {
    id: "TS-EFFECT-R004",
    severity: "Info",
    title: "Effect error channel must not use any/unknown",
    contract:
      "Effect service error channels must use typed errors. Avoid `Effect<never, any>` or `Effect<never, unknown>`.",
  },
  evaluate(modules) {
    const findings: TsCompactFinding[] = [];
    for (const mod of modules) {
      if (!mod.isValid) continue;
      if (!isEffectModule(mod)) continue;
      const source = sourceOf(mod);
      const re = /Effect<\w+,\s*(any|unknown)\s*,/g;
      let match;
      while ((match = re.exec(source)) !== null) {
        const lineNo = source.slice(0, match.index).split("\n").length;
        findings.push({
          ruleId: "TS-EFFECT-R004",
          severity: "Info",
          title: "Effect error channel must not use any/unknown",
          path: mod.path,
          line: lineNo,
          column: 1,
          fix: `replace \`Effect<..., ${match[1]}, ...>\` with a typed error channel`,
          sourceLine: lineAt(mod, lineNo) ?? "",
          help: `${mod.path} uses \`${match[0]}\` with untyped error channel \`${match[1]}\`.`,
          contract:
            "Effect service error channels must use typed errors. Avoid `Effect<never, any>` or `Effect<never, unknown>`.",
        });
        break; // one finding per module
      }
    }
    return findings;
  },
};

// ── R005: Layer graph must be acyclic (stub) ───────────────

const tsEffectR005: TsRule = {
  descriptor: {
    id: "TS-EFFECT-R005",
    severity: "Info",
    title: "Layer graph must be acyclic",
    contract:
      "The Effect layer dependency graph must not contain cycles. Use Layer.merge and Layer.provide correctly.",
  },
  evaluate() {
    // Stub: full layer graph traversal needs cross-module analysis.
    // Deferred until the reasoning tree supports layer-edge tracking.
    return [];
  },
};

// ── R006: Tag/interface/construction not separated ─────────

const tsEffectR006: TsRule = {
  descriptor: {
    id: "TS-EFFECT-R006",
    severity: "Info",
    title: "Service tag, interface, and construction should be separated",
    contract:
      "Effect services should separate the context tag, interface type, and layer construction into distinct declarations or files.",
  },
  evaluate(modules) {
    const findings: TsCompactFinding[] = [];
    for (const mod of modules) {
      if (!mod.isValid) continue;
      const coLoc = detectTagLayerCoLocation(mod);
      if (coLoc !== undefined) {
        findings.push({
          ruleId: "TS-EFFECT-R006",
          severity: "Info",
          title: "Service tag, interface, and construction should be separated",
          path: mod.path,
          line: coLoc.line,
          column: 1,
          fix: `move the service construction (Layer) to a separate implementation module`,
          sourceLine: lineAt(mod, coLoc.line) ?? "",
          help: `${mod.path} contains both Context.Tag and Layer in the same file. Consider separation.`,
          contract:
            "Effect services should separate the context tag, interface type, and layer construction into distinct declarations or files.",
        });
      }
    }
    return findings;
  },
};

// ── R007: Promise exposed from service boundary ────────────

const tsEffectR007: TsRule = {
  descriptor: {
    id: "TS-EFFECT-R007",
    severity: "Info",
    title: "Project using Effect should not expose Promise from service boundary",
    contract:
      "Effect service boundaries should expose Effect types, not raw Promise, unless explicitly documented for interop.",
  },
  evaluate(modules) {
    const findings: TsCompactFinding[] = [];
    for (const mod of modules) {
      if (!mod.isValid) continue;
      if (!isEffectModule(mod)) continue;
      const source = sourceOf(mod);
      // Check exported functions that return Promise
      const lines = source.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (
          /export\s+(async\s+)?function.*:\s*Promise</.test(line) ||
          /export\s+const\s+\w+\s*=\s*async\s*\(.*\):\s*Promise</.test(line)
        ) {
          findings.push({
            ruleId: "TS-EFFECT-R007",
            severity: "Info",
            title: "Project using Effect should not expose Promise from service boundary",
            path: mod.path,
            line: i + 1,
            column: 1,
            fix: `replace the Promise return type with an Effect type and document the interop boundary`,
            sourceLine: line.trimEnd(),
            help: `${mod.path} exports a function returning \`Promise\` in an Effect module. Use \`Effect\` types for service boundaries.`,
            contract:
              "Effect service boundaries should expose Effect types, not raw Promise, unless explicitly documented for interop.",
          });
          break;
        }
      }
    }
    return findings;
  },
};

// ── Helper ─────────────────────────────────────────────────

function isTestImport(spec: string): boolean {
  return /\b(test|mock|fixture|stub|fake|dummy)\b/i.test(spec);
}

/** Detect whether a module uses Effect-TS by checking imports or effect facts. */
function isEffectModule(mod: TsParsedModule): boolean {
  if (mod.effectFacts.length > 0) return true;
  return mod.imports.some(
    (imp) => imp.moduleSpecifier === "effect" || imp.moduleSpecifier.startsWith("effect/"),
  );
}

/** Source-level detection of Context.Tag + Layer in the same module. */
function detectTagLayerCoLocation(mod: TsParsedModule): { line: number } | undefined {
  if (!isEffectModule(mod)) return undefined;
  const source = sourceOf(mod);
  const hasTag = /\bContext\.Tag\b/.test(source) || /\bGenericTag\b/.test(source);
  const hasLayer = /\bLayer\.(effect|succeed|scope|merge)\b/.test(source);
  if (hasTag && hasLayer) {
    const layerIdx = source.search(/\bLayer\./);
    const lineNo = source.slice(0, layerIdx >= 0 ? layerIdx : 0).split("\n").length;
    return { line: lineNo };
  }
  return undefined;
}
