/** Negative: tag and layer in separate files — clean. */
import { Context } from "effect";

export class CacheService extends Context.Tag("CacheService")<
  CacheService,
  { get: (key: string) => Effect.Effect<string | null> }
>() {}
