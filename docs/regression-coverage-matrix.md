# Regression coverage matrix

This matrix defines the ContrataCR release safety net for the isolated **test environment**. Every Playwright test runs on desktop Chrome and a Pixel 7 viewport unless noted otherwise.

Legend:

- **UI**: the browser performs the user interaction.
- **API**: ownership, validation, and state transitions are exercised directly.
- **DB**: Supabase persistence and uniqueness are verified and test data is cleaned up.
- **Contract**: translations, destinations, or access boundaries are checked without depending on a third party.

| Area | Critical behavior | Coverage |
| --- | --- | --- |
| Public shell | Spanish/English routes, navbar, footer, resources, legal pages, responsive layout | UI |
| Services | Catalog, sections, known/unknown search, suggestions, canonical labels, admin moderation row | UI + API + DB |
| Search | Service/location filters, province-wide professionals matching province and canton searches, resolved-address coordinates used for ranking without an unintended near-me radius, near me, video nationwide, cards, favorite layout, responsive overflow, and mobile service/location context after navigation | UI + DB |
| Professional profile | Public profile, booking entry, share PNG, responsive rendering, and navigation from reviews back to results/home without freezing | UI + API |
| Registration/auth | Login, Google entry, registration routes, forgot-password privacy, invalid reset requests | UI + API + Contract |
| Account security | Real password change/login/restore, email-change states, account write protection, and deletion of authenticated WhatsApp follow-ups without affecting another account | UI + API + DB |
| Client requests | Create booking, double-book prevention, professional receipt, work completion, client confirmation, cancellation | API + DB + notification assertions |
| Reviews | Create after completion, edit existing review, one review per request | API + DB |
| Publications/opportunities | Publish, propose, edit, withdraw, reject, accept, ownership, complete, cancel, notification noise rules | API + DB + notification assertions |
| Availability | Weekly slots, video/in-person shared capacity, double-book prevention, private/public agenda persistence | UI + API + DB |
| Professional services | Add-service selector, real service-description persistence, image replacement/preview, contained month/year menus, and stable save-button geometry while saving | UI + DB |
| Success cases | Modal, image upload, stored case, cleanup | UI + DB |
| Profile | Professional bio persistence, every client/professional panel section, and a visible non-collapsing loading body while the first request is pending | UI + DB |
| Notifications | Lifecycle rows, cancellation recipients, every type translated, unified-panel destination | API + DB + Contract |
| Support | Guest and signed-in creation, acknowledgement, conversation, reopen, resolve/confirm | API + DB |
| Direct chat | One conversation per context, profile/request/proposal linkage, both participants, unread/read state, realtime delivery, archive/restore/reopen, blocked threads and outsider rejection | UI + API + DB |
| ContrataCR AI | Real OpenAI provider, complete action routing, live professional results, service suggestions, emergency guardrail, prompt-injection privacy, Spanish/English, responsive UI, navigation continuity, private account history and deletion | UI + API + DB + Contract |
| Admin | Signed-out boundary, private API boundaries and authenticated routes for overview, verification, users, requests, publications, reports, insurers, services, accounts, subscriptions, support, analytics and activity | UI + API |
| Localization | Public routes in Spanish/English, English panels, notification labels and destinations | UI + Contract |
| Responsive | Entire suite repeated at 390 x 844; explicit overflow/modal/card checks, including separate service/price rows and price-unit/tax detail | UI |
| Security baseline | Test-only Supabase guard, guest write rejection, private env check, TypeScript contracts, hosted deployment preflight | Contract + CI |

## Permanent contracts for reported bugs

| Reported regression | Permanent test |
| --- | --- |
| A professional serving an entire province disappeared from canton/address searches | `search-results.spec.ts` — `whole-province coverage survives canton and resolved-address searches` |
| A completed mobile search lost the selected service and location | `search-results.spec.ts` — `completed searches keep the selected service and location in the mobile search header` |
| Mobile cards clipped service/price or failed to explain unit and tax | `search-results.spec.ts` — `mobile cards keep service, price and price detail on aligned rows` |
| The language filter looked like Spanish was already selected | `search-results.spec.ts` — `filters expose the current search controls and retired controls stay gone` |
| Dashboard sections briefly rendered a header with an empty body | `dashboard-surfaces.spec.ts` — `dashboard sections never expose a blank body while their first request is pending` |
| Service-image preview, month/year menus, or the saving button broke inside the responsive modal | `extended-lifecycle.spec.ts` — `professional profile and service edits persist through their real UI` |
| Navigating away from the Reviews tab froze until refresh | `professional-profile.spec.ts` — `reviews never freeze navigation back to results or home` |
| Mobile Offers/Jobs scrolled their header/actions away and the owner buttons consumed too much vertical space | `seeded-regression.spec.ts` — `mobile offers and jobs keep compact owner actions above the scrolling cards` |
| Image types accepted by inputs and actual file bytes drifted apart | `product-contract.spec.ts` — `image upload formats are synchronized and validated by real bytes` |
| The mobile menu lost clicks before hydration and `/servicios` hydrated into a different tree | `recent-visual-regression.spec.ts` — `professional registration is turquoise text for client-only accounts and hidden for providers`; `public-smoke.spec.ts` — `services search uses the canonical design and art label` |
| Account deletion failed when an authenticated WhatsApp follow-up could not be nulled | `account-lifecycle.spec.ts` — `permanent deletion removes only the populated target and returns to the English home` |

## External-provider boundary

The suite can verify ContrataCR's request, response handling, and resulting UI. It cannot guarantee another company's delivery or uptime. When related code or configuration changes, perform these short checks in test:

1. **Email:** create one account and request one password reset; confirm both messages arrive and their links/codes work.
2. **Google OAuth:** complete one sign-in and confirm the callback returns to the intended locale.
3. **Maps:** load `/buscar`, use location suggestions and near-me permission, and confirm map tiles/pins render.
4. **Cloudinary:** upload one profile photo and one success-case image, then remove the temporary assets.
5. **WhatsApp/call/email fallback links:** open one professional profile and confirm the generated destination belongs to that professional. In-app chat behavior is covered automatically.
6. **OpenAI:** ask one natural-language service question and confirm the response reports `aiProvider: openai`; deterministic safety and navigation fallbacks remain covered even if the provider is unavailable.

## What a green run means

A green run provides strong evidence that the current deployed test build, test database schema, permissions, responsive UI, translations, and principal business lifecycles work together. It does **not** mathematically prove the absence of every bug, cover every possible data combination, or certify third-party infrastructure. Any test skipped unexpectedly makes the run incomplete and must be investigated before production promotion.
