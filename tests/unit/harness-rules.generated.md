# typescript-lang-project-harness

## Harness Rules

Generated from embedded `src/rules/harness-rules.md`.

- **TS-SEM-R001**: Surfaces TypeScript semantic diagnostics as harness findings.
- **TS-PROJ-R001**: Requires TypeScript projects to declare a tsconfig boundary.
- **TS-PROJ-R002**: Requires tsconfig files to parse before project policy runs.
- **TS-PROJ-R003**: Requires package manifests to parse before package policy runs.
- **TS-PROJ-R004**: Requires project references to use composite configuration.
- **TS-PROJ-R005**: Requires package entries to use modern module resolution.
- **TS-PROJ-R006**: Requires Rspack projects to expose npm build scripts.
- **TS-MOD-R001**: Prevents source dependency graphs from importing test code.
- **TS-MOD-R002**: Keeps project modules within a bounded responsibility surface.
- **TS-TEST-R001**: Keeps test modules inside configured test roots.
- **TS-AGENT-R001**: Requires project imports to resolve to explicit owners.
- **TS-AGENT-R002**: Requires package entrypoints to resolve to explicit owners.
- **TS-AGENT-R003**: Requires multi-owner facades to document their intent.
- **TS-AGENT-R004**: Replaces multiple public flag parameters with typed mode surfaces.
- **TS-AGENT-R005**: Replaces broad public positional parameters with named request surfaces.
- **TS-AGENT-R006**: Replaces anonymous primitive tuple APIs with named data shapes.
- **TS-AGENT-R007**: Exposes public algorithm branch shape through guards, dispatch, or named steps.
- **TS-AGENT-R008**: Splits broad public linear algorithms into smaller named responsibilities.
- **TS-AGENT-R009**: Wraps public primitive semantic fields in named data types.
- **TS-AGENT-R010**: Replaces public primitive semantic aliases with named carriers.
- **TS-AGENT-R011**: Replaces stringly public state fields with typed catalog boundaries.
- **TS-AGENT-R012**: Replaces primitive discriminated union payloads with named semantic payload shapes.
- **TS-AGENT-R013**: Requires exported modules to document public API intent.
- **TS-AGENT-R014**: Groups broad same-source imports behind namespace imports.
- **TS-AGENT-R015**: Organizes broad facade exports into explicit groups.
- **TS-AGENT-R016**: Documents when domain error or exception types occur.
- **TS-EXT-EFFECT-R001**: Requires Effect extension enablement to declare the Effect dependency.
- **TS-EXT-EFFECT-R002**: Requires typed async domain effects for Effect-enabled code.
- **TS-EXT-EFFECT-R003**: Keeps Effect runtime execution at entrypoint boundaries.
- **TS-EXT-EFFECT-R004**: Hides Effect service implementation requirements behind service methods.
- **TS-EXT-EFFECT-R005**: Requires Effect error channels to use typed domain errors.
- **TS-EXT-EFFECT-R006**: Requires rejection-capable Effect interop to expose failure explicitly.
- **TS-EXT-EFFECT-R007**: Requires Effect resources to declare an explicit Scope boundary.
- **TS-EXT-EFFECT-R008**: Requires Effect async batches to declare concurrency policy.
- **TS-EXT-EFFECT-R009**: Requires Effect JSON boundaries to use Schema validation.
- **TS-EXT-EFFECT-R010**: Requires Effect external operations to expose production policy.
- **TS-EXT-EFFECT-R011**: Prevents Effect production modules from importing test utilities.
- **TS-EXT-EFFECT-R012**: Requires Effect service methods to declare explicit error channels.
- **TS-EXT-EFFECT-R013**: Requires Effect fiber forks to propagate context.
- **TS-EXT-REACT-R001**: Requires React extension enablement to declare the React dependency.
- **TS-EXT-REACT-R002**: Keeps React render paths pure for compiler optimization.
- **TS-EXT-REACT-R003**: Keeps React hooks in stable top-level call order.
- **TS-EXT-REACT-R004**: Keeps React components and hooks as static module-level definitions.
- **TS-EXT-SHADCN-R001**: Requires shadcn ui extension enablement to declare the Tailwind CSS dependency.
- **TS-EXT-SHADCN-R002**: Requires shadcn ui components to use the class merge utility.
- **TS-EXT-SHADCN-R003**: Requires shadcn ui registry configuration to use Zod validation.
