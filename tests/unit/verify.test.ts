import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseModule } from "../../src/syntax/parse-module.js";
import { planVerification } from "../../src/syntax/verify/planner.js";
import { createReceipt, receiptMatches, applyReceipts } from "../../src/syntax/verify/receipt.js";
import { createWaiver, applyWaivers, authorityRank } from "../../src/syntax/verify/waiver.js";
import { renderVerifyPlans, renderVerifyClean } from "../../src/syntax/verify/render.js";

const FIXTURES = path.resolve(new URL("../../../tests/fixtures/verify", import.meta.url).pathname);

describe("verification planner", () => {
  it("plans typecheck + snapshot for all modules", () => {
    const mod = parseModule(path.join(FIXTURES, "module-with-fn.ts"));
    const plans = planVerification([mod]);
    assert.equal(plans.length, 1);
    const tasks = plans[0]!.tasks;
    assert.ok(tasks.some((t) => t.kind === "typecheck"));
    assert.ok(tasks.some((t) => t.kind === "snapshot"));
  });

  it("triggers unit when module exports functions", () => {
    const mod = parseModule(path.join(FIXTURES, "module-with-fn.ts"));
    const plans = planVerification([mod]);
    const tasks = plans[0]!.tasks;
    assert.ok(
      tasks.some((t) => t.kind === "unit"),
      "exported fn should trigger unit",
    );
  });

  it("triggers react-render when module has React component", () => {
    const mod = parseModule(path.join(FIXTURES, "module-with-component.tsx"));
    const plans = planVerification([mod]);
    const tasks = plans[0]!.tasks;
    assert.ok(
      tasks.some((t) => t.kind === "react-render"),
      "component should trigger react-render",
    );
  });

  it("triggers effect-layer when module has Effect layer", () => {
    const mod = parseModule(path.join(FIXTURES, "module-with-layer.ts"));
    const plans = planVerification([mod]);
    const tasks = plans[0]!.tasks;
    assert.ok(
      tasks.some((t) => t.kind === "effect-layer"),
      "layer should trigger effect-layer",
    );
  });

  it("triggers performance when function is broad", () => {
    const mod = parseModule(path.join(FIXTURES, "module-with-performance-risk.ts"));
    const plans = planVerification([mod]);
    const tasks = plans[0]!.tasks;
    assert.ok(
      tasks.some((t) => t.kind === "performance"),
      "broad fn should trigger performance",
    );
  });

  it("triggers bundle-size for index.ts", () => {
    const mod = parseModule(path.join(FIXTURES, "index.ts"));
    const plans = planVerification([mod]);
    const tasks = plans[0]!.tasks;
    assert.ok(
      tasks.some((t) => t.kind === "bundle-size"),
      "index should trigger bundle-size",
    );
  });

  it("fingerprints are deterministic (same module = same hash)", () => {
    const mod1 = parseModule(path.join(FIXTURES, "module-with-fn.ts"));
    const mod2 = parseModule(path.join(FIXTURES, "module-with-fn.ts"));
    const plans1 = planVerification([mod1]);
    const plans2 = planVerification([mod2]);
    const fp1 = plans1[0]!.tasks.find((t) => t.kind === "unit")!.fingerprint;
    const fp2 = plans2[0]!.tasks.find((t) => t.kind === "unit")!.fingerprint;
    assert.equal(fp1, fp2, "fingerprints must be deterministic");
  });

  it("fingerprints differ for different modules", () => {
    const mod1 = parseModule(path.join(FIXTURES, "module-with-fn.ts"));
    const mod2 = parseModule(path.join(FIXTURES, "index.ts"));
    const plans1 = planVerification([mod1]);
    const plans2 = planVerification([mod2]);
    const fp1 = plans1[0]!.tasks.find((t) => t.kind === "snapshot")!.fingerprint;
    const fp2 = plans2[0]!.tasks.find((t) => t.kind === "snapshot")!.fingerprint;
    assert.notEqual(fp1, fp2, "different modules must have different fingerprints");
  });
});

