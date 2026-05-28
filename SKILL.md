# TypeScript Project Harness — Agent Skill

Reasoning tree for TypeScript/JS projects. Parse once, explore infinitely — no `ls`, `grep`, or manual file traversal needed.

## Quick Start

```bash
npx ts-harness --guide <project-dir>    # Agent guide + project overview
npx ts-harness --stats <project-dir>    # One-line project identity
npx ts-harness --tree <project-dir>     # Architecture map
```

All flags accept a project directory as the last argument. Defaults to `.`.

---

## Progressive Exploration Path

```
1. --stats         Project identity: files, roots, branches, deps, extensions
2. --tree          Architecture: domains by role, entrypoints, internal branches
3. --domain <dir>  Drill down: all branches in a domain, internal deps, external boundary
4. --search <pat>  Find files: export name + path pattern matching, grouped by domain
5. --deps <file>   Trace graph: imports grouped by namespace, importers, fan-in signal
6. --topology      Key nodes: foundations (most imported), orchestrators (most imports), bridges
7. --guide <topic> Vocabulary discovery: domain matching, related concepts, refinement hints
8. --harness       Policy findings: rule violations grouped by severity and count
```

**Default behavior** (no flags): Shows the Agent Guide. Same as `--guide` with no topic.

---

## Signal Reference

| Signal | Meaning |
|---|---|
| `[core]` `[platform]` `[database]` `[ai]` `[process]` `[output]` `[entry]` | Architecture role inferred from package name and dependency position |
| `[facade]` | Re-exports from sub-modules (barrel/index file pattern) |
| `[entrypoint]` | Runtime or binary entry point |
| `←N` | Fan-in: imported by N other modules. Shown only when N ≥ 3. High fan-in = foundational. |
| `→N` | Fan-out: imports N other modules. High fan-out = orchestrator. |
| `·doc` | Has module-level JSDoc content (word count > 5) |
| `★doc` | High-quality documentation (> 20 meaningful words) |
| `◆ bridge` | Both high fan-in and high fan-out — critical architectural node |
| `(N semantic suppressed)` | TS-SEM-R001 diagnostics filtered from harness output |

---

## Exploration Patterns

### Understand a monorepo

```
--stats → --tree → --domain <package> → --deps <package>/src/index.ts
```

### Find a specific feature or concept

```
--guide <topic> → note vocabulary → --search <keyword> → --deps <top result>
```

Example: Understanding performance in Effect-TS
```
--guide "performance"
  → Vocabulary: Effect, Fiber, Scope, Micro, Scheduler...
  → Refine with: --search "fiber"
  → Top: Fiber.ts (←35), core.ts (←65), Effect.ts (←147)
```

### Trace a data flow (how does X reach Y?)

```
--deps <source> → note importers → --deps <each importer>
```

### Assess code quality

```
--harness → note rule IDs → --deps <file with findings> → apply fixes
```

### Explore a component library

```
--tree → note domains → --domain <component-dir> → --search <component-name>
```

Example: Understanding a UI library
```
--domain packages/ui/src
  → foundations: button, input, dialog
  → orchestrators: form, table
```

---

## CLI Reference

```
ts-harness [FLAG] [project-root]

FLAGS (one at a time):
  --stats            One-line project identity
  --tree             Architecture map with domain roles
  --domain <dir>     Branch summary for a directory
  --search <pattern> Find files by export name or path
  --deps <file>      Dependency graph for a file
  --topology         Key nodes in the dependency graph
  --guide [topic]    Vocabulary discovery (no topic = show this guide)
  --harness          Policy findings (add --all for TS diagnostics)
  --json             Full JSON report
  --agent-compact    Compact repair text for agents
  --agent-snapshot   Reasoning tree snapshot
  --help             Usage help

EXAMPLES:
  ts-harness --stats .               Project identity
  ts-harness --tree .                Architecture
  ts-harness --search "fiber" .      Find fiber-related files
  ts-harness --deps src/index.ts .   Who imports this?
  ts-harness --harness .             What's broken?
```

---

## Understanding the Output

