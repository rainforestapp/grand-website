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
- Repositioned the entire page from companion-first to peace-of-mind / dignity-first, aimed squarely at the adult child (the buyer). This supersedes the companion-first framing above. **Why:** the product's MVP is a quiet, passive sensor system (a hub + sensors) that lets an adult child know their parent is okay without cameras, wearables, or anything that announces "you're old" — not a voice companion. The "Grace" companion concept and all companion features (music, reading aloud, trivia, conversation, family-message dictation) were removed because they describe a different product and were not in the MVP spec.
  - "Grand satellites" renamed to "Grand sensors"; the device story is now simply "the Grand hub + Grand sensors."
  - Hero now leads with the fear→relief promise: "She keeps her independence. You stop worrying."
  - Added a "Why not a wearable, button, or camera?" comparison block (the spec's strongest selling argument against existing options).
  - Trust close ties privacy directly to dignity and drops conversation-era rules; no pricing and no public mention of human-in-the-loop alert review, per product decision.
  - Reused the existing iOS screenshots (`assets/grand-ios-home.png`, `assets/grand-ios-settings.png`) — they already show the passive-sensing view with no "Grace" UI.

## Open Locally

Open `index.html` in a browser. No build step is required.

## Waitlist Backend

The waitlist form posts to a Google Apps Script web app and appends rows to a Google Sheet.

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

- Hero promise (independence for the parent, peace of mind for the child) and waitlist CTA.
- "How Grand works" overview of the Grand hub + Grand sensors, with a "nothing to wear / charge / no cameras" note.
- "What Grand pays attention to": everyday activity, the kitchen (meals), and a call for help.
- "Caregiver experience": the daily "she's okay" app view with real iOS app screens, plus a parent-perspective dignity note.
- Family reassurance cards grounded in sensing (activity, meals, urgent stillness alert).
- Dignity-contrast use cases: "What you see" vs. "What she notices."
- "Why not a wearable, button, or camera?" comparison block.
- Trust and privacy close (no cameras, no live feed, no audio to the cloud, nothing to wear or charge).
- Waitlist form with validation and Google Sheets handoff.
