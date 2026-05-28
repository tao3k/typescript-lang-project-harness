// Positive fixture: 3 boolean params — triggers AGENT-TS-R006
export function search(
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
  regex: boolean,
): string[] {
  return [query];
}
