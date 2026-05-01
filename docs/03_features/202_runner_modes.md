# Runner Modes

The harness exposes two runner modes with shared configuration. Every report
includes both `runMode` and a reasoning tree whose own `runMode` matches it, so
downstream tools can branch on runner semantics without inspecting optional
project facts.

## Project Runner

Use `runTypeScriptProjectHarness()` or
`assertTypeScriptProjectHarnessClean()` when a caller has a project path. The
requested path must exist. The runner resolves the nearest parent
`package.json` as the package project anchor, reads a local `tsconfig.json` in
that package root, parses it with TypeScript's native config parser, builds a
reasoning tree from parser-owned facts, and evaluates the default rule packs
over that reasoning tree. Project runs also collect TypeScript `Program` semantic
diagnostics as parser-owned facts and expose them through reasoning-tree
diagnostics as non-blocking advice.

When no config file exists, the runner falls back to recursive TypeScript file
discovery and emits `TS-PROJ-R001` from the reasoning tree's missing
`configPath` fact. That fallback is for early bootstrap and editor-oriented
use; long-lived projects should declare `tsconfig.json` so the harness sees the
same source set TypeScript sees.
If `tsconfig.json` enables `allowJs`, JavaScript files selected by TypeScript's
config parser are parsed through the same native `Program`; the fallback
discovery path does not infer JavaScript ownership on its own.

## Configuration

`TypeScriptHarnessConfig` owns parser inclusion and assertion policy:

```ts
import { defaultTypeScriptHarnessConfig } from "typescript-lang-project-harness";

const config = {
  ...defaultTypeScriptHarnessConfig(),
  includeTests: false,
  sourceDirNames: ["lib"],
  testDirNames: ["spec"],
};
```

`ignoredDirNames` controls recursive fallback discovery. `blockingSeverities`
keeps assertion behavior independent from rule emission. `disabledRuleIds`
suppresses selected findings, and `blockingRuleIds` lets a project promote
specific advisory rules without changing catalog severities. Semantic
diagnostics, project-shape advice, modularity and test-layout rules, plus
malformed `package.json` metadata diagnostics, are rendered as `info` advice by
default. Package metadata diagnostics include root, TypeScript
project-reference, and workspace package files and are produced through
TypeScript's JSON parser. Package scripts and workspaces are parser-owned
orientation facts, not package-manager policy.

## Explicit-Path Runner

Use `runTypeScriptLangHarness()` or
`assertTypeScriptLangHarnessClean()` for explicit files or directories.
Requested paths must exist. This runner does not attach project scope, so
project-scoped evaluators stay quiet. It still builds a minimal reasoning tree
from parser-owned file facts, so file-local syntax diagnostics enter policy
through reasoning-tree diagnostic facts rather than parser module reports.

The explicit-path runner is useful for editor integrations, focused parser
checks, and small repair loops where the caller already knows the files to
inspect.

## Reasoning Tree Render

Reports always include a reasoning tree assembled from parser-owned facts.
`renderTypeScriptReasoningTree(report)` renders the Rust-style agent snapshot
shape: `Modules:`, `OwnerBranches:`, `OwnerDependencies:`, and
`FindingGroups:`. It summarizes module roles, exports, path-alias/package
edges, package-name import owners, project-reference/workspace owner
provenance, package entry owners, and Rust-style source-shape counters such as
`shadowed=` and `orphaned=` while omitting singleton and zero-value boilerplate.
Explicit-path reports use the same grouping surface, with diagnostics grouped
under `FindingGroups:` when rule findings exist. Full TypeScript diagnostic
codes and related information remain in compact findings and JSON output.
Parser-visible package `bin` owners are still classified as `entrypoint`
modules before entering this snapshot.

`runTypeScriptProjectHarnessAgentSnapshot()` and
`renderTypeScriptProjectHarnessAgentSnapshot()` provide the project-level
snapshot used by `--agent-snapshot`. The runner starts from the root package
report, follows parser-owned workspace and project-reference package facts, and
runs each member package from its own package anchor. The renderer adds compact
`pkg <path>` headings only when multiple package scopes produce source facts or
findings.

## Public Facade

Consumers should import from the package root. The root facade exposes the M3
contract: parser entrypoints, project/explicit runners, project snapshot
helpers, assertion helpers, compact/JSON/reasoning renderers, rule catalog
functions, and model types, including `TypeScriptHarnessRunMode`. Reasoning
builders and rule evaluators remain internal implementation details.
