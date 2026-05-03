#!/usr/bin/env node

const assert = require("node:assert/strict");
const { runCommand, formatCommand } = require("../daemon/command-runner");

(async () => {
  const valueWithSpaces = "C:\\Users\\seyo\\Premier SEYO\\clip one.wav";
  const result = await runCommand(
    process.execPath,
    ["-e", "process.stdout.write(process.argv[1])", valueWithSpaces],
    { timeoutMs: 5000 }
  );

  assert.equal(result.ok, true, result.stderr);
  assert.equal(result.stdout, valueWithSpaces);
  assert.equal(formatCommand("ffmpeg", ["-i", valueWithSpaces]), `ffmpeg -i "${valueWithSpaces}"`);
  console.log("command-runner tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
