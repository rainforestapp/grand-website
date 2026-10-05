# Changelog

## 0.0.2.1 — 2026-10-05

- Pause direct booking: nobody is routed to the Calendly scheduling page, including people who clear every qualifier. Onboarding-call volume outran the time we have to run the calls, so this is a capacity limit rather than a fit one.
- Add `DIRECT_BOOKING_OPEN` to `script.js` as the single switch, defaulting to `false`. The post-profile panel choice reads `routedToBooking` (`qualifies && DIRECT_BOOKING_OPEN`), so every profile submitter sees the "You're on the list." panel.
- Keep scoring fit on every submission. `waitlist_profile_submit_success` and `profile_completed` still carry `qualified`, now alongside `routed_to_booking`, so the people we would have booked stay visible in analytics. Both are first-class properties in PostHog; sheet-side they ride inside `raw_payload`, so no new column and no Apps Script redeploy. (Those are the call-site names: `profile_completed` reaches PostHog as `website_profile_completed`, and `waitlist_profile_submit_success` is sheet-side only.)
- Keep the booking panel and its Calendly link in `welcome.html`, commented as intentionally unreachable. Reopening is flipping the flag plus updating the guard test that pins it, so the pause cannot lift by accident.
- Stop publishing `tests/` to the live site. The suite was being rsynced to GitHub Pages and served at `/tests/` with `robots.txt` set to `Allow: /`, so a test asserting on the booking URL would have put that link on a crawlable path and defeated the `noindex` on `welcome.html`.
- Run the test suite in CI. Until now the only workflow was the Pages deploy, so a change that broke a guard test reached production unchallenged.
- Reword the profile intro: it promised to "match you with the right next step" when every submitter now lands on the same panel.
- Tests: 56 → 71. The new `tests/direct-booking-pause.test.cjs` runs the post-submit block with the flag injected, so it covers both the paused routing and the one-flag-flip rollback, and pins the booking panel as present-but-hidden.

## 0.0.2.0 — 2026-09-26

- Replace the waitlist phone field's fixed `+1` label with a country picker: a native `<select>` of 236 countries defaulting to the United States, shown closed as a flag and dial code. Anyone outside the US previously had nowhere to put their country code.
- Give `welcome.html`'s optional phone field the same picker. Without one it ran through the country-aware helpers and rewrote an autofilled `+44 7700 900123` as `+1 (447) 700-9001`, and it left the two A/B arms asymmetric.
- Accept a non-US number under the same 10–15 total digits the Apps Script endpoint enforces, so nothing the field accepts is rejected server-side. Drop a country code the visitor marked explicitly (a leading `+`, or an access prefix immediately followed by the code) so it is not submitted twice. Anything else is taken literally: a national number can legitimately begin with its own country code and a leading zero is significant in Italy.
- Add `country_code` and `country` columns to the events sheet and a `waitlist_country_code_edit` event on a real change of country. Bind the waitlist's start events to the picker too, so a visitor who begins there is not missing from the funnel denominator.
- Add `countries.js`: ISO code, dial code and name for 236 countries as a delimited string (3.4 KB gzipped), with flags derived from the ISO code rather than shipped.
- Tests: 28 → 56.

## 0.0.1.0 — 2026-09-18

- Contain the homepage hero in a rounded frame aligned with the shared content width, retain inset text, and remove section divider lines.
- Use matching numbered rows for routine signals and emergency response steps.
- Use the original footer green for green accents and primary CTAs.
- Remove the header tagline on the homepage, welcome, privacy, and terms pages.
- Place worry-section copy before the phone image on desktop and mobile.
