const waitlistForm = document.querySelector("[data-waitlist-form]");
const profileForm = document.querySelector("[data-profile-form]");
const analyticsEndpoint =
  (waitlistForm || profileForm)?.dataset.waitlistEndpoint?.trim() || "";
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

function getValueLengthBucket(value) {
  const length = String(value || "").trim().length;

  if (length === 0) return "0";
  if (length < 6) return "1-5";
  if (length < 12) return "6-11";
  if (length < 24) return "12-23";
  return "24+";
}

function getEmailFieldState(input) {
  const value = input.value.trim();

  return {
    has_value: value.length > 0,
    looks_valid: value.length > 0 && input.validity.valid,
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

function buildWaitlistPayload(email) {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  return {
    type: "waitlist_signup",
    email,
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
  const input = waitlistForm.querySelector("input[type='email']");
  let trackedEmailInputStart = false;

  if (input) {
    input.addEventListener(
      "focus",
      () => {
        trackAnalyticsEvent("waitlist_email_focus", {
          section_id: "waitlist",
        });
      },
      { once: true },
    );

    input.addEventListener("input", () => {
      if (trackedEmailInputStart || input.value.trim().length === 0) return;

      trackedEmailInputStart = true;
      trackAnalyticsEvent("waitlist_email_input_start", {
        section_id: "waitlist",
        ...getEmailFieldState(input),
      });
    });

    input.addEventListener("blur", () => {
      trackAnalyticsEvent("waitlist_email_blur", {
        section_id: "waitlist",
        ...getEmailFieldState(input),
      });
    });
  }

  waitlistForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = waitlistForm.querySelector("button[type='submit']");
    const endpoint = waitlistForm.dataset.waitlistEndpoint?.trim();
    if (!input || !button) return;

    trackAnalyticsEvent("waitlist_submit_attempt", {
      section_id: "waitlist",
    });

    const email = input.value.trim();
    if (!email || !input.validity.valid) {
      trackAnalyticsEvent("waitlist_submit_error", {
        section_id: "waitlist",
        error: "invalid_email",
      });
      setWaitlistStatus("Enter a valid email address.", "error");
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
    button.disabled = true;
    button.textContent = "Joining...";
    setWaitlistStatus("", "neutral");

    try {
      const payload = buildWaitlistPayload(email);
      void submitWaitlist(endpoint, payload, { waitForCompletion: false });
      waitlistForm.reset();
      trackAnalyticsEvent("waitlist_submit_success", {
        section_id: "waitlist",
      });
      firePixelConversion("Lead", "SignUp");
      setWaitlistStatus("You're on the list. Taking you to a couple of quick questions...", "success");

      // Progressive profiling: hand off to the profile page to collect
      // qualifying details, without ever gating the email behind them. The
      // email travels via sessionStorage (not the URL) so it isn't leaked into
      // the profile page's referrer/pixel traffic. The success message above
      // stays visible if navigation is blocked.
      try {
        window.sessionStorage.setItem("grand_signup_email", email);
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
      button.disabled = false;
      button.textContent = originalLabel;
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
  let email = "";
  try {
    email = window.sessionStorage.getItem("grand_signup_email") || "";
  } catch {}

  const data = new FormData(form);

  return {
    type: "waitlist_profile",
    email,
    source: "grand-website",
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

    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Saving...";
    setProfileStatus("", "neutral");

    try {
      const payload = buildProfilePayload(profileForm);
      await submitWaitlist(endpoint, payload);
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
    } catch (error) {
      console.warn(error);
      trackAnalyticsEvent("waitlist_profile_submit_error", {
        section_id: "welcome",
        error: "network_or_script_error",
      });
      setProfileStatus("Something went wrong. Please try again.", "error");
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });
}

setupClickTracking();
setupAnchorScrolling();
setupSectionViewTracking();
