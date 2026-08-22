# Quality roadmap — from "it works" to "nothing ships broken"

Written 2026-08-21 after auditing the regression suite, the CI pipeline and the
three environments. It states what exists, what is missing, and the order of
work that gets production, test and the mobile app to a state where the only
remaining job is improving the product.

## 1. What exists today (measured, not assumed)

| Area | State |
|---|---|
| Surfaces | 56 pages, 73 API route handlers. `verify-app-surface-ownership` fails CI if any page or handler lacks an owning spec, so **structural coverage is 100 %**. |
| Suites | 26 Playwright specs, 165 tests, two Chromium projects (desktop 1366×900, Pixel 7 390×844). Zero retries, one worker, and `verify-playwright-results` rejects any flaky or unexpectedly skipped test. |
| Assistant | 24 API-level tests incl. a 1,000-phrase natural-language matrix, safety boundaries and every navigation intent. Only 4 UI interactions; the native assistant UI is covered by `mobile-native-shell`. |
| i18n | `messages/es.json` and `messages/en.json` have the same 3,311 keys. **406 inline bilingual ternaries** (`isEn ? … : …`) live in components, mostly chat inbox (60), navbar (51), assistant route (37). They are translated, but nothing checks them. |
| Loading | 3 `loading.tsx` files, shared skeletons, and 4 client caches (notifications, dashboard bootstrap, account, conversations). **23 `cache: "no-store"` fetches in components** refetch on every mount, which is where skeleton flashes come from. |
| Performance | 8 timing assertions, no budgets. Measured today: home 933 KB JS → Maps and the Meta pixel deferred; tab navigation in the app 0.2–0.8 s; no white reloads. |
| CI | Regression ≈ 6 min, mobile WebView ≈ 7 min, deploy ≈ 2 min. The repository is **public**, so GitHub Actions minutes are free; the only hosting cost is the Cloudflare Worker that serves test and production. |
| Security | Audited today: RLS leak on `projects` fixed (migration 175), professional feed stripped of client contact, rate limits on public endpoints, Android backups off. |

## 2. Gaps that stand between today and "100 %"

Ordered by how likely each is to let a bug reach a user.

1. **Thin depth on the marketplace editors and admin.** `/empleos/[id]/editar` and `/ofertas/[id]/editar` are never opened by a test; admin has 3 tests for 16 pages. The publish flows are exercised through the API, not the form the user sees.
2. **No Safari/WebKit.** Every test runs on Chromium. The iOS app is a WebKit WebView; an iOS-only CSS or input bug would pass CI.
3. **No pixel-level visual regression.** The "visual" spec measures geometry (alignment, menus, dialogs) but never compares screenshots, so a wrong color, a broken icon or a misplaced image passes.
4. **Skeleton policy is implicit.** Each component decides when to show a skeleton; most refetch on every mount. The rule should be: *show cached data instantly, refresh silently, skeleton only when there is nothing cached yet.*
5. **No performance budgets.** Nothing fails when a page gets heavier or slower.
6. **Assistant answers are asserted by intent, not read by a person.** Tone, accents and usefulness of the 17 documented answers have never been reviewed as a set.
7. **Inline bilingual strings are unguarded.** A new hard-coded Spanish string in a component reaches English users unnoticed.
8. **Manual testing pollutes isolation.** Any account other than the two regression identities breaks the fixture check, as happened today.

## 3. The plan

Each block ends with a gate. Nothing moves to the next block until the gate is green.

### Block A — Depth where users actually click (2–3 sessions)

- UI flows for *publish offer → edit → unpublish* and *publish job → edit → close*, on both viewports, with the seeded identities.
- Admin: one test per section that renders it and performs its primary action with the disposable administrator.
- Onboarding, `completar-perfil`, `reset-password` and `olvide-contrasena` through the real screens.
- Mobile app: the same flows inside the native shell (header/bottom nav/back).
- **Gate:** every page in `src/app/[locale]` is *opened and interacted with* by at least one test, not only mapped.

**Status 2026-08-22.** Block A gate reached on CI: the manual release regression
(`Regression Tests` → *Run workflow*) is green on `5c1c02c4` — 4 shards × 104
tests, zero failures, zero flakies — and `mobile-native-regression` is green on
the matching `mobile` commit. Delivered on the way: real-screen editors and
account specs, the offer-form FileList bug, the optimistic-status race in the
offer/job managers, segmented filters that never clip at 320px, the assistant
route no longer booting wrangler outside the Worker, third-party hosts kept off
the wire during tests, the request journal and Supabase log dump in CI, and a
dedicated concurrency group so pushes cannot cancel a pending release run.
Admin (2026-08-22): audited every section on desktop and phone. Fixed the empty
daily charts (bar columns had no height), review cards naming "Profesional",
clipped verification rows on phones and the phone rail not showing the active
section. Added `Empleos`, `Ofertas` (every publication with its creator and
moderation actions) and `Cobertura` (professionals per service, province and
canton, including the empty ones); the services catalogue folds per category
with professional counts. Analytics now records searches, job views,
applications, offer views and assistant questions, each tagged web/native
(migration 176, applied to test and production). `admin-smoke` exercises the
new sections and the primary actions. Still open in Block A: `olvide-contrasena`.

### Block B — Visual truth (1–2 sessions)

- Screenshot baselines with `toHaveScreenshot` for ~30 deterministic routes on Pixel 7 and desktop, fed only by seeded data. Masks for timestamps and avatars.
- Add a **WebKit** project running the smoke subset (public routes, login, search, profile, chat).
- **Gate:** a one-pixel regression on a baseline fails CI; the smoke subset passes on WebKit.

### Block C — Loading and speed (1 session)

- One `useCachedResource` hook with stale-while-revalidate semantics, migrating the 8 components that own the 23 `no-store` fetches. Invalidate on mutation and on realtime events; keep the existing module caches.
- Performance budgets asserted in CI against the local production build: home JS ≤ 450 KB, first contentful paint ≤ 1.5 s on the throttled mobile profile, no route above 800 KB.
- **Gate:** navigating back to a section already visited shows content with no skeleton; budgets enforced.

### Block D — Assistant review (1 session, with you)

- A prompt matrix of ~60 prompts (Spanish, English, tico phrasing, typos, emergencies, account questions, marketplace questions, native-only flows), run locally, answers captured to a table.
- You and I read every answer once; wording fixes go into the route; the matrix becomes a test.
- **Gate:** every documented answer reviewed and frozen by a test.

### Block E — Guardrails (half a session)

- ESLint rule that forbids new `isEn ?`-style ternaries outside the two files that legitimately need them; a migration budget for the existing 406.
- `seed:test:verify` run before and after every manual test session, documented in `docs/regression-testing.md`.
- **Gate:** CI rejects a new hard-coded bilingual string.

### Block F — Ship (after A–E)

- Android: release build, internal testing track, the Apple 1.2 screen recording captured on the device.
- iOS: Xcode archive on this Mac, TestFlight, App Review resubmission with the recording and the native sign-in.

## 4. Costs

- GitHub Actions: free while the repository is public. If it becomes private (recommended for a commercial product — the source, project refs and business rules are visible today), current usage (~100 min/month) stays far inside the 2,000 free minutes.
- Hosting: regression and mobile suites run against a local production build and a local Supabase stack, so they cost nothing in Cloudflare or Supabase. Only the mobile WebView job reads the live test project.
- The macOS runner (iOS simulator) is the one expensive job; it stays on demand.
