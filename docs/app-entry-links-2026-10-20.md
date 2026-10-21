# App entry from mobile web

Apple's Universal Links / Smart App Banners and Android's verified App Links are the supported approach. The system owns the native confirmation dialog and remembers browser/app choices. A website cannot reliably detect an installed iOS app or guarantee Yelp's exact dialog on every visit. No timed custom-scheme probes, fake OS dialogs, install fingerprinting, session copying or third-party SDK were added.

## Changes

- Apple association now includes the exact homepage/localized homepage and exact professional-search root, in addition to existing detail routes. Existing app id, webcredentials and auth exclusions are preserved.
- Native URL handling accepts the homepage/localized homepage, preserving safe destination query/hash. Home links containing authentication payloads are rejected.
- Superseded on 21 October: explicit Apple Smart App Banner metadata was removed. The site must not depend on Safari displaying browser-owned UI to offer access to the store. Universal Links and association files remain unchanged.
- Safari iOS and home-screen web apps now show the same dismissible bottom notice on public browsing pages. On iOS its action says ‘Ver app’ / ‘View app’ and opens App Store, which decides whether to offer Open or Download; the website does not claim to detect installation. Native app, private tasks, keyboard and modal exclusions remain. Dismissal storage is versioned once to retire the legacy 30-day hidden state; closing the corrected notice still persists. The manifest href is versioned to refresh stale related-app metadata.
- Android's verified intent filter adds only five exact homepage paths. Existing path prefixes are retained; no catch-all captures browser login, auth callbacks or administration.

## Verification and release limits

Playwright validates server HTML without JavaScript, navigation, Safari/Chromium mobile and desktop behavior, native/PWA separation, store links, public destinations, token exclusions and unchanged branding. It does not simulate Apple's native dialog.

Android: merged debug manifest and JVM checks passed. Three instrumentation cases passed on the Android 16 emulator, resolving home/localized home, search/detail paths and rejecting login/auth/admin/unsubscribe. These explicitly target the installed package to test its manifest; debug signing is intentionally absent from production assetlinks, so this is not certification of Play-signed domain verification or an ad/search-originated click.

Android's added native paths require a future store build. Apple association caching and the entitlements of the installed iOS version also affect delivery. No store upload is part of this change. Final real-device Google/Messages opening must be checked with the signed release before certifying that behavior.

References:
- https://developer.apple.com/documentation/technotes/tn3155-debugging-universal-links
- https://developer.apple.com/documentation/webkit/promoting-apps-with-smart-app-banners
- https://developer.chrome.com/docs/android/intents
- https://developer.android.com/training/app-links/verify-applinks

Final QA: 85 browser cases passed across desktop Chromium, mobile Chromium and mobile WebKit; 11 platform-specific cases were omitted only in the inapplicable project and covered in the matching project. Fifteen follow-up cases passed for auth/query/hash guards and current metadata after navigation. Three Android instrumentation tests passed. Production build, TypeScript, brand contract and focused lint passed; locale layout retains its one pre-existing react-hooks/purity error concerning Date.now during the server cookie read, confirmed against HEAD. No new lint errors were introduced. An existing email-preview test now uses its configured baseURL instead of hard-coded localhost:3000.

## Follow-up 2026-10-21: one adaptive notice and Google entry

- Safari keeps Apple's native, dismissible notice at the top. There is no duplicate custom bottom notice on supported public pages; Apple owns its installed/store state and dismissal.
- Android web has one compact bottom notice. A verified related-app response for `com.contratacr.app` changes its action to Open app. An empty response shows Download; unsupported, rejected or pending detection shows View app. The latter uses a user-tapped Chrome intent with the exact Play Store fallback, never an automatic redirect or scheme probe. Returning from the store rechecks installation.
- Public destinations, query and fragment are retained. Authentication, admin and private task URLs are excluded from promotional intents. Other packages/PWAs are not treated as this native app.
- The web manifest declares the Play package. Android declares both related websites through application-level `asset_statements`; this native declaration requires an update before Chrome can reliably detect existing installations. Older installed versions may still report no related app.
- Real Google results contained both apex and www hosts. Both hosts serve the association files with HTTP 200 and no redirects. Android's HTTPS intent filter and iOS's Associated Domains now include www; the shared URL consumer accepts these two hosts only. No DNS, website redirects or canonical SEO settings were changed.

Validation: the complete browser selection finished with 76 passed and 17 platform-inapplicable skips; the corrected Android subset passed 25 cases with one inapplicable skip, and seven additional Android state/return checks passed. Brand checks, focused lint, TypeScript and the production web build passed. Android debug builds and 12 installed-manifest/native tests passed, including website declarations, both domains, destination query/fragment and rejection of unrelated browser routes. The iOS entitlement plist validates.

Real Google clicks on the Android QA emulator: without `com.contratacr.app`, the apex result opened Chrome on ContrataCR with its download notice. With the candidate installed and both supported-link domains explicitly enabled in Android's user settings, apex and www results opened `com.contratacr.app/.MainActivity`. This is a real search-result click, but deliberately NOT proof of automatic Play-signature verification: the debug signing certificate is absent from production assetlinks. The debug variant uses the isolated local test server; its adb reverse must point local device port 3000 to host port 3182.

Store gate: rebuild/sign Android with the related-site declarations and both hosts, rebuild/sign iOS with the www entitlement, confirm actual store versions/build numbers, and repeat Google clicks on physical devices using the signed candidates (installed/uninstalled, apex/www, default link preferences and an existing profile/detail destination). iOS's native banner and OS opening decision cannot be certified with Playwright or the unsigned simulator app. Preserve private/OAuth browser returns. No store upload or version bump was performed.

## iPhone notice correction — 21 October 2026

The previous deployment was live but suppressed the custom notice whenever the user agent was Safari, without being able to observe Apple's banner. Explicit Apple banner metadata is now removed, preserving Universal Links. Legacy dismissal keys are retired once.

Validation: TypeScript, focused ESLint, brand contract and production build passed. The three-engine focused run passed 78 cases with 23 platform-inapplicable skips; one new Safari test initially hit onboarding navigation because its native fixture had not completed onboarding. Correcting the fixture made all four Safari association/notice tests pass. All 79 applicable distinct cases now pass, including Safari and standalone with legacy dismissal, current dismissal persistence, cold SSR, Android installation states and navbar branding. This tests app-controlled web UI, not physical iPhone OS dialogs. No store release.
