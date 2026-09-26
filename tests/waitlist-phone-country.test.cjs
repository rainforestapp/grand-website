const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync("script.js", "utf8");
const indexHtml = fs.readFileSync("index.html", "utf8");
const welcomeHtml = fs.readFileSync("welcome.html", "utf8");

// Same source-slicing seam as tests/waitlist-phone.test.cjs, but extended past
// getValueLengthBucket so the analytics payload builder is in scope too. The
// markers are asserted for the same reason they are there: a rename would
// otherwise run an empty slice and every assertion below would pass against
// nothing.
const start = source.indexOf('const DEFAULT_COUNTRY_CODE = "+1";');
assert.notEqual(start, -1, "script.js no longer declares DEFAULT_COUNTRY_CODE");
const end = source.indexOf("\nasync function getUserAgentData(", start);
assert.notEqual(end, -1, "the getUserAgentData boundary after getWaitlistFieldState has moved");
const helpers = source.slice(start, end);
assert.ok(
  helpers.includes("function formatPhoneInput(") &&
    helpers.includes("function getWaitlistFieldState("),
  "extracted slice does not look like the phone helpers — markers have drifted",
);

const context = { String, Math, Object, document: {} };
vm.createContext(context);
vm.runInContext(helpers, context);
const {
  formatCountryCode,
  formatPhoneInput,
  formatPhoneValue,
  getCaretPositionForPhoneDigitCount,
  getNationalPhoneDigits,
  getNormalizedPhoneDigitCountBeforeCursor,
  getPhoneCountryCode,
  getPhoneInputDigits,
  getUsPhoneDigits,
  getWaitlistFieldState,
  getWaitlistPhoneSubmissionValue,
  isUsCountryCode,
  isValidWaitlistPhone,
} = context;

// A number input inside the homepage's `.field[data-phone-field]` wrapper, which
// is what getPhoneCountryCode walks up to. Pass `countryCode: null` for the
// welcome.html shape, which has no wrapper and no country box at all.
function phoneField(value, countryCode, options = {}) {
  const countryInput = countryCode === null ? null : { value: countryCode };
  const selections = [];
  const input = {
    value,
    selectionStart: options.selectionStart,
    setSelectionRange(startPosition, endPosition) {
      selections.push([startPosition, endPosition]);
    },
    closest: (selector) =>
      selector === "[data-phone-field]"
        ? { querySelector: () => countryInput }
        : null,
    selections,
    countryInput,
  };
  if (options.omitSetSelectionRange) delete input.setSelectionRange;
  if (options.focused) context.document.activeElement = input;
  else context.document.activeElement = null;
  return input;
}

// --- pre-existing US behavior, now routed through the country-aware path -----

// getUsPhoneDigits used to be called directly by every caller. It is now only
// reachable via getNationalPhoneDigits' `isUsCountryCode` branch, so the
// "visitor typed the leading 1 themselves" fix is one wrong conditional away
// from disappearing for the +1 majority.
test("the typed-leading-1 fix still applies on the country-aware path", () => {
  assert.equal(getUsPhoneDigits("15551234567"), "5551234567");
  assert.equal(getNationalPhoneDigits("15551234567", "+1"), "5551234567");
  assert.equal(formatPhoneValue("+1 (555) 123-4567", "+1"), "(555) 123-4567");
  // A leading 1 that is part of a 10-digit number is NOT a country code.
  assert.equal(getNationalPhoneDigits("1555123456", "+1"), "1555123456");
});

test("partial US numbers keep their progressive grouping while typing", () => {
  assert.equal(formatPhoneValue("5", "+1"), "(5");
  assert.equal(formatPhoneValue("555", "+1"), "(555");
  assert.equal(formatPhoneValue("55512", "+1"), "(555) 12");
  assert.equal(formatPhoneValue("", "+1"), "");
});

// welcome.html's optional second contact method has no country box and must
// behave exactly as it did before the country code became editable.
test("a phone input with no country wrapper formats and submits as US", () => {
  const input = phoneField("5551234567", null);
  formatPhoneInput(input);
  assert.equal(input.value, "(555) 123-4567");
  assert.equal(getPhoneInputDigits(input), "5551234567");
  assert.equal(getWaitlistPhoneSubmissionValue(input), "+1 (555) 123-4567");
});

// --- country resolution ------------------------------------------------------

