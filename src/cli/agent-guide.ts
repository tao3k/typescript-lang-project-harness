/**
 * Agent-facing command guide for the asp-typescript CLI.
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
  const workspace = "--workspace <workspace-root>";
  return [
    `[asp-typescript-guide] project=${project}`,
    "|catalog search=playbook routes=search-playbook,syntax-locate,exact-source,callable-skeleton",
    `|route search-playbook returns=candidates,native-syntax,lexical-rank,graph-expansion cmd=asp typescript search playbook <query> ${workspace}`,
    `|route syntax-locate selectors=S:tree-sitter-query,Scope:owner-or-structural returns=locator,capture,frontier code=false cmd=asp typescript query --treesitter-query '(function_declaration name: (identifier) @function.name)' --selector <owner-path-or-structural-scope> ${workspace}`,
    `|route exact-source selectors=R:exact-selector returns=source cmd=asp typescript query --selector <exact-structural-selector> --projection source ${workspace}`,
    `|route callable-skeleton selectors=R:exact-callable-selector returns=callable-skeleton cmd=asp typescript query --selector <exact-structural-selector> --projection callable-skeleton ${workspace}`,
    `|cmd playbook=asp typescript search playbook <query> ${workspace}`,
    `|cmd syntax-locate=asp typescript query --treesitter-query '(function_declaration name: (identifier) @function.name)' --selector <owner-path-or-structural-scope> ${workspace}`,
    `|cmd exact-source=asp typescript query --selector <exact-structural-selector> --projection source ${workspace}`,
    `|cmd callable-skeleton=asp typescript query --selector <exact-structural-selector> --projection callable-skeleton ${workspace}`,
    "|cmd ast-patch=asp typescript ast-patch dry-run --packet <semantic-ast-patch.json>",
    `|cmd evidence-graph=asp typescript evidence graph --json ${workspace}`,
    `|cmd evidence-analyze=asp typescript evidence analyze --json ${workspace}`,
    "|policy authority=asp-typescript-api trigger=package-test",
    "|rule agent hook install/runtime is owned by asp",
    "|rule selector queries do not need a trailing project root; --workspace <workspace-root> is the independent workspace override",
    "|rule syntax query ABI is compiled by asp; provider projects native parser facts into tree-sitter-compatible captures",
    "|rule syntax predicates supported=#eq?,#any-eq?,#any-of?,#match?,#any-match?,#not-eq?,#not-match? unsupported=none unsupportedReported=true",
    "|rule exact query requires a parser-owned selector and an explicit source or callable-skeleton projection",
    "|rule the root ASP Client owns the only public search surface; provider-local search views are removed",
    "|rule displayLineRange/sourceLocatorHint are display hints; execute structural selectors or owner/symbol routes, not line ranges",
    "|rule native syntax facts remain provider-owned inputs to the root search playbook",
    "|rule use the asp typescript facade; run one command at a time; no raw TS/JS source reads",
    "|subagent give one |cmd line; require evidence/missing/next/risk",
  ].join("\n");
}
