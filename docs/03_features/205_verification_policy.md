# Verification Policy

Verification policy is the M5 bridge between parser-owned TypeScript structure
and external validation skills. It plans what must be verified; it does not run
the verifier.

## Authority Chain

The verification planner consumes `TypeScriptHarnessReport.reasoningTree`.
It does not inspect TypeScript ASTs, call `typescript`, call parser helpers, or
rebuild module resolution. Native parser facts first become reasoning tree
facts, then profile hints map those owners to verification tasks.

The planner uses parser-visible owner facts such as module path, role, layer,
exports, imports, owner dependencies, external import counts, and unresolved
import counts. That is enough to detect responsibility drift without letting
verification become a second semantic parser.

## Configuration

`TypeScriptHarnessConfig.verificationPolicy` contains:

- `profileHints`: owner responsibility declarations.
- `receipts`: completed verification results keyed by task fingerprint.
- `waivers`: explicit suppressions keyed by task fingerprint.
- `responsibilityTaskOverrides`: library-level responsibility-to-task mapping.
- `taskContractOverrides`: library-level task receipt contract overrides.
- `skillBindings`: mapping from task kind to external skill id/adapter.
- `skillDescriptors`: expandable command and receipt contracts for configured
  skills.

Use the package facade helpers instead of mutating config objects in place:

- `withTypeScriptVerificationProfileHint()`
- `withTypeScriptVerificationReceipt()`
- `withTypeScriptVerificationWaiver()`
- `withTypeScriptVerificationTaskContract()`
- `withTypeScriptVerificationResponsibilityTaskKinds()`
- `withTypeScriptVerificationSkillBinding()`
- `withTypeScriptVerificationSkillDescriptor()`

## Task Mapping

M5 supports these task kinds:

- `stress`
- `performance`
- `chaos`
- `security`
- `regression`
- `responsibility_review`

Default profile mapping is intentionally small:

- `public_api` -> `stress`
- `latency_sensitive` -> `performance`
- `external_dependency`, `persistence`, `availability_critical` -> `chaos`
- `security_boundary` -> `security`
- `pure_domain_logic` -> no external task

`responsibility_review` is created when the profile itself needs repair. For
example, a `pure_domain_logic` owner with parser-visible external imports or
owner dependencies needs a profile review before external verification has a
meaningful contract.

## Receipts And Waivers

Every planned task has a stable `tsv:<hash>` fingerprint derived from task kind,
owner path, owner namespace, reason, required evidence, parser/reasoning facts,
and configured skill binding.

A matching passed receipt marks a task `satisfied`, and the compact renderer
hides it. A matching failed receipt keeps the task visible as `failed`. A waiver
hides the task only when it has both an `owner` and a `reason`; incomplete
waivers remain visible with a `resolution` line.

## Rendering

`renderTypeScriptVerificationPlan(plan)` emits active pending or failed tasks:

```text
[verify] src/api.ts
   |owner: src/api
   |performance: pending phase=after_unit_tests_pass fingerprint=tsv:...
   |why: performance=profile declares latency-sensitive TypeScript owner
   |requires: performance=benchmark_command,baseline,regression_threshold,latency_or_throughput,allocation_profile,profile_artifact
   |fact: performance.module=role=source layer=harness
   |contract: performance=performance skill must report benchmark command, baseline, regression threshold, latency or throughput, allocation profile, and profiling artifact for this fingerprint
```

When a task kind has a configured skill binding, the first-read task line stays
quiet:

```text
[verify] src/api.ts
   |owner: src/api
   |performance: pending phase=after_unit_tests_pass fingerprint=tsv:... skill=typescript-performance@node contract_ref=typescript-performance@node
```

`renderTypeScriptVerificationSkillContracts(plan)` emits the expandable skill
contract surface:

```text
[skill-contract] typescript-performance@node
   |tool: node
   |run: npm run bench
   |standard: compare current owner against the checked-in baseline
   |inputs: ownerPath,fingerprint
   |pass: no regression above configured threshold
   |receipt: fingerprint,status,summary,evidence
```

Structured consumers can use `renderTypeScriptVerificationPlanJson(plan)`.
Agents should read the compact task output first and expand skill contracts only
when a task references a skill.
