# Savlivo 5 — Handoff

## Do this first

1. Run:
   `git status --short`

2. Run:
   `git --no-pager log -8 --oneline`

3. Confirm local HEAD is still:
   `e585ec6 Add robots and sitemap for teaser site`

4. Confirm whether the three website commits have been pushed to `origin/main`:
   - `52c9651 Add Savlivo pre-launch teaser website`
   - `9c3afa3 Polish teaser mobile layout`
   - `e585ec6 Add robots and sitemap for teaser site`

5. Immediate active task:
   **Create and publish a production-quality Privacy Policy at `savlivo.com/privacy` that matches the actual Savlivo implementation.**

6. Before drafting legal/privacy claims, inspect the current app/API implementation for:
   - account and authentication data
   - subscription and savings data
   - Savlivo AI / Groq processing
   - voice/audio transcription
   - notifications
   - biometrics
   - account deletion and retention
   - analytics/tracking/advertising
   - third-party processors
   - user rights and data export/deletion behavior

7. After the Privacy Policy is live:
   **continue App Store release preparation for the known-good TestFlight Build 7.**

---


## Current state

Savlivo has reached three important milestones:

1. The iOS app works in TestFlight on a physical iPhone.
2. TestFlight Build 7 is the known-good mobile release checkpoint.
3. The public Savlivo teaser website is live at:
   https://savlivo.com

The immediate next project is:

**Create a production-quality Privacy Policy page for Savlivo, then continue App Store release preparation.**

Do not reopen previously solved mobile networking/build issues unless an actual regression appears.

---

# Working style

User prefers:

- compact/direct answers
- terminal commands rather than abstract instructions
- usually one safe command/change at a time
- inspect before modifying
- backup before meaningful source/config changes
- use `git --no-pager`
- run `git --no-pager diff --check`
- never stage backup files
- do not use `psql`; use Node DB scripts
- do not run `npm audit fix --force`
- do not upgrade Expo SDK
- do not touch pricing-adapter unless there is an actual regression
- do not generate images for website/UI work unless explicitly requested

Shell prompt:
`bash-3.2$`

Repo root:
`/Users/Thomas/Desktop/savlivo-mvp`

Mobile:
`/Users/Thomas/Desktop/savlivo-mvp/apps/mobile`

Web:
`/Users/Thomas/Desktop/savlivo-mvp/apps/web`

API:
`/Users/Thomas/Desktop/savlivo-mvp/services/api`

---

# Git status at handoff

Local HEAD:

`e585ec6 Add robots and sitemap for teaser site`

Recent commits:

- `e585ec6 Add robots and sitemap for teaser site`
- `9c3afa3 Polish teaser mobile layout`
- `52c9651 Add Savlivo pre-launch teaser website`
- `988309a Prepare deterministic TestFlight build 7`
- `b82762b Fix iOS production environment for TestFlight v6`
- `139a015 Configure production API for iOS release`

IMPORTANT:

At handoff time:

`origin/main` is still at:

`988309a Prepare deterministic TestFlight build 7`

Therefore the three website commits are LOCAL ONLY unless pushed later:

- `52c9651`
- `9c3afa3`
- `e585ec6`

Before doing major new work, inspect:

`git status --short`

and:

`git --no-pager log -8 --oneline`

Do not assume the website commits have been pushed.

---

# Untracked backup files

There are many intentional local mobile backup files, including:

- `apps/mobile/app/index.tsx.after-*`
- `apps/mobile/ios/Savlivo/Info.plist.after-*`

There are also website `before-*` backups.

These are reference backups only.

NEVER stage them.

Do not use:

`git add .`

or:

`git add apps/web/`

Stage production files explicitly.

The Git warnings:

`unable to access '/Users/Thomas/.config/git/ignore': Permission denied`

and:

`unable to access '/Users/Thomas/.config/git/attributes': Permission denied`

have repeatedly been non-blocking.

---

# Mobile known-good release

Known-good release:

**TestFlight Build 7**

Commit:

`988309a Prepare deterministic TestFlight build 7`

Build number:

`7`

Bundle identifier:

`com.thomashodne.savlivo`

Expo Project ID:

