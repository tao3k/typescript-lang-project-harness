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
    `|cmd ts-harness search prime --view seeds ${root}`,
    `|cmd ts-harness search owner ${input.ownerTarget} --view seeds ${root}`,
    `|cmd ts-harness search text <query> owner tests --view seeds ${root}`,
    `|cmd ts-harness search deps <dep[/subpath][@version][::api]> ${root}`,
    `|pipe <candidate-lines> | ts-harness search ingest --view seeds ${root}`,
    `|cmd ts-harness check --changed ${root}`,
    "|rule agent hook install/runtime is owned by semantic-agent-hook",
    "|rule use installed ts-harness binary; run one command at a time; no raw TS/JS source reads",
    "|subagent give one |cmd or |pipe line; require evidence/missing/next/risk",
  ].join("\n");
}
