/** Only 1 boolean param — does NOT trigger AGENT-TS-R006. */
export function search(query: string, caseSensitive: boolean): string[] {
  return [query];
}
