# Changelog

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
