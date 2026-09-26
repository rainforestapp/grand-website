const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync("script.js", "utf8");

// Same source-slicing seam the other script.js tests use: the file has no
// module boundary, so the phone helpers are lifted out by markers. Assert the
// markers still resolve — renaming either boundary would otherwise run an empty
// slice and every assertion below would pass against nothing.
const start = source.indexOf('const DEFAULT_COUNTRY_CODE = "+1";');
assert.notEqual(start, -1, "script.js no longer declares DEFAULT_COUNTRY_CODE");
const end = source.indexOf("\nfunction getValueLengthBucket(", start);
assert.notEqual(end, -1, "the getValueLengthBucket boundary after the phone helpers has moved");
const helpers = source.slice(start, end);
assert.ok(
  helpers.includes("function isValidWaitlistPhone(") &&
    helpers.includes("function getWaitlistPhoneSubmissionValue("),
  "extracted slice does not look like the phone helpers — markers have drifted",
);

const context = { String, Math, document: {} };
vm.createContext(context);
vm.runInContext(helpers, context);
const {
  formatCountryCode,
  formatPhoneValue,
  getPhoneCountryCode,
  getWaitlistPhoneSubmissionValue,
  isValidWaitlistPhone,
} = context;

// A phone input paired with an editable country box, mimicking the homepage's
// `.field[data-phone-field]` wrapper that getPhoneCountryCode walks up to.
function phoneField(value, countryCode) {
  const input = {
    value,
    closest: (selector) =>
      selector === "[data-phone-field]"
        ? { querySelector: () => (countryCode === null ? null : { value: countryCode }) }
        : null,
  };
  return input;
}

test("country code normalizes to + plus digits", () => {
  assert.equal(formatCountryCode("+44"), "+44");
  assert.equal(formatCountryCode("44"), "+44");
  assert.equal(formatCountryCode("(44)"), "+44");
  assert.equal(formatCountryCode("+1"), "+1");
  assert.equal(formatCountryCode(""), "");
  // Three digits is the E.164 ceiling for a country code.
  assert.equal(formatCountryCode("+3521"), "+352");
});

test("an international dialing prefix is stripped instead of eating the code", () => {
  assert.equal(formatCountryCode("0044"), "+44");
  assert.equal(formatCountryCode("01144"), "+44");
  assert.equal(formatCountryCode("001"), "+1");
  // Mid-typing, a lone "0" has nothing after it to disambiguate — leave it.
  assert.equal(formatCountryCode("0"), "+0");
});

test("a field with no country box still behaves as US +1", () => {
  const input = phoneField("5551234567", null);
  assert.equal(getPhoneCountryCode(input), "+1");
  assert.equal(getWaitlistPhoneSubmissionValue(input), "+1 (555) 123-4567");
  assert.equal(isValidWaitlistPhone(input), true);
});

test("an emptied country box falls back to +1 rather than validating against nothing", () => {
  assert.equal(getPhoneCountryCode(phoneField("5551234567", "")), "+1");
});

test("US numbers keep the (555) 123-4567 grouping and the 10-digit rule", () => {
  assert.equal(formatPhoneValue("5551234567", "+1"), "(555) 123-4567");
  assert.equal(isValidWaitlistPhone(phoneField("(555) 123-456", "+1")), false);
  assert.equal(isValidWaitlistPhone(phoneField("(555) 123-4567", "+1")), true);
});

test("non-US numbers are normalized to bare digits, not forced into US grouping", () => {
  assert.equal(formatPhoneValue("7700 900123", "+44"), "7700900123");
  assert.equal(
    getWaitlistPhoneSubmissionValue(phoneField("7700 900123", "+44")),
    "+44 7700900123",
  );
});

test("non-US validation matches the sheet endpoint's 10-15 total digit rule", () => {
  // 2 + 7 = 9 digits: the backend would reject this, so the field does first.
  assert.equal(isValidWaitlistPhone(phoneField("1234567", "+44")), false);
  // 2 + 10 = 12 digits.
  assert.equal(isValidWaitlistPhone(phoneField("7700900123", "+44")), true);
  // 3 + 12 = 15 digits, the E.164 ceiling.
  assert.equal(isValidWaitlistPhone(phoneField("123456789012", "+352")), true);
});

test("a number longer than E.164 allows is truncated, not silently rejected", () => {
  // 13 typed digits under a 3-digit country code leaves room for 12.
  assert.equal(formatPhoneValue("1234567890123", "+352"), "123456789012");
});
