export const HELP_TEXT = `TypeScript Project Harness — parser-naive fact layer for agent-assisted TS projects

Usage: typescript-project-harness [OPTIONS] [PROJECT]

Options:
  --tree            Show reasoning tree (structure, owners, deps, findings)
  --findings        Show compact findings only
  --stats           Show project statistics (one line)
  --cache           Show cache file status
  --json            Full JSON output (backwards compat)
  --agent-compact   Compact agent text output (backwards compat)
  --agent-snapshot  Full agent snapshot (backwards compat)
  --help            Show this help

Default output (no flags): [ok] for clean projects, findings otherwise.

Examples:
  typescript-project-harness .             # check current project
  typescript-project-harness --tree .      # show reasoning tree
  typescript-project-harness --stats .     # show project stats
  typescript-project-harness --findings .  # show findings only
`;
