#!/usr/bin/env node

import { chmod } from "node:fs/promises";
import { build } from "esbuild";

await build({
  entryPoints: ["src/cli/main.ts"],
  outfile: "dist/src/cli/main.bundle.js",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  external: ["./protocol.js"],
  legalComments: "none",
  sourcemap: false,
});

await chmod("dist/src/cli/main.js", 0o755);
await chmod("dist/src/cli/main.bundle.js", 0o755);
