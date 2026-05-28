/** Negative: live layer imports only production deps — clean. */
import { Effect, Layer } from "effect";
import { realParser } from "../parser/real-parser";

export const ParserServiceLive = Layer.succeed(realParser);
