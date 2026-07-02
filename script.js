const waitlistForm = document.querySelector("[data-waitlist-form]");

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
    keepalive: true,
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
  });
}

if (waitlistForm) {
  waitlistForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const input = waitlistForm.querySelector("input[type='email']");
    const button = waitlistForm.querySelector("button[type='submit']");
    const endpoint = waitlistForm.dataset.waitlistEndpoint?.trim();
    if (!input || !button) return;

    const email = input.value.trim();
    if (!email || !input.validity.valid) {
      setWaitlistStatus("Enter a valid email address.", "error");
      input.focus();
      return;
    }

    if (!endpoint) {
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
      setWaitlistStatus("You're on the list. We'll let you know when Grand is available.", "success");
    } catch (error) {
      console.warn(error);
      setWaitlistStatus("Something went wrong. Please try again.", "error");
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });
}
