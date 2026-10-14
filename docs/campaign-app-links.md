# Campaign links and confirmation pages

13 October 2026: the old report URLs now keep the dark wordmark visible on a white browser card in either OS color scheme. The question identifies jobs obtained via ContrataCR, shows the week and selected answer, and GET never records a response. The weekly sender remains paused.

Application links are limited to marketplace/profile/dashboard screens and the signed weekly confirmation page; auth callbacks, unsubscribe, admin and arbitrary external origins are excluded. The Capacitor listener handles warm and cold links and preserves query/hash. A boolean session marker prevents replaying the initial launch link on every document navigation; no signed URLs are stored.

The production Play signing SHA-256 was read from Google Play Console → Protegida con Play → Firma de aplicaciones → Digital Asset Links JSON on 13 October 2026. It starts 78:31:54, unlike the local/upload certificate starting 7D:0A:61 in Downloads/05-android-firma. Only the Play certificate is published. Apple app identity is LPB3Q4LJ5Z.com.contratacr.app; existing webcredentials association is retained.

Release requirements: native iOS applinks entitlement and Android verified intent filters must ship in a new store build. Website deployment alone cannot activate this in already-installed builds. Verify cold/warm opening from actual email in signed release apps before marking native support released. Also inspect Brevo's delivered link rewriting and Outlook's embedded browser behavior; neither client behavior nor an installed app can be inferred from web UA. No store submission or production email send was performed as part of this preparation.

References: https://developer.apple.com/documentation/technotes/tn3155-debugging-universal-links and https://developer.android.com/training/app-links/verify-applinks
