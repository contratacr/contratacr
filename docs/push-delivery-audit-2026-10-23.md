# Push delivery audit — 2026-10-23

## Production evidence (read-only)

Production snapshot at approximately 22:30 UTC; thirty-day window: 49 registered token rows; 36 active FCM tokens (21 Android, 15 iOS). The durable queue contained 1,398 jobs: 1,396 suppressed and two retrying. Suppression is not a provider delivery failure: many recipients had no eligible device, while 165 jobs had expired. There were 48 recorded delivery attempts, all failed with `messaging/unknown-error`, and no recorded accepted deliveries in this window.

Nine message notifications were created. Two recent unread message notifications for registered iOS recipients were retrying after three attempts. Message creation itself therefore works; successful push delivery was not demonstrated.

## Reproduced transport failure and local correction

Firebase multicast defaults to Node HTTP/2. With the exact Worker compatibility date/flag used by this app (`2026-07-29`, `nodejs_compat`), the current sender throws `ERR_METHOD_NOT_IMPLEMENTED: The http2.connect method is not implemented`. Reproduced in local Wrangler with real Firebase dry-run requests; no delivery to unrelated users.

`getFirebaseMessaging()` now selects the SDK's HTTP/1.1 transport with `enableLegacyHttpTransport()`. This still uses the current FCM HTTP v1 API, not the retired legacy FCM API. The corrected Worker accepts validation-only requests for both iOS and Android. This code change is local and has not been deployed.

## Independent iOS blocker

One explicitly coordinated real test addressed only the owner's latest active iPhone token. Firebase rejected it with `messaging/third-party-auth-error`. Dry-run acceptance does not check actual APNs delivery.

The Firebase console for `contratacr-95d6f` / `com.contratacr.app` confirms that neither development nor production APNs authentication keys or certificates are configured. Apple Developer contains a Sign in with Apple key only; it must not be repurposed. After the owner explicitly authorized creation and Firebase upload provided there was no additional charge, two topic-specific APNs keys were registered and uploaded: Production and Sandbox, each restricted to `com.contratacr.app`. No purchase or payment was requested. Firebase visibly confirms both keys configured. Sign in with Apple and SG Solutions keys were not altered. Downloaded private keys remain outside Git with owner-only file permissions; never include their contents in reports or logs.

The connected physical iPhone reports app version 1.0.11, build 16. After configuration, one real notification addressed only the owner's latest active iOS token was accepted by Firebase; the earlier third-party authentication error did not recur. The owner explicitly confirmed seeing the notification on the iPhone. Foreground/background/closed-state iPhone delivery remains unverified. Local simulator injection is not proof of remote delivery; its app has no notification settings entry yet and no visible banner was verified.

## Android real native test

Built and installed the debug APK locally in the Play-enabled `ContrataCR_Play_QA` emulator. It uses an existing debug-only localhost configuration, the local Supabase instance and a disposable local account, not a production test account.

Real FCM sends were accepted and Android notification records appeared in all three states:

- App in foreground.
- App in background.
- App task removed from recents with `am stack remove`, with task absence verified before sending (not `force-stop`).

An initial smoke also used `am kill`, but that alone did not prove task/process closure. The final regression explicitly removed and checked the app task. Android force-stop is a distinct OS restriction and is not equivalent to closing the app from recents. A physical Android handset was not connected, so this does not certify every vendor's battery/notification settings.

Reproducible hardware regression: `tests/native/android-push-delivery.spec.ts`. Run with `playwright.android-push.config.ts`, separately from browser-only CI, after building/installing the debug app, forwarding local ports and the WebView CDP socket, enabling notification permission on the isolated emulator, and providing local regression DB plus Firebase credentials securely. It requires loopback Supabase and uses disposable accounts. Configure `ANDROID_HOME`/`E2E_ADB_PATH`, `E2E_ANDROID_CDP_URL`, `E2E_ANDROID_APP_URL`, and optionally `E2E_ANDROID_PUSH_RESULTS`. Never log tokens or credential contents.

## Other reliability findings

GitHub's production drain schedule is declared every ten minutes, but observed runs on October 23 were hours apart. Existing chat POST already attempts an immediate background drain; general notifications remain exposed to scheduler delays. A reliable Cloudflare-native scheduled consumer or equivalent needs a separate deployment change. Do not replay old notifications to compensate: the six-hour expiry and account/device isolation must remain intact.

Token registration currently lacks a foreground/resume recovery path after device settings changes or exhausted registration retries. This is a secondary code finding, not evidence that every registered device lacks permission. The permanent notification-settings control discussed with the owner is still pending.

## Validation and release state

- 36 push outbox contracts passed.
- Push schema contract passed.
- Local push account/token isolation passed, without calling FCM or draining production.
- Corrected sender: real Worker dry-run accepted for iOS and Android.
- Android real native delivery: foreground/background/closed task passed.
- Changed sender passes TypeScript and ESLint.
- Production and Sandbox APNs credentials registered and uploaded with explicit owner authorization, without an additional purchase.
- One owner-only real iOS send accepted after configuration; visible receipt confirmed by the owner.
- No production queue manually drained, no store uploads, no Pro source changes. Server transport correction remains local and undeployed.

References:

- https://firebase.google.com/docs/reference/admin/node/firebase-admin.messaging.messaging
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- https://firebase.google.com/docs/cloud-messaging/error-codes
- https://firebase.google.com/docs/cloud-messaging/ios/get-started
