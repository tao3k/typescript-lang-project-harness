# TypeScript Lang Project Harness: Map Of Content

Documentation surface for the standalone TypeScript language project harness.
The README stays compact; durable package details live here so parser boundary,
runner modes, rule catalogs, and CLI behavior can evolve without turning the
entrypoint into a catch-all reference page.

## 01_core: Architecture And Foundation

- [Harness Boundary](01_core/101_harness_boundary.md): package ownership,
  TypeScript-native parser boundary, project runner, explicit-path runner, and
  non-goals.

## 02_plans: Alignment Plans

- [Native Parser Alignment Plan](02_plans/201_native_parser_alignment_plan.md):
  M2 parser-first workplan from native facts to reasoning tree, low-noise
  policy, compact output, and self-apply validation.
- [Rust Alignment M4 Plan](02_plans/202_rust_alignment_m4_plan.md):
  stacked milestone for policy config, rule-pack engine boundaries, compact
  agent snapshot alignment, and parser-boundary contract hardening.
- [Verification Policy M5 Plan](02_plans/203_verification_policy_m5_plan.md):
  stacked milestone for parser-fact-driven verification task planning,
  compact reminders, receipts, waivers, and external skill contracts.
- [Verification Profile Index M6 Plan](02_plans/204_verification_profile_index_m6_plan.md):
  stacked milestone for parser-fact-driven profile candidate drafts and
  low-noise profile config advice.

## 03_features: Functional Ledger

- [Rule Catalog](03_features/201_rule_catalog.md): default rule packs,
  blocking/advisory split, catalog functions, compact rendering policy, and
  parser-first rule constraints.
- [Runner Modes](03_features/202_runner_modes.md): project runner,
  explicit-path runner, shared config, and path validation.
- [CLI](03_features/203_cli.md): command entrypoint, output modes, and
  exit-code contract.
- [Compact Agent Snapshot](03_features/204_compact_agent_snapshot.md):
  compact text design, section order, line shapes, non-goals, and golden
  contract.
- [Verification Policy](03_features/205_verification_policy.md): profile hints,
  profile indexes, task contracts, receipts, waivers, skill bindings, and
  compact verification rendering.
