// Negative fixture: has module-level JSDoc — does NOT trigger AGENT-TS-R001

/**
 * This module handles the core processing pipeline.
 * It exports a single entrypoint function.
 */

export function processInput(data: string): string {
  return data.trim();
}
