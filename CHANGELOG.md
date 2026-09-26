# Changelog

## 0.0.2.0 — 2026-09-26

- Make the waitlist phone field's country code editable. It was a fixed `+1` label, which left anyone outside the US with nowhere to put their country code and no way to tell whether typing one into the number field would work. The box defaults to `+1`, so the US path is unchanged: same `(555) 123-4567` grouping, same 10-digit rule.
- Accept a non-US number under the same 10–15 total digits the Apps Script endpoint enforces, so nothing the field accepts is rejected server-side. Drop a country code the visitor marked explicitly (a leading `+`, or an access prefix immediately followed by the code) so it is not submitted twice. Anything else is taken literally: a national number can legitimately begin with its own country code and a leading zero is significant in Italy.
- Give `welcome.html`'s optional phone field the same country box. Without one it ran through the country-aware helpers and rewrote an autofilled `+44 7700 900123` as `+1 (447) 700-9001`, and it left the two A/B arms asymmetric.
- Add a `country_code` column to the events sheet and a `waitlist_country_code_edit` event that fires on a real change of country, so the question this feature exists to answer can be read off a breakdown. Bind the waitlist's start events to the country box too, so a visitor who begins there is not missing from the funnel denominator.
- Add 25 tests covering the phone helpers, the two-page markup contract, and the regressions found in review.

## 0.0.1.0 — 2026-09-18

- Contain the homepage hero in a rounded frame aligned with the shared content width, retain inset text, and remove section divider lines.
- Use matching numbered rows for routine signals and emergency response steps.
- Use the original footer green for green accents and primary CTAs.
- Remove the header tagline on the homepage, welcome, privacy, and terms pages.
- Place worry-section copy before the phone image on desktop and mobile.
