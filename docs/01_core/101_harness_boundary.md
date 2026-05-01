# Harness Boundary

`typescript-lang-project-harness` owns a standalone, library-first TypeScript
project harness. It exists because `tsc`, ESLint, and Prettier do not provide a
compact project reasoning tree for repair-oriented agents.

## Ownership

This repository may:

1. parse TypeScript and TSX modules through the TypeScript Compiler API
2. parse `tsconfig.json` through TypeScript's config parsing APIs
3. parse package metadata through TypeScript's JSON parser
4. discover project files from `tsconfig` and conventional TypeScript roots
5. evaluate deterministic rule packs over parser-owned facts
6. render compact diagnostics for humans and repair-oriented agents
7. expose structured reports and JSON rendering for tooling
8. expose a thin CLI over the default project runner

This repository must not own:

1. application runtime orchestration
2. framework-specific build execution
3. CI-provider-specific policy
4. package-manager installation workflows
5. project-specific allowlists hidden inside the library
6. long-running daemon behavior

## Parser Boundary

The parser layer owns TypeScript-native facts. Standalone files are parsed with
`ts.createSourceFile`; project runs build a TypeScript `Program` and resolve
module specifiers with TypeScript's module resolver. `tsconfig.json` is read
with `ts.readConfigFile` and `ts.parseJsonConfigFileContent`. Parser reports
carry syntax diagnostics, `Program` semantic diagnostics, native diagnostic
codes, related diagnostic information, imports, type-only import/export
markers, import resolution facts, exports, namespace/star re-export facts,
script kind, declaration-file status, source-line data, and project config
facts.
Project runs respect TypeScript's native file selection, including JavaScript
and JSX files selected by `allowJs`; fallback discovery without `tsconfig.json`
remains TypeScript-file-only.
Parser-visible JavaScript modules use the same role vocabulary as TypeScript
modules: `entrypoint`, `facade`, `source`, `test`, `config`, `declaration`, and
`unknown`.
Type-only markers include declaration-level `import type` / `export type`,
specifier-level `import { type T }` / `export { type T }`, and `import("...")`
type queries. Declaration-file export facts include `export =` and
`export as namespace`.
Project facts include `compilerOptions.paths`, `baseUrl`, `rootDirs`,
module/effective moduleResolution/target, JSX/emit/declaration options, project
references, TypeScript JSON AST-backed package entry fields,
exports/imports/bin/scripts/workspaces, conditional exports/imports target
details, package metadata source locations, package metadata diagnostics,
referenced package metadata and referenced package compiler options from
TypeScript project references, workspace
package metadata from root `workspaces`, package-root anchored module roles,
module layers, module line counts, owner branches, owner dependencies, package
entry owners, shadowed/orphaned source-shape counters, and import edges.
Parser-visible package `bin` owners feed the `entrypoint` module role.
Parser-visible `index.*`, `main.*`, config, and test file roles are matched by
explicit module suffix lists, not dynamic regular-expression construction.
Workspace package config facts are package-root local: a workspace package only
reports `configPath` when that package directory contains its own
`tsconfig.json`, never by inheriting the root project's config.

Project rule packs consume the reasoning tree assembled from those reports.
They must not re-parse TypeScript source or infer TypeScript semantics from raw
text. If a future rule needs project references, path aliases, package exports,
JSX mode, declaration emit, package import owner facts, or public surface facts,
the parser layer must expose those facts first and the reasoning tree must carry
the project-level projection.
Semantic diagnostics are a parser-owned fact from TypeScript's native
`Program`; rule packs may surface them as advice, including stable codes such
as `TS2322` and native related spans, but they must not call TypeScript parser
APIs directly.

The reasoning tree consumes parser-owned import resolution and diagnostic facts,
including source syntax, TypeScript semantic, `tsconfig`, and package JSON
parser diagnostics. It may render or compact those facts for rule packs and
agent output, but it must not reimplement TypeScript's relative, `paths`,
`rootDirs`, package imports, or external module resolution.
Unresolved relative imports, unresolved configured path aliases, and unresolved
`#` package imports are rendered as `unresolved`; resolved `#` imports stay
`package-import`.

