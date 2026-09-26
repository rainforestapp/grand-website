const waitlistForm = document.querySelector("[data-waitlist-form]");
const profileForm = document.querySelector("[data-profile-form]");
const analyticsEndpoint =
  (waitlistForm || profileForm)?.dataset.waitlistEndpoint?.trim() || "";
// Grand's alpha signup collects a phone number instead of an email. Tagging
// every payload routes this product's signups/profiles/events into their own
// spreadsheet tabs, keeping them a clean break from the historical email data.
const PRODUCT = "grandphone";
const trackedSections = ["problem", "system", "attention", "tracking", "response", "waitlist"];
let fallbackSessionId = "";
let cachedGeoLocation = null;
let cachedUserAgentData = null;

// Best-effort, non-blocking IP geolocation. Kicked off on load (homepage only)
// so a coarse location is usually ready by the time the visitor submits. We
// never block or fail a signup on this — see buildWaitlistPayload.
if (waitlistForm) {
  fetchGeoLocation()
    .then((geo) => {
      cachedGeoLocation = geo;
    })
    .catch(() => {});
  getUserAgentData()
    .then((userAgentData) => {
      cachedUserAgentData = userAgentData;
    })
    .catch(() => {});
}

function getSessionId() {
  const key = "grand_analytics_session_id";

  try {
    const storedSessionId = window.sessionStorage.getItem(key);
    if (storedSessionId) return storedSessionId;

    const sessionId = createSessionId();
    window.sessionStorage.setItem(key, sessionId);
    return sessionId;
  } catch {
    if (!fallbackSessionId) fallbackSessionId = createSessionId();
    return fallbackSessionId;
  }
}

function createSessionId() {
  return window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// One exposure per session, not per page load — see the call site. Marks the
// session as counted and reports whether it already was. Storage failures fall
// back to logging the exposure: an over-count is a worse outcome than a missing
// one only when it is silent, and a browser with no sessionStorage also has no
// sticky variant, so each of its page loads genuinely is a fresh assignment.
function hasLoggedVariantExposure() {
  const key = "grand_waitlist_exposure_logged";

  try {
    if (window.sessionStorage.getItem(key)) return true;
    window.sessionStorage.setItem(key, "1");
  } catch {}

  return false;
}

function getViewportPayload() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function getAnalyticsContextPayload() {
  return {
    ...(window.grandGetWebsiteAttribution?.() || {}),
    candidate_id: window.grandGetStoredWebsiteCandidateId?.() || "",
  };
}

function getCurrentSectionId() {
  const sections = trackedSections
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const midpoint = window.innerHeight / 2;

  return (
    sections.find((section) => {
      const rect = section.getBoundingClientRect();
      return rect.top <= midpoint && rect.bottom >= midpoint;
    })?.id || "top"
  );
}

function trackAnalyticsEvent(eventType, details = {}) {
  if (!analyticsEndpoint) return;

  const payload = {
    type: "analytics_event",
    product: PRODUCT,
    event_type: eventType,
    event_at: new Date().toISOString(),
    session_id: getSessionId(),
    page_url: window.location.href,
    page_path: window.location.pathname,
    page_hash: window.location.hash || "",
    referrer: document.referrer || "",
    viewport: getViewportPayload(),
    section_id: getCurrentSectionId(),
    ...getAnalyticsContextPayload(),
    // Which arm of the homepage waitlist A/B test this session was assigned.
    // Tagging the base payload means every event is comparable by variant,
    // including section_view — so "saw the form" and "signed up" come from one
    // pipeline with one join key (session_id) rather than two.
    waitlist_variant: window.grandWaitlistVariant || "",
    ...details,
  };
  const body = JSON.stringify(payload);

  if (navigator.sendBeacon) {
    const sent = navigator.sendBeacon(analyticsEndpoint, body);
    if (sent) return;
  }

  fetch(analyticsEndpoint, {
    method: "POST",
    mode: "no-cors",
    keepalive: true,
    headers: {
      "Content-Type": "text/plain",
    },
    body,
  }).catch(() => {});
}

function getClickTarget(element) {
  if (!(element instanceof Element)) return null;

  const link = element.closest("a");
  const button = element.closest("button");
  const target = link || button;

  if (!target) return null;

  return {
    element_type: target.tagName.toLowerCase(),
    target_text: target.textContent.trim().replace(/\s+/g, " ").slice(0, 120),
    target_href: link?.getAttribute("href") || "",
    target_id: target.id || "",
    target_classes: target.className || "",
    target_label: target.getAttribute("aria-label") || "",
  };
}

function setupClickTracking() {
  document.addEventListener(
    "click",
    (event) => {
      const target = getClickTarget(event.target);
      if (!target) return;

      trackAnalyticsEvent("click", {
        ...target,
        section_id: event.target.closest("section")?.id || getCurrentSectionId(),
      });
    },
    { capture: true },
  );
}

function getStickyHeaderOffset() {
  const header = document.querySelector(".site-header");
  if (!header) return 0;
  const position = window.getComputedStyle(header).position;
  if (position != "sticky" && position != "fixed") return 0;

  return Math.ceil(header.getBoundingClientRect().height) + 12;
}

function getSamePageAnchorTarget(link) {
  const href = link?.getAttribute("href") || "";
  if (!href.startsWith("#") || href === "#") return null;

  return getHashTarget(href);
}

function getHashTarget(hash) {
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1)));
  } catch {
    return document.getElementById(hash.slice(1));
  }
}

