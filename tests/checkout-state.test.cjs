const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync("script.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const config = JSON.parse(fs.readFileSync("checkout-config.json", "utf8"));

// Same source-slicing seam the other script.js tests use: script.js runs at
// module scope against a live DOM, so lift the pure decision functions out by
// markers and run them standalone. Asserting the markers resolve means drift
// fails loudly here instead of silently skipping the tests.
function slice(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `script.js no longer contains ${JSON.stringify(startMarker)}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `script.js no longer contains ${JSON.stringify(endMarker)} after it`);
  return source.slice(start, end + endMarker.length);
}

const block = slice("const CHECKOUT_CONFIG_URL", "// ---- checkout state: end");

function evaluate(expression, extraContext = {}) {
  // URL is a host global, not a JS intrinsic, so a fresh vm context does not
  // get one and buildPaymentLinkUrl would silently take its catch branch.
  const context = {
    URL,
    window: { location: { href: "https://www.grandeldercare.com/" } },
    ...extraContext,
  };
  vm.createContext(context);
  // Only the pure helpers are exercised; the DOM-touching functions are
  // declared in the same block but never called.
  vm.runInContext(`${block}\nresult = ${expression};`, context);
  return context.result;
}

const NOW = Date.parse("2026-10-15T12:00:00Z");
const fresh = (over = {}) => ({
  open: true,
  remaining: 7,
  updated_at: "2026-10-15T11:55:00Z",
  ...over,
});

function resolve(seats, cfg = null, now = NOW) {
  return evaluate(
    `resolveCheckoutState(${JSON.stringify(seats)}, ${JSON.stringify(cfg)}, ${now})`,
  );
}

test("a fresh count with seats left opens the sale", () => {
  const state = resolve(fresh());
  assert.equal(state.open, true);
  assert.equal(state.reason, "open");
  assert.equal(state.remaining, 7);
});

// The whole point of the two-section design: every ambiguous answer renders the
// waitlist. Someone shown a form they could have skipped is a small loss; a
// visitor sent to a capped Stripe page gets an unstyled dead end, no capture,
// and we paid for the click.
test("every unusable seats response fails closed", () => {
  for (const [label, seats] of [
    ["missing", null],
    ["not an object", "sold out"],
    ["explicitly closed", fresh({ open: false })],
    ["zero remaining", fresh({ remaining: 0 })],
    ["negative remaining", fresh({ remaining: -1 })],
    ["non-numeric remaining", fresh({ remaining: "lots" })],
    ["no timestamp", { open: true, remaining: 7 }],
    ["unparseable timestamp", fresh({ updated_at: "soon" })],
  ]) {
    assert.equal(resolve(seats).open, false, `${label} should fail closed`);
  }
});

// A silently dead poller is worse than no poller: it pins the page to its last
// good answer and looks healthy doing it.
test("a stale count fails closed, and the boundary is an hour", () => {
  const justInside = resolve(fresh({ updated_at: "2026-10-15T11:01:00Z" }));
  assert.equal(justInside.open, true);

  const justOutside = resolve(fresh({ updated_at: "2026-10-15T10:59:00Z" }));
  assert.equal(justOutside.open, false);
  assert.equal(justOutside.reason, "seats_stale");
});

// The committed config is a hand-operated kill switch, so it has to be able to
// close a sale the seat count still thinks is open.
test("config open:false overrides a healthy seat count", () => {
  const state = resolve(fresh(), { open: false });
  assert.equal(state.open, false);
  assert.equal(state.reason, "config_closed");
});

// ...but only an explicit false. A missing or malformed config must not close
// the sale, or a typo in a JSON file silently takes the page down.
test("a missing or malformed config does not close the sale", () => {
  assert.equal(resolve(fresh(), null).open, true);
  assert.equal(resolve(fresh(), {}).open, true);
  assert.equal(resolve(fresh(), { open: "false" }).open, true);
});

function link(base, candidateId, email) {
  return evaluate(
    `buildPaymentLinkUrl(${JSON.stringify(base)}, ${JSON.stringify(candidateId)}, ${JSON.stringify(email)})`,
  );
}

const CANDIDATE = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

// client_reference_id is the durable join back to the waitlist row. sessionStorage
// survives the trip to Stripe in the same tab, but a new tab or app handoff
// loses it, so the link parameter is the one that actually has to be right.
test("the payment link carries client_reference_id and a prefilled email", () => {
  const url = new URL(link("https://buy.stripe.com/test_abc", CANDIDATE, "a@b.com"));
  assert.equal(url.searchParams.get("client_reference_id"), CANDIDATE);
  assert.equal(url.searchParams.get("prefilled_email"), "a@b.com");
});

// Stripe restricts the field to [A-Za-z0-9_-]. Sending something else gets the
// parameter rejected server-side and the join lost, so drop it here instead.
test("a candidate id Stripe would reject is dropped, not sent", () => {
  for (const bad of ["has space", "semi;colon", "sl/ash", "x".repeat(201)]) {
    const url = new URL(link("https://buy.stripe.com/test_abc", bad, ""));
    assert.equal(url.searchParams.has("client_reference_id"), false, `${bad} should be dropped`);
  }
});

test("an absent or unparseable payment link yields no url", () => {
  assert.equal(link("", CANDIDATE, ""), "");
  assert.equal(link(undefined, CANDIDATE, ""), "");
});

// Guard the markup contract applyCheckoutState depends on. If either section id
// or either hook is renamed, the toggle silently stops working and the homepage
// is stuck on whichever state shipped.
test("index.html carries both CTA sections and the toggle hooks", () => {
  assert.match(index, /<section id="buy"/);
  assert.match(index, /<section id="waitlist"[^>]*\shidden>/);
  assert.match(index, /data-buy-cta/);
  assert.match(index, /data-cta-buy/);
});

// #buy is the markup default on purpose: with no JavaScript the correct state
// during the selling window is "you can buy". Overselling is not the risk,
// because Stripe caps the payment link server-side.
test("#buy is visible by default and #waitlist is hidden", () => {
  assert.doesNotMatch(index, /<section id="buy"[^>]*\shidden/);
});

// Shipping a real payment link in a public repo would let anyone pay outside the
// flow, and the file is the kill switch, so its shape is load-bearing.
test("checkout-config.json has the kill switch and no live link committed", () => {
  assert.equal(typeof config.open, "boolean");
  assert.equal(typeof config.paymentLink, "string");
  assert.doesNotMatch(config.paymentLink, /^https:\/\/buy\.stripe\.com\/(?!test_)/);
});

// The sold-out verdict is replayed from sessionStorage on the next page view to
// kill the ~2.3s window where the nav CTA still says "Buy Grand". Guard both
// halves: that only a closed verdict is ever cached (replaying an unverified
// "open" would show a reserve button we have not confirmed), and that the
// replay prefix is stripped on write, or the reason compounds into
// cached_cached_... on every reload and drags the analytics property with it.
test("only a closed verdict is cached, and the replay prefix is stripped", () => {
  assert.match(source, /sessionStorage\.removeItem\(CHECKOUT_CLOSED_CACHE_KEY\)/);
  assert.match(source, /state\.reason\.replace\(\/\^cached_\/, ""\)/);
  assert.match(source, /applyCheckoutState\(\{ open: false, reason: `cached_\$\{cachedClosed\}` \}/);
});

// The price lives in three places: the #buy copy, the Stripe product, and the
// pixel conversion value. The first two are checked by eye on every change; the
// pixel value is invisible and would silently train ad optimization against a
// stale number. Pin the two that live in this repo to each other.
test("the pixel conversion value matches the price in the buy copy", () => {
  const priceInCopy = index.match(/<b>\$(\d+) reserves yours\.<\/b>/);
  assert.ok(priceInCopy, "index.html no longer states the price in the expected shape");

  const priceInPixel = source.match(/const RESERVATION_PRICE_USD = (\d+);/);
  assert.ok(priceInPixel, "script.js no longer declares RESERVATION_PRICE_USD");

  assert.equal(priceInPixel[1], priceInCopy[1]);
});

// Meta rejects Purchase without value/currency outright, so this is not a
// nice-to-have: without it the conversion is unusable for optimization.
test("the Purchase pixel carries value and currency", () => {
  assert.match(source, /firePixelConversion\(\s*"Purchase",\s*"Purchase",\s*\{[\s\S]*?currency: "USD"/);
});
