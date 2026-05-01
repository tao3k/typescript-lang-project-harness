import path from "node:path";

export function resolveCandidatePath(
  candidatePath: string,
  modulePaths: ReadonlySet<string>,
): string | undefined {
  const normalizedCandidate = normalizeImportExtension(candidatePath);
  const candidates = [
    candidatePath,
    normalizedCandidate,
    `${normalizedCandidate}.ts`,
    `${normalizedCandidate}.tsx`,
    `${normalizedCandidate}.mts`,
    `${normalizedCandidate}.cts`,
    `${normalizedCandidate}.d.ts`,
    path.join(normalizedCandidate, "index.ts"),
    path.join(normalizedCandidate, "index.tsx"),
    path.join(normalizedCandidate, "index.mts"),
    path.join(normalizedCandidate, "index.cts"),
  ];
  return candidates.find((candidate) => modulePaths.has(candidate));
}

const IMPORT_EXTENSIONS_TO_NORMALIZE = [
  ".d.mts",
  ".d.cts",
  ".d.ts",
  ".mjs",
  ".cjs",
  ".jsx",
  ".js",
] as const;

function normalizeImportExtension(candidatePath: string): string {
  const extension = IMPORT_EXTENSIONS_TO_NORMALIZE.find((candidateExtension) =>
    candidatePath.endsWith(candidateExtension),
  );
  return extension === undefined ? candidatePath : candidatePath.slice(0, -extension.length);
}
