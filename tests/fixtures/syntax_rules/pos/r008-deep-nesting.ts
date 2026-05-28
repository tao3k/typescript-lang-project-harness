// Positive fixture: deeply nested control flow — triggers AGENT-TS-R008
export function processData(items: number[]): number[] {
  const result: number[] = [];
  for (const item of items) {
    if (item > 0) {
      for (const sub of [item]) {
        // depth 3
        if (sub > 10) {
          // depth 4
          if (sub % 2 === 0) {
            // depth 5
            if (sub % 3 === 0) {
              // depth 6
              result.push(sub);
            }
          }
        }
      }
    }
  }
  return result;
}