describe("receipt", () => {
  it("creates receipt with ISO timestamp", () => {
    const r = createReceipt("src/foo.ts", "typecheck", "abc123");
    assert.equal(r.kind, "typecheck");
    assert.equal(r.fingerprint, "abc123");
    assert.ok(Date.parse(r.completedAt) > 0, "timestamp must parse");
  });

  it("receipt matches task with same kind + fingerprint", () => {
    const task = {
      kind: "unit" as const,
      status: "pending" as const,
      phase: "after_typecheck_pass" as const,
      fingerprint: "abc123",
    };
    const receipt = createReceipt("src/bar.ts", "unit", "abc123");
    assert.ok(receiptMatches(receipt, task));
  });

  it("receipt does not match different fingerprint", () => {
    const task = {
      kind: "unit" as const,
      status: "pending" as const,
      phase: "after_typecheck_pass" as const,
      fingerprint: "xyz789",
    };
    const receipt = createReceipt("src/bar.ts", "unit", "abc123");
    assert.equal(receiptMatches(receipt, task), false);
  });

  it("applyReceipts marks matching tasks as completed", () => {
    const tasks = [
      {
        kind: "unit" as const,
        status: "pending" as const,
        phase: "after_typecheck_pass" as const,
        fingerprint: "abc",
      },
      {
        kind: "typecheck" as const,
        status: "pending" as const,
        phase: "after_code_change" as const,
        fingerprint: "def",
      },
    ];
    const receipts = [createReceipt("src/x.ts", "unit", "abc")];
    const applied = applyReceipts(tasks, receipts);
    assert.equal(applied[0]!.status, "completed");
    assert.equal(applied[1]!.status, "pending");
  });
});

describe("waiver", () => {
  it("complete waiver marks task as waived", () => {
    const tasks = [
      {
        kind: "react-render" as const,
        status: "pending" as const,
        phase: "after_unit_tests_pass" as const,
        fingerprint: "abc",
      },
    ];
    const waivers = [
      createWaiver("src/y.ts", "react-render", "complete", "Presentation-only component"),
    ];
    const applied = applyWaivers(tasks, waivers);
    assert.equal(applied[0]!.status, "waived");
  });

  it("partial waiver does not change status", () => {
    const tasks = [
      {
        kind: "performance" as const,
        status: "pending" as const,
        phase: "after_unit_tests_pass" as const,
        fingerprint: "abc",
      },
    ];
    const waivers = [createWaiver("src/z.ts", "performance", "partial", "Not critical path")];
    const applied = applyWaivers(tasks, waivers);
    assert.equal(applied[0]!.status, "pending");
  });

  it("authority rank: parser-fact > receipt > complete-waiver > config-hint > llm-prose", () => {
    assert.ok(authorityRank("parser-fact") > authorityRank("receipt"));
    assert.ok(authorityRank("receipt") > authorityRank("complete-waiver"));
    assert.ok(authorityRank("complete-waiver") > authorityRank("config-hint"));
    assert.ok(authorityRank("config-hint") > authorityRank("llm-prose"));
  });
});

describe("verify render", () => {
  it("renders compact [verify] output", () => {
    const mod = parseModule(path.join(FIXTURES, "module-with-fn.ts"));
    const plans = planVerification([mod]);
    const output = renderVerifyPlans(plans);
    assert.ok(output.startsWith("[verify] "));
    assert.ok(output.includes("|typecheck: pending"));
    assert.ok(output.includes("|unit: pending"));
    assert.ok(output.includes("fingerprint="));
  });

  it("renders [verify] ok when all tasks completed", () => {
    const mod = parseModule(path.join(FIXTURES, "module-with-fn.ts"));
    let plans = planVerification([mod]);
    // Apply receipts to all tasks
    const receipts = plans[0]!.tasks.map((t) => createReceipt(mod.path, t.kind, t.fingerprint));
    plans = plans.map((p) => ({
      ...p,
      tasks: applyReceipts(p.tasks, receipts),
    }));
    const output = renderVerifyClean(plans);
    assert.equal(output, "[verify] ok");
  });
});
