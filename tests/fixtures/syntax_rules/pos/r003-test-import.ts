// Positive: live layer imports test dependency — triggers TS-EFFECT-R003
import { Effect, Layer } from "effect";
import { mockParser } from "../test/fixtures/mock-parser";

export const ParserServiceLive = Layer.succeed(mockParser);
