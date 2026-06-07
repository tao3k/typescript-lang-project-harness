import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function runCliCapture(
  argv: readonly string[],
  cwd: string,
  stdin = "",
): {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
} {
  const cliPath = fileURLToPath(new URL("../../src/cli/main.js", import.meta.url));
  const result = spawnSync(process.execPath, [cliPath, ...argv], {
    cwd,
    encoding: "utf8",
    input: stdin,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout,
    stderr:
      result.stderr === "" && result.error !== undefined ? String(result.error) : result.stderr,
  };
}

export function hasCommand(command: string): boolean {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim() !== "";
}