function scrollToAnchorTarget(target, behavior = "smooth") {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    behavior = "instant";
  }
  const top = target.getBoundingClientRect().top + window.scrollY - getStickyHeaderOffset();

  // `behavior: "auto"` is not "jump instantly" — it defers to the CSS
  // `scroll-behavior`, which is `smooth` (styles.css), so "auto" animates. The
  // explicit "instant" enum only landed in Safari 15.4 and throws a TypeError
  // before that, so suppress the animation through the style instead.
  if (behavior === "instant") {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, Math.max(0, top));
    root.style.scrollBehavior = previous;
    return;
  }

  window.scrollTo({
    top: Math.max(0, top),
    behavior,
  });
}

function setupAnchorScrolling() {
  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest("a") : null;
    const target = getSamePageAnchorTarget(link);
    if (!target) return;

    event.preventDefault();
    const hash = `#${target.id}`;

    try {
      if (window.location.hash !== hash) {
        window.history.pushState(null, "", hash);
      }
    } catch {
      window.location.hash = hash;
    }

    scrollToAnchorTarget(target, "smooth");

    if (!target.hasAttribute("tabindex")) {
      target.setAttribute("tabindex", "-1");
    }
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
  });

  // The browser has already jumped to the fragment by now, so this only
  // re-aligns it under the sticky header (`scroll-padding-top` measures that
  // gap slightly differently). `load` can fire seconds late on mobile, and by
  // then the visitor may have scrolled somewhere of their own choosing —
  // moving the page under them is worse than an 8px misalignment, so the first
  // sign of a deliberate scroll cancels the correction.
  let visitorTookOver = false;
  const noteTakeover = () => {
    visitorTookOver = true;
  };
  ["wheel", "touchstart", "keydown"].forEach((eventName) => {
    window.addEventListener(eventName, noteTakeover, { once: true, passive: true });
  });

  window.addEventListener("load", () => {
    ["wheel", "touchstart", "keydown"].forEach((eventName) => {
      window.removeEventListener(eventName, noteTakeover);
    });

    const target = getHashTarget(window.location.hash || "");
    if (!target || visitorTookOver) return;

    scrollToAnchorTarget(target, "instant");
  });
}

function setupSectionViewTracking() {
  if (!("IntersectionObserver" in window)) return;

  const seenSections = new Set();
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || seenSections.has(entry.target.id)) return;

        seenSections.add(entry.target.id);
        trackAnalyticsEvent("section_view", {
          section_id: entry.target.id,
          section_label:
            entry.target.querySelector("h1, h2")?.textContent.trim().replace(/\s+/g, " ") || "",
        });
      });
    },
    {
      rootMargin: "0px 0px -35% 0px",
      threshold: 0.35,
    },
  );

  trackedSections.forEach((id) => {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  });
}

function setWaitlistStatus(message, type = "neutral") {
  const status = document.querySelector("[data-waitlist-status]");
  if (!status) return;

  status.textContent = message;
  status.dataset.status = type;
}

// The homepage phone arm ships an editable country code next to the number, so
// every helper below resolves the code from the DOM instead of assuming +1.
// A phone field without a country input (welcome.html's optional second
// contact method) falls back to this default and behaves exactly as before.
const DEFAULT_COUNTRY_CODE = "+1";
// E.164 caps a full number at 15 digits, country code included.
const MAX_PHONE_DIGITS = 15;

// "The phone number input" everywhere, never the country code box beside it.
const PHONE_INPUT_SELECTOR = "input[type='tel']:not([data-phone-country])";

function getCountryCodeDigits(value) {
  // The country code always comes from the picker now, so this only ever sees
  // a value we put in an <option> ("+44"). It stays defensive about the shape
  // because welcome.html and the homepage both feed it and a missing picker
  // falls back to the DEFAULT_COUNTRY_CODE string. Access-prefix handling
  // lives in getNationalPhoneDigits, which is where a visitor can still type
  // one.
  return String(value || "").replace(/\D/g, "").slice(0, 3);
}

function formatCountryCode(value) {
  const digits = getCountryCodeDigits(value);
  return digits ? `+${digits}` : "";
}

function isUsCountryCode(countryCode) {
  return getCountryCodeDigits(countryCode) === "1";
}

// The country code that applies to a phone input. An emptied country box reads
// as +1 here so validation never runs against "no country"; the blur handler
// puts the default back in the box so what we validate is what is on screen.
function getPhoneCountryCode(input) {
  const countryInput = input
    ?.closest("[data-phone-field]")
    ?.querySelector("[data-phone-country]");

  return formatCountryCode(countryInput?.value) || DEFAULT_COUNTRY_CODE;
}

function getUsPhoneDigits(value) {
  const rawDigits = String(value || "").replace(/\D/g, "");
  const digits = rawDigits.length > 10 && rawDigits.startsWith("1")
    ? rawDigits.slice(1)
    : rawDigits;

  return digits.slice(0, 10);
}

// The national part of a number, given its country code. US numbers keep the
// 10-digit cap and the "typed the 1 themselves" fix. For everywhere else we do
// not carry per-country numbering rules, so the only cap we can honestly apply
// is whatever E.164 leaves after the country code.
function getNationalDigitLimit(countryCode) {
  return Math.max(0, MAX_PHONE_DIGITS - getCountryCodeDigits(countryCode).length);
}

function getNationalPhoneDigits(value, countryCode) {
  if (isUsCountryCode(countryCode)) return getUsPhoneDigits(value);

  const codeDigits = getCountryCodeDigits(countryCode);
  const text = String(value || "").trim();
  let digits = text.replace(/\D/g, "");

  // Outside the US we do not guess. A national number can legitimately begin
  // with its own country code, and a leading zero is significant in Italy and
  // elsewhere, so whatever is typed literally is kept literally. The only two
  // shapes acted on are ones the visitor marked unambiguously as the full
  // international number:
  //
  //   "+44 7700 900123"   an explicit "+" in front of the country code
  //   "0044 7700 900123"  an access prefix immediately followed by it
  //
  // Both would otherwise submit the country code twice, as
  // "+44 447700900123", and that lead is unreachable.
  if (codeDigits) {
    const accessPrefixed = new RegExp(`^(?:011|00)${codeDigits}`);
    if (text.startsWith("+") && digits.startsWith(codeDigits)) {
      digits = digits.slice(codeDigits.length);
    } else if (accessPrefixed.test(digits)) {
      digits = digits.replace(accessPrefixed, "");
    }
  }

  return digits.slice(0, getNationalDigitLimit(countryCode));
}

