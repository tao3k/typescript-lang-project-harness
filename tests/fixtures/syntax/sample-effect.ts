import type { Effect } from "effect";

export class CounterService extends Effect.Service<CounterService>()("CounterService", {
  effect: Effect.gen(function* () {
    return {
      getCount: () => Effect.succeed(42),
      increment: (n: number) => Effect.succeed(42 + n),
    };
  }),
}) {}

export const runtimeLayer = Layer.mergeAll(CounterService.Default);

export const main = Effect.gen(function* (): Effect.Effect<void> {
  const counter = yield* CounterService;
  const count = yield* counter.getCount();
  yield* Effect.log(`Count: ${count}`);
});

main.pipe(Effect.provide(runtimeLayer), Effect.runPromise);
