/**
 * Shared test-path classification for semantic-search owners and hits.
 */

export function isTestOwnerPath(ownerPath: string): boolean {
  return (
    ownerPath.includes("/test/") ||
    ownerPath.includes("/tests/") ||
    ownerPath.includes("/__tests__/") ||
    ownerPath.includes(".test.") ||
    ownerPath.includes(".spec.")
  );
}