test("getPhoneCountryCode tolerates a missing input, wrapper, or box", () => {
  assert.equal(getPhoneCountryCode(undefined), "+1");
  assert.equal(getPhoneCountryCode({ closest: () => null }), "+1");
  assert.equal(getPhoneCountryCode(phoneField("", null)), "+1");
  assert.equal(getPhoneCountryCode(phoneField("", "+44")), "+44");
  // The values that reach formatCountryCode when the box is absent or junk.
  assert.equal(formatCountryCode(null), "");
  assert.equal(formatCountryCode(undefined), "");
  assert.equal(formatCountryCode("+"), "");
  assert.equal(formatCountryCode("abc"), "");
});

test("getPhoneInputDigits resolves the cap from the country code in the DOM", () => {
  assert.equal(getPhoneInputDigits(phoneField("(555) 123-4567", "+1")), "5551234567");
  assert.equal(getPhoneInputDigits(phoneField("7700 900123", "+44")), "7700900123");
  // A 3-digit country code leaves 12 of the 15 E.164 digits for the number.
  assert.equal(getPhoneInputDigits(phoneField("1234567890123456", "+352")), "123456789012");
  assert.equal(getPhoneInputDigits(phoneField("", "+44")), "");
});

// --- caret preservation ------------------------------------------------------

test("caret digit counting discounts a typed country code for US numbers", () => {
  // 11 digits with a leading 1: the 1 is dropped, so the caret sits after 10.
  assert.equal(getNormalizedPhoneDigitCountBeforeCursor("15551234567", 11, "+1"), 10);
  assert.equal(getNormalizedPhoneDigitCountBeforeCursor("(555) 1", 7, "+1"), 4);
  assert.equal(getNormalizedPhoneDigitCountBeforeCursor("", 0, "+1"), 0);
});

test("caret digit counting is capped by the E.164 remainder outside the US", () => {
  assert.equal(getNormalizedPhoneDigitCountBeforeCursor("7700 900123", 5, "+44"), 4);
  // 13 digits typed under a 3-digit code: the caret cannot land past digit 12.
  assert.equal(getNormalizedPhoneDigitCountBeforeCursor("1234567890123", 13, "+352"), 12);
  // No leading-1 discount outside the US — a UK number may legitimately start
  // with the same digits a US country code does.
  assert.equal(getNormalizedPhoneDigitCountBeforeCursor("15551234567", 11, "+44"), 11);
});

test("formatPhoneInput restores the caret only while the input is focused", () => {
  // The position math the restore depends on, including the zero-digit and
  // clamp edges an empty or half-typed value produces.
  assert.equal(getCaretPositionForPhoneDigitCount("", 0), 0);
  assert.equal(getCaretPositionForPhoneDigitCount("(5", 0), 1);
  assert.equal(getCaretPositionForPhoneDigitCount("(555) 123-4567", 4), 7);
  assert.equal(getCaretPositionForPhoneDigitCount("(555", 9), 4);

  const focused = phoneField("5551234567", "+1", { selectionStart: 3, focused: true });
  formatPhoneInput(focused);
  assert.equal(focused.value, "(555) 123-4567");
  assert.deepEqual(focused.selections, [[4, 4]]);

  // Reformatting triggered from the country box must not steal the caret back
  // into a field the visitor is not typing in.
  const blurred = phoneField("5551234567", "+1", { selectionStart: 3, focused: false });
  formatPhoneInput(blurred);
  assert.equal(blurred.value, "(555) 123-4567");
  assert.deepEqual(blurred.selections, []);
});

test("formatPhoneInput survives a non-numeric selectionStart and a missing setSelectionRange", () => {
  // selectionStart is null on input types that do not support selection.
  const noSelection = phoneField("5551234567", "+1", { selectionStart: null, focused: true });
  formatPhoneInput(noSelection);
  assert.equal(noSelection.value, "(555) 123-4567");
  assert.deepEqual(noSelection.selections, []);

  const noApi = phoneField("7700900123", "+44", {
    selectionStart: 4,
    focused: true,
    omitSetSelectionRange: true,
  });
  assert.doesNotThrow(() => formatPhoneInput(noApi));
  assert.equal(noApi.value, "7700900123");
});

// --- the country picker ------------------------------------------------------

