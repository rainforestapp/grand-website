const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync("google-apps-script/waitlist.gs", "utf8");

// waitlist.gs runs against Apps Script globals with no module seam, so the whole
// file is evaluated in a vm with those globals stubbed — the same approach
// tests/waitlist-backend.test.cjs takes.
function makeHarness({ sessions = [], properties = {}, waitlistRows = [], orderRows = [] } = {}) {
  const fetched = [];

  function makeSheet(name, rows, headerRef) {
    return {
      name,
      rows,
      appendRow(row) { rows.push(row.slice()); },
      getName() { return name; },
      getLastColumn() { return headerRef().length; },
      getLastRow() { return rows.length + 1; },
      getMaxColumns() { return 128; },
      getMaxRows() { return 200; },
      setFrozenRows() {},
      insertColumnsAfter() {},
      getRange(row, column, numRows = 1, numColumns = 1) {
        return {
          getValues() {
            if (row === 1) return [headerRef().slice(0, numColumns)];
            const out = [];
            for (let r = 0; r < numRows; r++) {
              const source = rows[row - 2 + r] || [];
              out.push(source.slice(column - 1, column - 1 + numColumns));
            }
            return out;
          },
          setValues() {},
          setValue(value) {
            const target = rows[row - 2] || (rows[row - 2] = []);
            target[column - 1] = value;
          },
          setNumberFormat() {},
        };
      },
    };
  }

  const context = {
    Array, Date, Error, JSON, Math, Number, Object, RegExp, String, encodeURIComponent, console,
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput(text) { return { text, setMimeType() { return this; } }; },
    },
    LockService: { getScriptLock() { return { releaseLock() {}, waitLock() {} }; } },
    Utilities: { sleep() {} },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) { return Object.prototype.hasOwnProperty.call(properties, key) ? properties[key] : null; },
          setProperty(key, value) { properties[key] = value; },
        };
      },
    },
    UrlFetchApp: {
      fetch(url) {
        fetched.push(url);
        return {
          getResponseCode() { return 200; },
          getContentText() { return JSON.stringify({ data: sessions, has_more: false }); },
        };
      },
    },
  };

  vm.createContext(context);
  // Top-level `const`/`function` in a classic script land in the global lexical
  // environment, which is not reachable as properties of the context object.
  // Re-export the handful under test onto the global so the assertions can see
  // them; waitlist-backend.test.cjs solves the same problem by running its
  // assertions inside the vm instead.
  vm.runInContext(
    `${source}\n;this.HEADERS = HEADERS; this.ORDER_HEADERS = ORDER_HEADERS;`
      + ` this.syncStripeOrders = syncStripeOrders; this.seatState_ = seatState_;`,
    context,
  );

  const waitlist = makeSheet("Grand phone number alpha list", waitlistRows, () => context.HEADERS);
  const orders = makeSheet("Grand phone orders", orderRows, () => context.ORDER_HEADERS);

  context.SpreadsheetApp = {
    openById() {
      return {
        getUrl() { return "https://example.test/sheet"; },
        getSheetByName(name) {
          if (name === "Grand phone orders") return orders;
          if (name === "Grand phone number alpha list") return waitlist;
          return null;
        },
        insertSheet(name) { return name === "Grand phone orders" ? orders : waitlist; },
      };
    },
  };

  return { context, waitlist, orders, properties, fetched };
}

const CANDIDATE = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const session = (over = {}) => ({
  id: "cs_test_1",
  payment_intent: "pi_1",
  livemode: false,
  created: 1792000000,
  amount_total: 7900,
  currency: "usd",
  payment_status: "paid",
  client_reference_id: CANDIDATE,
  customer_details: { email: "buyer@example.com", name: "A Buyer", phone: "+15551234567" },
  ...over,
});

// A trigger that quietly does nothing is indistinguishable from one that works.
test("a missing key or payment link throws rather than no-opping", () => {
  const { context } = makeHarness({ properties: {} });
  assert.throws(() => context.syncStripeOrders(), /Script Properties/);
});

test("a completed session is appended to the order sheet", () => {
  const h = makeHarness({
    sessions: [session()],
    properties: { STRIPE_RESTRICTED_KEY: "rk_test", STRIPE_PAYMENT_LINK_ID: "plink_1" },
  });
  const result = h.context.syncStripeOrders();

  assert.equal(result.appended, 1);
  assert.equal(h.orders.rows.length, 1);
  assert.equal(h.orders.rows[0].length, h.context.ORDER_HEADERS.length);

  const idAt = h.context.ORDER_HEADERS.indexOf("stripe_session_id");
  const amountAt = h.context.ORDER_HEADERS.indexOf("amount_total");
  assert.equal(h.orders.rows[0][idAt], "cs_test_1");
  // Stripe reports minor units; the sheet should read as dollars.
  assert.equal(h.orders.rows[0][amountAt], 79);
});

// The poller re-reads the same completed sessions on every run, so this is
// load-bearing rather than defensive.
test("re-running does not duplicate an order", () => {
  const h = makeHarness({
    sessions: [session()],
    properties: { STRIPE_RESTRICTED_KEY: "rk_test", STRIPE_PAYMENT_LINK_ID: "plink_1" },
  });
  h.context.syncStripeOrders();
  const second = h.context.syncStripeOrders();

  assert.equal(second.appended, 0);
  assert.equal(h.orders.rows.length, 1);
});