function getPhoneInputDigits(input) {
  return getNationalPhoneDigits(input.value, getPhoneCountryCode(input));
}

function formatUsPhone(digits) {
  const value = getUsPhoneDigits(digits);
  if (!value) return "";
  if (value.length < 4) return `(${value}`;
  if (value.length < 7) return `(${value.slice(0, 3)}) ${value.slice(3)}`;
  return `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6)}`;
}

// US numbers get the familiar (555) 123-4567 grouping. Other countries group
// digits differently enough that imposing the US shape would be wrong more
// often than right, so those are normalized to bare digits.
function formatPhoneValue(value, countryCode) {
  if (isUsCountryCode(countryCode)) return formatUsPhone(value);

  const codeDigits = getCountryCodeDigits(countryCode);
  const text = String(value || "").trim();
  const digits = text.replace(/\D/g, "");

  // Keep a "+" the visitor is still typing behind. Dropping it as soon as it
  // appears would erase the one unambiguous signal that a full international
  // number is coming, leaving getNationalPhoneDigits nothing to act on by the
  // time the country code lands.
  if (text.startsWith("+") && codeDigits && !digits.startsWith(codeDigits)) {
    return `+${digits.slice(0, getNationalDigitLimit(countryCode))}`;
  }

  return getNationalPhoneDigits(value, countryCode);
}

function getNormalizedPhoneDigitCountBeforeCursor(value, cursorPosition, countryCode) {
  const allDigits = String(value || "").replace(/\D/g, "");
  const cursorDigits = String(value || "")
    .slice(0, cursorPosition)
    .replace(/\D/g, "");

  if (!isUsCountryCode(countryCode)) {
    return Math.min(cursorDigits.length, getNationalDigitLimit(countryCode));
  }

  const countryPrefixWasTyped = allDigits.length > 10 && allDigits.startsWith("1");
  const digitCount = countryPrefixWasTyped && cursorDigits.length > 0
    ? cursorDigits.length - 1
    : cursorDigits.length;

  return Math.max(0, Math.min(digitCount, 10));
}

function getCaretPositionForPhoneDigitCount(formattedValue, digitCount) {
  if (digitCount <= 0) return formattedValue ? 1 : 0;

  let digitsSeen = 0;
  for (let index = 0; index < formattedValue.length; index += 1) {
    if (/\d/.test(formattedValue[index])) {
      digitsSeen += 1;
      if (digitsSeen === digitCount) return index + 1;
    }
  }

  return formattedValue.length;
}

function formatPhoneInput(input) {
  const countryCode = getPhoneCountryCode(input);
  // Reading selectionStart forces a layout, and the caret only matters while
  // this input has focus. The country box calls this on its own keystrokes,
  // when focus is elsewhere, so the guard has to come first.
  const isFocused = document.activeElement === input;
  const cursorPosition = isFocused ? input.selectionStart : null;
  const digitCountBeforeCursor = typeof cursorPosition === "number"
    ? getNormalizedPhoneDigitCountBeforeCursor(input.value, cursorPosition, countryCode)
    : null;
  const formattedValue = formatPhoneValue(input.value, countryCode);

  if (input.value !== formattedValue) input.value = formattedValue;

  if (
    digitCountBeforeCursor !== null &&
    isFocused &&
    typeof input.setSelectionRange === "function"
  ) {
    const nextCursorPosition = getCaretPositionForPhoneDigitCount(
      formattedValue,
      digitCountBeforeCursor,
    );
    input.setSelectionRange(nextCursorPosition, nextCursorPosition);
  }
}

// Build the picker's options from countries.js. Returns false when the data
// did not load, in which case the markup's single hard-coded United States
// option stays and the field still works for the overwhelming majority.
function populateCountryPicker(select) {
  const countries = window.grandCountries;
  if (!select || !Array.isArray(countries) || countries.length === 0) return false;

  const selectedCountry = select.querySelector("option[selected]")?.dataset.country || "US";
  const options = countries.map((country) => {
    const option = document.createElement("option");
    // The value is the dial code alone, so every phone helper keeps reading
    // this control exactly as it read the old text box. The ISO code rides
    // along in a data attribute for analytics, where "+1" cannot tell the
    // United States apart from Canada or twenty Caribbean countries.
    option.value = country.dial;
    option.dataset.country = country.iso;
    option.textContent = `${country.flag} ${country.name} ${country.dial}`;
    option.selected = country.iso === selectedCountry;
    return option;
  });

  select.replaceChildren(...options);
  return true;
}

// The closed picker shows a flag and a dial code; the select's own label is
// the full "United Kingdom +44", which does not fit the slot.
function syncCountryPickerDisplay(select) {
  const field = select?.closest("[data-phone-field]");
  if (!field) return;

  const iso = select.selectedOptions[0]?.dataset.country || "";
  const flag = field.querySelector("[data-phone-country-flag]");
  const dial = field.querySelector("[data-phone-country-dial]");

  if (flag) flag.textContent = window.grandCountryFlag?.(iso) || "";
  if (dial) dial.textContent = select.value || DEFAULT_COUNTRY_CODE;
}