`64dfe0f7-e0e6-48c2-96d7-bdb74f341af7`

Expo SDK:

`54`

Package constraint:

`"expo": "~54.0.0"`

React Native:

`0.81.5`

Do NOT upgrade Expo SDK.

Use native development builds, not Expo Go.

---

# Production mobile API behavior

File:

`apps/mobile/src/api.ts`

Current intended logic:

```ts
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

export const API_URL = __DEV__
  ? configuredApiUrl || "http://localhost:3000"
  : "https://savlivo-api.onrender.com";




































cd /Users/Thomas/Desktop/savlivo-mvp && \
cp SAVLIVO_4_HANDOFF.md SAVLIVO_4_HANDOFF.md.before-savlivo5-final-20260906 && \
cat > SAVLIVO_4_HANDOFF.md <<'EOF'
# Savlivo 5 — Handoff

## Immediate goal

Savlivo has reached these milestones:

1. iOS app works in TestFlight on a physical iPhone.
2. TestFlight Build 7 is the known-good mobile release checkpoint.
3. Public teaser website is live at `savlivo.com`.
4. `robots.txt` and `sitemap.xml` are live.
5. Google Search Console domain ownership is verified.
6. Sitemap has been submitted to Google.
7. Google had an older robots.txt block cached from before the new teaser deployment; current robots.txt allows crawling.

The immediate next task is:

**Create a production-quality public Privacy Policy page for Savlivo, then continue App Store release preparation.**

The privacy policy must reflect the actual implementation, especially:
- account/email data
- subscription and savings data
- Savlivo AI
- Groq / AI processing
- voice/audio transcription if used in production
- notifications
- biometrics
- account deletion
- retention
- security
- international processing
- user rights
- children
- advertising/tracking
- third-party services

Do not make unsupported claims such as:
- “we never share data”
- “we never store data”
- “end-to-end encrypted”
- “GDPR compliant”

unless verified from implementation.

---

# Working style

User prefers:

- compact, direct answers
- terminal commands rather than abstract instructions
- usually one safe command/change at a time
- inspect before modifying
- backup before meaningful source/config changes
- use `git --no-pager`
- run `git --no-pager diff --check`
- never stage backup files
- do not use `psql`; use Node DB scripts
- do not run `npm audit fix --force`
- do not upgrade Expo SDK
- do not touch pricing-adapter unless there is an actual regression
- do not generate images for website/UI work unless explicitly requested
- small targeted website changes only
- preserve working responsive behavior

Shell:
`bash-3.2$`

Repo root:
`/Users/Thomas/Desktop/savlivo-mvp`

Mobile:
`/Users/Thomas/Desktop/savlivo-mvp/apps/mobile`

Web:
`/Users/Thomas/Desktop/savlivo-mvp/apps/web`

API:
`/Users/Thomas/Desktop/savlivo-mvp/services/api`

---

# Git / checkpoints

Known local website commits:

- `e585ec6 Add robots and sitemap for teaser site`
- `9c3afa3 Polish teaser mobile layout`
- `52c9651 Add Savlivo pre-launch teaser website`

Known-good mobile checkpoint:

- `988309a Prepare deterministic TestFlight build 7`

Earlier important release commits:

- `b82762b Fix iOS production environment for TestFlight v6`
- `139a015 Configure production API for iOS release`

IMPORTANT:

At the last known check, `origin/main` was still at `988309a`.

Therefore do not assume the three website commits have been pushed.

Before major work, run:

`git status --short`

and:

`git --no-pager log -8 --oneline`

and, if appropriate:

`git rev-parse HEAD`

`git rev-parse origin/main`

Do not push automatically unless explicitly requested.

---

# Backup files

There are many intentional local backup files.

Examples:

- `apps/mobile/app/index.tsx.after-*`
- `apps/mobile/ios/Savlivo/Info.plist.after-*`
- `apps/web/*.before-*`
- `apps/web/styles.css.before-*`
- `apps/web/index.html.before-*`

These are reference backups only.

NEVER stage them.

Do not use:

`git add .`

or:

`git add apps/web/`

Stage production files explicitly.

Git warnings about:

`/Users/Thomas/.config/git/ignore`

and:

`/Users/Thomas/.config/git/attributes`

being inaccessible have repeatedly been non-blocking.

---

# Mobile known-good release

Known-good release:

**TestFlight Build 7**

Commit:

`988309a Prepare deterministic TestFlight build 7`

Build number:

`7`

Bundle identifier:

`com.thomashodne.savlivo`

Expo Project ID:

`64dfe0f7-e0e6-48c2-96d7-bdb74f341af7`

Expo SDK:

`54`

Package constraint:

`"expo": "~54.0.0"`

React Native:

`0.81.5`

Do NOT upgrade Expo SDK.

Use native development builds, not Expo Go.

Permanent archive:

`$HOME/Library/Developer/Xcode/Archives/2026-09-05/Savlivo-v7.xcarchive`

Exported IPA:

`/tmp/Savlivo-v7-export/Savlivo.ipa`

IPA was verified as Build 7.

Do not reopen Build 5/6 networking issues or dSYM warnings unless an actual regression appears.

---

# Production API

Production backend:

`savlivo-api.onrender.com`

Render service:

`savlivo-api`

Region:

Frankfurt

Branch:

`main`

Render build command:

`npm ci && npm --workspace @savlivo/api run build`

Render start command:

`npm --workspace @savlivo/api start`

Important production env vars:

- `DATABASE_URL`
- `JWT_SECRET`
- `NODE_ENV=production`

Optional / feature env vars previously used:

- `GROQ_API_KEY`
- `GROQ_ASSISTANT_MODEL`
- `SAVLIVO_EMAIL_WEBHOOK_URL`

Secrets must never be printed or committed.

Groq is configured in production.

Production mobile API selection is implemented in:

`apps/mobile/src/api.ts`

Intended behavior:

- development can use configured local API or localhost fallback
- release builds use `savlivo-api.onrender.com`

Do not change this unless there is a real production regression.

---

# Account deletion

Backend work already includes account deletion support.

Known behavior from prior implementation:

- account deletion can be requested
- deletion is scheduled approximately 7 days later
- restore tokens can be created
- deletion warning / notification flow exists

Inspect actual current API implementation before documenting exact wording in the privacy policy.

Important files/areas to inspect:

- auth/user database functions
- account deletion functions
- restore token handling
- account deletion notifications
- user lookup by email

Do not infer retention beyond what code/database proves.

---

# Savlivo AI

Savlivo AI is a real product feature.

Website copy describes it as a subscription assistant that can:

- identify saving opportunities
- explain subscription spending
- provide monthly/annual cost insights
- help users review subscriptions
- suggest next steps

Production backend uses Groq configuration.

The API also contains assistant/chat functionality and audio transcription handling.

Privacy policy must verify:

- what user information is sent to the AI provider
- whether subscription data is sent
- whether prompts/messages are stored
- whether audio is stored or only processed
- retention behavior
- provider terms / processing location if relevant
- whether data is used for provider model training
- whether users can avoid AI features

Do not guess. Inspect code and provider configuration first.

---

# Biometrics

The mobile app includes Face ID / Touch ID functionality.

Biometrics should be described carefully:

Likely architecture is device-native biometric authentication rather than Savlivo receiving biometric templates.

Verify implementation before stating this publicly.

Do not claim Savlivo never accesses biometric information until implementation has been checked.

---

# Notifications

The mobile app has settings for:

- renewal reminders
- savings opportunities

Inspect implementation before privacy-policy wording.

Determine whether notifications are:
- local only
- remote push
- token-based
- backed by Expo/Apple notification infrastructure

Document push-token handling only if actually used.

---

# Website

Static teaser site is intentionally separate from the mobile app.

Production files:

`apps/web/index.html`

`apps/web/styles.css`

`apps/web/assets/logo.png`

`apps/web/robots.txt`

`apps/web/sitemap.xml`

No npm / React / Expo dependencies.

Local preview:

`cd /Users/Thomas/Desktop/savlivo-mvp/apps/web && python3 -m http.server 4173`

Public site:

`savlivo.com`

Hosting/provider:

Webhuset.no

Web root:

`www/`

Current public structure includes approximately:

`www/index.html`

`www/styles.css`

`www/assets/logo.png`

`www/robots.txt`

`www/sitemap.xml`

`www/statistikk/`

There is also an old-index backup on the webserver.

Do not touch:

`www/statistikk/`

---

# Teaser site behavior

Current teaser intentionally hides most full-site sections.

Visible teaser includes:

- Savlivo logo/brand
- “SMARTER SUBSCRIPTIONS”
- “Keep more of your money”
- subscription-management intro
- COMING SOON note
- iOS button
- Android button
- full-site-coming-with-apps note
- hero benefits
- phone mockup
- footer

Full-site sections still exist in HTML but are hidden with teaser CSS.

Hidden sections include:

- trust strip
- features
- How it works
- Savlivo AI
- privacy teaser section
- download CTA
- community savings tracker

The full HTML is intentionally retained so the complete website can be activated later.

---

# Teaser links

Current intent:

Only the Savlivo brand/logo should be clickable.

Header Savlivo brand:
`savlivo.com`

Footer Savlivo brand:
`savlivo.com`

These teaser items should NOT be clickable:

- Features
- Savlivo AI
- Privacy
- How it works
- iOS
- Android
- Support

Support can remain visible as text, but no email link yet.

Before changing links, inspect actual HTML because an earlier automated replacement temporarily malformed anchor closing tags.

---

# Responsive website behavior

Do not perform a broad CSS rebuild.

A previous broad fluid rebuild made the page worse and was rolled back.

Current approach:
**small targeted CSS changes only.**

Known-good responsive behavior:

Header:
- wide desktop: normal nav
- mid-width header fix already exists
- do not disturb it unnecessarily

Hero title:
- responsive stability fixes already exist
- current title behavior is accepted

How it works:
- >= 900px: 4 columns
- 761–899px: 2x2
- <= 760px: 1 column

CTA:
- clean responsive CTA block is working
- do not alter unless necessary

Platform buttons:
- iOS + Android should stay on one row
- especially on mobile
- recent CSS commit `9c3afa3` addresses this

Header scrolling:
- sticky header was tested
- user decided normal/non-sticky scrolling looks better
- do not re-add sticky behavior unless requested

---

# Teaser SEO

SEO metadata was added to `<head>`.

Intent is hidden search-engine discoverability around:

- Savlivo
- subscription tracker
- subscription manager
- manage subscriptions
- recurring payments
- subscription savings
- subscription spending
- personal finance
- recurring expenses
- subscription optimization
- Savlivo AI
- AI subscription manager
- AI subscription analysis
- AI savings assistant
- AI financial insights
- spending insights
- personalized savings recommendations

Important:

`meta keywords` exists but should not be treated as the main Google ranking mechanism.

More important:
- title
- meta description
- canonical
- crawlability
- sitemap
- visible content
- future full-site content

Canonical domain:
`savlivo.com`

Preferred domain is non-www.

`www.savlivo.com` should eventually redirect to `savlivo.com` if not already configured.

---

# robots.txt

Current intended public content:

User-agent: *
Allow: /

Sitemap points to:
`savlivo.com/sitemap.xml`

The file was locally validated before upload.

---

# sitemap.xml

Current sitemap contains only the teaser homepage:

`savlivo.com/`

This is correct while the teaser is a one-page public site.

When `/privacy` is published, add it to the sitemap.

Later add other public pages as they become real.

---

# Google Search Console

Domain ownership for:

`savlivo.com`

has been verified through a DNS TXT record at Webhuset.

Sitemap has been submitted.

Google initially reported:

“Blocked by robots.txt”

but the reported last crawl was from September 2, before the corrected robots.txt was deployed September 6.

Current live robots.txt allows all crawling.

Search Console then showed processing / “check again in a day or two”.

Do not change robots.txt simply because the old crawl status still appears.

Re-check Google indexing later.

---

# Webhuset

Domain and website hosting are at:

Webhuset.no

DNS is managed there.

Google Search Console verification TXT record was added at the root of `savlivo.com`.

Do not modify unrelated DNS records.

Website document root is:

`www/`

For normal CSS-only updates:
upload only the changed `styles.css`.

For privacy page work:
likely create a dedicated public route/file structure under `www`.

---

# Privacy Policy next task

This is the immediate next task.

Goal:

Create a polished public Privacy Policy suitable for:

- Savlivo website
- Apple App Store privacy policy URL
- future Google Play listing

Preferred public URL:

`savlivo.com/privacy`

Before drafting final legal/privacy wording, inspect current implementation.

Recommended first inspection:

`cd /Users/Thomas/Desktop/savlivo-mvp`

Then inspect API/mobile data handling for:

- email
- password hashing
- authentication tokens
- JWT
- subscription records
- savings records
- currency / locale / country
- AI messages
- Groq
- transcription
- audio
- notifications
- device tokens
- analytics
- telemetry
- cookies
- tracking
- advertising
- biometrics
- account deletion
- restore tokens
- retention
- logs
- IP / user agent handling

The policy should clearly distinguish:

1. Data users provide
2. Data created through use of Savlivo
3. Device/app information
4. AI processing
5. Third-party processors
6. Security
7. Retention
8. Account deletion
9. User choices and rights
10. Children
11. International processing
12. Policy changes
13. Contact

Do not invent a legal company name or postal address if not established.

If a legal entity/controller name is needed, ask the user before publishing.

Do not publish a support email until the user confirms which email address should be public.

---

# App Store release work after privacy page

Build 7 already works.

After privacy policy is live, continue with:

1. App Store Connect app information
2. Privacy Policy URL
3. Support URL
4. App description
5. subtitle
6. keywords
7. categories
8. screenshots
9. age rating
10. App Privacy disclosures
11. review notes
12. export/compliance questions
13. final TestFlight regression test
14. submit for App Review

Do not rebuild iOS unnecessarily if Build 7 remains valid.

---

# Android

Android remains on the backburner until the iOS/App Store path is further along.

React Native / Expo means much of the code can be reused.

Future Android work will include:

- Android configuration
- native build
- physical-device testing
- Google Play Console
- Play privacy/data safety
- screenshots/store listing
- release signing
- production API verification

Do not let Android delay iOS release.

---

# Future web dashboard

Future idea:

Users may eventually log in on desktop and control Savlivo through a web dashboard.

Possible architecture:

- marketing site at `savlivo.com`
- app dashboard at `app.savlivo.com` or similar
- same backend/API/data model as mobile

This is on the backburner.

Do not start it now.

---

# Third-party subscription credentials

Important product/security decision:

Savlivo should NOT store users’ usernames/passwords for Netflix, Spotify, iCloud, etc.

When sending users to provider management pages:

- use browser/system password manager
- use passkeys where available
- use existing browser sessions/cookies
- store only provider/manage URLs and non-sensitive metadata

Do not design a third-party credential vault unless this decision is explicitly revisited.

---

# Community savings tracker

The full website has a community savings tracker concept.

It is hidden in teaser mode.

Planned architecture:

app → API/database → public aggregate endpoint → website

Do not expose user details publicly.

Potential endpoint concept:

`/public/savings-total`

Backend integration is deferred.

Important known issue:

The old website tracker JavaScript was placed before its markup and could access null DOM elements.

Because the tracker is hidden in teaser mode this was not a launch blocker, but it must be fixed before activating the full site.

When resumed:
- move execution after markup or DOMContentLoaded
- add null guards
- verify endpoint exists
- avoid fake totals

---

# Pricing

Pricing subsystem is considered frozen/closed unless a real regression appears.

Previously:
- pricing tests were green
- startup refresh worked
- multiple markets were supported

Protected file:

`services/api/src/pricing-adapters.ts`

Do not refactor or “clean up” pricing during unrelated work.

---

# Main priorities

Current order:

1. Privacy Policy page
2. App Store submission preparation
3. final iOS production verification
4. submit iOS
5. Android work
6. full website activation
7. community savings backend integration
8. future web dashboard

Do not reopen solved work without a real reason.

---

# First action in Savlivo 5

Start by checking repo state:

`cd /Users/Thomas/Desktop/savlivo-mvp`

`git status --short`

`git --no-pager log -8 --oneline`

Then inspect actual privacy-relevant implementation before drafting the public policy.
