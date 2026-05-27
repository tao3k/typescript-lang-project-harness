# typescript-lang-project-harness

`typescript-lang-project-harness` is a standalone, project-level TypeScript
language harness. It is shaped after the Rust and Python project harnesses:
native parser facts first, deterministic rule catalogs, compact rendered
diagnostics for repair-oriented agents, and a thin CLI for local or CI policy
runs.

The central contract is strict: TypeScript source semantics come from the
TypeScript Compiler API and `tsconfig` parsing APIs. Rule packs consume
parser-owned facts instead of searching source text with regular expressions.

## Quick Use

```ts
import { assertTypeScriptProjectHarnessClean } from "typescript-lang-project-harness";

assertTypeScriptProjectHarnessClean(new URL(".", import.meta.url));
```

For a compact repair surface:

```ts
import {
  renderTypeScriptProjectHarnessAgentCompactText,
  renderTypeScriptProjectHarness,
  runTypeScriptProjectHarness,
} from "typescript-lang-project-harness";

const report = runTypeScriptProjectHarness(".");
console.log(renderTypeScriptProjectHarness(report));
console.log(renderTypeScriptProjectHarnessAgentCompactText(report));
```

The CLI runs the same project harness:

```shell
typescript-project-harness .
typescript-project-harness --json .
typescript-project-harness --agent-compact .
typescript-project-harness --agent-snapshot .
```

Project runs anchor at the nearest `package.json` above the requested path.
Running from a package subdirectory still evaluates the whole package project,
including `tsconfig`, package metadata, roots, modules, and edges relative to
that package root.
Use `typescript-project-harness --agent-compact .` from downstream
`package.json` scripts when a shell command should surface agent repair
instructions without adding a project-local runner script. For `npm test` or
`npm check` embedded in a test framework, use
`assertTypeScriptProjectHarnessEmbeddedClean()`; it prints compact agent advice
by default and fails only on blocking findings. The embedded assertion defaults
to a fast non-semantic pass because `tsc --noEmit` or the test framework should
own type-check failure; callers can set `collectSemanticDiagnostics: true` when
they want the embedded assertion to also collect TypeScript semantic diagnostic
advice. Use
`assertTypeScriptProjectHarnessAgentClean()` only when agent-facing advice
should fail the test gate. The default `assertTypeScriptProjectHarnessClean()`
and CLI exit code remain blocking-only, so `info` advice can stay visible
without becoming a default policy failure.

## Current Rule Packs

Default project execution runs these packs in descriptor order:

1. `typescript.syntax`
2. `typescript.semantic`
3. `typescript.project_policy`
4. `typescript.modularity`
5. `typescript.test_layout`
6. `typescript.agent_policy`
7. `typescript.extension_policy`

