// Positive fixture: src/index.ts with own exports — triggers TS-PROJ-R003
export function doSomething(): string {
  return "done";
}
export const VERSION = "1.0";
