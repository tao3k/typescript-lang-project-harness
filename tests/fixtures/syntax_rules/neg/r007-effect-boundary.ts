/** Negative: Effect module exports Effect types — clean. */
import { Effect } from "effect";

export function fetchData(url: string): Effect.Effect<string, Error, never> {
  return Effect.tryPromise(() => fetch(url).then((r) => r.text()));
}
