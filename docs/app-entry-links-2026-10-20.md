# App entry from mobile web

Apple's Universal Links / Smart App Banners and Android's verified App Links are the supported approach. The system owns the native confirmation dialog and remembers browser/app choices. A website cannot reliably detect an installed iOS app or guarantee Yelp's exact dialog on every visit. No timed custom-scheme probes, fake OS dialogs, install fingerprinting, session copying or third-party SDK were added.

## Changes

- Apple association now includes the exact homepage/localized homepage and exact professional-search root, in addition to existing detail routes. Existing app id, webcredentials and auth exclusions are preserved.
- Native URL handling accepts the homepage/localized homepage, preserving safe destination query/hash. Home links containing authentication payloads are rejected.
- Safari iOS receives Apple's Smart App Banner metadata in the initial HTML and after supported public navigation. Its custom bottom banner is suppressed, even when Safari hides/remembers dismissing its own UI. Other iOS browsers and standalone do not receive Apple metadata after hydration.
- Android, other mobile browsers and home-screen web apps use the single dismissible bottom notice. It says Descargar/Download, switching to Abrir app/Open app only when Android confirms the package. Native app, private tasks, keyboard and modal exclusions remain. A permanent Descargar app/Download app drawer row reaches the device-aware store redirect, including when Safari remembers closing its native banner. No inferred iOS installation state or scheme probes are used.
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
- Android web has one compact bottom notice. A verified related-app response for `com.contratacr.app` changes its action to Open app. An empty response shows Download; unsupported, rejected or pending detection shows Download. The latter uses a user-tapped Chrome intent with the exact Play Store fallback, never an automatic redirect or scheme probe. Returning from the store rechecks installation.
- Public destinations, query and fragment are retained. Authentication, admin and private task URLs are excluded from promotional intents. Other packages/PWAs are not treated as this native app.
- The web manifest declares the Play package. Android declares both related websites through application-level `asset_statements`; this native declaration requires an update before Chrome can reliably detect existing installations. Older installed versions may still report no related app.
- Real Google results contained both apex and www hosts. Both hosts serve the association files with HTTP 200 and no redirects. Android's HTTPS intent filter and iOS's Associated Domains now include www; the shared URL consumer accepts these two hosts only. No DNS, website redirects or canonical SEO settings were changed.

Validation: the complete browser selection finished with 76 passed and 17 platform-inapplicable skips; the corrected Android subset passed 25 cases with one inapplicable skip, and seven additional Android state/return checks passed. Brand checks, focused lint, TypeScript and the production web build passed. Android debug builds and 12 installed-manifest/native tests passed, including website declarations, both domains, destination query/fragment and rejection of unrelated browser routes. The iOS entitlement plist validates.

Real Google clicks on the Android QA emulator: without `com.contratacr.app`, the apex result opened Chrome on ContrataCR with its download notice. With the candidate installed and both supported-link domains explicitly enabled in Android's user settings, apex and www results opened `com.contratacr.app/.MainActivity`. This is a real search-result click, but deliberately NOT proof of automatic Play-signature verification: the debug signing certificate is absent from production assetlinks. The debug variant uses the isolated local test server; its adb reverse must point local device port 3000 to host port 3182.

Store gate: rebuild/sign Android with the related-site declarations and both hosts, rebuild/sign iOS with the www entitlement, confirm actual store versions/build numbers, and repeat Google clicks on physical devices using the signed candidates (installed/uninstalled, apex/www, default link preferences and an existing profile/detail destination). iOS's native banner and OS opening decision cannot be certified with Playwright or the unsigned simulator app. Preserve private/OAuth browser returns. No store upload or version bump was performed.

## iPhone notice correction — 21 October 2026

The previous deployment was live but suppressed the custom notice whenever the user agent was Safari, without being able to observe Apple's banner. Explicit Apple banner metadata is now removed, preserving Universal Links. Legacy dismissal keys are retired once.

