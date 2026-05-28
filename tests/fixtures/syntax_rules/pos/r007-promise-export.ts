// Positive: Effect module exports Promise — triggers TS-EFFECT-R007
import { Effect } from "effect";

export async function fetchData(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}
