/**
 * Stable fingerprint helpers for cache atoms.
 *
 * This module turns ordered parser and prompt cache inputs into deterministic
 * digests so cache reuse decisions remain explicit.
 */
import crypto from "node:crypto";

/** Compute a stable content hash for a PrefixAtom. */
export function atomFingerprint(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/** Combine multiple fingerprints into a single group fingerprint. */
export function groupFingerprint(fingerprints: readonly string[]): string {
  const combined = [...fingerprints].sort().join(":");
  return atomFingerprint(combined);
}

/** Detect if a fingerprint changed from a previous value. */
export function fingerprintChanged(prev: string | undefined, current: string): boolean {
  return prev === undefined || prev !== current;
}
