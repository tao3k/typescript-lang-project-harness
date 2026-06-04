/**
 * Parser-owned TypeScript AST patch dry-run support for semantic repair packets.
 *
 * Callers pass an already parsed packet; this layer only resolves TypeScript AST
 * targets and constructs a non-mutating receipt for command-layer rendering.
 */
import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

const PACKET_SCHEMA_ID = "agent.semantic-protocols.semantic-ast-patch";
const RECEIPT_SCHEMA_ID = "agent.semantic-protocols.semantic-ast-patch-receipt";
const AST_PATCH_PROTOCOL_ID = "agent.semantic-protocols.ast-patch";
const SUPPORTED_OPERATIONS = [
  "remove_statement",
  "replace_item",
  "insert_after_statement",
] as const;

type SupportedOperation = (typeof SUPPORTED_OPERATIONS)[number];

interface SemanticAstPatchPacket {
  readonly schemaId?: string;
  readonly schemaVersion?: string;
  readonly protocolId?: string;
  readonly protocolVersion?: string;
  readonly languageId?: string;
  readonly target?: {
    readonly ownerPath?: string;
    readonly locator?: string;
    readonly read?: string;
  };
  readonly operation?: {
    readonly op?: string;
    readonly expectedSnippet?: string;
    readonly snippet?: string;
    readonly mechanicalKind?: string;
    readonly maxEdits?: number;
    readonly allowLargeMechanicalEdit?: boolean;
  };
}

interface SemanticAstPatchReceipt {
  readonly schemaId: typeof RECEIPT_SCHEMA_ID;
  readonly schemaVersion: "1";
  readonly protocolId: typeof AST_PATCH_PROTOCOL_ID;
  readonly protocolVersion: "1";
  readonly status: "verified" | "failed";
  readonly mode: "dry-run";
  readonly capability: "provider-ast-dry-run";
  readonly mutationAvailable: false;
  readonly languageId?: string;
  readonly target: {
    readonly ownerPath?: string | null;
    readonly locator?: string | null;
    readonly read?: string | null;
  };
  readonly operation: string | null;
  readonly supportedOperations: readonly SupportedOperation[];
  readonly mechanicalEditPlan: MechanicalEditPlan | null;
  readonly verification: readonly string[];
  readonly failureKind: "invalid-packet" | "unsupported-operation" | null;
  readonly failures: readonly string[];
  readonly fields?: {
    readonly diff?: string;
  };
  readonly next: string;
}

interface MechanicalEditPlan {
  readonly kind: "provider-dry-run";
  readonly operation: SupportedOperation;
  readonly targetRead: string;
  readonly estimatedEdits: number;
  readonly maxEdits: number;
  readonly safeForLargeChange: boolean;
  readonly mutationAvailable: false;
  readonly requiresCodexApplyPatch: true;
  readonly changedRanges: readonly string[];
  readonly notes: readonly string[];
}

interface SourceLocator {
  readonly path: string;
  readonly lineStart: number;
  readonly lineEnd: number;
}

interface MatchedNode {
  readonly node: ts.Node;
  readonly read: string;
  readonly text: string;
}

export function invalidTypeScriptAstPatchPacketReceipt(error: unknown): SemanticAstPatchReceipt {
  return failedReceipt({}, null, ["invalid ast patch packet JSON", errorMessage(error)]);
}

export function typeScriptAstPatchDryRunReceiptFromPacket(
  projectRoot: string,
  packetValue: unknown,
): SemanticAstPatchReceipt {
  return astPatchDryRunReceiptFromPacket(projectRoot, packetValue as SemanticAstPatchPacket);
}