function getSelectedCountryIso(select) {
  return select?.selectedOptions?.[0]?.dataset.country || "";
}

function getWaitlistPhoneSubmissionValue(input) {
  const countryCode = getPhoneCountryCode(input);
  return `${countryCode} ${formatPhoneValue(input.value, countryCode)}`;
}

function isValidWaitlistPhone(input) {
  const countryCode = getPhoneCountryCode(input);
  const nationalDigits = getNationalPhoneDigits(input.value, countryCode);
  if (isUsCountryCode(countryCode)) return nationalDigits.length === 10;
  // No country code starts with a zero, so "+0" is not one no matter how many
  // digits follow it into the number box.
  if (!/^[1-9]/.test(getCountryCodeDigits(countryCode))) return false;

  // Outside the US we have no per-country length table, so we hold the number
  // to the same 10–15 total digits the sheet endpoint enforces. Anything this
  // accepts is therefore something the backend will also accept — a stricter
  // guess here would reject real numbers, a looser one would hand the visitor
  // a generic network-ish failure instead of a fixable field error.
  const totalDigits = getCountryCodeDigits(countryCode).length + nationalDigits.length;
  return totalDigits >= 10 && totalDigits <= MAX_PHONE_DIGITS;
}

function getValueLengthBucket(value) {
  const length = String(value || "").trim().length;

  if (length === 0) return "0";
  if (length < 6) return "1-5";
  if (length < 12) return "6-11";
  if (length < 24) return "12-23";
  return "24+";
}

function getWaitlistFieldState(input, isEmail) {
  const value = input.value.trim();

  return {
    has_value: value.length > 0,
    looks_valid: isEmail ? value.length > 0 && input.checkValidity() : isValidWaitlistPhone(input),
    value_length_bucket: getValueLengthBucket(value),
    // Whether anyone actually edits the country code is the open question
    // behind making it editable at all; without this the only record of a
    // non-US signup is the phone column in the sheet.
    ...(isEmail
      ? {}
      : {
          country_code: getPhoneCountryCode(input),
          country: getSelectedCountryIso(
            input.closest("[data-phone-field]")?.querySelector("[data-phone-country]"),
          ),
        }),
  };
}

async function getUserAgentData() {
  const base = getBaseUserAgentData();
  if (!base) return null;
  if (!navigator.userAgentData.getHighEntropyValues) return base;

  try {
    const highEntropy = await navigator.userAgentData.getHighEntropyValues([
      "architecture",
      "bitness",
      "model",
      "platformVersion",
      "uaFullVersion",
      "fullVersionList",
      "wow64",
    ]);

    return { ...base, ...highEntropy };
  } catch {
    return base;
  }
}

function getBaseUserAgentData() {
  if (!navigator.userAgentData) return null;

  return {
    brands: navigator.userAgentData.brands,
    mobile: navigator.userAgentData.mobile,
    platform: navigator.userAgentData.platform,
  };
}

async function fetchGeoLocation() {
  try {
    const response = await fetch("https://ipapi.co/json/", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (!data || data.error) return null;

    return {
      city: data.city || "",
      region: data.region || "",
      country: data.country_name || data.country || "",
      postal: data.postal || "",
      source: "ipapi.co",
    };
  } catch {
    return null;
  }
}

// Report a conversion to the ad pixels. The base pixels load in the page head;
// here we fire the standard conversion events so Meta/Reddit can attribute and
// optimize toward signups (previously only PageView/PageVisit fired). Guarded
// so a blocked or absent pixel never throws.
function firePixelConversion(metaEvent, redditEvent) {
  // QA page loads and form checks must not train ad-platform optimization or
  // appear as paid conversions. Use ?qa=1 or utm_source=qa when testing live.
  if (window.grandIsWebsiteQaMode?.()) return;

  try {
    if (typeof window.fbq === "function") window.fbq("track", metaEvent);
  } catch {}
  try {
    if (typeof window.rdt === "function") window.rdt("track", redditEvent);
  } catch {}
}

function buildWaitlistPayload(identity, candidateId, submissionId, variant) {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  return {
    type: "waitlist_signup",
    product: PRODUCT,
    // Only the identifier this arm actually asked for. The other column stays
    // blank on the signup row and is filled in later only if the visitor
    // volunteers it on the profile page.
    phone: variant === "email" ? "" : identity,
    email: variant === "email" ? identity : "",
    waitlist_variant: variant,
    candidate_id: candidateId,
    // A submission-specific UUID makes an interrupted request safe to retry
    // without treating every signup in this browser session as the same lead.
    submission_id: submissionId,
    source: "grand-website",
    submitted_at: new Date().toISOString(),
    page_url: window.location.href,
    referrer: document.referrer || "",
    user_agent: navigator.userAgent,
    user_agent_data: cachedUserAgentData || getBaseUserAgentData(),
    language: navigator.language || "",
    languages: navigator.languages || [],
    platform: navigator.platform || "",
    vendor: navigator.vendor || "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    timezone_offset_minutes: new Date().getTimezoneOffset(),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    screen: {
      width: window.screen?.width || null,
      height: window.screen?.height || null,
      color_depth: window.screen?.colorDepth || null,
      pixel_depth: window.screen?.pixelDepth || null,
    },
    device_pixel_ratio: window.devicePixelRatio || 1,
    hardware_concurrency: navigator.hardwareConcurrency || null,
    device_memory_gb: navigator.deviceMemory || null,
    cookie_enabled: navigator.cookieEnabled,
    do_not_track: navigator.doNotTrack || window.doNotTrack || "",
    connection: connection
      ? {
          effective_type: connection.effectiveType || "",
          downlink: connection.downlink || null,
          rtt: connection.rtt || null,
          save_data: Boolean(connection.saveData),
        }
      : null,
    geo: cachedGeoLocation,
    ...(window.grandGetWebsiteAttribution?.() || {}),
  };
}

