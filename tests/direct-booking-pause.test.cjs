const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync("script.js", "utf8");
const welcome = fs.readFileSync("welcome.html", "utf8");

// Same source-slicing seam the other script.js tests use: the routing lives
// inside a submit handler with no module boundary, so lift the flag and the
// two expressions that consume it out by markers and run them standalone.
function slice(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `script.js no longer contains ${JSON.stringify(startMarker)}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `script.js no longer contains ${JSON.stringify(endMarker)} after the start marker`);
  return source.slice(start, end + endMarker.length);
}

const flag = slice("const DIRECT_BOOKING_OPEN =", ";");
const routing = slice("const qualifies =", "const routedToBooking = qualifies && DIRECT_BOOKING_OPEN;");

function route(payload) {
  const context = { payload };
  vm.createContext(context);
  vm.runInContext(`${flag}\n${routing}\nresult = { qualifies, routedToBooking };`, context);
  return context.result;
}

const idealCandidate = { phone_type: "iphone", lives_alone: "yes", has_pets: "no" };

// The point of the pause: call volume outran our capacity, so nobody is routed
// to Calendly — not even someone who clears all three qualifiers.
test("nobody is routed to direct booking while the pause is on", () => {
  assert.equal(route(idealCandidate).routedToBooking, false);
  assert.equal(route({ ...idealCandidate, phone_type: "android" }).routedToBooking, false);
  assert.equal(route({ ...idealCandidate, lives_alone: "no" }).routedToBooking, false);
  assert.equal(route({ ...idealCandidate, has_pets: "yes" }).routedToBooking, false);
  assert.equal(route({}).routedToBooking, false);
});

// Fit scoring is untouched by the pause — we still want to know, from the
// analytics events, who we would have booked once capacity frees up.
test("fit is still scored while booking is paused", () => {
  assert.equal(route(idealCandidate).qualifies, true);
  assert.equal(route({ ...idealCandidate, phone_type: "android" }).qualifies, false);
  assert.equal(route({ ...idealCandidate, lives_alone: "no" }).qualifies, false);
  assert.equal(route({ ...idealCandidate, has_pets: "yes" }).qualifies, false);
});

// Guard the two ways the pause could be silently undone: flipping the flag, or
// re-pointing the panel choice back at `qualifies`.
test("the panel choice stays gated on the flag", () => {
  assert.match(
    source,
    /const DIRECT_BOOKING_OPEN = false;/,
    "DIRECT_BOOKING_OPEN is no longer false — direct booking has been reopened",
  );
  assert.match(
    source,
    /const panel = routedToBooking \? doneMessage : waitlistedMessage;/,
    "the panel choice no longer reads routedToBooking — the pause can be bypassed",
  );
});

// Paused, not deleted: the panel and its Calendly link stay in the page so
// re-enabling is a one-line flag flip.
test("the booking panel is kept in welcome.html", () => {
  assert.match(welcome, /data-profile-done/);
  assert.match(welcome, /calendly\.com\/d\/dz47-vkm-rb2\/grand-early-tester-program/);
  assert.match(welcome, /data-profile-waitlisted/);
});

// ---------------------------------------------------------------------------
// The slice above proves the routing expression; this wider slice runs the
// whole post-submit block — fit scoring, both analytics events, and the panel
// choice — so the properties we promise analytics and the panel a visitor
// actually sees are asserted from the real source rather than from a regex.
// ---------------------------------------------------------------------------

const outcomeBlock = slice(
  "const qualifies =",
  "const panel = routedToBooking ? doneMessage : waitlistedMessage;",
);
assert.ok(
  outcomeBlock.includes("waitlist_profile_submit_success") &&
    outcomeBlock.includes("profile_completed"),
  "extracted slice does not look like the post-submit block — markers have drifted",
);

const DONE_PANEL = { name: "done" };
const WAITLISTED_PANEL = { name: "waitlisted" };

// `bookingOpen` is injected rather than sliced on purpose. The tests above pin
// the shipped flag to `false`; these ones have to be able to run the same code
// with the flag flipped, because "reopening is one flag flip" is a promise the
// README makes and nothing else exercises.
function submitOutcome(payload, bookingOpen) {
  const analyticsEvents = [];
  const websiteEvents = [];
  const context = {
    payload,
    doneMessage: DONE_PANEL,
    waitlistedMessage: WAITLISTED_PANEL,
    trackAnalyticsEvent(eventType, details) {
      analyticsEvents.push({ eventType, details });
    },
    window: {
      grandTrackWebsiteEvent(eventType, details) {
        websiteEvents.push({ eventType, details });
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(
    `const DIRECT_BOOKING_OPEN = ${bookingOpen};\n${outcomeBlock}\nresult = { qualifies, routedToBooking, panel };`,
    context,
  );
  return { ...context.result, analyticsEvents, websiteEvents };
}

const submission = {
  ...idealCandidate,
  submission_id: "223e4567-e89b-42d3-a456-426614174000",
};

// The user-visible point of the pause: the person who would previously have
// been fast-tracked to Calendly now sees the same "You're on the list." panel
// as everyone else. Asserting the panel object, not the source text, is what
// catches the panel choice being re-pointed at `doneMessage` some other way.
test("a qualifier sees the waitlisted panel while booking is paused", () => {
  assert.equal(submitOutcome(submission, false).panel, WAITLISTED_PANEL);
});

test("a non-qualifier still sees the waitlisted panel while booking is paused", () => {
  const outcome = submitOutcome({ ...submission, phone_type: "android" }, false);
  assert.equal(outcome.panel, WAITLISTED_PANEL);
  assert.equal(outcome.qualifies, false);
});

// Paused, not deleted. Without this the pause is indistinguishable from
// hardcoding `routedToBooking = false`, and the one-flag-flip rollback the
// README promises could rot unnoticed until the day we need it.
test("flipping the flag back to true routes a qualifier to the booking panel", () => {
  const outcome = submitOutcome(submission, true);
  assert.equal(outcome.routedToBooking, true);
  assert.equal(outcome.panel, DONE_PANEL);
});

// Reopening must not widen who gets booked: the three-part qualifier is still
// the gate once the flag is back on.
test("flipping the flag back to true still excludes non-qualifiers", () => {
  for (const override of [
    { phone_type: "android" },
    { lives_alone: "no" },
    { has_pets: "yes" },
    { phone_type: "" },
  ]) {
    const outcome = submitOutcome({ ...submission, ...override }, true);
    assert.equal(outcome.routedToBooking, false, `${JSON.stringify(override)} was routed to booking`);
    assert.equal(outcome.panel, WAITLISTED_PANEL);
  }
});

// "We keep scoring it so we can see who we would have booked" only holds if the
// properties actually ride along on the events. A qualifier during the pause is
// the one combination where the two differ, so it is the one that proves both
// are really being reported.
test("the success analytics event reports qualified and routed_to_booking separately", () => {
  const outcome = submitOutcome(submission, false);
  const success = outcome.analyticsEvents.find(
    (event) => event.eventType === "waitlist_profile_submit_success",
  );
  assert.ok(success, "waitlist_profile_submit_success was not emitted");
  assert.equal(success.details.qualified, true);
  assert.equal(success.details.routed_to_booking, false);
});

test("profile_completed reports qualified and routed_to_booking separately", () => {
  const outcome = submitOutcome(submission, false);
  const completed = outcome.websiteEvents.find(
    (event) => event.eventType === "profile_completed",
  );
  assert.ok(completed, "profile_completed was not emitted");
  assert.equal(completed.details.qualified, true);
  assert.equal(completed.details.routed_to_booking, false);
});

// Adding a property must not have displaced the ones the funnel already joins
// on. `submission_id` is how an event is reconciled with the sheet row.
test("adding routed_to_booking did not drop the existing event properties", () => {
  const outcome = submitOutcome(submission, false);
  for (const event of [outcome.analyticsEvents[0], outcome.websiteEvents[0]]) {
    assert.equal(event.details.submission_id, submission.submission_id);
    assert.equal(event.details.delivery_confirmed, true);
  }
  assert.equal(outcome.analyticsEvents[0].details.section_id, "welcome");
});

test("both events report routed_to_booking true once the flag is flipped", () => {
  const outcome = submitOutcome(submission, true);
  assert.equal(outcome.analyticsEvents[0].details.routed_to_booking, true);
  assert.equal(outcome.websiteEvents[0].details.routed_to_booking, true);
});

// Nothing un-hides the booking panel anymore, so the `hidden` attribute is the
// only thing keeping a kept-but-unreachable Calendly CTA off the page. Without
// it every profile visitor would see the fast-track panel permanently.
test("the unreachable booking panel stays hidden in the markup", () => {
  assert.match(welcome, /<div class="profile-done" data-profile-done hidden>/);
  assert.match(welcome, /<div class="profile-done" data-profile-waitlisted hidden>/);
});

// The kept Calendly link has to stay inside the hidden panel. Hoisting it out —
// into the form, or the footer — would reopen booking without touching the flag.
test("the Calendly link is only reachable from inside the hidden booking panel", () => {
  const calendly = welcome.indexOf("https://calendly.com/d/dz47-vkm-rb2");
  const panelStart = welcome.indexOf("data-profile-done");
  const panelEnd = welcome.indexOf("data-profile-waitlisted");
  assert.notEqual(calendly, -1, "the Calendly link was removed rather than kept");
  assert.ok(
    calendly > panelStart && calendly < panelEnd,
    "the Calendly link escaped the hidden booking panel",
  );
  assert.equal(
    welcome.split("https://calendly.com/d/dz47-vkm-rb2").length - 1,
    1,
    "a second Calendly link appeared in welcome.html",
  );
});

// The README claims the Calendly link is no longer reachable from the site, not
// just from this page — so no other page may link to it either.
test("no other page links to Calendly", () => {
  for (const page of ["index.html", "privacy.html", "terms.html"]) {
    assert.doesNotMatch(
      fs.readFileSync(page, "utf8"),
      /calendly\.com/i,
      `${page} links to Calendly while direct booking is paused`,
    );
  }
});
