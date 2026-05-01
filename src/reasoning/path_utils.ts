import path from "node:path";

import { MODULE_FILE_EXTENSIONS } from "./constants.js";

export function isInsideAny(filePath: string, roots: readonly string[]): boolean {
  return roots.some((root) => {
    const relativePath = path.relative(root, filePath);
    return (
      relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
    );
  });
}

export function commonAncestor(inputPaths: readonly string[]): string {
  const candidatePaths = inputPaths.map((inputPath) => directoryLikePath(path.resolve(inputPath)));
  const firstPath = candidatePaths[0];
  if (firstPath === undefined) {
    return path.resolve(".");
  }
  return candidatePaths.slice(1).reduce((ancestor, candidate) => {
    let currentAncestor = ancestor;
    while (!isInsidePath(candidate, currentAncestor)) {
      const parent = path.dirname(currentAncestor);
      if (parent === currentAncestor) {
        return currentAncestor;
      }
      currentAncestor = parent;
    }
    return currentAncestor;
  }, firstPath);
}

export function samePath(left: string, right: string): boolean {
  return path.resolve(left) === path.resolve(right);
}

function directoryLikePath(inputPath: string): string {
  return MODULE_FILE_EXTENSIONS.some((extension) => inputPath.endsWith(extension))
    ? path.dirname(inputPath)
    : inputPath;
}

function isInsidePath(filePath: string, root: string): boolean {
  const relativePath = path.relative(root, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}
