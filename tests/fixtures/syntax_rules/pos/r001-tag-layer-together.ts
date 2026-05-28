// Positive: tag + layer in same file — triggers TS-EFFECT-R001
import { Context, Layer, Effect } from "effect";

export class ParserService extends Context.Tag("ParserService")<
  ParserService,
  { parse: (raw: string) => Effect.Effect<string> }
>() {}

export const ParserServiceLive = Layer.effect(
  ParserService,
  Effect.gen(function* () {
    return { parse: (raw: string) => Effect.succeed(raw.trim()) };
  }),
);
