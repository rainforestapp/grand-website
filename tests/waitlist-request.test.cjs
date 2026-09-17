const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync("script.js", "utf8");
const requestFunction = source.slice(source.indexOf("async function submitWaitlist("), source.indexOf("\nif (waitlistForm) {", source.indexOf("async function submitWaitlist(")));

function harness(fetch) {
  let now = 0;
  let cleared = false;
  let timer;
  const context = {
    AbortController, JSON, Error, String, fetch,
    window: {
      setTimeout(callback, delay) { timer = { callback, at: now + delay }; return 1; },
      clearTimeout() { cleared = true; },
    },
  };
  vm.createContext(context);
  vm.runInContext(requestFunction, context);
  return {
    submit: context.submitWaitlist,
    advance(ms) { now += ms; if (!cleared && now >= timer.at) timer.callback(); },
    cleared: () => cleared,
  };
}

test("a 20-second save waits for confirmation instead of aborting after 10 seconds", async () => {
  let finish;
  let signal;
  const h = harness((url, options) => {
    signal = options.signal;
    return new Promise(resolve => { finish = resolve; });
  });
  const result = h.submit("https://example.test/signup", { submission_id: "same-on-retry" });
  h.advance(20000);
  assert.equal(signal.aborted, false);
  finish({ ok: true, json: async () => ({ ok: true, duplicate: true }) });
  assert.equal((await result).duplicate, true);
  assert.equal(h.cleared(), true);
});

test("a stalled request times out after 45 seconds and clears its timer", async () => {
  const h = harness((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")));
  }));
  const result = h.submit("https://example.test/signup", {});
  h.advance(45000);
  await assert.rejects(result, error => error.failureReason === "timeout");
  assert.equal(h.cleared(), true);
});

test("HTTP success without a saved-row confirmation remains a failure", async () => {
  const h = harness(async () => ({ ok: true, json: async () => ({ ok: false, error: "save_failed" }) }));
  await assert.rejects(h.submit("https://example.test/signup", {}), error => error.failureReason === "save_failed");
  assert.equal(h.cleared(), true);
});
