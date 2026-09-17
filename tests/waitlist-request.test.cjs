const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync("script.js", "utf8");

// script.js has no module seam, so the function under test is sliced out by
// source markers. Assert the markers still resolve: renaming submitWaitlist or
// reformatting the `if (waitlistForm)` below it would otherwise silently run an
// empty or wrong slice, and every test here would pass against nothing.
const start = source.indexOf("async function submitWaitlist(");
assert.notEqual(start, -1, "script.js no longer declares `async function submitWaitlist(`");
const end = source.indexOf("\nif (waitlistForm) {", start);
assert.notEqual(end, -1, "the `if (waitlistForm) {` boundary after submitWaitlist has moved");
const requestFunction = source.slice(start, end);
assert.ok(
  requestFunction.includes("controller.abort()") && requestFunction.includes("failureReason"),
  "extracted slice does not look like submitWaitlist — markers have drifted",
);

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

test("a non-2xx response fails as http_error and clears its timer", async () => {
  const h = harness(async () => ({ ok: false, status: 502, json: async () => ({ ok: true }) }));
  await assert.rejects(
    h.submit("https://example.test/signup", {}),
    (error) => error.failureReason === "http_error" && error.message === "waitlist_http_502",
  );
  assert.equal(h.cleared(), true);
});

// Apps Script can answer 200 with an HTML error page. That is not a saved row,
// so it has to fail rather than redirect the visitor to the welcome page.
test("a 200 whose body is not JSON fails as invalid_server_response", async () => {
  const h = harness(async () => ({
    ok: true,
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON");
    },
  }));
  await assert.rejects(
    h.submit("https://example.test/signup", {}),
    (error) => error.failureReason === "invalid_server_response",
  );
  assert.equal(h.cleared(), true);
});

// If the abort lands while the body is still being read, the visitor must be
// told to retry, not told the server sent garbage. This pins the observable
// contract via the outer catch. Note it does NOT pin the inner
// `if (controller.signal.aborted) throw error;` guard: both branches fall into
// the same outer catch, which converts any abort to a timeout, so that line is
// behaviourally redundant and no test here can distinguish it.
test("an abort during the body read is reported as a timeout, not bad JSON", async () => {
  let abortNow;
  const h = harness(async (url, { signal }) => ({
    ok: true,
    json: async () => {
      abortNow();
      throw new Error("The operation was aborted");
    },
  }));
  abortNow = () => h.advance(45000);
  await assert.rejects(
    h.submit("https://example.test/signup", {}),
    (error) => error.failureReason === "timeout",
  );
  assert.equal(h.cleared(), true);
});

test("a server rejection surfaces the server's own reason", async () => {
  const h = harness(async () => ({
    ok: true,
    json: async () => ({ ok: false, error: "duplicate_submission" }),
  }));
  await assert.rejects(
    h.submit("https://example.test/signup", {}),
    (error) => error.failureReason === "duplicate_submission",
  );
});

test("a rejection with no reason still fails closed", async () => {
  const h = harness(async () => ({ ok: true, json: async () => ({ ok: false }) }));
  await assert.rejects(
    h.submit("https://example.test/signup", {}),
    (error) => error.failureReason === "server_rejected",
  );
});

// The timeout copy is built inside the `if (waitlistForm)` DOM block, which has
// no test seam. Guard the part that can regress invisibly: the typography. The
// rest of the page is entity-encoded, so a straight quote here would be a
// visible inconsistency that no layout check would catch.
test("the timeout message keeps its curly apostrophes and em dash", () => {
  const timeoutCopy =
    "We couldn’t confirm your signup in time. Please try again — we’ll avoid adding it twice.";
  assert.ok(source.includes(timeoutCopy), "timeout copy changed or lost its typographic characters");
  assert.ok(source.includes('"Something went wrong. Please try again."'), "generic failure copy missing");
});
