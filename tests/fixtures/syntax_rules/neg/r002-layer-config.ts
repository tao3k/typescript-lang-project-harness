/** Negative: config comes from layer parameter — clean. */
import { Effect, Layer } from "effect";

export const ConfigLayer = Layer.succeed({ cacheDir: "/var/cache" });
