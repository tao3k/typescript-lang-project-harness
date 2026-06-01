import { spawnSync } from "node:child_process";

import { runCli } from "../../src/cli/main.js";

export function runCliCapture(
  argv: readonly string[],
  cwd: string,
  stdin = "",
): {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
} {
  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    argv,
    {
      stdout: { write: (chunk: string) => void (stdout += chunk) },
      stderr: { write: (chunk: string) => void (stderr += chunk) },
      stdin,
    },
    cwd,
  );
  return { exitCode, stdout, stderr };
}

export function hasCommand(command: string): boolean {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim() !== "";
}
