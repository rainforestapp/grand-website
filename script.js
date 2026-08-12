const waitlistForm = document.querySelector("[data-waitlist-form]");
const profileForm = document.querySelector("[data-profile-form]");
const analyticsEndpoint =
  (waitlistForm || profileForm)?.dataset.waitlistEndpoint?.trim() || "";
// Grand's alpha signup collects a phone number instead of an email. Tagging
// every payload routes this product's signups/profiles/events into their own
// spreadsheet tabs, keeping them a clean break from the historical email data.
const PRODUCT = "grandphone";
const trackedSections = ["problem", "system", "attention", "tracking", "response", "waitlist"];
const anchorScrollRetries = [0, 120, 360, 760];
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

function getViewportPayload() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
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
  const top = target.getBoundingClientRect().top + window.scrollY - getStickyHeaderOffset();

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

    anchorScrollRetries.forEach((delay, index) => {
      window.setTimeout(() => {
        scrollToAnchorTarget(target, index === 0 ? "smooth" : "auto");
      }, delay);
    });

    if (!target.hasAttribute("tabindex")) {
      target.setAttribute("tabindex", "-1");
    }
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
  });

  window.addEventListener("load", () => {
    const target = getHashTarget(window.location.hash || "");
    if (!target) return;

    anchorScrollRetries.forEach((delay) => {
      window.setTimeout(() => {
        scrollToAnchorTarget(target, "auto");
      }, delay);
    });
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

function getUsPhoneDigits(value) {
  const rawDigits = String(value || "").replace(/\D/g, "");
  const digits = rawDigits.length > 10 && rawDigits.startsWith("1")
    ? rawDigits.slice(1)
    : rawDigits;

  return digits.slice(0, 10);
}

function formatUsPhone(digits) {
  const value = getUsPhoneDigits(digits);
  if (!value) return "";
  if (value.length < 4) return `(${value}`;
  if (value.length < 7) return `(${value.slice(0, 3)}) ${value.slice(3)}`;
  return `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6)}`;
}

function getNormalizedPhoneDigitCountBeforeCursor(value, cursorPosition) {
  const allDigits = String(value || "").replace(/\D/g, "");
  const cursorDigits = String(value || "")
    .slice(0, cursorPosition)
    .replace(/\D/g, "");
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
  const cursorPosition = input.selectionStart;
  const digitCountBeforeCursor = typeof cursorPosition === "number"
    ? getNormalizedPhoneDigitCountBeforeCursor(input.value, cursorPosition)
    : null;
  const formattedValue = formatUsPhone(input.value);

  input.value = formattedValue;

  if (
    digitCountBeforeCursor !== null &&
    document.activeElement === input &&
    typeof input.setSelectionRange === "function"
  ) {
    const nextCursorPosition = getCaretPositionForPhoneDigitCount(
      formattedValue,
      digitCountBeforeCursor,
    );
    input.setSelectionRange(nextCursorPosition, nextCursorPosition);
  }
}

function getWaitlistPhoneSubmissionValue(input) {
  return `+1 ${formatUsPhone(input.value)}`;
}

function isValidWaitlistPhone(input) {
  return getUsPhoneDigits(input.value).length === 10;
}

function getValueLengthBucket(value) {
  const length = String(value || "").trim().length;

  if (length === 0) return "0";
  if (length < 6) return "1-5";
  if (length < 12) return "6-11";
  if (length < 24) return "12-23";
  return "24+";
}

function getPhoneFieldState(input) {
  const value = input.value.trim();

  return {
    has_value: value.length > 0,
    looks_valid: isValidWaitlistPhone(input),
    value_length_bucket: getValueLengthBucket(value),
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
  try {
    if (typeof window.fbq === "function") window.fbq("track", metaEvent);
  } catch {}
  try {
    if (typeof window.rdt === "function") window.rdt("track", redditEvent);
  } catch {}
}

function buildWaitlistPayload(phone) {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  return {
    type: "waitlist_signup",
    product: PRODUCT,
    phone,
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
  };
}

function submitWaitlist(endpoint, payload, options = {}) {
  const { waitForCompletion = true } = options;
  const body = JSON.stringify(payload);

  if (!waitForCompletion && navigator.sendBeacon) {
    const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
    if (navigator.sendBeacon(endpoint, blob)) {
      return Promise.resolve();
    }
  }

  const request = fetch(endpoint, {
    method: "POST",
    mode: "no-cors",
    keepalive: !waitForCompletion,
    headers: {
      "Content-Type": "text/plain",
    },
    body,
  });

  return waitForCompletion ? request : request.catch(() => {});
}

if (waitlistForm) {
  const input = waitlistForm.querySelector("input[type='tel']");
  const button = waitlistForm.querySelector("button[type='submit']");
  let trackedPhoneInputStart = false;

  function syncWaitlistPhoneState(options = {}) {
    if (!input || !button) return;

    const hasValue = getUsPhoneDigits(input.value).length > 0;
    const isValid = isValidWaitlistPhone(input);
    const showError = Boolean(options.showError && hasValue && !isValid);

    button.disabled = !isValid;
    input.setAttribute("aria-invalid", showError ? "true" : "false");

    if (showError) {
      setWaitlistStatus("Enter a 10-digit US phone number.", "error");
    } else if (!options.preserveStatus) {
      setWaitlistStatus("", "neutral");
    }
  }

  if (input && button) {
    syncWaitlistPhoneState();

    input.addEventListener(
      "focus",
      () => {
        trackAnalyticsEvent("waitlist_phone_focus", {
          section_id: "waitlist",
        });
      },
      { once: true },
    );

    input.addEventListener("input", () => {
      formatPhoneInput(input);
      syncWaitlistPhoneState();

      if (trackedPhoneInputStart || input.value.trim().length === 0) return;

      trackedPhoneInputStart = true;
      trackAnalyticsEvent("waitlist_phone_input_start", {
        section_id: "waitlist",
        ...getPhoneFieldState(input),
      });
    });

    input.addEventListener("blur", () => {
      formatPhoneInput(input);
      syncWaitlistPhoneState({ showError: true });

      trackAnalyticsEvent("waitlist_phone_blur", {
        section_id: "waitlist",
        ...getPhoneFieldState(input),
      });
    });
  }

  waitlistForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const endpoint = waitlistForm.dataset.waitlistEndpoint?.trim();
    if (!input || !button) return;

    trackAnalyticsEvent("waitlist_submit_attempt", {
      section_id: "waitlist",
    });

    formatPhoneInput(input);
    const phone = getWaitlistPhoneSubmissionValue(input);
    if (!isValidWaitlistPhone(input)) {
      trackAnalyticsEvent("waitlist_submit_error", {
        section_id: "waitlist",
        error: "invalid_phone",
      });
      syncWaitlistPhoneState({ showError: true });
      input.focus();
      return;
    }

    if (!endpoint) {
      trackAnalyticsEvent("waitlist_submit_error", {
        section_id: "waitlist",
        error: "missing_endpoint",
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
      const payload = buildWaitlistPayload(phone);
      void submitWaitlist(endpoint, payload, { waitForCompletion: false });
      waitlistForm.reset();
      submitted = true;
      trackAnalyticsEvent("waitlist_submit_success", {
        section_id: "waitlist",
      });
      firePixelConversion("Lead", "SignUp");
      setWaitlistStatus("You're on the list. Taking you to a couple of quick questions...", "success");

      // Progressive profiling: hand off to the profile page to collect
      // qualifying details, without ever gating the phone number behind them.
      // The phone travels via sessionStorage (not the URL) so it isn't leaked
      // into the profile page's referrer/pixel traffic. The success message
      // above stays visible if navigation is blocked.
      try {
        window.sessionStorage.setItem("grand_signup_phone", phone);
      } catch {}
      window.location.assign("welcome.html");
    } catch (error) {
      console.warn(error);
      trackAnalyticsEvent("waitlist_submit_error", {
        section_id: "waitlist",
        error: "network_or_script_error",
      });
      setWaitlistStatus("Something went wrong. Please try again.", "error");
    } finally {
      delete waitlistForm.dataset.submitting;
      button.textContent = originalLabel;
      if (!submitted) syncWaitlistPhoneState({ preserveStatus: true });
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
  let phone = "";
  try {
    phone = window.sessionStorage.getItem("grand_signup_phone") || "";
  } catch {}

  const data = new FormData(form);

  return {
    type: "waitlist_profile",
    product: PRODUCT,
    phone,
    // Optional: phone stays the identity; email is captured only if the visitor
    // chooses to give it, and lands in the row's existing email column.
    email: String(data.get("email") || "").trim(),
    source: "grand-website",
    full_name: String(data.get("full_name") || "").trim(),
    zipcode: String(data.get("zipcode") || "").trim(),
    reason_interested: String(data.get("reason_interested") || "").trim(),
    lives_alone: String(data.get("lives_alone") || ""),
    alpha_tester: String(data.get("alpha_tester") || ""),
    profile_completed_at: new Date().toISOString(),
    page_url: window.location.href,
    referrer: document.referrer || "",
  };
}

if (profileForm) {
  const doneMessage = document.querySelector("[data-profile-done]");

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = profileForm.querySelector("button[type='submit']");
    const endpoint = profileForm.dataset.waitlistEndpoint?.trim();
    if (!button) return;

    trackAnalyticsEvent("waitlist_profile_submit_attempt", {
      section_id: "welcome",
    });

    if (!endpoint) {
      trackAnalyticsEvent("waitlist_profile_submit_error", {
        section_id: "welcome",
        error: "missing_endpoint",
      });
      setProfileStatus("This form is not connected yet.", "error");
      return;
    }

    const payload = buildProfilePayload(profileForm);
    // Fire-and-forget, like the initial signup capture: sendBeacon (with a
    // keepalive fetch fallback) so the confirmation shows instantly instead of
    // blocking on the Apps Script round trip — that call holds a script lock and
    // runs a signup-row retry loop that can take ~1.4s. The backend appends a
    // fallback row if the match is missed, so optional profile answers are never
    // lost.
    void submitWaitlist(endpoint, payload, { waitForCompletion: false });
    firePixelConversion("CompleteRegistration", "Lead");
    trackAnalyticsEvent("waitlist_profile_submit_success", {
      section_id: "welcome",
    });

    if (doneMessage) {
      (profileForm.closest("[data-profile-layout]") || profileForm).hidden = true;
      doneMessage.hidden = false;
      doneMessage.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      setProfileStatus("Thank you — we've got everything we need.", "success");
    }
  });
}

setupClickTracking();
setupAnchorScrolling();
setupSectionViewTracking();
