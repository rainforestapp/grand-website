const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

// countries.js assigns onto `window`, so it runs in a vm with a window stub
// rather than through the source-slicing seam the script.js tests need.
const source = fs.readFileSync("countries.js", "utf8");
const context = { window: {}, String, Array, RegExp };
vm.createContext(context);
vm.runInContext(source, context);
// Copied out of the vm realm: a vm-context Array has a different prototype
// than this file's, and assert.deepEqual compares prototypes.
const countries = Array.from(context.window.grandCountries, (country) => ({ ...country }));
const flag = context.window.grandCountryFlag;

test("the list is populated and every record is well formed", () => {
  assert.ok(Array.isArray(countries));
  assert.ok(countries.length > 200, `only ${countries.length} countries parsed`);

  for (const country of countries) {
    assert.match(country.iso, /^[A-Z]{2}$/, `bad ISO code: ${JSON.stringify(country)}`);
    // E.164 caps a country code at 3 digits, and none start with a zero.
    assert.match(country.dial, /^\+[1-9]\d{0,2}$/, `bad dial code: ${JSON.stringify(country)}`);
    assert.ok(country.name && country.name.trim() === country.name, `bad name: ${country.name}`);
  }
});

test("no duplicate countries", () => {
  // A delimited string is easy to append to twice. ISO codes are the identity;
  // dial codes are legitimately shared (+1 covers the US, Canada and much of
  // the Caribbean), so only the ISO codes have to be unique.
  const isoCodes = countries.map((country) => country.iso);
  assert.equal(new Set(isoCodes).size, isoCodes.length);

  const names = countries.map((country) => country.name);
  assert.equal(new Set(names).size, names.length);
});

test("the rendered order is alphabetical regardless of how the source is written", () => {
  const names = countries.map((country) => country.name);
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(names, sorted);
});

test("the countries the default and the tests depend on are present", () => {
  const byIso = Object.fromEntries(countries.map((country) => [country.iso, country]));

  // US is the default selection; the rest appear in the phone-helper tests.
  assert.equal(byIso.US.dial, "+1");
  assert.equal(byIso.US.name, "United States");
  assert.equal(byIso.GB.dial, "+44");
  assert.equal(byIso.IT.dial, "+39");
  assert.equal(byIso.DE.dial, "+49");
  // Shares +1 with the US, which is why analytics carries the ISO code too.
  assert.equal(byIso.CA.dial, "+1");
});

test("flags are derived from the ISO code, not stored", () => {
  // Regional indicator symbols: 'G','B' -> U+1F1EC U+1F1E7. Nothing to ship
  // and nothing to keep in sync with the country list.
  assert.equal(flag("GB"), "\u{1F1EC}\u{1F1E7}");
  assert.equal(flag("US"), "\u{1F1FA}\u{1F1F8}");
  assert.equal(countries.find((c) => c.iso === "FR").flag, "\u{1F1EB}\u{1F1F7}");
});

test("the flag helper does not throw on junk", () => {
  // It runs against selectedOptions[0]?.dataset.country, which is "" when the
  // picker failed to populate.
  assert.equal(flag(""), "");
  assert.equal(flag(null), "");
  assert.equal(flag("usa"), "\u{1F1FA}\u{1F1F8}", "lowercase and over-long input is normalized");
});
