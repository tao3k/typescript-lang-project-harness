// Positive fixture: no module-level JSDoc — triggers AGENT-TS-R001
import { something } from "./other.js";

export function doThing() {
  return something();
}
