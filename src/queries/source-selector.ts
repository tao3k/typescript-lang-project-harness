export interface SourceLineRange {
  readonly lineStart: number;
  readonly lineEnd: number;
}

export function ownerPathFromQuerySelector(selector: string | undefined): string | undefined {
  if (selector === undefined) return undefined;
  if (querySelectorHasGlob(selector)) return undefined;
  const normalized = selector.replace(/\\/gu, "/").replace(/^owner:/u, "");
  return normalized.replace(/:\d+(?::|-)\d+$/u, "");
}

export function selectorHasLineRange(
  selector: string | undefined,
  ownerPath: string | undefined,
): boolean {
  if (selector === undefined || ownerPath === undefined) return false;
  return sourceSelectorLineRange(selector, ownerPath) !== undefined;
}

export function sourceSelectorLineRange(
  selector: string,
  ownerPath: string,
): SourceLineRange | undefined {
  const normalized = selector.replace(/\\/gu, "/").replace(/^owner:/u, "");
  const match = /:(\d+)(?::|-)(\d+)$/u.exec(normalized);
  if (match === null) return undefined;
  const selectedOwnerPath = normalized.slice(0, match.index);
  if (selectedOwnerPath !== ownerPath) return undefined;
  const lineStart = Number.parseInt(match[1]!, 10);
  const lineEnd = Number.parseInt(match[2]!, 10);
  if (!Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) return undefined;
  return {
    lineStart: Math.min(lineStart, lineEnd),
    lineEnd: Math.max(lineStart, lineEnd),
  };
}

export function querySelectorHasGlob(selector: string): boolean {
  return /[*?[{}\]]/u.test(selector);
}