async function submitWaitlist(endpoint, payload) {
  const body = JSON.stringify(payload);
  const controller = new AbortController();
  // Apps Script can take around 20 seconds to confirm a saved row.
  // Keep awaiting its JSON receipt rather than reporting a saved signup as failed.
  const timeout = window.setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      // text/plain is a simple CORS request, and Apps Script's redirect target
      // returns Access-Control-Allow-Origin: *. Reading that JSON is what lets us
      // distinguish a written row from a queued-or-rejected beacon.
      mode: "cors",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = new Error(`waitlist_http_${response.status}`);
      error.failureReason = "http_error";
      throw error;
    }

    let result;
    try {
      result = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      const invalidResponseError = new Error("waitlist_invalid_response");
      invalidResponseError.failureReason = "invalid_server_response";
      throw invalidResponseError;
    }

    if (!result?.ok) {
      const error = new Error(`waitlist_rejected_${String(result?.error || "unknown")}`);
      error.failureReason = String(result?.error || "server_rejected").slice(0, 80);
      throw error;
    }

    return result;
  } catch (error) {
    if (!controller.signal.aborted) throw error;
    const timeoutError = new Error("waitlist_timeout");
    timeoutError.failureReason = "timeout";
    throw timeoutError;
  } finally {
    window.clearTimeout(timeout);
  }
}