test("a picker with no selection still resolves to the +1 default", () => {
  // getPhoneCountryCode is what every other helper reads, so its fallback is
  // the one that decides how an unselected or failed-to-load picker behaves.
  const input = phoneField("5551234567", "");
  assert.equal(getPhoneCountryCode(input), "+1");
  assert.equal(isValidWaitlistPhone(input), true);
  assert.equal(getWaitlistPhoneSubmissionValue(input), "+1 (555) 123-4567");
});

test("the picker's value is a bare dial code, which is all the helpers read", () => {
  // The <option value> contract: swapping the free-text box for a select must
  // not change what getPhoneCountryCode sees.
  assert.equal(getPhoneCountryCode(phoneField("7700900123", "+44")), "+44");
  assert.equal(
    getWaitlistPhoneSubmissionValue(phoneField("7700900123", "+44")),
    "+44 7700900123",
  );
});

// --- switching country mid-entry ---------------------------------------------

test("switching +1 to +44 re-runs the typed number through the new rules", () => {
  const input = phoneField("(555) 123-4567", "+44", { selectionStart: 5, focused: false });
  formatPhoneInput(input);
  assert.equal(input.value, "5551234567", "US grouping was left on a non-US number");
  assert.equal(getWaitlistPhoneSubmissionValue(input), "+44 5551234567");
});

test("switching back to +1 re-imposes the US grouping and the 10-digit cap", () => {
  const input = phoneField("441234567890", "+1", { selectionStart: 0, focused: false });
  formatPhoneInput(input);
  // Digits past 10 are dropped silently — the US cap is the promise the
  // placeholder and the error copy both make once the box reads +1 again.
  assert.equal(input.value, "(441) 234-5678");
  assert.equal(isValidWaitlistPhone(input), true);
});

// --- analytics ---------------------------------------------------------------

test("the phone arm's field state carries the country code, the email arm does not", () => {
  const phone = getWaitlistFieldState(phoneField("7700 900123", "+44"), false);
  assert.equal(phone.country_code, "+44");
  assert.equal(phone.looks_valid, true);
  assert.equal(phone.has_value, true);

  const emailInput = { value: "qa@example.com", checkValidity: () => true };
  const email = getWaitlistFieldState(emailInput, true);
  assert.equal("country_code" in email, false, "the email arm has no country box to report");
  assert.equal(email.looks_valid, true);
});

// --- markup contracts the helpers depend on ----------------------------------

test("index.html pairs the picker and the number input as the helpers expect", () => {
  // Attribute presence, not the literal tag: getPhoneCountryCode only needs the
  // wrapper to carry data-phone-field, so adding role/aria must not fail.
  assert.match(indexHtml, /<div class="field"[^>]*\sdata-phone-field(\s|>)/);
  assert.match(indexHtml, /<select[^>]*id="phone_country"[^>]*data-phone-country/);
  assert.ok(
    !/id="phone"\s[^>]*data-phone-country/.test(indexHtml),
    "the number input must not carry data-phone-country",
  );
  // PHONE_INPUT_SELECTOR scopes on type=tel, so the picker must not be one.
  assert.ok(
    !/<select[^>]*id="phone_country"[^>]*type="tel"/.test(indexHtml),
    "the picker is a <select>; giving it type=tel would make it match PHONE_INPUT_SELECTOR",
  );
  // syncPhonePlaceholder restores this exact string when the code returns to +1.
  assert.match(indexHtml, /id="phone"[^>]*data-us-placeholder="\(555\) 123-4567"/);
  assert.match(indexHtml, /id="phone"[^>]*placeholder="\(555\) 123-4567"/);
  assert.ok(
    source.includes(`const PHONE_INPUT_SELECTOR = "input[type='tel']:not([data-phone-country])"`),
    "the scoped phone selector changed — the picker may now be picked as the number field",
  );
});

test("both pages ship the same picker contract", () => {
  for (const [name, html] of [["index.html", indexHtml], ["welcome.html", welcomeHtml]]) {
    // A hard-coded United States option so the field is never empty if
    // countries.js fails to load.
    assert.match(
      html,
      /<option value="\+1" data-country="US" selected>/,
      `${name} has no fallback option`,
    );
    // The display spans populateCountryPicker/syncCountryPickerDisplay write to.
    assert.match(html, /data-phone-country-flag/, `${name} has no flag slot`);
    assert.match(html, /data-phone-country-dial/, `${name} has no dial slot`);
    // countries.js must parse before script.js reads window.grandCountries.
    const countriesAt = html.indexOf("countries.js");
    const scriptAt = html.indexOf("script.js\" defer");
    assert.ok(countriesAt > -1, `${name} does not load countries.js`);
    assert.ok(countriesAt < scriptAt, `${name} loads countries.js after script.js`);
  }
});

