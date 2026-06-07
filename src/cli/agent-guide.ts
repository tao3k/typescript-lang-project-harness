/**
 * Agent-facing command guide for the ts-harness CLI.
 */

export function renderCodexAgentGuide(projectRoot: string): string {
  return `${commandGuide({
    ownerTarget: "<owner-path>",
    projectRoot,
  })}\n`;
}

function commandGuide(input: {
  readonly ownerTarget: string;
  readonly projectRoot: string;
}): string {
  const project = input.projectRoot === "." ? "." : input.projectRoot;
  const root = ".";
  const workspace = "--workspace <workspace-root>";
  return [
    `[ts-harness-guide] project=${project}`,
    "|catalog reasoningProfiles=owner-query,query-deps,owner-tests,finding-frontier,feature-cfg entries=owner-query,query-deps,owner-tests routes=read-frontier,syntax-locate,syntax-code,query-code",
    "|flow prime->owner|syntax-locate|query-code|deps|tests pipe=fzf:tests ingest=stdin",
    `|route syntax-locate selectors=S:tree-sitter-query,R:range returns=locator,capture,frontier code=false cmd=asp typescript query --treesitter-query '(function_declaration name: (identifier) @function.name)' --selector <path[:line|:start-end]> ${workspace}`,
    `|route syntax-code selectors=S:tree-sitter-query,R:exact-selector returns=code code=pure cmd=asp typescript query --treesitter-query '(function_declaration name: (identifier) @function.name)' --selector <path[:line|:start-end]> ${workspace} --code`,
    `|route read-plan selectors=R:selector,T:term returns=owners,tests,window-set code=false cmd=asp typescript query --from-hook direct-source-read --selector <selector> --term <term> --surface owners,tests --view seeds ${workspace}`,
    `|route query-code selectors=O:owner,Q:symbol returns=code code=pure cmd=asp typescript query ${input.ownerTarget} --term <symbol> ${workspace} --code`,
    `|cmd prime=asp typescript search prime --view seeds ${root}`,
    `|cmd owner=asp typescript search owner ${input.ownerTarget} --view seeds ${root}`,
    `|cmd reasoning-owner-tests=asp typescript search reasoning owner-tests --owner ${input.ownerTarget} --view seeds ${root}`,
    `|cmd reasoning-owner-query=asp typescript search reasoning owner-query --owner ${input.ownerTarget} --query <symbol> --view seeds ${root}`,
    `|cmd reasoning-query-deps=asp typescript search reasoning query-deps --query <symbol> --dependency <pkg> --view seeds ${root}`,
    `|cmd names=asp typescript query ${input.ownerTarget} --term <symbol> ${workspace} --names-only`,
    `|cmd query-code=asp typescript query ${input.ownerTarget} --term <symbol> ${workspace} --code`,
    `|cmd syntax-locate=asp typescript query --treesitter-query '(function_declaration name: (identifier) @function.name)' --selector <path[:line|:start-end]> ${workspace}`,
    `|cmd syntax-code=asp typescript query --treesitter-query '(function_declaration name: (identifier) @function.name)' --selector <path[:line|:start-end]> ${workspace} --code`,
    `|cmd owner-items=asp typescript search owner ${input.ownerTarget} items --query <symbol-or-a|b|c> ${root}`,
    `|cmd owner-items-code=asp typescript search owner ${input.ownerTarget} items --query <symbol-or-a|b|c> ${workspace} --code`,
    `|cmd policy=asp typescript search policy <rule-id-or-alias> owner tests --view seeds ${root}`,
    `|cmd read-plan=asp typescript query --from-hook direct-source-read --selector <selector> --term <term> --surface owners,tests --view seeds ${workspace}`,
    `|cmd fzf=asp typescript search fzf <query> owner tests --view seeds ${root}`,
    `|cmd deps=asp typescript search deps <dep[/subpath][@version][::api]> ${root}`,
    `|pipe <candidate-lines> | asp typescript search ingest --view seeds ${root}`,
    `|cmd ast-patch=asp typescript ast-patch dry-run --packet <semantic-ast-patch.json> ${root}`,
    `|cmd check=asp typescript check --changed ${root}`,
    "|rule agent hook install/runtime is owned by asp",
    "|rule selector queries do not need a trailing project root; --workspace <workspace-root> is the independent workspace override",
    "|rule syntax query ABI is compiled by asp; provider projects native parser facts into tree-sitter-compatible captures",
    "|rule syntax predicates supported=#eq?,#any-eq?,#any-of?,#match?,#any-match?,#not-eq?,#not-match? unsupported=none unsupportedReported=true",
    "|rule query --code is pure code; search/read-plan returns locators/frontier, not inline code",
    "|rule use the asp typescript facade; run one command at a time; no raw TS/JS source reads",
    "|subagent give one |cmd or |pipe line; require evidence/missing/next/risk",
  ].join("\n");
}
