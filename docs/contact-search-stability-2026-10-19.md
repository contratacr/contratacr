# Contact channel and search transitions — 2026-10-19

## Cause and changes

Native contact buttons previously interpreted an unresolved app-availability lookup as false. They painted WhatsApp before changing to the internal message launcher. Availability is now tri-state: pending, chat, WhatsApp. A disabled neutral Contactar button reserves the same height while auth/availability resolves. The existing batching, session cache and WhatsApp fallback on lookup errors remain. Public web keeps WhatsApp. No contact is sent by loading a profile.

The mobile search overlay closed in a passive effect and released its fixed-body scroll lock afterward. Route dismissal and lock cleanup now run before paint. A completed navigation discards the old saved scroll position; cancelling the search still restores it. Existing pending-navigation and same-search behavior remain.

## Regression

- `contact-channel-stability.spec.ts`: delayed native availability true/false, no provisional WhatsApp, button height and inset within its container, reload with session cache. Disposable TEST accounts only; availability endpoint intercepted, no chats/notifications sent.
- `mobile-search-focus.spec.ts`: pending and same-search cases now sample 20 rendered frames after arrival, rejecting a retained fixed body or search overlay class.
- `navbar-brand-consistency.spec.ts`: unchanged font-blocked brand contract in Chromium desktop/mobile and WebKit mobile.

Cloudflare production build, TypeScript, brand asset verification and focused lint pass. The combined browser run passed the search cases on both mobile engines, all three brand cases, and both contact outcomes on Chromium desktop/mobile. WebKit contact cases were rerun after correcting the geometry assertion: its reserved viewport scrollbar changes the fixed container by 7px, independently of contact selection; the test now compares inset within that container and preserves the height contract. The existing navbar lint errors at cookie assignment, section-share state and recent-search hydration predate these changes; focused hook/launcher/new-spec lint passes.

No native store release is included.
