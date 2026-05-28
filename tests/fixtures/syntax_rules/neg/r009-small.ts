/** Small function — does NOT trigger AGENT-TS-R009. */
export function shortAlgorithm(data: string[]): string[] {
  const trimmed = data.map((x) => x.trim());
  const filtered = trimmed.filter((x) => x.length > 0);
  return filtered;
}
