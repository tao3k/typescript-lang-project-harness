# Rule Catalog

The harness exposes deterministic rule metadata through compact library
functions:

- `typeScriptRulePackDescriptors()`
- `typeScriptSyntaxRules()`
- `typeScriptSemanticRules()`
- `typeScriptProjectPolicyRules()`
- `typeScriptModularityRules()`
- `typeScriptTestLayoutRules()`
- `typeScriptAgentPolicyRules()`
- `typeScriptRulePackRuleIds()`

## Default Rule Packs

Default project execution runs these packs:

1. `typescript.syntax`
2. `typescript.semantic`
3. `typescript.project_policy`
4. `typescript.modularity`
5. `typescript.test_layout`
6. `typescript.agent_policy`

The implementation enforces parser-native syntax and project rules, then
surfaces native semantic diagnostics, module-graph, test-layout, and
agent-repair advice as non-blocking findings from parser-owned facts. New rules
should be added only after the parser layer exposes the native facts they
require.

## Policy Configuration

M4 exposes Rust-aligned policy configuration without exporting the rule engine.
Callers can use `TypeScriptRulePack` and the helper functions
`withDisabledTypeScriptRule()`, `withDisabledTypeScriptRules()`,
`withDisabledTypeScriptRulePack()`, `withTypeScriptRuleSeverity()`,
`withTypeScriptRulePackSeverity()`, and
`withTypeScriptBlockingSeverities()` from the package facade.

Policy is applied after all default packs evaluate over the reasoning tree.
The order is deterministic: disabled rules and disabled packs remove findings
first, rule-pack severity overrides apply next, and single-rule severity
overrides win last. `blockingRuleIds` remains a report-time promotion mechanism
for advisory rules; it does not mutate catalog severity.

## Blocking Rules

- `TS-SYN-R001`: TypeScript source must parse through the TypeScript Compiler
  API.
- `TS-PROJ-R001`: TypeScript project runs should have a `tsconfig.json`.
- `TS-PROJ-R002`: `tsconfig.json` must parse through TypeScript's native config
  parser.

## Agent Advice Rules

`TS-SEM-*`, `TS-PROJ-R003`, `TS-PROJ-R004`, `TS-PROJ-R005`, `TS-MOD-*`,
`TS-TEST-*`, and `TS-AGENT-*` rules are `info` findings. They are rendered by
default for repair agents but do not fail assertions unless a caller promotes
them or uses the agent test-gate helper
`assertTypeScriptProjectHarnessAgentClean()`.

- `TS-SEM-R001`: TypeScript `Program` semantic diagnostics should be visible
  from parser-native facts, including stable TypeScript diagnostic codes,
  without replacing `tsc`.
- `TS-PROJ-R003`: root, project-reference, and workspace-package `package.json`
  files should parse so package entry fields, exports/imports/bin, script,
  workspace, referenced package, and workspace package facts are visible.
  Package diagnostics, entry locations, conditional exports/imports target
  details, script locations, and workspace locations come from TypeScript's JSON AST.
- `TS-PROJ-R004`: TypeScript project references should point to package-local
  configs whose parser-owned compiler option facts show `composite` and
  `declaration` enabled. This stays non-blocking so agents can still inspect
  partial workspaces.
- `TS-PROJ-R005`: projects using package `exports` or `imports` should have an
  effective TypeScript `moduleResolution` of `node16`, `nodenext`, or `bundler`.
  The value comes from TypeScript compiler-option facts, including defaults
  implied by `module`, not raw JSON string matching.
- `TS-MOD-R001`: production source, facade, entrypoint, and config modules
  should not depend on parser-visible test owners.
- `TS-MOD-R002`: package project modules should stay below their layer line
  budgets and split by concern. The rule scans the whole package reasoning
  tree, not a single hard-coded file.
- `TS-TEST-R001`: when configured test roots exist, parser-visible test modules
  should live under those roots.

- `TS-AGENT-R001`: project imports, including relative imports, unresolved
  configured path aliases, and unresolved `#` package imports, should resolve
  to a parser-visible TypeScript owner or be documented as a non-TypeScript
  asset.
- `TS-AGENT-R002`: package exports/imports should resolve to parser-visible
  TypeScript owners or documented external artifacts.
- `TS-AGENT-R003`: facade `index.*` modules that re-export multiple owners
  should include a local intent doc.
- `TS-AGENT-R004`: public functions should avoid multiple boolean mode
  parameters when a named options object or discriminated union would preserve
  agent-visible intent.
- `TS-AGENT-R005`: public functions should avoid broad positional parameter
  surfaces when a named request/options object would preserve call semantics.
- `TS-AGENT-R006`: public tuple parameters and return values that bundle
  primitive semantic values should use named object, tuple alias, or domain
  types.
- `TS-AGENT-R007`: public functions with deeply nested or branch-heavy
  algorithm shape should expose guard clauses, discriminated dispatch, or small
  named steps.
- `TS-AGENT-R008`: broad linear public functions should split algorithm
  responsibilities into small named helpers or pipeline steps.
