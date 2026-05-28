// Positive: Effect error channel uses `any` — triggers TS-EFFECT-R004
import { Effect } from "effect";

export function parseFile(path: string): Effect.Effect<string, any, never> {
  return Effect.succeed("content");
}
