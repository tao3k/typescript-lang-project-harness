// Fixture: module with exported function — should trigger unit + typecheck + snapshot
export function transform(input: string): string {
  return input.toUpperCase();
}
