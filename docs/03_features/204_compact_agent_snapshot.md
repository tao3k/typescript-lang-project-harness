# Compact Agent Snapshot

The compact agent snapshot is the first reading surface for repair-oriented
agents. It follows the Rust harness shape: a low-noise owner summary, not a
JSON-like dump of every parser fact.

## Design Chain

```text
TypeScript parser facts -> reasoning tree facts -> agent owner snapshot
```

The renderer consumes `TypeScriptHarnessReport.reasoningTree.ownerBranches`,
`ownerDependencies`, package owner facts, and grouped findings. It must not
inspect raw source files, `tsconfig`, `package.json`, `report.modules`,
`report.projectScope`, `report.rootPaths`, or raw import edges to rediscover
owner structure.

## Format Shape

The output uses the same section grammar as the Rust harness agent snapshot:

```text
Modules: source=<n> roots=<n> branches=<n> deps=<n> paths=<n> refs=<n> workspaces=<n> package-owners=<n> findings=<n>
OwnerBranches:
 - <path> [<roles>] owner=<owner> imports=<resolution:count,...> exports=<names> -> <edge-kind:path,...>
OwnerDependencies:
 - <path> --<resolution>/<import-kind>--> <path-or-specifier>
 - package <kind>:<subpath> --<owner|unresolved|external>--> <path-or-target>
FindingGroups:
 - <severity> <rule-id> x<count> first=<path> <title>
```

Only non-empty sections are emitted. Singleton and zero-value boilerplate is
omitted.

## Semantics

- `Modules:` summarizes parser-visible non-test modules.
- `OwnerBranches:` lists source owners that are roots, facades, entrypoints,
  configs, or modules with parser-owned re-export structure edges. Ordinary
  imports stay in `OwnerDependencies:`.
- `OwnerDependencies:` lists import/export edges, package-name import owner
  facts, and package entry owner facts in one compact routing surface.
- External package imports stay as `imports=external:<n>` counters on owner
  branches. They are not expanded as owner-dependency rows because they are not
  parser-visible TypeScript owners.
- `FindingGroups:` groups deterministic rule findings by severity, rule id, and
  title instead of repeating full diagnostic cards.
- TypeScript test modules are omitted from owner-branch and owner-dependency
  orientation unless a future parser fact makes a test owner explicitly useful.

## Compactness Rules

- Do not render raw JSON.
- Do not render full package manifests.
- Do not render `dependencies`, `devDependencies`, `peerDependencies`, or
  `optionalDependencies`; those are package-manager policy, not TypeScript
  owner reasoning.
- Package-name imports may render as `--package-name/<kind>-->` owner
  dependencies when they resolve to a parser-visible TypeScript project
  reference or workspace package. That is import-owner dependency orientation,
  not manifest dependency governance.
- Keep diagnostic detail out of the snapshot. Full diagnostic cards stay in the
  default compact renderer; the snapshot only groups findings.
- Compact renderers normalize project-root absolute path mentions in diagnostic
  summaries to relative paths before rendering.

## Golden Contract

The canonical fixture lives at:

```text
tests/fixtures/agent_snapshot_project
```

The expected compact text lives at:

```text
tests/snapshots/agent_snapshot_project.snap
```

`tests/unit/agent_snapshot.test.ts` compares both the library renderer and the
CLI `--agent-snapshot` output against that golden file. Update the fixture and
golden together only when the compact reasoning surface intentionally changes.
