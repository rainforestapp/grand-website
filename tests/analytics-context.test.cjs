const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const storage = new Map();
const sessionStorage = {
  getItem(key) {
    return storage.get(key) || null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
};
const window = {
  crypto,
  location: {
    pathname: "/",
    hash: "#waitlist",
    search:
      "?qa=1&rdt_cid=click-id&utm_medium=paid&utm_campaign=campaign-a&utm_content=ad-a",
  },
  sessionStorage,
};
const document = { referrer: "https://www.reddit.com/" };

vm.runInNewContext(fs.readFileSync("analytics-context.js", "utf8"), {
  Array,
  JSON,
  String,
  URL,
  URLSearchParams,
  Uint8Array,
  document,
  window,
});

const attribution = window.grandGetWebsiteAttribution();
assert.equal(attribution.utm_source, "reddit");
assert.equal(attribution.utm_campaign, "campaign-a");
assert.equal(attribution.utm_content, "ad-a");
assert.equal(attribution.has_rdt_cid, true);
assert.equal(attribution.qa_mode, true);

const candidateId = window.grandGetOrCreateWebsiteCandidateId();
assert.match(candidateId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
assert.equal(window.grandGetOrCreateWebsiteCandidateId(), candidateId);

// Simulate the query-string-free profile page in the same browser tab.
window.location.search = "";
assert.equal(window.grandIsWebsiteQaMode(), true);
assert.equal(window.grandGetWebsiteAttribution().utm_source, "reddit");

console.log("analytics context: 9 assertions passed");
