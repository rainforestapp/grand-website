(function setupGrandAnalyticsContext(window, document) {
  "use strict";

  const ATTRIBUTION_STORAGE_KEY = "grand_first_touch_attribution";
  const CANDIDATE_ID_STORAGE_KEY = "grand_website_candidate_id";
  const UTM_KEYS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "utm_id",
  ];

  function readSessionValue(key) {
    try {
      return window.sessionStorage.getItem(key) || "";
    } catch {
      return "";
    }
  }

  function writeSessionValue(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {}
  }

  function isCandidateId(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value || ""),
    );
  }

  function createCandidateId() {
    if (typeof window.crypto?.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    if (typeof window.crypto?.getRandomValues !== "function") return "";

    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
      .slice(6, 8)
      .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  function getStoredCandidateId() {
    const candidateId = readSessionValue(CANDIDATE_ID_STORAGE_KEY);
    return isCandidateId(candidateId) ? candidateId : "";
  }

  function getOrCreateCandidateId() {
    const storedCandidateId = getStoredCandidateId();
    if (storedCandidateId) return storedCandidateId;

    const candidateId = createCandidateId();
    if (candidateId) writeSessionValue(CANDIDATE_ID_STORAGE_KEY, candidateId);
    return candidateId;
  }

  function clean(value, maxLength = 240) {
    return String(value || "").trim().slice(0, maxLength);
  }

  function referringDomain() {
    try {
      return clean(new URL(document.referrer).hostname.toLowerCase(), 160);
    } catch {
      return "";
    }
  }

  function inferredSource(params, referrerDomain) {
    const explicitSource = clean(params.get("utm_source")).toLowerCase();
    if (explicitSource) return explicitSource;
    if (params.has("fbclid")) return "fb";
    if (params.has("rdt_cid")) return "reddit";
    if (referrerDomain.includes("instagram")) return "ig";
    if (referrerDomain.includes("facebook") || referrerDomain === "fb.com") return "fb";
    if (referrerDomain.includes("reddit")) return "reddit";
    return "";
  }

  function isCurrentQaMode() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("qa") === "1" || params.get("utm_source")?.toLowerCase() === "qa";
    } catch {
      return false;
    }
  }

  function captureAttribution() {
    let params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      params = new URLSearchParams();
    }

    const initialReferringDomain = referringDomain();
    const attribution = {
      initial_referring_domain: initialReferringDomain,
      initial_landing_path: `${window.location.pathname}${window.location.hash || ""}`,
      has_fbclid: params.has("fbclid"),
      has_rdt_cid: params.has("rdt_cid"),
      qa_mode: isCurrentQaMode(),
    };

    UTM_KEYS.forEach((key) => {
      attribution[key] = clean(params.get(key));
    });
    attribution.utm_source = inferredSource(params, initialReferringDomain);
    attribution.attribution_type = attribution.utm_source
      ? params.get("utm_source")
        ? "utm"
        : params.has("fbclid") || params.has("rdt_cid")
          ? "click_id"
          : "referrer"
      : initialReferringDomain
        ? "referrer"
        : "direct";

    return attribution;
  }

  function readStoredAttribution() {
    try {
      const stored = JSON.parse(readSessionValue(ATTRIBUTION_STORAGE_KEY) || "null");
      return stored && typeof stored === "object" ? stored : null;
    } catch {
      return null;
    }
  }

  const firstTouchAttribution = readStoredAttribution() || captureAttribution();
  writeSessionValue(ATTRIBUTION_STORAGE_KEY, JSON.stringify(firstTouchAttribution));

  function isQaMode() {
    return Boolean(firstTouchAttribution.qa_mode || isCurrentQaMode());
  }

  window.grandGetWebsiteAttribution = function getWebsiteAttribution() {
    return {
      ...firstTouchAttribution,
      qa_mode: isQaMode(),
    };
  };
  window.grandGetStoredWebsiteCandidateId = getStoredCandidateId;
  window.grandGetOrCreateWebsiteCandidateId = getOrCreateCandidateId;
  window.grandCreateWebsiteSubmissionId = createCandidateId;
  window.grandIsWebsiteQaMode = isQaMode;
})(window, document);