function astPatchDryRunReceiptFromPacket(
  projectRoot: string,
  packet: SemanticAstPatchPacket,
): SemanticAstPatchReceipt {
  const failures = basePacketFailures(packet);
  const target = packet.target ?? {};
  const operation = packet.operation ?? {};
  const op = operation.op ?? null;
  if (op !== null && !isSupportedOperation(op)) {
    failures.push(`unsupported operation ${op}`);
  }
  if (op !== null && isSupportedOperation(op) && typeof operation.expectedSnippet !== "string") {
    failures.push("operation.expectedSnippet is required for " + op);
  }
  if (
    (op === "replace_item" || op === "insert_after_statement") &&
    typeof operation.snippet !== "string"
  ) {
    failures.push("operation.snippet is required for " + op);
  }
  if (operation.allowLargeMechanicalEdit === true) {
    if (operation.maxEdits === undefined || operation.maxEdits < 2) {
      failures.push("operation.maxEdits must be at least 2 for large mechanical edits");
    }
    if (typeof operation.mechanicalKind !== "string") {
      failures.push("operation.mechanicalKind is required for large mechanical edits");
    }
  }
  const targetLocator =
    typeof target.read === "string" ? parseSourceLocator(target.read) : undefined;
  if (target.read !== undefined && targetLocator === undefined) {
    failures.push("target.read must use path:start:end source locator");
  }
  if (
    failures.length > 0 ||
    targetLocator === undefined ||
    op === null ||
    !isSupportedOperation(op)
  ) {
    return failedReceipt(
      packet,
      op,
      failures,
      op !== null && !isSupportedOperation(op) ? "unsupported-operation" : "invalid-packet",
    );
  }

  const absoluteOwnerPath = path.resolve(projectRoot, target.ownerPath ?? targetLocator.path);
  let sourceText: string;
  try {
    sourceText = fs.readFileSync(absoluteOwnerPath, "utf8");
  } catch (error) {
    return failedReceipt(packet, op, [
      `failed to read ${target.ownerPath ?? targetLocator.path}: ${errorMessage(error)}`,
    ]);
  }
  const sourceFile = ts.createSourceFile(
    absoluteOwnerPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForPath(absoluteOwnerPath),
  );
  const matchedNodes = matchingAstPatchTargetNodes(
    sourceFile,
    targetLocator,
    operation.expectedSnippet ?? "",
    op,
  );
  if (matchedNodes.length === 0) {
    return failedReceipt(packet, op, [
      "no " + op + " target matched operation.expectedSnippet inside target.read",
    ]);
  }
  const maxEdits = operation.maxEdits ?? 1;
  if (matchedNodes.length > maxEdits) {
    return failedReceipt(packet, op, [
      `matched ${matchedNodes.length} nodes but operation.maxEdits is ${maxEdits}`,
    ]);
  }

  const changedRanges = matchedNodes.map((match) => match.read);
  const safeForLargeChange = operation.allowLargeMechanicalEdit === true && matchedNodes.length > 1;
  return {
    schemaId: RECEIPT_SCHEMA_ID,
    schemaVersion: "1",
    protocolId: AST_PATCH_PROTOCOL_ID,
    protocolVersion: "1",
    status: "verified",
    mode: "dry-run",
    capability: "provider-ast-dry-run",
    mutationAvailable: false,
    ...(packet.languageId !== undefined ? { languageId: packet.languageId } : {}),
    target: receiptTarget(packet),
    operation: op,
    supportedOperations: SUPPORTED_OPERATIONS,
    mechanicalEditPlan: {
      kind: "provider-dry-run",
      operation: op,
      targetRead: target.read ?? targetLocatorToString(targetLocator),
      estimatedEdits: matchedNodes.length,
      maxEdits,
      safeForLargeChange,
      mutationAvailable: false,
      requiresCodexApplyPatch: true,
      changedRanges,
      notes: [
        safeForLargeChange
          ? "TypeScript AST dry-run resolved bounded " + op + " targets without mutating files"
          : "TypeScript AST dry-run resolved one " + op + " target without mutating files",
      ],
    },
    verification: [
      "packet-parsed",
      "schema-id-valid",
      "protocol-id-valid",
      "target-read-valid",
      "operation-supported",
      "source-parsed",
      "target-nodes-resolved",
      "mutation-disabled",
    ],
    failureKind: null,
    failures: [],
    fields: {
      diff: dryRunDiff(matchedNodes, op, operation.snippet),
    },
    next: "Review changedRanges, then use Codex apply_patch or a future trusted provider apply backend.",
  };
}

function basePacketFailures(packet: SemanticAstPatchPacket): string[] {
  const failures: string[] = [];
  if (packet.schemaId !== PACKET_SCHEMA_ID) {
    failures.push(`schemaId must be ${PACKET_SCHEMA_ID}`);
  }
  if (packet.schemaVersion !== "1") {
    failures.push("schemaVersion must be 1");
  }
  if (packet.protocolId !== AST_PATCH_PROTOCOL_ID) {
    failures.push(`protocolId must be ${AST_PATCH_PROTOCOL_ID}`);
  }
  if (packet.protocolVersion !== "1") {
    failures.push("protocolVersion must be 1");
  }
  if (typeof packet.target?.ownerPath !== "string") {
    failures.push("target.ownerPath is required");
  }
  if (typeof packet.target?.locator !== "string") {
    failures.push("target.locator is required");
  }
  if (typeof packet.target?.read !== "string") {
    failures.push("target.read is required");
  }
  if (typeof packet.operation?.op !== "string") {
    failures.push("operation.op is required");
  }
  return failures;
}

