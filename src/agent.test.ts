import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { SCENARIOS, validateConfig, hostAllows } from "./modes.js";
import { prepareWorkspace } from "./workspace.js";
import { requestReview, resolveReview } from "./review.js";
test("mode and prediction input is bounded; omitted stays omitted", () => {
  assert.throws(() => validateConfig({ mode: "custom" }));
  assert.equal(SCENARIOS.omitted.permissionMode, undefined);
  assert.equal(
    validateConfig({ mode: "auto", prediction: "observe" }).prediction,
    "observe",
  );
});
test("host guard allows only the fixed read and output content", () => {
  const cwd = resolve("classroom");
  assert.equal(
    hostAllows(cwd, "Write", {
      file_path: resolve(cwd, "result.txt"),
      content: "MODE-29\n",
    }),
    true,
  );
  assert.equal(
    hostAllows(cwd, "Write", {
      file_path: resolve(cwd, "../escape.txt"),
      content: "MODE-29\n",
    }),
    false,
  );
  assert.equal(hostAllows(cwd, "Bash", { command: "echo unsafe" }), false);
});
test("review IDs are single-use and cancellation clears pending decisions", async () => {
  const a = new AbortController();
  let id = "";
  const p = requestReview(
    "Plan",
    (e) => {
      if (e.type === "review-required") id = e.id;
    },
    a.signal,
  );
  assert.equal(resolveReview(id, true), true);
  assert.equal(await p, true);
  assert.equal(resolveReview(id, true), false);
  const b = new AbortController();
  const cancelled = requestReview("Plan", () => {}, b.signal);
  b.abort();
  await assert.rejects(cancelled);
});
test("workspace starts with immutable fixture and no output", async () => {
  const w = await prepareWorkspace();
  try {
    assert.deepEqual(await w.inspect(), {
      fileCreated: false,
      fileContents: null,
      fixtureUnchanged: true,
    });
  } finally {
    await w.cleanup();
  }
});
