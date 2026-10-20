# App entry from mobile web

Apple's Universal Links / Smart App Banners and Android's verified App Links are the supported approach. The system owns the native confirmation dialog and remembers browser/app choices. A website cannot reliably detect an installed iOS app or guarantee Yelp's exact dialog on every visit. No timed custom-scheme probes, fake OS dialogs, install fingerprinting, session copying or third-party SDK were added.

## Changes

- Apple association now includes the exact homepage/localized homepage and exact professional-search root, in addition to existing detail routes. Existing app id, webcredentials and auth exclusions are preserved.
- Native URL handling accepts the homepage/localized homepage, preserving safe destination query/hash. Home links containing authentication payloads are rejected.
- Public supported pages emit Apple's official apple-itunes-app metadata in the initial head with the current destination. A client component updates/removes it after navigation. Private tasks, authentication/admin and token payloads do not get metadata. The native app has none.
- Safari iOS uses that native banner instead of the duplicate custom bottom download notice on supported public pages. Chrome/Android and unsupported browsers retain their existing download notice. PWA standalone mode retains its own store notice because Safari's native banner is unavailable there. Store links and the download section remain available.
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