if (waitlistForm) {
  // The markup ships one field block per A/B arm. Whichever one this session
  // was not assigned is already hidden by the stylesheet, so remove it from the
  // DOM outright: a hidden `required` input would otherwise stay behind as an
  // autofill and screen-reader target. No reflow, because it already occupies
  // no space. Defaults to phone when ab-test.js is blocked or absent, matching
  // the stylesheet's fallback.
  // Whether ab-test.js actually ran and assigned an arm. When it did not — the
  // script was dropped by a flaky connection, failed to parse on an old engine,
  // or the visitor is a bot running a stripped JS engine — `activeVariant`
  // below silently falls back to phone. That fallback is intentional (degrade
  // to the form that was live before this test), but it is invisible, and an
  // invisible fallback is indistinguishable from a real assignment when you are
  // staring at a lopsided split wondering whether the randomizer is broken.
  const variantWasAssigned =
    window.grandWaitlistVariant === "phone" || window.grandWaitlistVariant === "email";
  const activeVariant = window.grandWaitlistVariant === "email" ? "email" : "phone";
  let pendingSubmissionId = "";
  let pendingSubmissionIdentity = "";
  waitlistForm
    .querySelectorAll(`[data-waitlist-field]:not([data-waitlist-field="${activeVariant}"])`)
    .forEach((field) => field.remove());

  // Scoped past the country box, which is also type=tel and sits first in the
  // markup — an unqualified selector here would pick it up instead.
  const input = waitlistForm.querySelector(`${PHONE_INPUT_SELECTOR}, input[type='email']`);
  const countryInput = waitlistForm.querySelector("[data-phone-country]");
  const button = waitlistForm.querySelector("button[type='submit']");
  const isEmailVariant = input?.type === "email";
  let trackedFieldInputStart = false;
  let trackedCountryCodeEdit = false;
  let trackedFieldFocus = false;
  // The country code is the first thing a non-US visitor touches, and it is a
  // sibling input rather than the one the funnel used to watch. Shared between
  // both boxes so the pair reports one start, whichever they reach first.
  let lastCountryCode = DEFAULT_COUNTRY_CODE;

  // The test's exposure event, and the funnel's denominator. Fired here rather
  // than in ab-test.js because grandTrackWebsiteEvent does not exist yet when
  // that synchronous head script runs. Deliberately PostHog-only: the sheet
  // pipeline already gets a variant-tagged section_view for #waitlist, and an
  // extra beacon per homepage view would add an Apps Script execution per
  // visitor for data we already have.
  //
  // Fired at most ONCE PER SESSION. The variant is sticky for the whole
  // session, so a visitor who reloads the homepage — or navigates back to it
  // from welcome.html — would otherwise log an exposure per page load, every
  // one of them in the same arm. That does not just inflate the count, it
  // biases the ratio: a handful of reloads by a few visitors is enough to make
  // an even 50/50 assignment read as lopsided, which is exactly what it did
  // (15 PostHog exposures against 9 real sessions, splitting 11/4 while the
  // sheet showed 12/12 for the day).
  //
  // `variant_assigned: false` marks a visitor who was never randomized. These
  // are already excluded from the experiment itself, because posthog.js only
  // sets the `$feature/...` property when a real arm was assigned — so they
  // cannot skew the split. What they do skew is the denominator: they are
  // traffic the experiment never saw. Tagging them turns "how often does this
  // happen?" into a number you can read off a breakdown instead of a question
  // that has to be re-argued every time the split looks uneven.
  if (!hasLoggedVariantExposure()) {
    window.grandTrackWebsiteEvent?.("waitlist_variant_assigned", {
      waitlist_variant: activeVariant,
      variant_assigned: variantWasAssigned,
    });
  }

  function isValidWaitlistValue() {
    if (!input) return false;

    return isEmailVariant
      ? input.value.trim().length > 0 && input.checkValidity()
      : isValidWaitlistPhone(input);
  }

  // The (555) 123-4567 example is a promise about formatting that only holds
  // for +1, so it is withdrawn as soon as the visitor picks another country.
  // The replacement has to survive a 375px phone, where the number input is
  // only ~171px wide: anything longer renders clipped mid-word.
  function syncPhonePlaceholder() {
    if (!input || !countryInput) return;

    input.placeholder = isUsCountryCode(getPhoneCountryCode(input))
      ? input.dataset.usPlaceholder || input.placeholder
      : "No country code";
  }

  // Outside the US the only rule we enforce is a plausible total length, so the
  // US copy ("10-digit") would be telling a UK visitor to do the wrong thing.
  function getWaitlistErrorMessage() {
    if (isEmailVariant) return "Enter a valid email address.";
    return isUsCountryCode(getPhoneCountryCode(input))
      ? "Enter a 10-digit US phone number."
      : "Enter your full phone number, without the country code.";
  }

  function trackWaitlistFieldFocus() {
    if (trackedFieldFocus) return;
    trackedFieldFocus = true;

    trackAnalyticsEvent(`waitlist_${activeVariant}_focus`, {
      section_id: "waitlist",
    });
    window.grandTrackWebsiteEvent?.("waitlist_started", {
      form_type: activeVariant,
    });
  }

  function syncWaitlistFieldState(options = {}) {
    if (!input || !button) return;

    const hasValue = isEmailVariant
      ? input.value.trim().length > 0
      : getPhoneInputDigits(input).length > 0;
    const isValid = isValidWaitlistValue();
    const showError = Boolean(options.showError && hasValue && !isValid);

    button.disabled = !isValid;
    input.setAttribute("aria-invalid", showError ? "true" : "false");

    if (showError) {
      setWaitlistStatus(getWaitlistErrorMessage(), "error");
    } else if (!options.preserveStatus) {
      setWaitlistStatus("", "neutral");
    }
  }

  if (input && button) {
    syncWaitlistFieldState();

    input.addEventListener("focus", trackWaitlistFieldFocus);

    input.addEventListener("input", () => {
      if (!isEmailVariant) formatPhoneInput(input);
      syncWaitlistFieldState();

      if (trackedFieldInputStart || input.value.trim().length === 0) return;

      trackedFieldInputStart = true;
      trackAnalyticsEvent(`waitlist_${activeVariant}_input_start`, {
        section_id: "waitlist",
        ...getWaitlistFieldState(input, isEmailVariant),
      });
    });

    input.addEventListener("blur", () => {
      if (!isEmailVariant) formatPhoneInput(input);
      syncWaitlistFieldState({ showError: true });

      trackAnalyticsEvent(`waitlist_${activeVariant}_blur`, {
        section_id: "waitlist",
        ...getWaitlistFieldState(input, isEmailVariant),
      });
    });
  }

  if (countryInput && input) {
    populateCountryPicker(countryInput);
    syncCountryPickerDisplay(countryInput);
    syncPhonePlaceholder();
    lastCountryCode = getPhoneCountryCode(input);
    countryInput.addEventListener("focus", trackWaitlistFieldFocus);

    // "change", not "input": a picker only ever reports real selections, so
    // the guesswork the free-text box needed — normalizing as you type,
    // restoring a default on blur, telling a stray keystroke apart from a
    // deliberate edit — has nothing left to do.
    countryInput.addEventListener("change", () => {
      syncCountryPickerDisplay(countryInput);
      // Switching country changes both how the number is grouped and how long
      // it is allowed to be, so the number already typed has to be re-run
      // through the new rules rather than left in the old country's shape.
      formatPhoneInput(input);
      syncPhonePlaceholder();
      syncWaitlistFieldState();

      const countryCode = getPhoneCountryCode(input);
      if (countryCode === lastCountryCode) return;
      lastCountryCode = countryCode;

      if (trackedCountryCodeEdit) return;
      trackedCountryCodeEdit = true;
      trackAnalyticsEvent("waitlist_country_code_edit", {
        section_id: "waitlist",
        country_code: countryCode,
        country: getSelectedCountryIso(countryInput),
      });
    });
  }

  waitlistForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const endpoint = waitlistForm.dataset.waitlistEndpoint?.trim();
    if (!input || !button) return;

    const candidateId = window.grandGetOrCreateWebsiteCandidateId?.() || "";

    if (!isEmailVariant) formatPhoneInput(input);
    const identity = isEmailVariant
      ? input.value.trim()
      : getWaitlistPhoneSubmissionValue(input);
    const submissionIdentity = `${activeVariant}:${identity}`;
    if (!pendingSubmissionId || pendingSubmissionIdentity !== submissionIdentity) {
      pendingSubmissionId = window.grandCreateWebsiteSubmissionId?.() || "";
      pendingSubmissionIdentity = submissionIdentity;
    }

    trackAnalyticsEvent("waitlist_submit_attempt", {
      section_id: "waitlist",
      submission_id: pendingSubmissionId,
    });

    if (!isValidWaitlistValue()) {
      const failureReason = isEmailVariant ? "invalid_email" : "invalid_phone";
      trackAnalyticsEvent("waitlist_submit_error", {
        section_id: "waitlist",
        error: failureReason,
      });
      window.grandTrackWebsiteEvent?.("waitlist_submission_failed", {
        failure_reason: failureReason,
      });
      syncWaitlistFieldState({ showError: true });
      input.focus();
      return;
    }

    if (!endpoint) {
      trackAnalyticsEvent("waitlist_submit_error", {
        section_id: "waitlist",
        error: "missing_endpoint",
      });
      window.grandTrackWebsiteEvent?.("waitlist_submission_failed", {
        failure_reason: "missing_endpoint",
      });
      setWaitlistStatus("The waitlist sheet is not connected yet.", "error");
      return;
    }

    const originalLabel = button.textContent;
    waitlistForm.dataset.submitting = "true";
    button.disabled = true;
    button.textContent = "Joining...";
    setWaitlistStatus("", "neutral");
    let submitted = false;

    try {
      window.grandIdentifyWebsiteCandidate?.(candidateId);
      const payload = buildWaitlistPayload(
        identity,
        candidateId,
        pendingSubmissionId,
        activeVariant,
      );
      await submitWaitlist(endpoint, payload);
      waitlistForm.reset();
      submitted = true;
      trackAnalyticsEvent("waitlist_submit_success", {
        section_id: "waitlist",
        submission_id: pendingSubmissionId,
        delivery_confirmed: true,
      });
      window.grandTrackWebsiteEvent?.("waitlist_signup", {
        form_type: activeVariant,
        submission_id: pendingSubmissionId,
        delivery_confirmed: true,
      });
      firePixelConversion("Lead", "SignUp");
      setWaitlistStatus("You're on the list. Taking you to a couple of quick questions...", "success");

      // Progressive profiling: hand off to the profile page to collect
      // qualifying details, without ever gating the identifier behind them.
      // The value travels via sessionStorage (not the URL) so it isn't leaked
      // into the profile page's referrer/pixel traffic. The success message
      // above stays visible if navigation is blocked.
      try {
        window.sessionStorage.setItem(
          isEmailVariant ? "grand_signup_email" : "grand_signup_phone",
          identity,
        );
        window.sessionStorage.setItem("grand_signup_submission_id", pendingSubmissionId);
        // Clear the opposite key. welcome.html decides what to ask for from
        // which of these two exists, so leaving a stale value from an earlier
        // ?variant= switch in the same session would make it conclude we
        // already have both and offer neither.
        window.sessionStorage.removeItem(
          isEmailVariant ? "grand_signup_phone" : "grand_signup_email",
        );
      } catch {}
      window.location.assign("welcome.html");
    } catch (error) {
      console.warn(error);
      const failureReason = error?.failureReason || "network_or_script_error";
      trackAnalyticsEvent("waitlist_submit_error", {
        section_id: "waitlist",
        submission_id: pendingSubmissionId,
        error: failureReason,
      });
      window.grandTrackWebsiteEvent?.("waitlist_submission_failed", {
        submission_id: pendingSubmissionId,
        failure_reason: failureReason,
      });
      setWaitlistStatus(
        failureReason === "timeout"
          ? "We couldn’t confirm your signup in time. Please try again — we’ll avoid adding it twice."
          : "Something went wrong. Please try again.",
        "error",
      );
    } finally {
      delete waitlistForm.dataset.submitting;
      button.textContent = originalLabel;
      if (!submitted) syncWaitlistFieldState({ preserveStatus: true });
    }
  });
}

