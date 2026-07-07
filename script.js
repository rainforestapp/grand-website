const waitlistForm = document.querySelector("[data-waitlist-form]");
const analyticsEndpoint = waitlistForm?.dataset.waitlistEndpoint?.trim() || "";
const trackedSections = ["problem", "system", "attention", "tracking", "response", "waitlist"];
let fallbackSessionId = "";

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

async function getUserAgentData() {
  if (!navigator.userAgentData) return null;

  const base = {
    brands: navigator.userAgentData.brands,
    mobile: navigator.userAgentData.mobile,
    platform: navigator.userAgentData.platform,
  };

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

async function buildWaitlistPayload(email) {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const userAgentData = await getUserAgentData();

  return {
    type: "waitlist_signup",
    email,
    source: "grand-website",
    submitted_at: new Date().toISOString(),
    page_url: window.location.href,
    referrer: document.referrer || "",
    user_agent: navigator.userAgent,
    user_agent_data: userAgentData,
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
  };
}

async function submitWaitlist(endpoint, payload) {
  await fetch(endpoint, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain",
    },
    body: JSON.stringify(payload),
  });
}

if (waitlistForm) {
  const input = waitlistForm.querySelector("input[type='email']");

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
      const payload = await buildWaitlistPayload(email);
      await submitWaitlist(endpoint, payload);
      waitlistForm.reset();
      trackAnalyticsEvent("waitlist_submit_success", {
        section_id: "waitlist",
      });
      setWaitlistStatus("You're on the list. We'll let you know when Grand is available.", "success");
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

setupClickTracking();
setupSectionViewTracking();
