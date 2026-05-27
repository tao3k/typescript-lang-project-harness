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
- [Verification Report Bundle M7 Plan](02_plans/205_verification_report_bundle_m7_plan.md):
  stacked milestone for report obligations, configured-skill task indexes, and
  report bundle JSON renderers.
- [Verification VAS M8 Plan](02_plans/206_verification_vas_m8_plan.md):
  stacked milestone for report writing, performance indexes, receipt metadata,
  waiver completeness, disabled task kinds, and dependency-signal profile
  inference.
- [Parser-Native Agent Policy M9 Plan](02_plans/207_parser_native_agent_policy_m9_plan.md):
  stacked milestone for parser-native public API/data/control-flow facts and
  low-noise TypeScript agent policy advice.
- [Agent Advice Test Gate M10 Plan](02_plans/208_agent_advice_test_gate_m10_plan.md):
  stacked milestone for surfacing visible agent advice through an explicit
  test-gate assertion without changing default CLI blocking semantics.
- [Public Data Shape Agent Advice M11 Plan](02_plans/209_public_data_shape_agent_advice_m11_plan.md):
  stacked milestone for conservative parser-native public data-shape advice.
- [Type Boundary Quality M12 Plan](02_plans/210_type_boundary_quality_m12_plan.md):
  stacked milestone for Rust-aligned parser-native type-boundary advice.
- [Effect Extension Policy M13 Plan](02_plans/211_effect_extension_policy_m13_plan.md):
  stacked milestone for package-owned Effect extension activation and
  parser-native async domain-effect advice.
- [Effect Policy Enrichment M14 Plan](02_plans/212_effect_policy_enrichment_m14_plan.md):
  stacked milestone for parser-native Effect runtime and service/layer advice.
- [Effect Resource Scope M15 Plan](02_plans/213_effect_resource_scope_m15_plan.md):
  stacked milestone for parser-native Effect resource scope advice before PR
  closure.
- [Build Tool Rspack Surface M16 Plan](02_plans/214_build_tool_rspack_surface_plan.md):
  stacked milestone for parser-owned Rspack/Rsbuild build-tool facts and
  low-noise package-script advice.
- [Effect Capability Boundaries M17 Plan](02_plans/215_effect_capability_boundaries_m17_plan.md):
  stacked milestone for parser-owned Effect Schema boundary advice and the
  broader Effect capability-policy map.
- [Effect Production Observability M18 Plan](02_plans/216_effect_production_observability_m18_plan.md):
  stacked milestone for parser-owned Effect external IO observability and
  resilience advice, plus React docs research baseline.
- [React Extension Render Purity M19 Plan](02_plans/217_react_extension_render_purity_m19_plan.md):
  stacked milestone for package-owned React activation, parser-native
  component/hook render-purity facts, and compact agent repair guidance.

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
  compact verification/report rendering.
