# Grand Website

Static landing-page wireframe for Grand.

## Status

- Added a first-pass one-page wireframe for the public landing page.
- Positioning is companion-first for the older person, with family reassurance as the buyer story.
- The wireframe uses the existing Grand product language: warm surfaces, sage/clay accents, editorial type moments, privacy by default, and no surveillance framing.
- Added an optimized hero image from the selected Pexels option: Moe Magners photo `pexels-moe-magners-5335290.jpg`, resized to 2400px wide at `assets/hero-pexels-moe-magners-5335290.jpg`.
- Deployed the static page with GitHub Pages from the `gh-pages` branch under `rainforestapp/grand-website`; the `Deploy GitHub Pages` workflow publishes `main` to `gh-pages` automatically when `main` changes.
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
  - Added an upfront "The worry" problem section after the hero that sets up the fear and contrasts pendants/watches, call-for-help buttons, and cameras before presenting the solution. (This replaced a later "Why not a wearable, button, or camera?" comparison block, which said the same thing twice once the problem was framed up front.)
  - Trust close ties privacy directly to dignity and drops conversation-era rules; no pricing and no public mention of human-in-the-loop alert review, per product decision. *(The human-in-the-loop decision was later reversed — see the Grand Call Center section below.)*
  - Reused the existing iOS screenshots (`assets/grand-ios-home.png`, `assets/grand-ios-settings.png`) — they already show the passive-sensing view with no "Grace" UI.
- Added a "Grand Call Center" section (`#response`) between the caregiver experience and the waitlist. **Why:** this reverses the earlier "no public mention of human-in-the-loop alert review" decision — the call center is now a headline differentiator, because "what actually happens in an emergency?" is the buyer's biggest pre-purchase question and the human agent + EMS escalation is the answer. The section presents the emergency flow as a four-step process (a real person calls through the hub/sensors → confirms she's safe → calls EMS if not → the family is notified throughout and can join the call), with a call-center agent photo (`assets/call-center-pexels-kampus-8204317.jpg`, Pexels / Kampus Production, cropped 3:4 around the agent and optimized to ~250KB). The caregiver-experience intro and the urgent signal tile were reworded to hand off to this section instead of implying an automated-only reach-out, and an "Emergency response" nav link was added.
- Reformatted "The worry" section from a three-card competitor teardown into a narrative "anxiety window" timeline plus a compact "you've probably already thought about…" strikethrough list. **Why:** user research (May–June interviews) showed the problem is emotional, not comparative — the single most vivid finding was the adult child who worries from the moment she wakes until it's socially acceptable to call at 8am, and the failed alternatives land as stories (the pendant on the nightstand during the fall, the button that's "a reminder you're old") rather than spec-sheet dismissals. The old equal-cards format asked visitors to evaluate product categories before feeling understood, and gave competitor categories the same visual weight as the worry itself. The timeline dramatizes a familiar morning (clay dots for the anxious beats, a sage dot for the relief beat), a payoff line bridges into "How Grand works," and the three alternatives survive as demoted one-line dismissals so the content wasn't lost.

- Added baseline SEO and indexing plumbing: canonical URL, Open Graph and Twitter card tags, JSON-LD structured data (Organization + WebSite), `robots.txt`, `sitemap.xml`, and a favicon set. **Why:** the site previously had none of this, so Google had little to work with and link previews in iMessage/Slack/social showed no image or branding. This is intentionally the crawlability baseline, not an optimization pass. See the "SEO & Indexing" section below.

