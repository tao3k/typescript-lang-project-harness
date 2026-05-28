import type { TsCompactFinding, TsCompactOutput } from "./model.js";

export function renderCompactFindings(findings: readonly TsCompactFinding[]): TsCompactOutput {
  if (findings.length === 0) {
    return "[ok] ts";
  }

  const blocks = findings.map(renderSingle);
  return blocks.join("\n\n");
}

function renderSingle(f: TsCompactFinding): string {
  const lines: string[] = [];

  // Header: [RULE-ID] Severity: Title
  lines.push(`[${f.ruleId}] ${f.severity}: ${f.title}`);

  // Location: @ path:line:column
  lines.push(`@ ${f.path}:${f.line}:${f.column}`);

  // Fix
  lines.push(`fix: ${f.fix}`);

  // Source line
  if (f.sourceLine.length > 0) {
    const displayLine =
      f.sourceLine.length > 100 ? f.sourceLine.slice(0, 97) + "..." : f.sourceLine;
    lines.push(`line: ${f.line} | ${displayLine}`);
  }

  // Help
  lines.push(`Help: ${f.help}`);

  // Contract
  lines.push(`Contract: ${f.contract}`);

  return lines.join("\n");
}
