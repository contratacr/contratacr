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
| Search | Service/location filters, provinces/cantons, near me, video nationwide, cards, favorite layout, responsive overflow | UI + DB |
| Professional profile | Public profile, booking entry, share PNG, responsive rendering | UI + API |
| Registration/auth | Login, Google entry, registration routes, forgot-password privacy, invalid reset requests | UI + API + Contract |
| Account security | Real password change/login/restore, email-change states, account write protection | UI + API + DB |
| Client requests | Create booking, double-book prevention, professional receipt, work completion, client confirmation, cancellation | API + DB + notification assertions |
| Reviews | Create after completion, edit existing review, one review per request | API + DB |
| Publications/opportunities | Publish, propose, edit, withdraw, reject, accept, ownership, complete, cancel, notification noise rules | API + DB + notification assertions |
| Availability | Weekly slots, video/in-person shared capacity, double-book prevention, private/public agenda persistence | UI + API + DB |
| Professional services | Add-service selector and real service-description persistence | UI + DB |
| Success cases | Modal, image upload, stored case, cleanup | UI + DB |
| Profile | Professional bio persistence and every client/professional panel section | UI + DB |
| Notifications | Lifecycle rows, cancellation recipients, every type translated, unified-panel destination | API + DB + Contract |
| Support | Guest and signed-in creation, acknowledgement, conversation, reopen, resolve/confirm | API + DB |
| Admin | Signed-out boundary and authenticated routes for overview, verification, users, reports, insurers, services, accounts, subscriptions, support, analytics, activity | UI |
| Localization | Public routes in Spanish/English, English panels, notification labels and destinations | UI + Contract |
| Responsive | Entire suite repeated at 390 x 844; explicit overflow/modal/card checks | UI |
| Security baseline | Test-only Supabase guard, guest write rejection, private env check, TypeScript contracts, Vercel protection preflight | Contract + CI |

## External-provider boundary

The suite can verify ContrataCR's request, response handling, and resulting UI. It cannot guarantee another company's delivery or uptime. When related code or configuration changes, perform these short checks in test:

1. **Email:** create one account and request one password reset; confirm both messages arrive and their links/codes work.
2. **Google OAuth:** complete one sign-in and confirm the callback returns to the intended locale.
3. **Maps:** load `/buscar`, use location suggestions and near-me permission, and confirm map tiles/pins render.
4. **Cloudinary:** upload one profile photo and one success-case image, then remove the temporary assets.
5. **WhatsApp/call/email links:** open one professional profile and confirm the generated destination belongs to that professional.

## What a green run means

A green run provides strong evidence that the current deployed test build, test database schema, permissions, responsive UI, translations, and principal business lifecycles work together. It does **not** mathematically prove the absence of every bug, cover every possible data combination, or certify third-party infrastructure. Any test skipped unexpectedly makes the run incomplete and must be investigated before production promotion.
