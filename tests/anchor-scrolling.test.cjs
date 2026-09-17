const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync("script.js", "utf8");

// script.js runs at module scope against a live DOM, so there is no import seam.
// Slice the anchor-scrolling helpers out and run them against a stub document.
// Fail loudly rather than silently testing an empty or wrong slice.
function slice(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `script.js no longer contains ${JSON.stringify(startMarker)}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `script.js no longer contains ${JSON.stringify(endMarker)} after the start marker`);
  const text = source.slice(start, end);
  assert.ok(text.length > 100, "extracted slice is implausibly short — markers have drifted");
  return text;
}

const helpers = slice("function getStickyHeaderOffset()", "\nfunction setupAnchorScrolling()");

// Minimal stand-ins for the only DOM surface these helpers touch.
function harness({ header = null, reducedMotion = false, scrollY = 0, targetTop = 0 } = {}) {
  const scrollCalls = [];
  const behaviorWrites = [];
  const documentElement = {
    style: {
      _v: "smooth",
      get scrollBehavior() {
        return this._v;
      },
      set scrollBehavior(v) {
        this._v = v;
        behaviorWrites.push(v);
      },
    },
  };
  const context = {
    Math,
    Element: class Element {},
    document: {
      documentElement,
      querySelector: (sel) => (sel === ".site-header" ? header : null),
      getElementById: () => null,
    },
    window: {
      scrollY,
      getComputedStyle: (el) => ({ position: el.position }),
      matchMedia: (query) => ({
        matches: query.includes("prefers-reduced-motion") && reducedMotion,
      }),
      scrollTo: (...args) => scrollCalls.push(args),
    },
  };
  vm.createContext(context);
  vm.runInContext(helpers, context);
  return {
    getStickyHeaderOffset: context.getStickyHeaderOffset,
    scrollToAnchorTarget: context.scrollToAnchorTarget,
    target: { getBoundingClientRect: () => ({ top: targetTop }) },
    scrollCalls,
    behaviorWrites,
    finalBehavior: () => documentElement.style.scrollBehavior,
  };
}

const stickyHeader = { position: "sticky", getBoundingClientRect: () => ({ height: 69.4 }) };

test("a sticky header reserves its height plus a 12px margin", () => {
  const h = harness({ header: stickyHeader });
  assert.equal(h.getStickyHeaderOffset(), 82); // ceil(69.4) + 12
});

test("a fixed header also reserves space", () => {
  const h = harness({
    header: { position: "fixed", getBoundingClientRect: () => ({ height: 50 }) },
  });
  assert.equal(h.getStickyHeaderOffset(), 62);
});

// homepage.css makes .site-header position:static under 700px. If this guard
// regresses, every anchor scroll on mobile stops ~82px short of its section.
test("a static header reserves nothing, so mobile anchors land on target", () => {
  const h = harness({
    header: { position: "static", getBoundingClientRect: () => ({ height: 69 }) },
  });
  assert.equal(h.getStickyHeaderOffset(), 0);
});

test("a missing header reserves nothing instead of throwing", () => {
  const h = harness({ header: null });
  assert.equal(h.getStickyHeaderOffset(), 0);
});

// The options object is built inside the vm context, so it has that realm's
// Object.prototype and deepEqual would reject it on identity alone. Read fields.
function onlyScrollOptions(scrollCalls) {
  assert.equal(scrollCalls.length, 1);
  assert.equal(scrollCalls[0].length, 1);
  const [options] = scrollCalls[0];
  return { top: options.top, behavior: options.behavior };
}

test("anchor scrolling offsets the target by the sticky header", () => {
  const h = harness({ header: stickyHeader, scrollY: 500, targetTop: 300 });
  h.scrollToAnchorTarget(h.target);
  const options = onlyScrollOptions(h.scrollCalls);
  assert.equal(options.top, 718); // 300 + 500 - 82
  assert.equal(options.behavior, "smooth");
});

test("anchor scrolling never asks for a negative offset", () => {
  const h = harness({ header: stickyHeader, scrollY: 0, targetTop: -400 });
  h.scrollToAnchorTarget(h.target);
  assert.equal(onlyScrollOptions(h.scrollCalls).top, 0);
});

// "instant" only landed in Safari 15.4 and throws a TypeError before that, so
// the reduced-motion path must suppress the animation via scroll-behavior and
// the positional scrollTo, never by passing behavior:"instant".
test("reduced motion jumps without passing the instant enum to scrollTo", () => {
  const h = harness({ header: stickyHeader, reducedMotion: true, scrollY: 100, targetTop: 200 });
  h.scrollToAnchorTarget(h.target);
  assert.deepEqual(h.scrollCalls, [[0, 218]]); // positional form, 200 + 100 - 82
  const passedInstant = h.scrollCalls.some(
    (args) => typeof args[0] === "object" && args[0]?.behavior === "instant",
  );
  assert.equal(passedInstant, false);
});

test("reduced motion restores the previous scroll-behavior afterwards", () => {
  const h = harness({ header: stickyHeader, reducedMotion: true });
  h.scrollToAnchorTarget(h.target);
  assert.deepEqual(h.behaviorWrites, ["auto", "smooth"]);
  assert.equal(h.finalBehavior(), "smooth");
});

test("without reduced motion the smooth path leaves scroll-behavior untouched", () => {
  const h = harness({ header: stickyHeader, reducedMotion: false });
  h.scrollToAnchorTarget(h.target);
  assert.deepEqual(h.behaviorWrites, []);
});
