/**
 * Parser-owned package/build/test facts for semantic graph packets.
 */
import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

import { discoverTypeScriptFiles } from "./files.js";

const DEPENDENCY_LIMIT = 64;
const TEST_LIMIT = 64;

export interface TypeScriptSemanticGraphProjectFact {
  readonly packageName: string;
  readonly manifestPath: string;
  readonly dependencies: readonly TypeScriptSemanticGraphDependencyFact[];
  readonly tests: readonly TypeScriptSemanticGraphTestFact[];
}

export interface TypeScriptSemanticGraphDependencyFact {
  readonly dependencyName: string;
  readonly packageName: string;
  readonly dependencyKind: "normal" | "dev" | "peer" | "optional";
  readonly versionReq: string;
  readonly manifestPath: string;
}

export interface TypeScriptSemanticGraphTestFact {
  readonly path: string;
  readonly name: string;
  readonly functionCount: number;
}

export function collectTypeScriptSemanticGraphProjectFact(
  projectRootInput: string,
): TypeScriptSemanticGraphProjectFact | undefined {
  const projectRoot = path.resolve(projectRootInput);
  const manifestPath = path.join(projectRoot, "package.json");
  const manifest = readPackageJson(manifestPath);
  if (manifest === undefined || typeof manifest.name !== "string" || manifest.name === "") {
    return undefined;
  }
  const displayManifestPath = displayRelativePath(projectRoot, manifestPath);
  return {
    packageName: manifest.name,
    manifestPath: displayManifestPath,
    dependencies: dependencyFacts(manifest, displayManifestPath),
    tests: testFacts(projectRoot),
  };
}

interface PackageJsonShape {
  readonly name?: unknown;
  readonly dependencies?: unknown;
  readonly devDependencies?: unknown;
  readonly peerDependencies?: unknown;
  readonly optionalDependencies?: unknown;
}

function readPackageJson(manifestPath: string): PackageJsonShape | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as PackageJsonShape) : undefined;
  } catch {
    return undefined;
  }
}

function dependencyFacts(
  manifest: PackageJsonShape,
  manifestPath: string,
): readonly TypeScriptSemanticGraphDependencyFact[] {
  const facts = [
    ...dependencyTableFacts(manifest.dependencies, "normal", manifestPath),
    ...dependencyTableFacts(manifest.devDependencies, "dev", manifestPath),
    ...dependencyTableFacts(manifest.peerDependencies, "peer", manifestPath),
    ...dependencyTableFacts(manifest.optionalDependencies, "optional", manifestPath),
  ];
  return facts
    .sort((left, right) =>
      `${left.dependencyKind}:${left.packageName}`.localeCompare(
        `${right.dependencyKind}:${right.packageName}`,
      ),
    )
    .slice(0, DEPENDENCY_LIMIT);
}

function dependencyTableFacts(
  table: unknown,
  dependencyKind: TypeScriptSemanticGraphDependencyFact["dependencyKind"],
  manifestPath: string,
): readonly TypeScriptSemanticGraphDependencyFact[] {
  if (typeof table !== "object" || table === null) return [];
  return Object.entries(table)
    .filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string",
    )
    .map(([dependencyName, versionReq]) => ({
      dependencyName,
      packageName: dependencyName,
      dependencyKind,
      versionReq,
      manifestPath,
    }));
}

function testFacts(projectRoot: string): readonly TypeScriptSemanticGraphTestFact[] {
  const testsDir = path.join(projectRoot, "tests");
  if (!fs.existsSync(testsDir)) return [];
  return discoverTypeScriptFiles([testsDir])
    .map((filePath) => testFact(projectRoot, filePath))
    .slice(0, TEST_LIMIT);
}

function testFact(projectRoot: string, filePath: string): TypeScriptSemanticGraphTestFact {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const displayPath = displayRelativePath(projectRoot, filePath);
  return {
    path: displayPath,
    name: path.basename(displayPath, path.extname(displayPath)),
    functionCount: testFunctionCount(sourceFile),
  };
}

function testFunctionCount(sourceFile: ts.SourceFile): number {
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text.startsWith("test")) {
      count += 1;
    }
    if (ts.isCallExpression(node) && testCallName(node.expression) !== undefined) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return count;
}

function testCallName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression) && (expression.text === "test" || expression.text === "it")) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const name = expression.name.text;
    return name === "test" || name === "it" ? name : undefined;
  }
  return undefined;
}

function displayRelativePath(root: string, filePath: string): string {
  const relativePath = path.relative(root, filePath).replaceAll("\\", "/");
  return relativePath.length === 0 ? "." : relativePath;
}