Validation: TypeScript, focused ESLint, brand contract and production build passed. The three-engine focused run passed 78 cases with 23 platform-inapplicable skips; one new Safari test initially hit onboarding navigation because its native fixture had not completed onboarding. Correcting the fixture made all four Safari association/notice tests pass. All 79 applicable distinct cases now pass, including Safari and standalone with legacy dismissal, current dismissal persistence, cold SSR, Android installation states and navbar branding. This tests app-controlled web UI, not physical iPhone OS dialogs. No store release.

## Final single-banner policy — 21 October 2026

Isaac requested automatic installed-app handling with no duplicate top/bottom banners. Safari now exclusively uses Apple's installation-aware banner on supported public pages; its metadata is present before opening the drawer. Standalone, Chrome iOS and Android use only our bottom notice. The web-only menu store entry remains available independently of banner dismissal. Owned labels/accessibility text follow the website's locale; Apple owns the native banner's presentation, dismissal, supported-device rules and language (iOS/App Store), so website language cannot force its button text. Safari may reveal/hide its own UI with scrolling; we do not claim DOM tests or iOS Simulator can certify that physical-device UI.

Research: Apple's Smart App Banner documentation explicitly describes installed-app opening, store fallback and dismissal persistence; WebKit issue 232237 documents browser bar/banner behavior with scrolling. Yelp's screenshot supplied by Isaac is native OS UI. Direct HTML inspection of Airbnb did not expose an Apple banner in that response, while Yelp blocked automated retrieval; no claim is made that every large app implements an identical banner.

Validation of the final policy: TypeScript and the OpenNext build pass; all eight Worker-render smoke routes pass. Focused browser runs cover initial Safari metadata before the menu, no custom Safari notice, native/private exclusions, legacy/current dismissal, standalone, Chrome iOS and embedded iOS, Android installed/missing/unsupported/error/pending, store-return refresh, owned ES/EN labels and actual menu language switching. Test fixtures now wait for page hydration before successive Safari navigations and scope menu entries to the visible navbar (desktop/mobile shells coexist in the DOM). Navbar branding passed on the three engines. Focused changed-file lint passes; the large existing navbar retains unrelated React compiler immutability/set-state-in-effect findings (the added import/row does not modify those sites). Native Apple UI/Open/install/language still needs physical-iPhone observation; no claim of simulated OS detection is made.


## Localized neutral action — 21 October 2026

Isaac chose a single-line owned notice with one neutral action for both installation states: Usar app / Use app. Remove explicit Apple promotion metadata in SSR and after navigation; keep Universal Links, AASA, Android association and Google-entry handling unchanged. Safari's OS-owned affordances remain outside website control. Preserve current dismissal, keyboard/modal/private-route exclusions, native-app suppression and the one-row brand layout.

On iPhone, the owned action deliberately opens the official App Store listing, which offers opening or downloading according to device state. This is a store-mediated route, not a claim of automatic install detection or direct opening. Android retains its package-specific intent/store routing; both labels remain neutral. No timer-based scheme probing, install fingerprinting, store uploads or version changes.

Validation: 86 focused cases passed with 31 platform-inapplicable skips, plus four drawer/native presentation checks. TypeScript, focused changed-component/test lint, wordmark contract, OpenNext build, eight Worker pages and ES/EN iPhone HTML checks passed. The one-row geometry, dismissal persistence, native/form exclusions, Android installed/missing/unknown/error/pending routes and live website-language switching are covered. The physical OS/store opening flow remains a device-level check; no simulated installation claim is made.

## Tap-to-open with store fallback — 21 October 2026

Isaac authorized opening an installed app and using the store when the OS does not claim the tap, retaining one localized row. iPhone uses the opposite existing associated host (apex ↔ www), the same public destination and `_ccr_open=ios`. The marker reaches the server only when iOS leaves the link on the web; middleware returns a fixed, private/no-store/noindex App Store redirect before locale/auth/catalogue work. A web fallback is not proof that the app is absent: OS preferences can also leave a link in the browser.

