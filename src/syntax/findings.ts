import fs from "node:fs";
import type { TsCompactFinding, TsParsedModule } from "./model.js";

export function buildCompactFindings(
  modules: readonly TsParsedModule[],
): readonly TsCompactFinding[] {
  const findings: TsCompactFinding[] = [];

  for (const mod of modules) {
    if (!mod.isValid) {
      findings.push(syntaxErrorFinding(mod));
      continue;
    }

    for (const fn of mod.functions) {
      findings.push(...functionFindings(mod, fn.name, fn));
    }
  }

  return findings.sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.path.localeCompare(b.path));
}

function syntaxErrorFinding(mod: TsParsedModule): TsCompactFinding {
  return {
    ruleId: "AGENT-TS-R001",
    severity: "Error",
    title: "Syntax error in TypeScript source file",
    path: mod.path,
    line: 1,
    column: 1,
    fix: `fix the syntax errors in ${mod.path} then re-parse`,
    sourceLine: "",
    help: `${mod.path} failed to parse${mod.parseError ? `: ${mod.parseError}` : ""}`,
    contract: "All TypeScript source files must parse without syntax errors.",
  };
}

interface FnMetrics {
  readonly name: string;
  readonly exported: boolean;
  readonly async: boolean;
  readonly line: number;
  readonly lineSpan: number;
  readonly statementCount: number;
  readonly maxNestingDepth: number;
  readonly branchCount: number;
  readonly loopCount: number;
  readonly awaitCount: number;
  readonly tryCatchCount: number;
  readonly booleanParamCount: number;
  readonly positionalParamCount: number;
  readonly usesAny: boolean;
  readonly usesUnknown: boolean;
  readonly returnsAnonymousTuple: boolean;
}

function functionFindings(mod: TsParsedModule, name: string, fn: FnMetrics): TsCompactFinding[] {
  const results: TsCompactFinding[] = [];
  const sourceLine = readLine(mod.path, fn.line) ?? "";

  if (fn.positionalParamCount > 3 && fn.exported) {
    results.push({
      ruleId: "AGENT-TS-R007",
      severity: "Info",
      title: "Exported function exposes broad positional parameter surface",
      path: mod.path,
      line: fn.line,
      column: 1,
      fix: `replace this positional surface with a named options type`,
      sourceLine,
      help: `${mod.path} exposes exported function \`${name}\` with ${fn.positionalParamCount} positional parameters.`,
      contract:
        "Replace broad exported positional parameter lists with a named options type or destructured parameter object.",
    });
  }

  if (fn.maxNestingDepth > 4 && fn.exported) {
    results.push({
      ruleId: "AGENT-TS-R004",
      severity: "Info",
      title: "Exported function hides algorithm behind nested control flow",
      path: mod.path,
      line: fn.line,
      column: 1,
      fix: `extract deeply nested blocks into named helper functions`,
      sourceLine,
      help: `${mod.path} exports function \`${name}\` with maximum nesting depth ${fn.maxNestingDepth} (> 4).`,
      contract:
        "Extract deeply nested control flow into named helper functions with clear contracts.",
    });
  }

  if (fn.branchCount > 8 && fn.exported) {
    results.push({
      ruleId: "AGENT-TS-R005",
      severity: "Info",
      title: "Exported function has high cyclomatic complexity",
      path: mod.path,
      line: fn.line,
      column: 1,
      fix: `split into smaller functions each handling one branch path`,
      sourceLine,
      help: `${mod.path} exports function \`${name}\` with ${fn.branchCount} branches (> 8).`,
      contract:
        "Split functions with high branch counts into smaller, single-responsibility functions.",
    });
  }

  if (fn.usesAny && fn.exported) {
    results.push({
      ruleId: "AGENT-TS-R011",
      severity: "Info",
      title: "Exported function uses `any` in public API surface",
      path: mod.path,
      line: fn.line,
      column: 1,
      fix: `replace \`any\` with a precise type or \`unknown\` + validation`,
      sourceLine,
      help: `${mod.path} exports function \`${name}\` whose body or return type references \`any\`.`,
      contract:
        "Avoid `any` in public API surfaces. Use precise types or `unknown` with runtime validation.",
    });
  }

  if (fn.returnsAnonymousTuple && fn.exported) {
    results.push({
      ruleId: "AGENT-TS-R010",
      severity: "Info",
      title: "Exported function returns anonymous tuple type",
      path: mod.path,
      line: fn.line,
      column: 1,
      fix: `declare a named type alias for the return tuple`,
      sourceLine,
      help: `${mod.path} exports function \`${name}\` with an anonymous tuple return type.`,
      contract: "Use named type aliases for tuple return types in public APIs.",
    });
  }

  return results;
}

function readLine(filePath: string, lineNumber: number): string | undefined {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    return lines[lineNumber - 1]?.trimEnd();
  } catch {
    return undefined;
  }
}
