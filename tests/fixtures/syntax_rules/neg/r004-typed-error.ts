/** Negative: typed error channel — clean. */
import { Effect } from "effect";

class ParseError {
  readonly _tag = "ParseError";
}
export function parseFile(path: string): Effect.Effect<string, ParseError, never> {
  return Effect.succeed("content");
}