- `TS-AGENT-R009`: public source data surfaces should avoid clusters of
  semantic primitive fields such as identifiers, URLs, paths, byte/time units,
  or boolean mode fields unless the raw DTO boundary is explicit. Harness
  model-layer modules, including nested `src/**/model.ts` schema modules, stay
  outside this advice surface.

## Reasoning Tree Policy

The harness treats a TypeScript package as an agent reasoning tree: the nearest
parent `package.json` anchors the package project, `tsconfig.json` selects the
TypeScript source set, `package.json` declares public package subpaths, source
files expose parser-owned imports/exports, and import edges show whether a
dependency is relative, path-alias backed, package-import backed, external, or
unresolved. Package entry resolution maps exports/imports bin targets, and
package fields such as `main`, `module`, `types`, `typings`, and `browser` back
to parser-visible owners when possible, including common `outDir` to
source-root mappings. Package entry advice points at the JSON AST location for
the exact `exports`, `imports`, or `bin` target when available, including
conditional package target branches.
Parser-visible `bin` targets also mark the owner module as an `entrypoint`.
Package scripts, workspace patterns, and resolved workspace package metadata
are rendered as orientation facts; they remain non-blocking and do not become
package-manager policy.
Package-name dependency rows include whether the package owner came from a
TypeScript project reference or a workspace package fact, so agents can edit the
right owner boundary without guessing.
M9 also carries parser-native public API/data/control-flow facts in each
reasoning module. Active agent policy uses those facts for public API and
algorithm-shape repair hints. M11 adds the first data-shape hint from those
facts: it reports only source data surfaces with at least three semantic
primitive fields, and skips the `model` layer so schema/fact definitions do not
become generic DTO style findings.
When TypeScript selects JavaScript through `allowJs`, parser-visible `.js`,
`.jsx`, `.mjs`, and `.cjs` files participate in the same module-role policy as
TypeScript files.
Shadowed owner namespaces and orphaned source files are reasoning-tree
orientation metrics. They may appear as `shadowed=` and `orphaned=` counters in
agent snapshots, but they do not create default rule findings in M3.

`renderTypeScriptReasoningTree()` exposes those facts as Rust-style agent
snapshot text: `Modules:`, `OwnerBranches:`, `OwnerDependencies:`, and
`FindingGroups:`. It groups diagnostics by rule id and owner path instead of
rendering full diagnostic cards. Full TypeScript diagnostic codes, source
lines, and related information remain available in the default compact finding
renderer and JSON output. The snapshot is not a style report and it does not
replace JSON for tools; it is the low-noise orientation surface agents should
inspect before editing.

## Future Agent Advice

`TS-PROJ-*` advice beyond the structural blocking rules, `TS-MOD-*`,
`TS-TEST-*`, and `TS-AGENT-*` rules should be `info` findings. They are intended
as repair hints for LLMs and should not block by default. Candidate future rules
include:

- source paths should avoid generic buckets such as `utils` and `shared`
- owner dependency graphs should avoid local cycles and leaf-module reach-ins

Each candidate depends on parser-owned TypeScript facts. Do not implement these
rules with regular expressions over source text.

## Rendered Diagnostic Policy

Compact text is the primary repair surface:

1. stable rule id
2. source location
3. highlighted source line when available
4. short pointer label
5. one `Help:` line from the concrete finding summary, including TypeScript
   diagnostic code when available
6. one `Contract:` line from the stable rule requirement

Agent snapshots may also render TypeScript related diagnostic information as
indented `related` lines under the primary diagnostic.

Structured consumers should use `renderTypeScriptProjectHarnessJson()` or the
serializable report shape instead of parsing compact text.

## Parser-First Policy

TypeScript semantic policy is parser-first. Project rule packs consume
reasoning-tree facts instead of opening TypeScript files and guessing from raw
text. The parser layer owns TypeScript Compiler API facts, `Program` semantic
diagnostics, diagnostic codes, related diagnostic information, `tsconfig`
facts, source-line capture, imports, exports, script kind, declaration-file
status, top-of-file intent docs, granular type-only import/export facts,
`import("...")` type query imports, declaration export assignments,
package entry metadata, package metadata diagnostics and package metadata source
locations for root, project-reference, and workspace packages, compiler-option
facts, effective module resolution, referenced package compiler-option facts,
module line counts, package-root anchored module layers, parser-native public
API/data/control-flow facts, and project/module-level diagnostic facts consumed
by the reasoning tree. The reasoning layer owns
source-shape projections such as shadowed owner namespaces and orphaned source
files after native parser facts and TypeScript import resolution are available.
The harness layer
owns rule catalogs, project/test layout policy, reporting, and assertion
behavior. Rule evaluation consumes the reasoning tree, including its typed
`runMode`, not parser module reports or project parser scopes. The
explicit-path runner attaches a minimal reasoning tree so file-local syntax
findings also flow through reasoning-tree diagnostic facts. Compact output
counts use reasoning-tree module validity, and compact finding locations are
relative to the reasoning tree root.
