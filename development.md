# Development

## Format, Typecheck, Test

```shell
direnv exec . npm install
direnv exec . npm run check
direnv exec . oxlint
direnv exec . npm test
direnv exec . npm run harness
direnv exec . git diff --check
```

## Native Parser Boundary

This package is parser-first. TypeScript source semantics must be extracted
through the TypeScript Compiler API and `tsconfig` parsing APIs in
the `src/parser.ts` facade and `src/parser/` parser layer. Rule packs consume parser-owned facts; they must not scan
TypeScript source text to infer imports, exports, syntax validity, project
references, or module ownership.
When a rule needs a new TypeScript concept, add a parser fact first, then
consume that fact from reasoning/render/rules.
Project semantic diagnostics must come from the parser-owned TypeScript
`Program`; rule packs and renderers may only consume the reported
`semanticDiagnostics` facts. Preserve TypeScript diagnostic codes such as
`TS2322` and related diagnostic spans in rendered output; they are stable
repair anchors for agents.
Reasoning tree diagnostics are a compact aggregation of parser-owned module
diagnostics. Do not make renderers walk TypeScript ASTs or call TypeScript
`Program` APIs to recover diagnostics.
Project-level rule packs should consume reasoning tree facts once the project
or explicit-path runner has built them. The explicit-path runner has no project
scope, but it still attaches a minimal reasoning tree so file-local diagnostics
flow through the same policy surface. Rule evaluators should not accept parser
module reports or project parser scopes as policy inputs. Use
`TypeScriptReasoningTree.runMode` when policy needs to distinguish project runs
from explicit-path checks. Keep `TypeScriptHarnessReport.reasoningTree`
required so new output modes cannot bypass the reasoning surface. Compact file
and parsed counts should come from reasoning-tree module validity, not from raw
parser module reports. Compact finding locations should be relative to
`TypeScriptHarnessReport.reasoningTree.projectRoot`. Compact renderers should
not read `report.modules`, `report.projectScope`, or `report.rootPaths`; those
remain structured report fields rather than the agent output authority surface.
Project runs resolve the nearest parent `package.json` first and treat that
directory as the package project anchor; `tsconfig`, package metadata, roots,
module layers, and compact locations are interpreted relative to that anchor.

Text reads are allowed for non-semantic surfaces such as rendering source lines
and docs/tests that enforce this boundary. Package metadata should enter facts
through TypeScript's JSON parser, not `JSON.parse`, so diagnostics and package
entry locations remain parser-owned.
Malformed `package.json` must be captured as a package fact diagnostic instead
of crashing the project runner. This applies to the project root package and to
package metadata read from TypeScript project references and workspace package
roots.
Package entry fields such as `main`, `module`, `types`, `typings`, and
`browser` belong in parser-owned package facts before reasoning or rule packs
consume them.
Conditional package `exports` and `imports` targets should preserve condition
paths and target source locations from TypeScript's JSON AST before they enter
the reasoning tree.
Package scripts, workspace patterns, and resolved workspace package metadata
should also stay parser-owned orientation facts; do not turn them into
package-manager policy inside this harness.
JavaScript files should enter reports only through TypeScript's native project
selection, such as `allowJs`; do not widen fallback discovery with ad hoc JS
scanning.
Module-role classification should use explicit parser-visible suffix lists for
supported module script kinds instead of dynamic regular-expression helpers.
The whole package project is modularity-governed: large parser, reasoning,
policy, render, model, and harness modules should be split by concern before
they exceed their layer line budgets.

## Self-Applied Policy

The repository runs its own harness through `tests/unit/self_policy.test.ts`.
Those tests call the project runner against the repository root, so the package
must stay clean under the same default policy downstream TypeScript projects
will consume. Self-apply means zero default findings, including `info` advice,
not merely zero blocking findings.
M2 semantic diagnostics, modularity advice, test-layout advice, package
metadata diagnostics, and agent advice are rendered by default but remain
`info`; do not promote advisory findings to blocking without an explicit policy
decision.

## Renderer Contract

Compact text is the default output for repair-oriented agents. JSON is available
for tools through `renderTypeScriptProjectHarnessJson()`. Keep compact output
finding-first and low-noise; do not turn it into a broad audit report.
The agent snapshot compact format follows
`docs/03_features/204_compact_agent_snapshot.md`; design the line shape there
before changing renderer output.
Compact renderers must normalize diagnostic message path mentions under the
reasoning-tree project root, because TypeScript diagnostic text can include
host absolute paths even when diagnostic locations are already structured.

## Public API Contract

The package root is the supported M2 import surface. Tests in
`tests/unit/public_api.test.ts` lock the runtime facade, type exports, and public
agent snapshot behavior. Do not export internal reasoning builders or rule-pack
evaluators unless they become an intentional library contract.
The agent snapshot compact format is also locked by the golden fixture in
`tests/fixtures/agent_snapshot_project` and
`tests/snapshots/agent_snapshot_project.snap`; update them together only when
the reasoning surface intentionally changes.
