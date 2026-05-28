/** Shallow control flow — does NOT trigger AGENT-TS-R008. */
export function processData(items: number[]): number[] {
  const result: number[] = [];
  for (const item of items) {
    if (item > 0) {
      result.push(item * 2);
    }
  }
  return result;
}