The current surface implements the native parser boundary, source syntax
diagnostics, native TypeScript `Program` semantic diagnostics with TypeScript
diagnostic codes, parseable `tsconfig.json` policy, TypeScript JSON AST-backed
package/config facts, reasoning-tree snapshots, project-level workspace
package snapshots, Rust-style source-shape counters for shadowed/orphaned
source owners, non-blocking package metadata diagnostics,
modularity/test-layout advice, and the first non-blocking agent advice rules.
It also includes Rust-aligned policy configuration for disabling single rules,
disabling built-in rule packs, overriding single-rule severities, overriding
rule-pack severities, and promoting advisory rules by `blockingRuleIds`.
`TS-SEM-*`, `TS-PROJ-R003`, `TS-PROJ-R004`, `TS-PROJ-R005`,
`TS-PROJ-R006`, `TS-MOD-*`, `TS-TEST-*`, `TS-AGENT-*`, and
`TS-EXT-EFFECT-R002` through
`TS-EXT-EFFECT-R007` findings are shown to agents without failing the default
gate. `TS-EXT-EFFECT-R001` is `error` because an
explicit Effect enablement that lacks the `effect` dependency is a broken
project configuration promise. Package metadata diagnostics cover both the
project root package and TypeScript project reference packages, plus package
metadata discovered from root workspace patterns. Modern TypeScript
project-shape advice also stays
non-blocking: `TS-PROJ-R004` points out referenced package configs missing
`composite` or `declaration`, and `TS-PROJ-R005` points out package
`exports`/`imports` when the effective TypeScript `moduleResolution` is not
`node16`, `nodenext`, or `bundler`. `TS-PROJ-R006` points out Rspack package
or config facts that are not exposed through package scripts, so agents can run
the same build path through `npm run build`/`npm run check` instead of inventing
local gate scripts.
M9 extends the parser-native fact layer with exported function parameter facts,
anonymous public tuple API facts, exported primitive data-field facts, and
public function control-flow shape facts. Those facts are projected into the
reasoning tree before policy runs. The active M9 policy surface remains
low-noise and advisory: `TS-AGENT-R004` through `TS-AGENT-R008` cover public
flag parameters, broad positional parameter lists, anonymous primitive tuple
APIs, deeply nested public algorithms, and broad linear public algorithms.
The exported primitive data-field facts are available to downstream tooling and
future policies, but M9 does not enable a public DTO/data-shape gate by default.
M10 adds a Rust-aligned agent test-gate assertion:
`assertTypeScriptProjectHarnessAgentClean()` fails when configured-blocking
findings or visible `info` advice remain. It respects the same policy config
pass, so disabling `agent_policy` or a single advice rule also suppresses that
test-gate feedback.
M11 turns the already-collected public data-field facts into one conservative
advice rule, `TS-AGENT-R009`, for public source data surfaces that expose
clusters of semantic primitive fields such as `ownerId`, `requestUrl`,
`timeoutMs`, or boolean mode fields. It remains `info` and excludes model
schema modules so the harness does not mistake its own fact model contracts for
application DTO drift.
M12 extends that Rust-aligned type-quality surface with parser-native public
type alias and discriminated-union payload facts. `TS-AGENT-R010` through
`TS-AGENT-R012` stay advisory and catch primitive semantic type aliases,
stringly state/status/kind fields, and primitive semantic payloads on public
discriminated-union variants. Literal-union catalog aliases such as
`type Status = "pending" | "done"` remain accepted typed boundaries.
M13 adds the first package-owned extension policy for Effect. The parser reads
known extension activation facts from `package.json`: an `effect` dependency
auto-activates the Effect extension, and
`typescriptProjectHarness.extensions.effect = "enable"` declares an explicit
project commitment. Explicit enablement without the `effect` dependency emits
`TS-EXT-EFFECT-R001` as an `error`, while active Effect projects get
non-blocking `TS-EXT-EFFECT-R002` advice when public source APIs expose raw
Promise or implicit async Promise surfaces instead of `Effect.Effect<A, E, R>`.
Effect activation is intentionally project-wide: adding `effect` means the
harness should guide agents to migrate public async domain APIs toward
`Effect.Effect<Success, DomainError, Requirements>`, `Effect.tryPromise`
interop, and `Effect.run*` execution only at entrypoint or adapter boundaries.
Package-owned CLI adapters are recognized from parser-owned `bin` facts and
from TypeScript targets named in `package.json` scripts, so agent advice stays
focused on source/domain owners instead of asking benchmark or command handlers
to masquerade as reusable domain APIs.
This is extension policy, not a manifest dependency gate.
M14 enriches that extension from the current Effect docs without widening it
into a style linter. Parser-native facts now record `Effect.run*` /
`Runtime.run*` execution calls and public Effect service method return types.
`TS-EXT-EFFECT-R003` advises when runtime execution appears inside source
modules instead of entrypoint or adapter boundaries, and `TS-EXT-EFFECT-R004`
advises when public service methods leak non-`never` requirements that should
usually move into Layer/runtime construction. The same parser fact path now
classifies weak public Effect error channels, so `TS-EXT-EFFECT-R005` can nudge
primitive, `any`, `unknown`, or `void` error types toward tagged/domain errors
without treating ordinary `Error` as a blocking project violation.
`TS-EXT-EFFECT-R006` adds parser-native Promise interop advice: public Effect
APIs that wrap `async`, `throw`, or `Promise.reject` callbacks with
`Effect.promise` should use `Effect.tryPromise` with a domain error mapping.
M15 closes the pre-PR Effect enrichment with resource-scope advice:
`TS-EXT-EFFECT-R007` reports public source owners that construct
`Effect.acquireRelease` resources without a local `Effect.scoped` boundary.
The verification lane now includes M5 task planning, M6 profile-index drafts,
M7 report obligations, and M8 Rust VAS-aligned artifact surfaces: configured
skill task-index JSON, performance-index JSON, report-bundle manifest JSON, a
filesystem report writer, receipt evidence URI/timestamp metadata, complete
waiver checks, disabled task-kind controls, and parser-fact dependency signals
for profile inference. It still does not execute external skills or add
manifest dependency policy.
M16 adds parser-owned build-tool facts for Rspack/Rsbuild-family projects. The
parser recognizes known package dependencies, `rspack.config.*` /
`rsbuild.config.*`, package scripts, and optional
`typescriptProjectHarness.buildTools` config, then emits `BuildTools:` in the
agent snapshot. This remains a build/profile orientation surface: it does not
replace TypeScript type checking, declaration emit, framework compilers, or
package-manager dependency audits.

