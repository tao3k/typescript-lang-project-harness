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
  renderTypeScriptProjectHarness,
  runTypeScriptProjectHarness,
} from "typescript-lang-project-harness";

const report = runTypeScriptProjectHarness(".");
console.log(renderTypeScriptProjectHarness(report));
```

The CLI runs the same project harness:

```shell
typescript-project-harness .
typescript-project-harness --json .
typescript-project-harness --agent-snapshot .
```

Project runs anchor at the nearest `package.json` above the requested path.
Running from a package subdirectory still evaluates the whole package project,
including `tsconfig`, package metadata, roots, modules, and edges relative to
that package root.

## Current Rule Packs

Default project execution runs these packs in descriptor order:

1. `typescript.syntax`
2. `typescript.semantic`
3. `typescript.project_policy`
4. `typescript.modularity`
5. `typescript.test_layout`
6. `typescript.agent_policy`

M2 implements the native parser boundary, source syntax diagnostics, native
TypeScript `Program` semantic diagnostics with TypeScript diagnostic codes,
parseable `tsconfig.json` policy, TypeScript JSON AST-backed package/config
facts, reasoning-tree snapshots, non-blocking package metadata diagnostics,
modularity/test-layout advice, and the first non-blocking agent advice rules.
`TS-SEM-*`, `TS-PROJ-R003`, `TS-MOD-*`, `TS-TEST-*`, and `TS-AGENT-*` findings
are shown to agents without failing the default gate. Package metadata
diagnostics cover both the project root package and TypeScript project
reference packages, plus package metadata discovered from root workspace
patterns.

For agent repair loops, `renderTypeScriptReasoningTree(report)` and the
`--agent-snapshot` CLI flag emit a Rust-style owner snapshot from reasoning
tree facts. The snapshot starts with `Modules:` and then renders
`OwnerBranches:`, `OwnerDependencies:`, and `FindingGroups:` when those
sections are non-empty. The renderer consumes reasoning-tree `ownerBranches`
and `ownerDependencies` rather than rediscovering owner structure from raw
source or raw import edges.
Owner branches summarize module roles, exports, type-only re-exports,
TypeScript-native import-resolution counts, and parser-owned re-export
structure. Owner dependencies summarize relative/path-alias/package-import
owner routing, package-name import owners with `project-reference` or
`workspace` provenance, and package entry ownership for fields,
exports/imports, and bins. External package imports stay as branch counters
instead of becoming owner-dependency rows.
Full TypeScript diagnostic codes, source lines, related information, compiler
options, package metadata, scripts, workspace facts, and detailed parser reports
remain available through the default compact findings and JSON report instead
of being repeated in the agent snapshot.
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
facade `index.*`, entrypoint `main.*`/package `bin`, config files, source, and
test files.
Parser-visible package `bin` owners are rendered as `entrypoint` modules so CLI
surfaces are visible without filename guessing.
The parser recognizes TypeScript's granular type-only forms such as
`import { type T }`, `export { type T } from`, and `import("./module")` type
queries before the reasoning tree renders them as compact edges.

## Public API Contract

The package facade exports the M2 library surface: runners, assertion helpers,
parser entrypoints, compact/JSON/reasoning renderers, rule catalog functions,
and report model types. Internals such as reasoning-tree builders and rule-pack
evaluators stay private so downstream tools depend on parser-owned facts and
stable rendered output instead of implementation modules.

## Docs

Detailed package material lives under [`docs/`](docs/index.md).
