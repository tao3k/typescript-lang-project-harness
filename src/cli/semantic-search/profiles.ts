import type { SemanticSearchReasoningProfile } from "./types.js";

export function typeScriptReasoningProfiles(): readonly SemanticSearchReasoningProfile[] {
  return [
    {
      profile: "owner-query",
      description:
        "Combine an owner and query term to find matching items, tests, and dependency usage.",
      selectors: [
        { kind: "owner", alias: "O", targetRole: "path", required: true },
        { kind: "query", alias: "Q", targetRole: "term", required: true },
      ],
      returns: ["items", "tests", "dependency-usage"],
      frontier: ["O.items", "Q.owner", "Q.tests"],
      fields: { source: "search-guide" },
    },
    {
      profile: "query-deps",
      description:
        "Combine a query term and dependency handle to find owners, imports, usage, and tests.",
      selectors: [
        { kind: "query", alias: "Q", targetRole: "term", required: true },
        { kind: "dependency", alias: "D", targetRole: "pkg", required: true },
      ],
      returns: ["owners", "imports", "usage-tests"],
      frontier: ["Q.owner", "D.public-api", "D.tests"],
      fields: { source: "search-guide" },
    },
    {
      profile: "owner-tests",
      description: "Use an owner to inspect covering tests, entrypoints, and fixtures.",
      selectors: [{ kind: "owner", alias: "O", targetRole: "path", required: true }],
      returns: ["covering-tests", "test-entrypoints", "fixtures"],
      frontier: ["O.tests", "T.owner"],
      fields: { source: "search-guide" },
    },
    {
      profile: "finding-frontier",
      description:
        "Combine a finding and optional owner to find affected owners, tests, and verification actions.",
      selectors: [
        { kind: "finding", alias: "F", targetRole: "finding", required: true },
        { kind: "owner", alias: "O", targetRole: "path", required: false },
      ],
      returns: ["affected-owners", "tests", "verification-actions"],
      frontier: ["F.owner", "F.tests", "O.policy"],
      fields: { source: "search-guide" },
    },
    {
      profile: "feature-cfg",
      description: "Use a feature or cfg gate to find guarded owners and verification surfaces.",
      selectors: [{ kind: "feature", alias: "F", targetRole: "feature", required: true }],
      returns: ["cfg-gates", "owners", "verification-surfaces"],
      frontier: ["F.cfg", "F.owner", "F.tests"],
      fields: { source: "search-guide" },
    },
  ];
}
