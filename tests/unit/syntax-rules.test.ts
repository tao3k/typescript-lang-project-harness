import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateRules } from "../../src/syntax/rules/catalog.js";
import { parseModule as parseSingle } from "../../src/syntax/parse-module.js";
import { renderCompactFindings } from "../../src/syntax/render-finding.js";

// Use URL-based resolution to find fixtures in the source tree.
// Compiled: dist/tests/unit/ → go up 3 to project root → tests/fixtures/syntax_rules/
const POS = path.resolve(
  new URL("../../../tests/fixtures/syntax_rules/pos", import.meta.url).pathname,
);
const NEG = path.resolve(
  new URL("../../../tests/fixtures/syntax_rules/neg", import.meta.url).pathname,
);

describe("rule packs", () => {
  // ── Positive fixtures (should trigger) ──────────────────

  it("TS-SYN-R001: detects syntax errors", () => {
    const mod = parseSingle(path.join(POS, "r001-syntax-error.ts"));
    const findings = evaluateRules([mod]);
    const errs = findings.filter((f) => f.ruleId === "TS-SYN-R001");
    assert.equal(errs.length, 1, "syntax error should trigger R001");
  });

  it("AGENT-TS-R001: detects missing module doc", () => {
    const mod = parseSingle(path.join(POS, "r001-no-doc.ts"));
    const findings = evaluateRules([mod]);
    const docs = findings.filter((f) => f.ruleId === "AGENT-TS-R001");
    assert.equal(docs.length, 1, "no doc should trigger R001");
  });

  it("AGENT-TS-R003: detects generic bucket path", () => {
    const mod = parseSingle(path.join(POS, "utils", "r003-generic-bucket.ts"));
    const findings = evaluateRules([mod]);
    const buckets = findings.filter((f) => f.ruleId === "AGENT-TS-R003");
    assert.equal(buckets.length, 1, "generic bucket should trigger R003");
  });

  it("AGENT-TS-R006: detects multiple boolean flags", () => {
    const mod = parseSingle(path.join(POS, "r006-bool-flags.ts"));
    const findings = evaluateRules([mod]);
    const flags = findings.filter((f) => f.ruleId === "AGENT-TS-R006");
    assert.equal(flags.length, 1, "3 bool flags should trigger R006");
    assert.ok(flags[0]!.help.includes("search"), "names the function");
  });

  it("AGENT-TS-R008: detects deep nesting", () => {
    const mod = parseSingle(path.join(POS, "r008-deep-nesting.ts"));
    const findings = evaluateRules([mod]);
    const nest = findings.filter((f) => f.ruleId === "AGENT-TS-R008");
    assert.equal(nest.length, 1, "depth 6 should trigger R008");
    assert.ok(nest[0]!.help.includes("processData"), "names the function");
  });

  it("AGENT-TS-R009: detects broad linear algorithm", () => {
    const mod = parseSingle(path.join(POS, "r009-broad-linear.ts"));
    const findings = evaluateRules([mod]);
    const linear = findings.filter((f) => f.ruleId === "AGENT-TS-R009");
    assert.equal(linear.length, 1, ">30 statements should trigger R009");
  });

  it("AGENT-TS-R012: detects too many facade exports", () => {
    const mod = parseSingle(path.join(POS, "r012-too-many-exports.ts"));
    const findings = evaluateRules([mod]);
    const facade = findings.filter((f) => f.ruleId === "AGENT-TS-R012");
    assert.equal(facade.length, 1, ">12 exports should trigger R012");
    assert.ok(facade[0]!.help.includes("13"), "names the count");
  });

  it("TS-PROJ-R003: detects non-facade index.ts", () => {
    const mod = parseSingle(path.join(POS, "index.ts"));
    const findings = evaluateRules([mod]);
    const index = findings.filter((f) => f.ruleId === "TS-PROJ-R003");
    assert.equal(index.length, 1, "own exports in index should trigger PROJ-R003");
  });

  // ── Negative fixtures (should NOT trigger) ──────────────

  it("TS-SYN-R001 negative: valid syntax is clean", () => {
    const mod = parseSingle(path.join(NEG, "r001-valid-syntax.ts"));
    const findings = evaluateRules([mod]);
    const errs = findings.filter((f) => f.ruleId === "TS-SYN-R001");
    assert.equal(errs.length, 0);
  });

  it("AGENT-TS-R001 negative: documented module is clean", () => {
    const mod = parseSingle(path.join(NEG, "r001-has-doc.ts"));
    const findings = evaluateRules([mod]);
    const docs = findings.filter((f) => f.ruleId === "AGENT-TS-R001");
    assert.equal(docs.length, 0);
  });

  it("AGENT-TS-R003 negative: domain-named dir is clean", () => {
    const mod = parseSingle(path.join(NEG, "r003-domain-dir.ts"));
    const findings = evaluateRules([mod]);
    const buckets = findings.filter((f) => f.ruleId === "AGENT-TS-R003");
    assert.equal(buckets.length, 0);
  });

  it("AGENT-TS-R006 negative: single bool flag is clean", () => {
    const mod = parseSingle(path.join(NEG, "r006-one-bool.ts"));
    const findings = evaluateRules([mod]);
    const flags = findings.filter((f) => f.ruleId === "AGENT-TS-R006");
    assert.equal(flags.length, 0);
  });

  it("AGENT-TS-R008 negative: shallow nesting is clean", () => {
    const mod = parseSingle(path.join(NEG, "r008-shallow.ts"));
    const findings = evaluateRules([mod]);
    const nest = findings.filter((f) => f.ruleId === "AGENT-TS-R008");
    assert.equal(nest.length, 0);
  });

  it("AGENT-TS-R009 negative: small function is clean", () => {
    const mod = parseSingle(path.join(NEG, "r009-small.ts"));
    const findings = evaluateRules([mod]);
    const linear = findings.filter((f) => f.ruleId === "AGENT-TS-R009");
    assert.equal(linear.length, 0);
  });

  it("AGENT-TS-R012 negative: reasonable export count is clean", () => {
    const mod = parseSingle(path.join(NEG, "r012-reasonable-exports.ts"));
    const findings = evaluateRules([mod]);
    const facade = findings.filter((f) => f.ruleId === "AGENT-TS-R012");
    assert.equal(facade.length, 0);
  });

  it("TS-PROJ-R003 negative: facade-only index.ts is clean", () => {
    const mod = parseSingle(path.join(NEG, "index.ts"));
    const findings = evaluateRules([mod]);
    const index = findings.filter((f) => f.ruleId === "TS-PROJ-R003");
    assert.equal(index.length, 0);
  });

  // ── Snapshot tests ────────────────────────────────────────

  it("compact snapshot: all positive fixtures produce stable output", () => {
    const allFindings = evaluateAll(posFixtures());
    const output = renderCompactFindings(allFindings);
    // Must not be clean
    assert.ok(output !== "[ok] ts", "positive fixtures should produce findings");
    // Each finding block has required fields
    for (const block of output.split("\n\n")) {
      assert.ok(
        block.includes("fix:") || block === "[ok] ts",
        `block missing fix:\n${block.slice(0, 80)}`,
      );
      assert.ok(
        block.includes("Help:") || block === "[ok] ts",
        `block missing Help:\n${block.slice(0, 80)}`,
      );
      assert.ok(
        block.includes("Contract:") || block === "[ok] ts",
        `block missing Contract:\n${block.slice(0, 80)}`,
      );
    }
  });

  it("compact snapshot: no false positives on negative fixtures", () => {
    const allFindings = evaluateAll(negFixtures());
    const output = renderCompactFindings(allFindings);
    assert.equal(output, "[ok] ts", "negative fixtures should be clean");
  });

  it("JSON snapshot: findings are structurally valid", () => {
    const allFindings = evaluateAll(posFixtures());
    for (const f of allFindings) {
      // Every finding must have all required fields
      assert.ok(f.ruleId.startsWith("TS-") || f.ruleId.startsWith("AGENT-TS-"));
      assert.ok(f.severity === "Error" || f.severity === "Info");
      assert.ok(f.title.length > 0, `empty title for ${f.ruleId}`);
      assert.ok(f.path.length > 0, `empty path for ${f.ruleId}`);
      assert.ok(f.line > 0, `invalid line for ${f.ruleId}`);
      assert.ok(f.column > 0, `invalid column for ${f.ruleId}`);
      assert.ok(f.fix.length > 0, `empty fix for ${f.ruleId}`);
      assert.ok(f.help.length > 0, `empty help for ${f.ruleId}`);
      assert.ok(f.contract.length > 0, `empty contract for ${f.ruleId}`);
    }
  });

  it("blocking errors appear first in sorted output", () => {
    const allFindings = evaluateAll(posFixtures());
    if (allFindings.length >= 2) {
      const firstError = allFindings.findIndex((f) => f.severity === "Error");
      const firstInfo = allFindings.findIndex((f) => f.severity === "Info");
      if (firstError >= 0 && firstInfo >= 0) {
        assert.ok(firstError < firstInfo, "errors must come before info");
      }
    }
  });

  // ── React rules ─────────────────────────────────────────

  it("TS-REACT-R001: detects browser subscription in component", () => {
    const mod = parseSingle(path.join(POS, "r001-browser-api.tsx"));
    const findings = evaluateRules([mod]);
    const r001 = findings.filter((f) => f.ruleId === "TS-REACT-R001");
    assert.equal(r001.length, 1, "chrome.storage should trigger R001");
    assert.ok(r001[0]!.help.includes("AutoSave"));
  });

  it("TS-REACT-R002: detects mixed concerns", () => {
    const mod = parseSingle(path.join(POS, "r002-mixed-concerns.tsx"));
    const findings = evaluateRules([mod]);
    const r002 = findings.filter((f) => f.ruleId === "TS-REACT-R002");
    assert.equal(r002.length, 1, "domain logic + JSX should trigger R002");
  });

  it("TS-REACT-R003: detects anonymous tuple return from hook", () => {
    const mod = parseSingle(path.join(POS, "r003-anonymous-tuple.tsx"));
    const findings = evaluateRules([mod]);
    const r003 = findings.filter((f) => f.ruleId === "TS-REACT-R003");
    assert.equal(r003.length, 1, "return [value, toggle] should trigger R003");
  });

  it("TS-REACT-R004: detects multiple boolean props", () => {
    const mod = parseSingle(path.join(POS, "r004-bool-props.tsx"));
    const findings = evaluateRules([mod]);
    const r004 = findings.filter((f) => f.ruleId === "TS-REACT-R004");
    assert.equal(r004.length, 1, "3 boolean props should trigger R004");
  });

  it("TS-REACT-R005: detects broad context value", () => {
    const mod = parseSingle(path.join(POS, "r005-broad-context.tsx"));
    const findings = evaluateRules([mod]);
    const r005 = findings.filter((f) => f.ruleId === "TS-REACT-R005");
    assert.equal(r005.length, 1, "8-property context value should trigger R005");
  });

  it("TS-REACT-R006: detects broad effect body", () => {
    const mod = parseSingle(path.join(POS, "r006-broad-effect.tsx"));
    const findings = evaluateRules([mod]);
    const r006 = findings.filter((f) => f.ruleId === "TS-REACT-R006");
    assert.equal(r006.length, 1, "broad effect body should trigger R006");
  });

  // ── React negative ─────────────────────────────────────

  it("TS-REACT-R001 negative: pure component is clean", () => {
    const mod = parseSingle(path.join(NEG, "r001-no-browser-api.tsx"));
    const findings = evaluateRules([mod]);
    assert.equal(findings.filter((f) => f.ruleId === "TS-REACT-R001").length, 0);
  });

  it("TS-REACT-R002 negative: presentational component is clean", () => {
    const mod = parseSingle(path.join(NEG, "r002-presentational.tsx"));
    const findings = evaluateRules([mod]);
    assert.equal(findings.filter((f) => f.ruleId === "TS-REACT-R002").length, 0);
  });

  it("TS-REACT-R003 negative: named return is clean", () => {
    const mod = parseSingle(path.join(NEG, "r003-named-return.tsx"));
    const findings = evaluateRules([mod]);
    assert.equal(findings.filter((f) => f.ruleId === "TS-REACT-R003").length, 0);
  });

  it("TS-REACT-R004 negative: no boolean props is clean", () => {
    const mod = parseSingle(path.join(NEG, "r004-no-bool-props.tsx"));
    const findings = evaluateRules([mod]);
    assert.equal(findings.filter((f) => f.ruleId === "TS-REACT-R004").length, 0);
  });

  it("TS-REACT-R005 negative: focused context is clean", () => {
    const mod = parseSingle(path.join(NEG, "r005-focused-context.tsx"));
    const findings = evaluateRules([mod]);
    assert.equal(findings.filter((f) => f.ruleId === "TS-REACT-R005").length, 0);
  });

  it("TS-REACT-R006 negative: clean effect is clean", () => {
    const mod = parseSingle(path.join(NEG, "r006-clean-effect.tsx"));
    const findings = evaluateRules([mod]);
    assert.equal(findings.filter((f) => f.ruleId === "TS-REACT-R006").length, 0);
  });

  // ── Effect rules ───────────────────────────────────────

  it("TS-EFFECT-R001: detects tag+layer co-location", () => {
    const mod = parseSingle(path.join(POS, "r001-tag-layer-together.ts"));
    const findings = evaluateRules([mod]);
    const hits = findings.filter((f) => f.ruleId === "TS-EFFECT-R001");
    assert.equal(hits.length, 1, "tag + layer together should trigger R001");
  });

  it("TS-EFFECT-R002: detects process.env in service", () => {
    const mod = parseSingle(path.join(POS, "r002-process-env.ts"));
    const findings = evaluateRules([mod]);
    const hits = findings.filter((f) => f.ruleId === "TS-EFFECT-R002");
    assert.equal(hits.length, 1, "process.env should trigger R002");
    assert.ok(hits[0]!.help.includes("process.env"));
  });

  it("TS-EFFECT-R003: detects test import in live layer", () => {
    const mod = parseSingle(path.join(POS, "r003-test-import.ts"));
    const findings = evaluateRules([mod]);
    const hits = findings.filter((f) => f.ruleId === "TS-EFFECT-R003");
    assert.equal(hits.length, 1, "test import should trigger R003");
  });

  it("TS-EFFECT-R004: detects any in error channel", () => {
    const mod = parseSingle(path.join(POS, "r004-any-error.ts"));
    const findings = evaluateRules([mod]);
    const hits = findings.filter((f) => f.ruleId === "TS-EFFECT-R004");
    assert.equal(hits.length, 1, "Effect<..., any> should trigger R004");
  });

  it("TS-EFFECT-R006: detects tag+layer together (separation)", () => {
    const mod = parseSingle(path.join(POS, "r001-tag-layer-together.ts"));
    const findings = evaluateRules([mod]);
    const hits = findings.filter((f) => f.ruleId === "TS-EFFECT-R006");
    assert.equal(hits.length, 1, "tag + layer should trigger R006 too");
  });

  it("TS-EFFECT-R007: detects Promise export in Effect module", () => {
    const mod = parseSingle(path.join(POS, "r007-promise-export.ts"));
    const findings = evaluateRules([mod]);
    const hits = findings.filter((f) => f.ruleId === "TS-EFFECT-R007");
    assert.equal(hits.length, 1, "Promise return should trigger R007");
  });

  // ── Effect negative ────────────────────────────────────

  it("TS-EFFECT-R001 negative: tag-only module is clean", () => {
    const mod = parseSingle(path.join(NEG, "r001-tag-only.ts"));
    const findings = evaluateRules([mod]);
    assert.equal(findings.filter((f) => f.ruleId === "TS-EFFECT-R001").length, 0);
  });

  it("TS-EFFECT-R002 negative: layer config is clean", () => {
    const mod = parseSingle(path.join(NEG, "r002-layer-config.ts"));
    const findings = evaluateRules([mod]);
    assert.equal(findings.filter((f) => f.ruleId === "TS-EFFECT-R002").length, 0);
  });

  it("TS-EFFECT-R003 negative: production import is clean", () => {
    const mod = parseSingle(path.join(NEG, "r003-prod-import.ts"));
    const findings = evaluateRules([mod]);
    assert.equal(findings.filter((f) => f.ruleId === "TS-EFFECT-R003").length, 0);
  });

  it("TS-EFFECT-R004 negative: typed error channel is clean", () => {
    const mod = parseSingle(path.join(NEG, "r004-typed-error.ts"));
    const findings = evaluateRules([mod]);
    assert.equal(findings.filter((f) => f.ruleId === "TS-EFFECT-R004").length, 0);
  });

  it("TS-EFFECT-R007 negative: Effect boundary is clean", () => {
    const mod = parseSingle(path.join(NEG, "r007-effect-boundary.ts"));
    const findings = evaluateRules([mod]);
    assert.equal(findings.filter((f) => f.ruleId === "TS-EFFECT-R007").length, 0);
  });
});

// ── Helpers ────────────────────────────────────────────────

function posFixtures(): string[] {
  return [
    path.join(POS, "r001-syntax-error.ts"),
    path.join(POS, "r001-no-doc.ts"),
    path.join(POS, "utils", "r003-generic-bucket.ts"),
    path.join(POS, "r006-bool-flags.ts"),
    path.join(POS, "r008-deep-nesting.ts"),
    path.join(POS, "r009-broad-linear.ts"),
    path.join(POS, "r012-too-many-exports.ts"),
    path.join(POS, "index.ts"),
  ];
}

function negFixtures(): string[] {
  return [
    path.join(NEG, "r001-valid-syntax.ts"),
    path.join(NEG, "r001-has-doc.ts"),
    path.join(NEG, "r003-domain-dir.ts"),
    path.join(NEG, "r006-one-bool.ts"),
    path.join(NEG, "r008-shallow.ts"),
    path.join(NEG, "r009-small.ts"),
    path.join(NEG, "r012-reasonable-exports.ts"),
    path.join(NEG, "index.ts"),
  ];
}

function evaluateAll(paths: string[]): ReturnType<typeof evaluateRules> {
  const modules = paths.map((p) => parseSingle(p));
  return evaluateRules(modules);
}