function setProfileStatus(message, type = "neutral") {
  const status = document.querySelector("[data-profile-status]");
  if (!status) return;

  status.textContent = message;
  status.dataset.status = type;
}

function buildProfilePayload(form) {
  let storedPhone = "";
  let storedEmail = "";
  let candidateId = "";
  let submissionId = "";
  try {
    storedPhone = window.sessionStorage.getItem("grand_signup_phone") || "";
    storedEmail = window.sessionStorage.getItem("grand_signup_email") || "";
    candidateId = window.grandGetOrCreateWebsiteCandidateId?.() ||
      window.sessionStorage.getItem("grand_website_candidate_id") || "";
    submissionId = window.sessionStorage.getItem("grand_signup_submission_id") || "";
  } catch {}

  const data = new FormData(form);
  const phoneInput = form.querySelector(PHONE_INPUT_SELECTOR);
  // The optional second contact method, normalized the same way the homepage
  // does it so the two arms write identically formatted values. Sent only when
  // non-empty: the backend writes contact columns only for non-empty values, so
  // a blank field can never clear what the signup already captured.
  const submittedPhone =
    phoneInput && getPhoneInputDigits(phoneInput).length > 0
      ? getWaitlistPhoneSubmissionValue(phoneInput)
      : "";

  return {
    type: "waitlist_profile",
    product: PRODUCT,
    // Whichever identifier the signup captured is the identity used to find
    // this person's row; the other one, if given here, is extra contact data.
    phone: storedPhone || submittedPhone,
    email: storedEmail || String(data.get("email") || "").trim(),
    // Lets the backend match the signup row on the column that arm actually
    // wrote, instead of guessing phone-then-email and appending a duplicate.
    waitlist_variant: window.grandWaitlistVariant || "",
    candidate_id: candidateId,
    submission_id: submissionId,
    source: "grand-website",
    full_name: String(data.get("full_name") || "").trim(),
    zipcode: String(data.get("zipcode") || "").trim(),
    reason_interested: String(data.get("reason_interested") || "").trim(),
    lives_alone: String(data.get("lives_alone") || ""),
    phone_type: String(data.get("phone_type") || ""),
    has_pets: String(data.get("has_pets") || ""),
    alpha_tester: String(data.get("alpha_tester") || ""),
    profile_completed_at: new Date().toISOString(),
    ...(window.grandGetWebsiteAttribution?.() || {}),
    page_url: window.location.href,
    referrer: document.referrer || "",
  };
}