For agent repair loops, `renderTypeScriptProjectHarnessAgentCompactText(report)`
and `--agent-compact` emit task-oriented repair instructions, while
`renderTypeScriptReasoningTree(report)` emits a single-package Rust-style owner
snapshot from reasoning tree facts and the `--agent-snapshot` CLI flag emits the
project-level snapshot. When parser-owned
workspace or project-reference package facts are present, the CLI groups each
package scope under a compact `pkg <path>` heading and runs that package from
its own `package.json` anchor and local `tsconfig.json`. Each package snapshot
starts with `Modules:` and then renders
`Extensions:`, `BuildTools:`, `OwnerBranches:`, `OwnerDependencies:`, and `FindingGroups:`
when those sections are non-empty. The renderer consumes reasoning-tree `ownerBranches`
and `ownerDependencies` rather than rediscovering owner structure from raw
source or raw import edges.
Owner branches summarize module roles, exports, type-only re-exports,
TypeScript-native import-resolution counts, and parser-owned re-export
structure. Branch lines cap long package surfaces and omit empty child-edge
placeholders instead of rendering `-> -`. Owner dependencies summarize
relative/path-alias/package-import
owner routing, package-name import owners with `project-reference` or
`workspace` provenance, and package entry ownership for fields,
exports/imports, and bins. External package imports stay as branch counters
instead of becoming owner-dependency rows.
High fan-out and fan-in owner dependency surfaces are grouped deterministically
so agents get a compact edit map before they inspect JSON.
`shadowed=` and `orphaned=` source-shape counters are rendered only when
non-zero and remain orientation facts, not style gates.
Full TypeScript diagnostic codes, source lines, related information, compiler
options, package metadata, scripts, workspace facts, and detailed parser reports
remain available through the default compact findings and JSON report instead
of being repeated in the agent snapshot.
Extension facts are rendered only as compact capability and activation lines;
raw dependency fields stay out of the snapshot.
Explicit-path runs also attach a minimal reasoning tree, so syntax diagnostics
flow through the same reasoning-tree policy and compact snapshot path even when
no project scope is available.
Every harness report includes a reasoning tree; project reports carry the full
project tree, while explicit-path reports carry a minimal tree over the
requested parser-visible files.
Rule evaluation receives reasoning-tree facts, including the tree's `runMode`,
not parser module reports or project parser scopes.
Compact file and parsed counts are derived from reasoning-tree module facts,
including each module's parser validity marker.
Compact finding locations are also rendered relative to the reasoning tree root,
so project and explicit-path outputs share the same low-noise location policy.
Reports expose that marker as `runMode: "project" | "explicit"` so JSON
consumers can distinguish project-scoped policy from focused explicit-path
checks without inferring from optional project fields.
Unresolved relative imports, unresolved `#` package imports, and unresolved
configured path aliases are shown as non-blocking project-import advice instead
of being hidden as external edges.
When `tsconfig.json` selects JavaScript through `allowJs`, parser reports keep
native `js`, `jsx`, `mjs`, and `cjs` script kinds and reasoning edges can point
back to those parser-visible owners.
Those parser-visible JavaScript modules participate in the same module roles:
facade `index.*`, entrypoint `main.*`/package-owned CLI adapters, config files,
source, and test files.
Parser-visible package `bin` owners and package-script TypeScript targets are
rendered as `entrypoint` modules so CLI surfaces are visible without filename
guessing.
The parser recognizes TypeScript's granular type-only forms such as
`import { type T }`, `export { type T } from`, and `import("./module")` type
queries before the reasoning tree renders them as compact edges.

## Verification Policy

M5 adds a Rust-aligned verification planning surface for external skills, M6
adds a profile index that drafts missing or drifting owner profile hints from
parser-visible reasoning facts, M7 adds report-bundle obligations and JSON
artifact renderers, and M8 adds the durable VAS artifact surface. A caller can
attach `verificationPolicy` profile hints to parser-visible owners, then ask
the library to produce compact tasks for `stress`, `performance`, `chaos`,
`security`, `regression`, or `responsibility_review`.

Verification policy consumes harness reports and reasoning-tree facts. It does
not run tools, add CLI flags, inspect TypeScript ASTs, or turn manifest
dependencies into project gates. Passed receipts and complete waivers hide
resolved tasks; a complete waiver must carry `owner`, `reason`, and
`expiresAt`. Failed receipts and incomplete waivers stay visible in compact
output, including receipt artifact URI and observed timestamp when supplied.
The profile index renders only missing/drifting profile candidates and goes
quiet once matching hints cover the suggested responsibilities; when active
candidates exist, it appends a `profile_hints` reminder so agents know where to
write `TypeScriptVerificationProfileHint` entries. Dependency signals may
enrich profile responsibility inference from parser-owned import/package facts,
but they are not dependency checks. When active tasks remain,
`renderTypeScriptVerificationPlan()` also emits a compact `[verify-report]`
block naming the required bundle artifacts.

## Public API Contract

The package facade exports the M13 library surface: runners, project agent
snapshot helpers, assertion helpers, parser entrypoints,
compact/JSON/reasoning renderers, rule catalog functions, policy config helper
functions, verification policy helpers, profile-index builders/renderers,
verification planners/renderers, task-index and performance-index
builders/renderers, report-bundle builders/renderers, report writer helpers,
and report model types, including parser-native public API/data/control-flow
fact types, M12 type-boundary facts, and Effect extension fact types. Internals such as reasoning-tree
builders, rule-pack evaluators, and verification internals stay private so
downstream tools depend on parser-owned facts and stable rendered output
instead of implementation modules.

## CI

GitHub Actions runs the same package-owned validation surface as local
development:

```shell
npm ci
npm run check
npm run lint
npm run format:check
npm test
npm run harness
git diff --check
```

The workflow uses the repository `package-lock.json`, Node 24, npm cache, and
the npm-pinned `oxlint` and `oxfmt` binaries so CI does not rely on a developer shell.

## Docs

Detailed package material lives under [`docs/`](docs/index.md).
