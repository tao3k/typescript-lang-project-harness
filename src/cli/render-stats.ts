/** Project statistics (files, roots, branches, deps, findings) and harness findings grouped by rule. */
import type { TypeScriptHarnessReport } from "../model.js";

export function renderStats(report: TypeScriptHarnessReport): string {
  const tree = report.reasoningTree;
  const f = report.findings;
  const modules = tree.modules.length;
  const branches = tree.ownerBranches.length;
  const deps = tree.ownerDependencies.filter((d) => !d.isTestContext).length;
  const roots = tree.modules.filter((m) => m.role === "entrypoint" || m.role === "facade").length;
  const errors = f.filter((x) => x.severity === "error").length;
  const warnings = f.filter((x) => x.severity === "warning").length;
  const advice = f.filter((x) => x.severity === "info").length;
  const extCount = tree.packageExtensions.length;

  const parts = [`files=${modules}`, `roots=${roots}`, `branches=${branches}`, `deps=${deps}`];
  if (errors > 0) parts.push(`errors=${errors}`);
  if (warnings > 0) parts.push(`warnings=${warnings}`);
  if (advice > 0) parts.push(`advice=${advice}`);
  if (tree.orphanedSourceFiles.length > 0)
    parts.push(`orphaned=${tree.orphanedSourceFiles.length}`);
  if (extCount > 0) parts.push(`ext=${extCount}`);

  return `[stats] ${parts.join(" ")}\n`;
}

/** Harness findings grouped by rule. Default: suppress TS-SEM and info-level noise. */
export function renderHarnessFindings(report: TypeScriptHarnessReport): string {
  return renderHarnessFindingsWith(report, { includeSemantic: false, minSeverity: "info" });
}

export interface HarnessFindingsOptions {
  /** Show TS-SEM-R001 TypeScript semantic diagnostics. Default false. */
  readonly includeSemantic: boolean;
  /** Minimum severity to show ("info" | "warning" | "error"). Default "warning". */
  readonly minSeverity: "info" | "warning" | "error";
}

export function renderHarnessFindingsWith(
  report: TypeScriptHarnessReport,
  opts: HarnessFindingsOptions,
): string {
  const semTotal = report.findings.filter((f) => f.ruleId === "TS-SEM-R001").length;

  // Filter: skip TS-SEM unless explicitly included
  let filtered = report.findings;
  if (!opts.includeSemantic) {
    filtered = filtered.filter((f) => f.ruleId !== "TS-SEM-R001");
  }

  // Filter by severity
  if (opts.minSeverity !== "info") {
    const keep: string[] = opts.minSeverity === "error" ? ["error"] : ["error", "warning"];
    filtered = filtered.filter((f) => keep.includes(f.severity));
  }

  // Group by rule + severity + title
  const groups = new Map<
    string,
    { severity: string; ruleId: string; title: string; locations: string[] }
  >();
  for (const f of filtered) {
    const key = `${f.severity}\0${f.ruleId}\0${f.title}`;
    const g = groups.get(key);
    if (g) {
      g.locations.push(f.location.path ?? "?");
    } else {
      groups.set(key, {
        severity: f.severity,
        ruleId: f.ruleId,
        title: f.title,
        locations: [f.location.path ?? "?"],
      });
    }
  }

  const rows = [...groups.values()].sort((a, b) => {
    const sev = (s: string) => (s === "error" ? 0 : s === "warning" ? 1 : 2);
    return sev(a.severity) - sev(b.severity) || b.locations.length - a.locations.length;
  });

  const visible = filtered.length;
  const total = report.findings.length;
  const semLabel =
    !opts.includeSemantic && semTotal > 0 ? ` (${semTotal} semantic suppressed)` : "";

  if (visible === 0 && !opts.includeSemantic && semTotal > 0) {
    return `[harness] ${total} total${semLabel}\n`;
  }
  if (visible === 0) {
    return "[harness] ok\n";
  }

  const lines = [`[harness] ${visible} visible / ${total} total${semLabel}`];
  for (const row of rows.slice(0, 20)) {
    const topLocations = [...new Set(row.locations)].slice(0, 2);
    const locLabel = topLocations.join(", ");
    const icon = row.severity === "error" ? "✗" : "⚠";
    lines.push(`  ${icon} ${row.ruleId} x${row.locations.length}  ${row.title}  (${locLabel})`);
  }
  if (rows.length > 20) {
    lines.push(`  ... +${rows.length - 20} more groups`);
  }
  return lines.join("\n") + "\n";
}
