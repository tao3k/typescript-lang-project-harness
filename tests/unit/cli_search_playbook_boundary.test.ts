import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../../src/cli/main.js";
import { typeScriptSemanticLanguageRegistration } from "../../src/cli/semantic-language.js";

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    streams: {
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) },
    },
    stdout,
    stderr,
  };
}

test("provider registry exposes no search orchestration method", () => {
  const registration = typeScriptSemanticLanguageRegistration();
  assert.deepEqual(
    registration.methods.filter((method) => method.startsWith("search/")),
    [],
  );
  const searchDescriptors = registration.methodDescriptors.filter((descriptor) =>
    descriptor.method.startsWith("search/"),
  );
  assert.deepEqual(searchDescriptors, []);
});

for (const operation of ["prime", "owner", "lexical", "ingest", "pipe", "playbook"]) {
  test(`provider-local search ${operation} is hard cut`, async () => {
    const output = capture();
    const exitCode = await runCli(["search", operation, "fixture"], output.streams, "/workspace");

    assert.equal(exitCode, 2);
    assert.equal(output.stdout.join(""), "");
    assert.equal(
      output.stderr.join(""),
      "provider-local search was removed; use asp typescript search playbook <query>\n",
    );
  });
}
