# typescript-lang-project-harness

Standalone project-level TypeScript language harness for agent repair loops,
local checks, and CI policy gates.

The package keeps one strict boundary: TypeScript semantics come from the
TypeScript Compiler API, native `tsconfig` parsing, and parser-owned project
facts. Rule packs and search packets consume those facts instead of treating
source text as the source of truth.

## Use

```ts
import { assertTypeScriptProjectHarnessClean } from "typescript-lang-project-harness";

assertTypeScriptProjectHarnessClean(new URL(".", import.meta.url));
```

For compact repair output:

```ts
import {
  renderTypeScriptProjectHarnessAgentCompactText,
  runTypeScriptProjectHarness,
} from "typescript-lang-project-harness";

const report = runTypeScriptProjectHarness(".");
console.log(renderTypeScriptProjectHarnessAgentCompactText(report));
```

## CLI

The public binary is `ts-harness`.

```shell
ts-harness search workspace .
ts-harness search prime --workspace . --view seeds
ts-harness search owner src/index.ts --workspace . --view seeds
ts-harness search fzf OrderStatus .
ts-harness search fzf --query-set OrderStatus --query-set findOrderStatus owner tests .
rg -n "OrderStatus" src tests | ts-harness search ingest .

ts-harness check --changed .
ts-harness check --full .
ts-harness agent doctor --json .
ts-harness agent install --client codex .
ts-harness agent guide --client codex .
```

Compact text is the default agent surface. `--json` emits the shared semantic
search packet, and `agent doctor --json` emits the semantic language registry.
`agent install --client codex` writes `.codex/config.toml` so Codex hooks route
raw TypeScript/JavaScript source reads and broad candidate searches back through
`ts-harness search` packets. Existing multi-language hook config is preserved:
the installer updates its own marked block or appends one when another harness
already owns hooks. `agent guide --client codex` prints the command-line guide
used in hook denials; every actionable line uses the installed `ts-harness`
binary.
The provider identity is:

```text
languageId=typescript
providerId=ts-harness
binary=ts-harness
namespace=agent.semantic-protocols.languages.typescript.ts-harness
```

## Rule Packs

Default project execution evaluates:

1. `typescript.syntax`
2. `typescript.semantic`
3. `typescript.project_policy`
4. `typescript.modularity`
5. `typescript.test_layout`
6. `typescript.agent_policy`
7. `typescript.extension_policy`

Blocking rules represent broken parser/project promises. Advisory rules stay
visible to agents without failing the default gate unless the caller promotes
them or uses the explicit agent test-gate assertion.

## Validation

```shell
npm run check:implementation
npm run check:policy
npm run lint
npm run format:check
npm run test:implementation
npm run test:policy
npm run harness
git diff --check
```

## Documentation

Durable package material lives under [docs/](docs/index.md):

- [Harness Boundary](docs/01_core/101_harness_boundary.md)
- [Runner Modes](docs/03_features/202_runner_modes.md)
- [CLI](docs/03_features/203_cli.md)
- [Rule Catalog](docs/03_features/201_rule_catalog.md)
- [Verification Policy](docs/03_features/205_verification_policy.md)
- [CI](docs/04_development/301_ci.md)