if (profileForm) {
  const doneMessage = document.querySelector("[data-profile-done]");
  const waitlistedMessage = document.querySelector("[data-profile-waitlisted]");

  // Ask only for the contact method the signup did not capture. The unused
  // field is already hidden by the stylesheet; removing it stops autofill
  // quietly populating a value the visitor never saw themselves give us.
  // "both" (a direct visit, or a session with nothing stored) leaves both.
  const profileAsk = window.grandProfileAsk || "both";
  if (profileAsk === "email" || profileAsk === "phone") {
    profileForm
      .querySelectorAll(`[data-profile-field]:not([data-profile-field="${profileAsk}"])`)
      .forEach((field) => field.remove());
  }

  // Same live formatting as the homepage phone field, so an optional phone
  // given here behaves and normalizes identically.
  const profilePhoneInput = profileForm.querySelector(PHONE_INPUT_SELECTOR);
  const profileCountryInput = profileForm.querySelector("[data-phone-country]");
  if (profilePhoneInput) {
    ["input", "blur"].forEach((eventName) => {
      profilePhoneInput.addEventListener(eventName, () => formatPhoneInput(profilePhoneInput));
    });
  }

  // Same picker as the homepage, so a number given here is normalized the same
  // way and lands in the sheet in the same shape.
  if (profileCountryInput && profilePhoneInput) {
    populateCountryPicker(profileCountryInput);
    syncCountryPickerDisplay(profileCountryInput);
    profileCountryInput.addEventListener("change", () => {
      syncCountryPickerDisplay(profileCountryInput);
      formatPhoneInput(profilePhoneInput);
    });
  }

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = profileForm.querySelector("button[type='submit']");
    const endpoint = profileForm.dataset.waitlistEndpoint?.trim();
    if (!button) return;

    trackAnalyticsEvent("waitlist_profile_submit_attempt", {
      section_id: "welcome",
    });

    // The qualifier answers decide who is routed to the scheduling call vs. the
    // waitlist, and name/ZIP are how we follow up, so those stay required.
    // The contact field is not required: the signup already captured one way to
    // reach this person, and the second one is a nice-to-have we would rather
    // not push anyone away over. Keeping it optional in both arms also keeps
    // them symmetric, so the test measures the field type and nothing else.
    const answers = new FormData(profileForm);
    const requiredFields = [
      "full_name",
      "zipcode",
      "phone_type",
      "lives_alone",
      "has_pets",
    ];
    const firstMissing = requiredFields.find(
      (name) => !String(answers.get(name) || "").trim()
    );
    if (firstMissing) {
      trackAnalyticsEvent("waitlist_profile_submit_error", {
        section_id: "welcome",
        error: "missing_required_field",
      });
      setProfileStatus("Please complete all required fields.", "error");
      profileForm
        .querySelector(`[name="${firstMissing}"]`)
        ?.focus();
      return;
    }

    // The form is novalidate (JS drives the flow), so check the optional
    // contact fields ourselves — but only once something has been typed into
    // them. Leaving either blank has to submit cleanly.
    const emailField = profileForm.querySelector("#email");
    if (emailField && emailField.value.trim() && !emailField.checkValidity()) {
      trackAnalyticsEvent("waitlist_profile_submit_error", {
        section_id: "welcome",
        error: "invalid_email",
      });
      setProfileStatus("Please enter a valid email address, or leave it blank.", "error");
      emailField.focus();
      return;
    }

    const phoneField = profileForm.querySelector(PHONE_INPUT_SELECTOR);
    if (phoneField && phoneField.value.trim() && !isValidWaitlistPhone(phoneField)) {
      trackAnalyticsEvent("waitlist_profile_submit_error", {
        section_id: "welcome",
        error: "invalid_phone",
      });
      setProfileStatus(
        isUsCountryCode(getPhoneCountryCode(phoneField))
          ? "Please enter a 10-digit US phone number, or leave it blank."
          : "Please enter your full phone number without the country code, or leave it blank.",
        "error",
      );
      phoneField.focus();
      return;
    }

    if (!endpoint) {
      trackAnalyticsEvent("waitlist_profile_submit_error", {
        section_id: "welcome",
        error: "missing_endpoint",
      });
      window.grandTrackWebsiteEvent?.("profile_submission_failed", {
        failure_reason: "missing_endpoint",
      });
      setProfileStatus("This form is not connected yet.", "error");
      return;
    }

    const payload = buildProfilePayload(profileForm);
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Saving...";
    setProfileStatus("", "neutral");
    let submitted = false;

    try {
      // Do not announce completion until Apps Script has returned `{ ok: true }`.
      // Profile answers are valuable lead data too, and the old optimistic path
      // could lose them while still revealing the confirmation panel.
      await submitWaitlist(endpoint, payload);
      submitted = true;
      firePixelConversion("CompleteRegistration", "Lead");

      // Only good-fit alpha candidates see the scheduling link: an iPhone-using
      // caregiver whose loved one lives alone and has no pets. Everyone else still
      // has their answers saved but lands on the "you're on the list" panel.
      const qualifies =
        payload.phone_type === "iphone" &&
        payload.lives_alone === "yes" &&
        payload.has_pets === "no";

      trackAnalyticsEvent("waitlist_profile_submit_success", {
        section_id: "welcome",
        submission_id: payload.submission_id,
        delivery_confirmed: true,
        qualified: qualifies,
      });
      window.grandTrackWebsiteEvent?.("profile_completed", {
        submission_id: payload.submission_id,
        delivery_confirmed: true,
        qualified: qualifies,
      });

      const panel = qualifies ? doneMessage : waitlistedMessage;
      if (panel) {
        (profileForm.closest("[data-profile-layout]") || profileForm).hidden = true;
        panel.hidden = false;
        panel.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        setProfileStatus("Thank you — we've got everything we need.", "success");
      }
    } catch (error) {
      console.warn(error);
      const failureReason = error?.failureReason || "network_or_script_error";
      trackAnalyticsEvent("waitlist_profile_submit_error", {
        section_id: "welcome",
        submission_id: payload.submission_id,
        error: failureReason,
      });
      window.grandTrackWebsiteEvent?.("profile_submission_failed", {
        submission_id: payload.submission_id,
        failure_reason: failureReason,
      });
      setProfileStatus("We couldn't save that yet. Please try again.", "error");
    } finally {
      button.textContent = originalLabel;
      if (!submitted) button.disabled = false;
    }
  });
}

setupClickTracking();
setupAnchorScrolling();
setupSectionViewTracking();
