/**
 * Parser-owned project facade for graph-turbo semantic facts.
 */
import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

import { parseDiagnosticsForSourceFile } from "./diagnostics.js";
import { discoverTypeScriptFiles, isTypeScriptSourcePath } from "./files.js";
import {
  collectSemanticGraphFieldFacts,
  type TypeScriptSemanticGraphFieldFact,
} from "./native_syntax/semantic_graph_facts.js";

export interface LocatedTypeScriptSemanticGraphFieldFact extends TypeScriptSemanticGraphFieldFact {
  readonly path: string;
}

export function collectLocatedSemanticGraphFieldFacts(
  projectRootInput: string,
  stdin: string,
): LocatedTypeScriptSemanticGraphFieldFact[] {
  const projectRoot = path.resolve(projectRootInput);
  const facts: LocatedTypeScriptSemanticGraphFieldFact[] = [];
  for (const filePath of candidateFiles(projectRoot, stdin)) {
    try {
      facts.push(...factsForFile(projectRoot, filePath));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `semantic graph facts failed for ${displayRelativePath(projectRoot, filePath)}: ${reason}`,
      );
    }
  }
  return facts;
}

function factsForFile(
  projectRoot: string,
  filePath: string,
): LocatedTypeScriptSemanticGraphFieldFact[] {
  const sourceText = fs.readFileSync(filePath, "utf8");
  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      scriptKindForPath(filePath),
    );
  } catch {
    // Conformance fixtures may intentionally be unparsable and cannot yield exact facts.
    return [];
  }
  if (parseDiagnosticsForSourceFile(sourceFile).length > 0) return [];
  const relativePath = displayRelativePath(projectRoot, filePath);
  return collectSemanticGraphFieldFacts(sourceFile).map((fact) => ({
    ...fact,
    path: relativePath,
  }));
}

function candidateFiles(projectRoot: string, stdin: string): string[] {
  const candidates = candidatePathsFromStdin(stdin)
    .map((candidatePath) =>
      path.isAbsolute(candidatePath) ? candidatePath : path.join(projectRoot, candidatePath),
    )
    .filter(
      (candidatePath) => fs.existsSync(candidatePath) && isTypeScriptSourcePath(candidatePath),
    );
  const roots = candidates.length > 0 ? candidates : discoverTypeScriptFiles([projectRoot]);
  return [...new Set(roots.map((filePath) => path.resolve(filePath)))].sort();
}

function candidatePathsFromStdin(stdin: string): string[] {
  return stdin
    .split(/\r?\n/u)
    .map((line) => /^(.+?):\d+(?::\d+)?:/u.exec(line.trim())?.[1])
    .filter((candidatePath): candidatePath is string => candidatePath !== undefined);
}

function scriptKindForPath(filePath: string): ts.ScriptKind {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (lowerPath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  return ts.ScriptKind.TS;
}

function displayRelativePath(root: string, filePath: string): string {
  const relativePath = path.relative(root, filePath).replaceAll("\\", "/");
  return relativePath.length === 0 ? "." : relativePath;
}