### `--stats` output
```
[stats] files=1773 roots=38 branches=987 deps=5445 ext=1
```
1773 TypeScript files, 38 entry points, 987 owner branches, 5445 dependency edges, 1 extension detected.

### `--tree` output
```
Architecture:
  [core] packages/effect/  379 branches ◆ bridge
  [platform] packages/platform-node/  34 branches ◆ entry
  ...
Entrypoints:
  src/cli/main.ts [root,entrypoint] exports=4
  ...
33 internal branches  (use --domain <name> to explore)
```
Domain roles, entrypoints with export counts, internal branches collapsed for clarity.

### `--domain` output
```
[domain] packages/shadcn/src (122 branches)
  src/registry/  [facade,source]  18 branches, 137 exports
  src/utils/     [facade,source]  54 branches, 188 exports

  imports from outside (10):
    ← [../package.json] index.ts
  exported to outside (2):
    → [packages/shadcn] api.ts, schema.ts
  internal deps (50):
    src/index.ts → src/registry/api.ts
```
Structure, external boundary, and internal dependency edges.

### `--search` output
```
[search] "fiber" → 20 matches
  packages/effect/src/
    Fiber.ts ←35  → Fiber, FiberTypeId, RuntimeFiber, Order
    internal/fiberRuntime.ts ·doc ←34  → FiberRuntime, ScopeImpl, ...
    Effect.ts ←147  → Adapter, All, Effect, Blocked, Do...
```
Files matching the pattern, grouped by domain, with fan-in and doc signals.

### `--deps` output
```
[deps] src/internal/fiberRuntime.ts ←34 importers
  exports: FiberRuntime, ScopeImpl, ... (103 total)
  imports (73, 1 group):
    [effect/src] Cause.ts, Clock.ts, Effect.ts, Fiber.ts...
  imported by (34, 1 group):
    [effect/src] Effect.ts, Fiber.ts, cache.ts, core.ts...
```
Complete import/export surface of a file with namespace grouping.

### `--topology` output
```
Foundations (most imported):
  ←217 Function.ts     ←142 Option.ts     ←141 Effect.ts
Orchestrators (most imports):
  →175 index.ts        →73 fiberRuntime   →64 Effect.ts
Bridges (high fan-in + fan-out):
  ←141 →64 Effect.ts   ←142 →17 Option.ts
```
Key architectural nodes identified by graph position.

### `--harness` output
```
[harness] 13 visible / 1471 total (1458 semantic suppressed)
  ✗ TS-MOD-R002  x1  layer boundary (MDXComponents.tsx)
  ⚠ TS-AGENT-R007 x5  nested control flow (ConsoleBlock.tsx, ...)
```
Policy violations grouped by rule, with TS-SEM-R001 diagnostics suppressed by default.

---

## Architecture Roles

Roles are inferred from package/directory names and dependency graph position. Not hardcoded — derived from project structure.

| Role | Trigger | Example |
|---|---|---|
| `core` | High fan-in, core library names | `packages/effect/` |
| `platform` | Platform adapter names | `packages/platform-node/` |
| `database` | SQL/database names | `packages/sql-pg/` |
| `ai` | AI/ML names | `packages/ai/` |
| `process` | Rule/verification/cache names | `packages/cluster/` |
| `output` | Render/format/printer names | `packages/printer/` |
| `entry` | CLI/main entry points | `packages/cli/` |
| `internal` | No clear signal | `scripts/` |

---

## Tips for Effective Exploration

1. **Start broad, narrow iteratively**: `--tree` → `--domain` → `--search` → `--deps`
2. **Use vocabulary discovery**: `--guide <topic>` shows the project's language. Use those terms to refine searches.
3. **Read the signals**: `←N` means foundational (changes affect many). `·doc`/`★doc` tells you where the docs are.
4. **Trace before reading**: `--deps` shows you the dependency context before you open any file.
5. **Harness is for quality**: `--harness` catches policy issues. Run it after changes to verify.
6. **Orphaned ≠ bad**: Files in doc sites (`apps/`, `www/`) are excluded. Remaining orphans may be dead code worth investigating.
