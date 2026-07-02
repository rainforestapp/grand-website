# Grand Website

Static landing-page wireframe for Grand.

## Status

- Added a first-pass one-page wireframe for the public landing page.
- Positioning is companion-first for the older person, with family reassurance as the buyer story.
- The wireframe uses the existing Grand product language: warm surfaces, sage/clay accents, editorial type moments, privacy by default, and no surveillance framing.
- Added an optimized hero image from the selected Pexels option: Moe Magners photo `pexels-moe-magners-5335290.jpg`, resized to 2400px wide at `assets/hero-pexels-moe-magners-5335290.jpg`.
- Deployed the static page with GitHub Pages from the `gh-pages` branch under `rainforestapp/grand-website`.
- Configured GitHub Pages for the canonical custom domain `www.grandeldercare.com`, with DNSimple records pointing `www` to `rainforestapp.github.io` and the apex domain to GitHub Pages A/AAAA records. GitHub is issuing a certificate for both `www.grandeldercare.com` and `grandeldercare.com`.
- Refined the landing-page copy after review feedback, including more specific music examples, clearer reminder language, and replacing the abstract product preview with concrete Grace app ideas.
- Reframed the landing page around the broader Grand system: Grace is the smart speaker companion, and optional Grand Satellites add home tracking.
- Added a "How Grand works" section that explains Grace as the smart speaker and Grand Satellites as the optional home-tracking add-on.
- Added a Grand satellites/home-tracking section focused on daily rhythm, routine changes, and filtered emergency-like alerts without cameras or live feeds.
- Split use cases into "Ask Grace" and "Grand notices" so companion moments and home-tracking moments can sit together without blurring their roles.
- Replaced the abstract satellite floor-plan with resized real Grand iOS app screenshots from `../grand-ios/docs/screenshots`: `ios-home.png` and `pr1-settings-index.png`.
- Simplified the hero headline and strapline so first-time readers understand the promise without needing prior context for Grand, Grace, or satellites.
- Wired the waitlist form for a Google Sheets backend via Google Apps Script, including client-side email validation, status messaging, and browser/user-agent metadata capture.

## Open Locally

Open `index.html` in a browser. No build step is required.

## Waitlist Backend

The waitlist form posts to a Google Apps Script web app and appends rows to a Google Sheet.
The current configured Sheet is `Grand Waitlist`: https://docs.google.com/spreadsheets/d/1i2_lUmRSIVA1iN3zaE8mLrR-8QEpOUPKtM8Y6aHfw1w/edit

For a fresh setup:

1. Create a Google Sheet for the waitlist.
2. In the sheet, open Extensions -> Apps Script.
3. Paste the contents of `google-apps-script/waitlist.gs`.
4. Optional but recommended: paste the Google Sheet ID into `SPREADSHEET_ID` at the top of the Apps Script file.
5. Deploy as a Web app.
6. Set "Execute as" to yourself and "Who has access" to anyone.
7. Copy the `/exec` web app URL.
8. Paste that URL into `index.html` on the waitlist form's `data-waitlist-endpoint` attribute.

When updating the Apps Script code, use Deploy -> Manage deployments -> Edit -> New version. Saving the code alone does not update the deployed web app. Visiting the `/exec` URL directly should return JSON with `spreadsheet_url`, `sheet_name`, and `last_row`; this confirms which sheet/tab the script is writing to.

The client sends email, source, page URL, referrer, user agent, user-agent client hints where available, language, timezone, viewport, screen, connection hints, and other browser metadata. The request uses a simple `text/plain` POST because Google Apps Script web apps are easiest to call from a static GitHub Pages site without a CORS preflight.

## Current Sections

- Hero promise and waitlist CTA.
- Grand system overview for the base station, Grace, and optional satellites.
- Grace value proposition for the person at home, now framed as included with every Grand base station.
- Grand satellites/home-tracking value proposition with tangible iOS app screens.
- Family reassurance cards combining Grace engagement and Grand home-pattern summaries.
- Plain-language use cases split between "Ask Grace" and "Grand notices."
- Grace app ideas for music, reading, reminders, and family messages.
- Trust and privacy close.
- Waitlist form with validation and Google Sheets handoff.
