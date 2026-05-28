// Positive: Effect service reads process.env — triggers TS-EFFECT-R002
import { Effect, Layer, pipe } from "effect";

export const ConfigLayer = Layer.effect(
  Effect.gen(function* () {
    const cacheDir = process.env.CACHE_DIR ?? "/tmp/cache";
    return { cacheDir };
  }),
);