// --- regression tests for defects found in review and fixed ------------------

// maxlength="4" used to truncate a pasted "01144" to "0114" before any JS ran,
// so getCountryCodeDigits stripped the "011" it could still see and yielded
// "+4" — a country code nobody dialled, which passed validation and would have
// been written to the sheet. The cap now leaves room for "+" plus the longest
// access prefix and code, so the README's documented paste actually works.
// The US path strips a country code the visitor typed into the number box
// (getUsPhoneDigits' leading-1 rule). There was no equivalent outside the US,
// so pasting a full international number doubled it — "+44 447700900123" —
// and still validated, because 14 digits sits inside the backend's 10-15
// window. That lead would have been unreachable.
test("a full international number pasted under a non-US code is not doubled", () => {
  const input = phoneField("+44 7700 900123", "+44");
  assert.equal(formatPhoneValue(input.value, "+44"), "7700900123");
  assert.equal(getWaitlistPhoneSubmissionValue(input), "+44 7700900123");
  assert.equal(isValidWaitlistPhone(input), true);
  // The US equivalent, which is what this now matches.
  assert.equal(
    getWaitlistPhoneSubmissionValue(phoneField("+1 555 123 4567", "+1")),
    "+1 (555) 123-4567",
  );
});

test("an explicitly marked full international number drops its country code", () => {
  assert.equal(formatPhoneValue("+44 7700 900123", "+44"), "7700900123");
  assert.equal(
    getWaitlistPhoneSubmissionValue(phoneField("+44 7700 900123", "+44")),
    "+44 7700900123",
  );
  // An access prefix counts as the same explicit marking, but only because the
  // country code follows it immediately.
  assert.equal(formatPhoneValue("0044 7700900123", "+44"), "7700900123");
});

test("the + survives the keystroke that produces it", () => {
  // The formatter used to strip a lone "+" immediately, which left nothing to
  // key off by the time the country code was typed, so the typed path doubled
  // the code where the pasted path did not.
  assert.equal(formatPhoneValue("+", "+44"), "+");
  assert.equal(formatPhoneValue("+4", "+44"), "+4");
  assert.equal(formatPhoneValue("+447", "+44"), "7");
});

test("a number typed without a + is taken literally, never guessed at", () => {
  // A national number may legitimately begin with its own country code
  // (+49 49xx), so stripping on a bare digit match would corrupt real numbers.
  assert.equal(formatPhoneValue("447700900123", "+44"), "447700900123");
  // Leading zeros are significant in Italy and elsewhere — not a trunk code we
  // get to discard.
  assert.equal(formatPhoneValue("06 1234 5678", "+39"), "0612345678");
  assert.equal(
    getWaitlistPhoneSubmissionValue(phoneField("06 1234 5678", "+39")),
    "+39 0612345678",
  );
});

test("a country code starting with zero is rejected", () => {
  // getCountryCodeDigits will surface "+0" from a half-typed access prefix; no
  // assigned country code starts with a zero.
  assert.equal(isValidWaitlistPhone(phoneField("123456789", "+0")), false);
  assert.equal(isValidWaitlistPhone(phoneField("7700900123", "+44")), true);
});

// There used to be two notions of "is this US": syncPhonePlaceholder read the
// box's raw value while everything else read getPhoneCountryCode, which
// defaults an empty box to +1. Clearing the box formatted, validated and
// errored as US while the placeholder claimed the field was international.
test("an emptied country box reads as +1 everywhere, including the placeholder", () => {
  assert.equal(getPhoneCountryCode(phoneField("", "")), "+1");
  assert.ok(
    !source.includes("isUsCountryCode(countryInput.value)"),
    "syncPhonePlaceholder is reading the raw box value again instead of getPhoneCountryCode",
  );
  assert.ok(
    source.includes("isUsCountryCode(getPhoneCountryCode(input))"),
    "the placeholder and error copy no longer resolve through getPhoneCountryCode",
  );
});