// The reason this integration exists: a payment has to resolve back to the lead
// row that produced it, or all you have is a list of names.
test("a payment is stamped onto the originating waitlist row", () => {
  const h = makeHarness({
    sessions: [session()],
    properties: { STRIPE_RESTRICTED_KEY: "rk_test", STRIPE_PAYMENT_LINK_ID: "plink_1" },
  });
  const candidateAt = h.context.HEADERS.indexOf("candidate_id");
  const row = new Array(h.context.HEADERS.length).fill("");
  row[candidateAt] = CANDIDATE;
  h.waitlist.rows.push(row);

  h.context.syncStripeOrders();

  const paidAt = h.context.HEADERS.indexOf("paid_at");
  const sessionAt = h.context.HEADERS.indexOf("stripe_session_id");
  assert.match(String(h.waitlist.rows[0][paidAt]), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(h.waitlist.rows[0][sessionAt], "cs_test_1");

  const matchedAt = h.context.ORDER_HEADERS.indexOf("matched_waitlist_row");
  assert.equal(h.orders.rows[0][matchedAt], 2);
});

// An unmatched payment must still be recorded. Losing the join is a reporting
// gap; losing the order is a customer nobody ships to.
test("a payment with no matching lead is still recorded", () => {
  const h = makeHarness({
    sessions: [session({ client_reference_id: "" })],
    properties: { STRIPE_RESTRICTED_KEY: "rk_test", STRIPE_PAYMENT_LINK_ID: "plink_1" },
  });
  h.context.syncStripeOrders();

  assert.equal(h.orders.rows.length, 1);
  const matchedAt = h.context.ORDER_HEADERS.indexOf("matched_waitlist_row");
  assert.equal(h.orders.rows[0][matchedAt], "");
});

// Safety valve for a test key left in place after going live.
test("requiring livemode skips test-mode sessions", () => {
  const h = makeHarness({
    sessions: [session({ livemode: false })],
    properties: {
      STRIPE_RESTRICTED_KEY: "rk_test",
      STRIPE_PAYMENT_LINK_ID: "plink_1",
      STRIPE_REQUIRE_LIVEMODE: "true",
    },
  });
  assert.equal(h.context.syncStripeOrders().appended, 0);
  assert.equal(h.orders.rows.length, 0);
});

test("the sync only queries completed sessions for the configured link", () => {
  const h = makeHarness({
    sessions: [],
    properties: { STRIPE_RESTRICTED_KEY: "rk_test", STRIPE_PAYMENT_LINK_ID: "plink_abc" },
  });
  h.context.syncStripeOrders();

  assert.match(h.fetched[0], /status=complete/);
  assert.match(h.fetched[0], /payment_link=plink_abc/);
});

test("seat state counts sold orders against the total", () => {
  const h = makeHarness({
    sessions: [session(), session({ id: "cs_test_2", client_reference_id: "" })],
    properties: { STRIPE_RESTRICTED_KEY: "rk_test", STRIPE_PAYMENT_LINK_ID: "plink_1" },
  });
  h.context.syncStripeOrders();

  const seats = h.context.seatState_(h.context.SpreadsheetApp.openById());
  assert.equal(seats.total, 10);
  assert.equal(seats.sold, 2);
  assert.equal(seats.remaining, 8);
  assert.equal(seats.open, true);
  assert.match(seats.updated_at, /^\d{4}-\d{2}-\d{2}T/);
});

// The site rejects an undated seat count, so a trigger that has never run reads
// as closed rather than as ten seats available.
test("seat state before the first sync carries no timestamp", () => {
  const h = makeHarness({ properties: {} });
  const seats = h.context.seatState_(h.context.SpreadsheetApp.openById());
  assert.equal(seats.updated_at, "");
});

// A failed Stripe call must not refresh the timestamp, or a dead trigger would
// keep the page open on a frozen count.
test("a Stripe error leaves the last-synced timestamp untouched", () => {
  const h = makeHarness({
    properties: { STRIPE_RESTRICTED_KEY: "rk_test", STRIPE_PAYMENT_LINK_ID: "plink_1" },
  });
  h.context.UrlFetchApp.fetch = () => ({
    getResponseCode() { return 401; },
    getContentText() { return '{"error":{"message":"Invalid API Key"}}'; },
  });

  assert.throws(() => h.context.syncStripeOrders(), /Stripe returned 401/);
  assert.equal(h.properties.STRIPE_LAST_SYNCED_AT, undefined);
});

// ensureHeaders_ can only migrate a live sheet when columns go on the end.
test("the new signup columns are appended last", () => {
  const { context } = makeHarness();
  // Compared element-wise: arrays built inside the vm have that realm's
  // Array prototype, which assert/strict's deepEqual treats as a mismatch.
  const headers = context.HEADERS;
  assert.equal(headers[headers.length - 2], "paid_at");
  assert.equal(headers[headers.length - 1], "stripe_session_id");
});