function failedReceipt(
  packet: Partial<SemanticAstPatchPacket>,
  operation: string | null,
  failures: readonly string[],
  failureKind: "invalid-packet" | "unsupported-operation" = "invalid-packet",
): SemanticAstPatchReceipt {
  return {
    schemaId: RECEIPT_SCHEMA_ID,
    schemaVersion: "1",
    protocolId: AST_PATCH_PROTOCOL_ID,
    protocolVersion: "1",
    status: "failed",
    mode: "dry-run",
    capability: "provider-ast-dry-run",
    mutationAvailable: false,
    ...(packet.languageId !== undefined ? { languageId: packet.languageId } : {}),
    target: receiptTarget(packet),
    operation: operation !== null && isSupportedOperation(operation) ? operation : null,
    supportedOperations: SUPPORTED_OPERATIONS,
    mechanicalEditPlan: null,
    verification: ["packet-parsed", "mutation-disabled"],
    failureKind,
    failures,
    next: "Revise the semantic-ast-patch packet from parser-owned query evidence.",
  };
}

function receiptTarget(packet: Partial<SemanticAstPatchPacket>): SemanticAstPatchReceipt["target"] {
  return {
    ownerPath: packet.target?.ownerPath ?? null,
    locator: packet.target?.locator ?? null,
    read: packet.target?.read ?? null,
  };
}

function matchingAstPatchTargetNodes(
  sourceFile: ts.SourceFile,
  target: SourceLocator,
  expectedSnippet: string,
  operation: SupportedOperation,
): readonly MatchedNode[] {
  const matches: MatchedNode[] = [];
  const expected = expectedSnippet.trim();
  visit(sourceFile);
  return matches;

  function visit(node: ts.Node): void {
    if (matchesAstPatchOperationNode(node, operation)) {
      const range = nodeRange(sourceFile, node);
      if (
        range.lineStart >= target.lineStart &&
        range.lineEnd <= target.lineEnd &&
        node.getText(sourceFile).trim() === expected
      ) {
        matches.push({
          node,
          read: `${target.path}:${range.lineStart}:${range.lineEnd}`,
          text: node.getText(sourceFile),
        });
      }
    }
    ts.forEachChild(node, visit);
  }
}

function matchesAstPatchOperationNode(node: ts.Node, operation: SupportedOperation): boolean {
  switch (operation) {
    case "remove_statement":
    case "insert_after_statement":
      return ts.isStatement(node) && !ts.isBlock(node);
    case "replace_item":
      return isReplaceableItemNode(node);
  }
}

function isReplaceableItemNode(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isModuleDeclaration(node) ||
    ts.isVariableStatement(node) ||
    ts.isImportDeclaration(node) ||
    ts.isExportDeclaration(node) ||
    ts.isExportAssignment(node)
  );
}

function nodeRange(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): { readonly lineStart: number; readonly lineEnd: number } {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return { lineStart: start.line + 1, lineEnd: end.line + 1 };
}

function parseSourceLocator(value: string): SourceLocator | undefined {
  const endSeparator = value.lastIndexOf(":");
  if (endSeparator < 0) return undefined;
  const startSeparator = value.lastIndexOf(":", endSeparator - 1);
  if (startSeparator < 0) return undefined;
  const lineStart = Number.parseInt(value.slice(startSeparator + 1, endSeparator), 10);
  const lineEnd = Number.parseInt(value.slice(endSeparator + 1), 10);
  const locatorPath = value.slice(0, startSeparator);
  if (locatorPath.length === 0 || !Number.isInteger(lineStart) || !Number.isInteger(lineEnd)) {
    return undefined;
  }
  if (lineStart < 1 || lineEnd < lineStart) return undefined;
  return { path: locatorPath, lineStart, lineEnd };
}

function targetLocatorToString(locator: SourceLocator): string {
  return `${locator.path}:${locator.lineStart}:${locator.lineEnd}`;
}

function isSupportedOperation(value: string): value is SupportedOperation {
  return SUPPORTED_OPERATIONS.includes(value as SupportedOperation);
}

function dryRunDiff(
  matches: readonly MatchedNode[],
  operation: SupportedOperation,
  snippet?: string,
): string {
  const replacement = snippet?.trim() ?? "";
  return matches
    .map((match) => {
      const current = match.text.trim();
      switch (operation) {
        case "remove_statement":
          return "-" + current;
        case "replace_item":
          return "-" + current + "\n+" + replacement;
        case "insert_after_statement":
          return " " + current + "\n+" + replacement;
      }
    })
    .join("\n");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function scriptKindForPath(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".mts")) return ts.ScriptKind.TS;
  if (filePath.endsWith(".cts")) return ts.ScriptKind.TS;
  if (filePath.endsWith(".ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}
