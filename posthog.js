(function setupGrandWebsiteAnalytics(window, document) {
  "use strict";

  const POSTHOG_PROJECT_TOKEN = "phc_mUSBnDUzt5xFcvdadqqDR9297UH94ttzvRhtRjdpLsrr";
  const POSTHOG_API_HOST = "https://eu.i.posthog.com";
  const POSTHOG_ASSET_URL = "https://eu-assets.i.posthog.com/static/1/array.js";
  const queuedEvents = [];
  let posthogReady = false;

  function getWebsiteContext() {
    const path = window.location.pathname;
    const isGrace = path === "/grace" || path.startsWith("/grace/");
    let pageType = "landing";

    if (path.endsWith("/welcome.html") || path === "/welcome.html") {
      pageType = "onboarding";
    } else if (path.endsWith("/privacy.html") || path.endsWith("/terms.html")) {
      pageType = "legal";
    }

    return {
      platform: "web",
      analytics_surface: "marketing_website",
      website_experience: isGrace ? "grace" : "grand",
      website_page_type: pageType,
    };
  }

  function captureWebsiteEvent(eventName, properties) {
    if (!eventName) return;

    const event = {
      name: `website_${eventName}`,
      properties: {
        ...getWebsiteContext(),
        ...(properties || {}),
      },
    };

    if (!posthogReady || typeof window.posthog?.capture !== "function") {
      queuedEvents.push(event);
      return;
    }

    window.posthog.capture(event.name, event.properties);
  }

  // Page-specific scripts use this narrow wrapper instead of accessing the
  // PostHog SDK directly. No form values or other personal data are accepted.
  window.grandTrackWebsiteEvent = captureWebsiteEvent;

  function getClickLocation(link) {
    return (
      link.closest("section")?.id ||
      (link.closest("header") ? "header" : "") ||
      (link.closest("footer") ? "footer" : "") ||
      "page"
    );
  }

  document.addEventListener(
    "click",
    function trackMeaningfulWebsiteClick(event) {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link) return;

      const href = link.getAttribute("href") || "";
      const label = (link.getAttribute("aria-label") || link.textContent || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 120);
      const properties = {
        cta_label: label,
        cta_location: getClickLocation(link),
      };

      if (href.includes("calendly.com")) {
        captureWebsiteEvent("onboarding_call_clicked", properties);
      } else if (href.startsWith("mailto:")) {
        captureWebsiteEvent("contact_clicked", {
          ...properties,
          contact_method: "email",
        });
      } else if (link.classList.contains("button") || link.classList.contains("nav-cta")) {
        captureWebsiteEvent("cta_clicked", {
          ...properties,
          cta_target: href.startsWith("#") ? href : "other_page",
        });
      }
    },
    { capture: true },
  );

  function initializePostHog() {
    if (typeof window.posthog?.init !== "function") return;

    const websiteContext = getWebsiteContext();
    window.posthog.init(POSTHOG_PROJECT_TOKEN, {
      api_host: POSTHOG_API_HOST,
      ui_host: "https://eu.posthog.com",
      defaults: "2026-05-30",
      cookieless_mode: "always",
      person_profiles: "never",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: true,
      capture_exceptions: false,
      disable_session_recording: true,
      advanced_disable_flags: true,
      loaded: function onPostHogLoaded(posthog) {
        posthogReady = true;
        posthog.register(websiteContext);
        posthog.capture("$pageview", websiteContext);

        queuedEvents.splice(0).forEach(function flushQueuedEvent(event) {
          posthog.capture(event.name, event.properties);
        });
      },
    });
  }

  const sdkScript = document.createElement("script");
  sdkScript.async = true;
  sdkScript.src = POSTHOG_ASSET_URL;
  sdkScript.onload = initializePostHog;
  document.head.appendChild(sdkScript);
})(window, document);
