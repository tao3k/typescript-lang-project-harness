import path from "node:path";

export function relativePath(from: string, to: string): string {
  return path.relative(from, to).replaceAll("\\", "/") || ".";
}

export function slashPath(value: string): string {
  return value.replaceAll("\\", "/");
}
