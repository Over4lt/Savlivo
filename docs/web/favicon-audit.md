# Savlivo favicon / search eligibility audit

Starting HEAD: 7ac8ec5, build10-final. Tracked tree clean; unrelated .htaccess untracked and untouched. No deployment was performed.

## Findings and change

Both local and live homepages had no favicon declaration, canonical or Open Graph metadata. No favicon or web manifest existed in apps/web. The live `/favicon.ico` returned 404. That prevents the usual favicon discovery paths from finding a brand icon; it does not prove why Google selected a globe on a particular result.

The source is the existing `apps/web/assets/logo.png`: square 1254×1254 opaque RGB artwork with its own dark branded background. It is byte-identical to the live `/assets/logo.png` (SHA-256 `14150cb209ba4a9f0c7bda58f18ab53ca23755a92ef6e5390bfcd8726aa9870c`). It was resized without cropping, recoloring, background replacement or redesign. The original asset is unchanged. The 96px export was visually inspected and remains recognizable.

New stable public files and homepage head declarations:

| Path | Format / size | Declaration |
| --- | --- | --- |
| /favicon.ico | ICO containing opaque PNG 16/32/48px entries | rel=icon, image/x-icon, sizes=16x16 32x32 48x48 |
| /favicon-96x96.png | RGB PNG 96×96 | rel=icon, image/png, sizes=96x96 |
| /favicon-192x192.png | RGB PNG 192×192 | rel=icon, image/png, sizes=192x192 |
| /apple-touch-icon.png | RGB PNG 180×180 | rel=apple-touch-icon, sizes=180x180 |

96 and 192 are multiples of 48. Paths contain no query strings, authentication or generated version names. The existing apex sitemap and brand links identify `https://savlivo.com/`; the missing homepage canonical is now explicitly that URL. Page copy/body/styles were not changed. No manifest is needed for this favicon fix, so none was introduced. Other pages may use the conventional root favicon; private admin/reset indexing behavior is unchanged.

## Google guidance

[Google's favicon documentation](https://developers.google.com/search/docs/appearance/favicon-in-search) requires a square brand-representative icon, a stable URL and crawlable homepage/icon. It currently recommends a size larger than 48px (rather than prescribing multiples of 48); these exports also meet the user's multiple-of-48 requirement. Googlebot must access the homepage and Googlebot-Image the icon. Google controls recrawling and display and does not guarantee an icon even when eligible.

## Live observations (before deployment)

Read-only HTTPS requests confirmed:

- Apex homepage: 200 text/html, no authentication, no meta noindex or X-Robots-Tag in the observed response.
- robots.txt: 200; wildcard Allow: /; sitemap references https://savlivo.com/sitemap.xml. Homepage and favicon paths are not disallowed by these rules.
- sitemap.xml: 200, with apex homepage and /privacy/ URLs, matching the repository.
- Existing favicon.ico: 404. New favicon files are local only; their production responses are not yet verified.
- www homepage: 200 without redirect to apex; same observed page content/last-modified as apex. The new canonical addresses the HTML signal, but hostname redirects remain a separate host decision.
- HTTP apex: 302 to https://savlivo.com:443/, then 200. HTTPS works; whether to use a permanent clean apex redirect is a separate hosting review.
- Observed host identifies as Apache. apps/web is static files expected to be published at the site's document root. No framework build, manifest, auth layer or API routing is required for these files. The unrelated .htaccess was not read to infer host rules.

These checks establish public accessibility from this client, not proof of Google's actual crawl/index state. Search Console was not accessed, and indexing was not requested.

## Narrow SEO sanity check

Title remains `Savlivo — Take control of your subscriptions`.
Description remains `Savlivo helps you understand, manage and save on your subscriptions.`
Sitemap and robots are present, public and unchanged. Homepage canonical was missing and is now added. Homepage has no noindex; reset-password/admin restrictions remain untouched. Open Graph metadata/image declarations are absent rather than broken; social-preview metadata is a separate optional task, not a favicon blocker. No SEO copy, privacy text, application behavior, analytics/admin code or hosting configuration was changed.

## Validation

- `node --test scripts/web-favicon.test.mjs apps/web/admin/admin.test.mjs`: **13 passed, 0 failed/skipped** (5 favicon/static, 8 existing admin).
- Tests verify head declarations, stable root-relative paths, file existence, PNG signatures/CRCs/inflated image data/opaque RGB dimensions, all ICO entry offsets/images, canonical, unchanged title/description, robots and sitemap.
- `file` and macOS `sips` independently recognized the ICO and all PNG dimensions. The initial ICO test used the wrong byte order; it was corrected to the ICO format's little-endian fields, after which all checks passed. No malformed generated asset was shipped.
- Temporary loopback-only static-file smoke test: homepage, all four icon paths, robots and sitemap returned 200 (**7/7**). This proves the local document-root layout, not actual Apache MIME/cache/rewrite configuration after deployment.
- Generator syntax and git diff checks passed. No web build pipeline exists; no dependency/build framework was added. API/mobile suites were not rerun for this static-only change.

Re-export on macOS with `node scripts/generate-web-favicons.mjs`; it uses built-in sips and Node to resize/package the existing artwork. Tests/generator/docs live outside the public document root. PNG-compressed ICO entries target current browsers/Google, not ancient pre-PNG ICO clients.

## Authorized deployment / recrawl review checklist (not executed)

1. Review and deploy only the homepage plus the four favicon files to the correct document root; preserve existing site files. Do not publish scripts/tests/docs or unrelated local admin work as part of this favicon change.
2. Verify apex homepage and every linked icon return 200, with actual image MIME types, no login/challenge, no blocking X-Robots-Tag/robots rule and no HTML fallback returned as an image. Check www behavior if that hostname remains public. Confirm the apex canonical is served.
3. Verify the favicon visually in a browser; cached icons may require a fresh browser profile. Keep stable URLs rather than rotating query strings.
4. With separate authorization/access, request homepage recrawling through Search Console URL Inspection. Allow Google time to process it; do not promise immediate replacement of the globe.

**READY FOR DEPLOY AND GOOGLE RECRAWL REVIEW** — local implementation ready; no push, deployment, host change, release/build change or recrawl request performed.
