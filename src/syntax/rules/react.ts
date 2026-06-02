import type { TsCompactFinding } from "../model.js";
import { sourceOf, lineAt } from "./helpers.js";
import type { TsRule } from "./types.js";

export function reactRules(): readonly TsRule[] {
  return [tsReactR001, tsReactR002, tsReactR003, tsReactR004, tsReactR005, tsReactR006];
}

// ── R001: Component owns browser subscription ─────────────

const BROWSER_API_PATTERNS = [
  /chrome\.storage/,
  /browser\.storage/,
  /localStorage/,
  /sessionStorage/,
  /new WebSocket/,
  /setInterval\s*\(/,
  /setTimeout\s*\(/,
  /addEventListener\s*\(/,
  /navigator\./,
  /window\./,
  /document\./,
  /location\./,
];

const tsReactR001: TsRule = {
  descriptor: {
    id: "TS-REACT-R001",
    severity: "Info",
    title: "Component owns browser subscription",
    contract:
      "Move browser, storage, message, websocket, and timer subscriptions from component scope into owner-named hooks.",
  },
  evaluate(modules) {
    const findings: TsCompactFinding[] = [];
    for (const mod of modules) {
      if (!mod.isValid) continue;
      const source = sourceOf(mod);
      for (const comp of mod.reactFacts) {
        if (comp.factKind !== "component") continue;
        for (const pattern of BROWSER_API_PATTERNS) {
          const match = pattern.exec(source);
          if (match === null) continue;
          findings.push({
            ruleId: "TS-REACT-R001",
            severity: "Info",
            title: "Component owns browser subscription",
            path: mod.path,
            line: comp.line,
            column: 1,
            fix: `extract this browser subscription into an owner-named hook`,
            sourceLine: lineAt(mod, comp.line) ?? "",
            help: `${mod.path} component \`${comp.name}\` uses \`${match[0].trim()}\` inside component scope.`,
            contract:
              "Move browser, storage, message, websocket, and timer subscriptions from component scope into owner-named hooks.",
          });
          break; // one finding per component
        }
      }
    }
    return findings;
  },
};

// ── R002: Component mixes domain transformation + JSX ──────

const tsReactR002: TsRule = {
  descriptor: {
    id: "TS-REACT-R002",
    severity: "Info",
    title: "Component mixes domain transformation and JSX rendering",
    contract:
      "Separate domain logic from presentational rendering. Extract transformations into hooks or service modules.",
  },
  evaluate(modules) {
    const findings: TsCompactFinding[] = [];
    for (const mod of modules) {
      if (!mod.isValid) continue;
      for (const comp of mod.reactFacts) {
        if (comp.factKind !== "component") continue;
        // Check if this component has hook calls (indicates domain logic)
        // AND renders JSX (found by parser's isComponent check)
        // Component has hook calls (data fetching, state, memoization) + renders JSX
        const hasDomainLogic = comp.hookCalls.length > 0;
        const hasRendering = comp.isComponent;

        if (hasDomainLogic && hasRendering) {
          findings.push({
            ruleId: "TS-REACT-R002",
            severity: "Info",
            title: "Component mixes domain transformation and JSX rendering",
            path: mod.path,
            line: comp.line,
            column: 1,
            fix: `extract domain logic from \`${comp.name}\` into a custom hook`,
            sourceLine: lineAt(mod, comp.line) ?? "",
            help: `${mod.path} component \`${comp.name}\` mixes ${comp.hookCalls.length} hook calls with JSX rendering.`,
            contract:
              "Separate domain logic from presentational rendering. Extract transformations into hooks or service modules.",
          });
        }
      }
    }
    return findings;
  },
};

// ── R003: Custom hook returns anonymous tuple ──────────────

const tsReactR003: TsRule = {
  descriptor: {
    id: "TS-REACT-R003",
    severity: "Info",
    title: "Custom hook returns anonymous tuple for semantic values",
    contract:
      "Custom hooks must return named objects, not anonymous tuples, for semantic return values.",
  },
  evaluate(modules) {
    const findings: TsCompactFinding[] = [];
    for (const mod of modules) {
      if (!mod.isValid) continue;
      const source = sourceOf(mod);
      for (const hook of mod.reactFacts) {
        if (hook.factKind !== "hook") continue;
        // Check if the hook function body contains `return [` indicating tuple return
        const body = findFunctionBody(source, hook.name);
        if (body !== undefined && /return\s*\[/.test(body)) {
          findings.push({
            ruleId: "TS-REACT-R003",
            severity: "Info",
            title: "Custom hook returns anonymous tuple for semantic values",
            path: mod.path,
            line: hook.line,
            column: 1,
            fix: `replace anonymous tuple return in \`${hook.name}\` with a named return type`,
            sourceLine: lineAt(mod, hook.line) ?? "",
            help: `${mod.path} hook \`${hook.name}\` returns an anonymous tuple. Use a named object or typed record.`,
            contract:
              "Custom hooks must return named objects, not anonymous tuples, for semantic return values.",
          });
        }
      }
    }
    return findings;
  },
};

// ── R004: Component props expose multiple boolean flags ────

const tsReactR004: TsRule = {
  descriptor: {
    id: "TS-REACT-R004",
    severity: "Info",
    title: "Component props expose multiple boolean flags",
    contract:
      "Component prop types with >1 boolean field should use a semantic enum or union type instead.",
  },
  evaluate(modules) {
    const findings: TsCompactFinding[] = [];
    for (const mod of modules) {
      if (!mod.isValid) continue;
      const source = sourceOf(mod);
      for (const comp of mod.reactFacts) {
        if (comp.factKind !== "component") continue;
        const boolCount = countBooleanProps(source, comp.name);
        if (boolCount > 1) {
          findings.push({
            ruleId: "TS-REACT-R004",
            severity: "Info",
            title: "Component props expose multiple boolean flags",
            path: mod.path,
            line: comp.line,
            column: 1,
            fix: `replace ${boolCount} boolean props in \`${comp.name}\` with a semantic enum or union type`,
            sourceLine: lineAt(mod, comp.line) ?? "",
            help: `${mod.path} component \`${comp.name}\` has ${boolCount} boolean props.`,
            contract:
              "Component prop types with >1 boolean field should use a semantic enum or union type instead.",
          });
        }
      }
    }
    return findings;
  },
};

// ── R005: Context provider value surface too broad ─────────

const tsReactR005: TsRule = {
  descriptor: {
    id: "TS-REACT-R005",
    severity: "Info",
    title: "Context provider value surface is too broad",
    contract:
      "React Context values should expose ≤6 properties. Split broad contexts into focused sub-contexts.",
  },
  evaluate(modules) {
    const findings: TsCompactFinding[] = [];
    for (const mod of modules) {
      if (!mod.isValid) continue;
      const source = sourceOf(mod);
      const contextValues = findContextValues(source);
      for (const ctx of contextValues) {
        if (ctx.propCount > 6) {
          findings.push({
            ruleId: "TS-REACT-R005",
            severity: "Info",
            title: "Context provider value surface is too broad",
            path: mod.path,
            line: ctx.line,
            column: 1,
            fix: `split the ${ctx.propCount} properties in this context value into focused sub-contexts`,
            sourceLine: lineAt(mod, ctx.line) ?? "",
            help: `${mod.path} context value has ${ctx.propCount} properties (> 6).`,
            contract:
              "React Context values should expose ≤6 properties. Split broad contexts into focused sub-contexts.",
          });
        }
      }
    }
    return findings;
  },
};

// ── R006: useEffect body owns broad logic ────────────

const tsReactR006: TsRule = {
  descriptor: {
    id: "TS-REACT-R006",
    severity: "Info",
    title: "useEffect body owns broad logic instead of calling named helpers",
    contract:
      "useEffect callbacks should delegate to named helper functions, not inline broad logic (>15 statements).",
  },
  evaluate(modules) {
    const findings: TsCompactFinding[] = [];
    for (const mod of modules) {
      if (!mod.isValid) continue;
      const source = sourceOf(mod);
      for (const comp of mod.reactFacts) {
        if (comp.factKind !== "component") continue;
        if (comp.effectCalls.length === 0) continue;
        // Scan source for each useEffect call and count body
        for (const effName of comp.effectCalls) {
          const stmtCount = countEffectBodyAt(source, effName);
          if (stmtCount > 15) {
            findings.push({
              ruleId: "TS-REACT-R006",
              severity: "Info",
              title: "useEffect body owns broad logic instead of calling named helpers",
              path: mod.path,
              line: comp.line,
              column: 1,
              fix: `extract the ${stmtCount}-statement effect body into named helper functions`,
              sourceLine: lineAt(mod, comp.line) ?? "",
              help: `${mod.path} component \`${comp.name}\` has a useEffect with ${stmtCount} statements (> 15).`,
              contract:
                "useEffect callbacks should delegate to named helper functions, not inline broad logic (>15 statements).",
            });
          }
        }
      }
    }
    return findings;
  },
};

// ── Helpers ────────────────────────────────────────────────

function findFunctionBody(source: string, name: string): string | undefined {
  // Simple regex: find `function name(...) { ... }` or `const name = (...) => { ... }`
  const re = new RegExp(
    `(?:function\\s+${escapeRegex(name)}\\s*\\([^)]*\\)\\s*\\{|const\\s+${escapeRegex(name)}\\s*=\\s*(?:\\([^)]*\\)\\s*=>\\s*\\{))([\\s\\S]*?)\\n\\}`,
    "m",
  );
  const match = re.exec(source);
  return match?.[1];
}

function countBooleanProps(source: string, componentName: string): number {
  // Look for an interface/type with Props pattern near the component name
  const propsPatterns = [
    new RegExp(`${escapeRegex(componentName)}Props\\s*=\\s*\\{([^}]*)\\}`, "m"),
    new RegExp(`interface\\s+${escapeRegex(componentName)}Props\\s*\\{([^}]*)\\}`, "m"),
    new RegExp(`type\\s+${escapeRegex(componentName)}Props\\s*=\\s*\\{([^}]*)\\}`, "m"),
  ];

  for (const pattern of propsPatterns) {
    const match = pattern.exec(source);
    if (match?.[1] !== undefined) {
      const body = match[1];
      return (body.match(/:\s*boolean/g) ?? []).length;
    }
  }

  return 0;
}

interface ContextValue {
  line: number;
  propCount: number;
}

function findContextValues(source: string): ContextValue[] {
  const results: ContextValue[] = [];
  const lines = source.split("\n");
  let inValueObj = false;
  let braceDepth = 0;
  let propCount = 0;
  let lineStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (!inValueObj) {
      if (/value\s*=\s*\{/.test(line)) {
        inValueObj = true;
        braceDepth = 1; // the opening brace is on this line
        propCount = 0;
        lineStart = i + 1;
      }
      continue;
    }

    // Track brace depth for subsequent lines
    for (const ch of line) {
      if (ch === "{") braceDepth++;
      else if (ch === "}") braceDepth--;
    }

    // Count property assignments at depth 1
    if (braceDepth === 1 && /\w+\s*:/.test(line) && !line.trimStart().startsWith("//")) {
      propCount++;
    }

    // End of value object
    if (braceDepth <= 0) {
      if (propCount > 0) {
        results.push({ line: lineStart, propCount });
      }
      inValueObj = false;
    }
  }

  return results;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countEffectBodyAt(source: string, effectName: string): number {
  // Find `useEffect(() => { ... }` or `React.useEffect(() => { ... }` etc
  const re = new RegExp(`${escapeRegex(effectName)}\\s*\\(\\s*\\(\\s*\\)\\s*=>\\s*\\{`);
  const match = re.exec(source);
  if (match === null) return 0;

  const startIdx = match.index + match[0].length;
  // Walk forward counting braces and statements
  let braceDepth = 1;
  let stmtCount = 0;
  const lines = source.slice(startIdx).split("\n");

  for (const line of lines) {
    for (const ch of line) {
      if (ch === "{") braceDepth++;
      else if (ch === "}") braceDepth--;
    }
    const trimmed = line.trim();
    if (
      braceDepth >= 1 &&
      trimmed.length > 0 &&
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("/*")
    ) {
      stmtCount++;
    }
    if (braceDepth <= 0) break;
  }

  return stmtCount;
}
