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
  const root = input.projectRoot === "." ? "." : input.projectRoot;
  return [
    `[ts-harness-guide] project=${root}`,
    "|catalog reasoningProfiles=owner-query,query-deps,owner-tests,finding-frontier,feature-cfg entries=owner-query,query-deps,owner-tests routes=read-frontier",
    `|cmd asp typescript search prime --view seeds ${root}`,
    `|cmd asp typescript search owner ${input.ownerTarget} --view seeds ${root}`,
    `|cmd asp typescript query ${input.ownerTarget} --term <symbol> --names-only ${root}`,
    `|cmd asp typescript query ${input.ownerTarget} --term <symbol> --code ${root}`,
    `|cmd asp typescript query --treesitter-query '(function_declaration name: (identifier) @function.name)' --selector <selector> ${root}`,
    `|cmd asp typescript search owner ${input.ownerTarget} items --query <symbol-or-a|b|c> ${root}`,
    `|cmd asp typescript search owner ${input.ownerTarget} items --query <symbol-or-a|b|c> --code ${root}`,
    `|cmd asp typescript search policy <rule-id-or-alias> owner tests --view seeds ${root}`,
    `|cmd asp typescript query --from-hook direct-source-read --selector <selector> --term <term> --surface owners,tests --view seeds ${root}`,
    `|cmd asp typescript search fzf <query> owner tests --view seeds ${root}`,
    `|cmd asp typescript search deps <dep[/subpath][@version][::api]> ${root}`,
    `|pipe <candidate-lines> | asp typescript search ingest --view seeds ${root}`,
    `|cmd asp typescript ast-patch dry-run --packet <semantic-ast-patch.json> ${root}`,
    `|cmd asp typescript check --changed ${root}`,
    "|rule agent hook install/runtime is owned by asp",
    "|rule use the asp typescript facade; run one command at a time; no raw TS/JS source reads",
    "|subagent give one |cmd or |pipe line; require evidence/missing/next/risk",
  ].join("\n");
}
