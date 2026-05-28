import type { TsParsedModule } from "../model.js";

/** Get source text from a module (populated by parser). */
export function sourceOf(mod: TsParsedModule): string {
  return mod.sourceText ?? "";
}

/** Read a specific line from the module's cached source text. */
export function lineAt(mod: TsParsedModule, lineNumber: number): string | undefined {
  const src = sourceOf(mod);
  if (src.length === 0) return undefined;
  return src.split("\n")[lineNumber - 1]?.trimEnd();
}