Rule evaluation starts after the reasoning tree exists. The rule layer consumes
the reasoning tree, including its `runMode`; it must not accept parser module
reports or project parser scopes as policy inputs. Reports expose this marker
as `runMode` so structured consumers can distinguish project-scoped policy from
explicit-path checks without reverse-engineering optional project fields. Every
harness report carries a reasoning tree: full project facts for project runs
and minimal parser-owned file facts for explicit-path runs.
Agent-facing modularity and repair rules use reasoning-tree owner facts such
as `ownerBranches` and `ownerDependencies` before falling back to lower-level
edge facts. Snapshot rendering filters test-context owner dependencies the same
way Rust's agent snapshot hides test-context dependency rows.
Compact file and parsed counts are computed from reasoning-tree module
validity, not directly from parser module reports. Compact finding locations
are rendered relative to the reasoning tree root, so explicit-path output does
not fall back to absolute host paths.

Text reads remain acceptable for non-semantic surfaces: compact rendering can
show source lines, and tests can inspect source text to enforce the parser
boundary. Package metadata should still enter through `ts.parseJsonText` so
diagnostics and entry locations stay parser-owned. Text reads must not become
policy logic for TypeScript syntax, imports, exports, or ownership.

## Runner Modes

Use `runTypeScriptProjectHarness()` when a caller has a project path. The
project runner first resolves the nearest parent `package.json` and uses that
directory as the package project anchor. It then reads `tsconfig.json` when
present and uses TypeScript's own config parser to select root file names.
Without a config file, it falls back to conventional recursive TypeScript file
discovery while emitting project-policy guidance from the reasoning tree's
missing `configPath` fact.

Use `runTypeScriptLangHarness()` for explicit files or directories. This runner
is useful for focused parser checks and editor integrations. It attaches a
minimal reasoning tree built from parser-owned file facts, so syntax diagnostics
still flow through reasoning-tree diagnostic facts before rule packs render
findings. Project-scoped policy stays quiet unless a project scope is available.

## Reasoning Tree

`renderTypeScriptReasoningTree()` turns a report into a compact agent snapshot.
It follows the Rust harness agent snapshot shape: `Modules:`, `OwnerBranches:`,
`OwnerDependencies:`, and `FindingGroups:`. It renders reasoning-tree
`ownerBranches` and `ownerDependencies` facts built from parser-owned module
roles, source exports, import specifiers, TypeScript-native
relative/path-alias/package/external import resolution, package-name import
owners, resolved workspace packages, project references, and package entry
owners. It also carries source-shape counters such as shadowed owner
namespaces and orphaned source files as compact orientation metrics, not
blocking policy. It groups findings by rule instead of rendering full
diagnostic cards.
This is the preferred first read when an agent needs to choose which TypeScript
owner, facade, entrypoint, or package surface to edit. Full diagnostic detail
stays in the default compact renderer and JSON output.

## Blocking And Advice

`warning` and `error` findings block assertions by default. `info` findings are
advisory. TypeScript semantic diagnostics are reported as `TS-SEM-R001` advice
because they should be visible to agents without turning the harness into a
replacement for `tsc`. Malformed `package.json` metadata is reported as
`TS-PROJ-R003` advice, including malformed package metadata in TypeScript
project references, so the project harness can still produce a repair surface.
Project-reference config shape and package-entry module-resolution shape are
reported as `TS-PROJ-R004`/`TS-PROJ-R005` advice from parser-owned
compiler-option facts, not package-manager or style policy. Modularity findings
are `TS-MOD-*` ownership advice over the parser-owned reasoning tree, and test
layout findings are `TS-TEST-*` advice over parser-owned module roles and
configured test roots. Future `TS-MOD-*`, `TS-TEST-*`, and
`TS-AGENT-*` rules should remain non-blocking unless a caller explicitly
promotes them.

## Non-Goals

The first standalone version does not replace `tsc`, ESLint, Prettier,
framework compilers, bundlers, or package-manager audits. The harness should
avoid rules those tools already own and focus on project facts that help agents
choose the correct owner, entrypoint, facade, and edit surface.