- Rebuilt the site footer: a top row with a "Contact us" label + `hello@grandelderare.com` `mailto:` link on the left and the four nav links as a single right-aligned column, above a hairline-topped bottom bar with the `grand.` wordmark logo (`assets/grand-logo.png`) on the bottom-left and the copyright on the bottom-right. **Why:** earlier footer iterations laid the nav links out as a run-on horizontal line, then as labelled columns that still read as cluttered. This is the simplified layout the team asked for. The "Grand is not a replacement for 911 or professional medical care" disclaimer was dropped per request, and the earlier "Quiet home monitoring…" tagline was removed from the footer (it wasn't requested). The logo is the brand wordmark trimmed and made transparent (cream background removed) so it blends on the footer surface.

## SEO & Indexing

All URLs are canonicalized to `https://www.grandeldercare.com/` (the `www` host, matching `CNAME`).

- `index.html` `<head>` carries the canonical link, `theme-color`, Open Graph tags, a `twitter:card` tag, and JSON-LD (`Organization` + `WebSite`). Only `twitter:card` is set for X/Twitter — scrapers fall back to the `og:*` tags for title/description/image, so there's one canonical copy of each string instead of hand-synced duplicates.
- The deploy workflow excludes `README.md` and `google-apps-script/` from the published site. **Why:** GitHub Pages was serving the whole repo, so internal strategy notes and the waitlist backend source (including the spreadsheet ID) were live URLs — and robots.txt + the sitemap would have invited crawlers to index them.
- The social share image is `assets/og-image.jpg`, a 1200×630 center crop of the hero photo (the standard large-card size for iMessage, Slack, and social previews).
- `robots.txt` allows all crawlers and points at the sitemap.
- `sitemap.xml` lists the single page; bump its `<lastmod>` when the page content changes meaningfully, and add entries if the site ever grows past one page.
- Favicons: `favicon.svg` is the source of truth (serif "g" on the charcoal `--surface-charcoal` rounded square); `favicon.ico` (32px) is the legacy fallback that crawlers request blindly, and `apple-touch-icon.png` (180px, square-cornered because iOS applies its own mask) covers iOS home-screen bookmarks.
- Google Search Console: the site is verified via the `google-site-verification` meta tag in `index.html` (URL-prefix property for `https://www.grandeldercare.com/`). Don't remove that tag — verification lapses without it. After content changes, the sitemap doesn't need resubmitting; Google re-crawls on its own.

## Open Locally

Open `index.html` in a browser. No build step is required.

## Production

Production is served by GitHub Pages at:

https://www.grandeldercare.com/

Because this is a static site with no build step, the `Deploy GitHub Pages` workflow copies `main` to the `gh-pages` branch on every push to `main`. The `CNAME` file keeps the custom domain attached to the Pages deployment.

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

Every content section leads with a standardized eyebrow (uppercase, 12px, clay `--status-clay`) above its title; the hero eyebrow is light for contrast on the dark photo. The `.eyebrow` is excluded from the `> p` intro-paragraph rules so it always renders at the base 12px.

- Hero promise (independence for the parent, peace of mind for the child) and waitlist CTA.
- "The worry" problem section: a two-column narrative with the independence/worry copy on the left and an iMessage-style multi-day concern graphic on the right, followed by a compact strikethrough list dismissing pendants/watches, call-for-help buttons, in-home carers, and cameras with one-line stories.
- "How Grand works" section titled as such, with a combined lead ("There's a better way to know they're okay. A small hub and a few sensors. No cameras, nothing to wear, nothing to charge.") and two product cards, each showing a real product photo: `assets/grand-sensor.jpg` (sensor in a wall outlet) and `assets/grand-hub.jpg` (hub on a kitchen counter), both optimized to ~120–210KB JPGs. The `.card-media` slot renders a cover-fit image via `:has(img)`, falling back to a dashed placeholder when no image is present.
- "What Grand pays attention to": everyday activity, the kitchen (meals), and a call for help.
- "Caregiver experience": the daily "she's okay" app view with real iOS app screens, plus a parent-perspective dignity note.
- "The Grand call center" (`#response`): what happens in an emergency — a mirrored two-column section (photo left, copy right) with a four-step numbered process (real person calls through the hub/sensors, confirms she's safe, calls EMS if not, family stays notified and can join the call). Step numerals are bare clay Georgia counters via CSS `counter()`; the photo slot falls back to the standard dashed placeholder if the image is removed.
- Waitlist form with validation and Google Sheets handoff.
- Site footer: a top row ("Contact us" label + `hello@grandelderare.com` on the left, four nav links as a right-aligned single column) above a bottom bar with the `grand.` logo bottom-left and the copyright bottom-right.