Middleware forwards the authoritative original hostname in an overwritten internal request header; SSR does not trust the Host header after Next/OpenNext rewrites or a client-supplied source-host header. No global www redirect, DNS change, third-party SDK, custom-scheme probe or timed store jump is used. Normal Google links remain untouched. Public route/query/fragment and language are preserved; private/auth destinations are rejected. The app URL consumer removes the browser-only marker, and native requests are excluded from the store fallback to prevent a bounce.

Verified Android state uses Abrir/Open or Descargar/Download. Unsupported, pending or failed detection and iPhone use Abrir o descargar/Open or download. The platform suffix is omitted for this longer neutral label so the shared wordmark, close action and one button fit at 320px. Unsupported app sections open the localized app homepage instead of inventing a private/native route.

Automated coverage passes for both source hosts, server store redirects, native no-bounce, forged host headers, first HTML, locale switching, public destinations, rejected auth payloads and 320px layouts in mobile WebKit/Chromium and desktop Chromium. The app's existing mobile branch already declares apex and www entitlements, validated with plutil. Existing installed binaries cannot be assumed to have those declarations. Physical signed-device installed/uninstalled confirmation and the previously recorded store gate remain pending; the available iPhone was disconnected. No store upload, version/build increment or signed-device success is claimed.

Android always delegates the tap to its package-specific intent with the fixed Play Store fallback, even after a negative browser lookup. This avoids routing an already-installed older/unreported binary straight to the store; the browser lookup controls only the label.

## Neutral action wording — 21 October 2026

Isaac rejected the combined action label. Unknown install state now uses Continuar/Continue, one neutral word in the selected website language. Verified Android state retains Abrir/Open and Descargar/Download. Routing, fallback, dismissal, one-row layout and native store versions are unchanged. Physical iPhone opening confirmation remains pending; the user response addressed wording only.

Validation for this wording change: 100 browser checks passed across mobile WebKit, mobile Chromium and desktop Chromium; 35 platform-inapplicable checks skipped. TypeScript, focused ESLint, test inventory, diff check and the wordmark contract passed.

## Desktop navbar handoff — 21 October 2026

The desktop navbar replaces its sign-up action with Usar app/Use app, including signed-in users. Registration remains in login and the mobile drawer. The nonmodal panel reuses the existing device-aware download QR and closes with Escape, its close button or an outside pointer. Native and mobile headers do not show the desktop action. Search width classes are unchanged, and auth loading reserves only the remaining account controls.

Validation: four targeted cases passed (five mobile/desktop-inapplicable skips), covering ES/EN at 1024/1280/1440, an authenticated TEST client, QR visibility, outside/Escape dismissal and mobile exclusion. All three mandatory brand browser checks passed on rerun; the initial overlapping test runs conflicted in artifact output and timed out. TypeScript, new component/test lint, wordmark and inventory checks passed. Navbar lint retains its four existing errors and two warnings, with no new rule violations. No native release or version change.

## Restore platform label — 21 October 2026

Isaac requested the mobile how-it-works layout remain unchanged; the proposed redesign remains desktop-only and is not implemented in this change. The bottom app notice now always labels its detected platform as para iOS/para Android or for iOS/for Android, independently of Android install-state detection. The one-row notice retains its shared logo, localized neutral/dynamic button and existing routing. Narrow-screen spacing was adjusted without altering the logo assets or proportions.

Validation: 11 browser checks passed with 16 platform-inapplicable skips, including 320px iPhone ES/EN, all five Android install-detection states, Android language switching and the three mandatory cross-engine wordmark checks. TypeScript, focused lint, wordmark contract, inventory and diff checks passed. The first attempt could not connect because the local TEST server was stopped; the server was restarted before the passing run. No store release or version change.
