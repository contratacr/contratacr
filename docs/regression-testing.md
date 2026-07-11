# Regression testing

This suite is designed to run against the **test environment**. Production should receive the same deployed code after test passes; do production smoke checks manually in the browser when needed.

## Commands

Run against the local app:

```bash
npm run test:e2e
```

Run against the Vercel/Supabase/Cloudinary test environment:

```bash
PLAYWRIGHT_BASE_URL=https://your-test-url.vercel.app npm run test:e2e
```

Run only the always-safe smoke layer:

```bash
npm run test:e2e:smoke
```

Open the Playwright UI:

```bash
npm run test:e2e:ui
```

## Release gate

A release candidate is accepted only when the test-environment workflow finishes with:

- TypeScript contracts passing.
- No committed `test.only`.
- Every seeded account and test-environment secret available.
- The complete desktop and mobile suite green after retries.
- No unexpected skipped test in the Playwright report.
- The external-provider checklist below reviewed when auth, email, maps, WhatsApp, or uploads changed.

The detailed source of truth is [the regression coverage matrix](./regression-coverage-matrix.md).

## Coverage

The suite runs in two Playwright projects:

- `chromium-desktop`: 1366 x 900.
- `chromium-mobile`: Pixel 7 viewport.

It covers:

- Public routes in Spanish and English: home, services, legacy categories redirect, search, auth, registration, support, help, contact, how it works, atraer clientes, privacy and terms.
- Public APIs for service search and the approved service catalog.
- Services catalog behavior: known service search, empty enter behavior, unknown-service suggestion CTA, and untranslated-key guards.
- Guest service suggestions: anonymous submissions create a pending admin moderation row and the test cleans up the temporary hidden service.
- Navbar/public shell checks on desktop and responsive.
- Search results and professional cards, including responsive favorite-button layout.
- Public professional profile and professional Open Graph image generation.
- Client booking API flow: create request, block double booking, professional view, mark work done, client completion.
- Booking/project/proposal notifications for create, edit, accept, reject, work done, complete, withdraw and cancellation paths.
- Projects/proposals API flow: publish request, professional proposal, edit proposal, reject/accept ownership rules, complete project.
- Proposal withdrawal, declined-proposal behavior, and cancellation noise checks.
- Dashboard surfaces for professional mode: profile, services, success cases, availability, requests received, opportunities, verification, notifications, support, account security.
- Dashboard surfaces for client mode: profile, my requests, my posts, favorites, notifications, support, account security.
- UI entry points for booking and publishing request modals without submitting.
- Editable review lifecycle after completed work, including one-review-per-request persistence.
- Signed-in and guest support ticket creation, automatic acknowledgement, reply, reopen, and confirmation.
- Real password change and restored seeded credentials.
- Real professional bio, service description, success-case upload, and availability privacy persistence.
- Notification translation and destination contracts for every supported notification type.
- Protected API boundaries for guest users and privacy-safe forgot-password behavior.
- English professional and client panels, localized footer routes, and safe external links.
- Admin signed-out boundary and all authenticated admin sections through the seeded test admin account.

No regression suite can prove literally every possible user-data combination or guarantee external-provider uptime. This suite is the launch safety net for every major product surface and the flows most likely to regress.

## Test tags

- `@smoke`: public routes, support/login rendering, services catalog, admin signed-out surface, and public APIs. These do not need seeded users.
- `@seeded`: search cards, professional profile, profile share image, dashboard surfaces, booking/project/proposal flows, and modal entry points. These use the test Supabase project and skip automatically if seeded regression is disabled.

## GitHub Actions

Use **Actions > Regression Tests > Run workflow**.

- You can leave **Use workflow from** on GitHub's default branch. The workflow checks out `test` internally.
- The workflow is fixed to the test Vercel URL and has no runtime inputs.
- It always runs the regression suite against the `test` branch and test deployment.

If the Vercel test deployment is protected, add `VERCEL_AUTOMATION_BYPASS_SECRET` to the GitHub Environment secrets for `test`. Playwright will send it as the Vercel automation bypass header.

The workflow also performs a preflight `curl` with the bypass header before running Playwright. If the secret is missing, stale, or not accepted by the current test deployment, the workflow fails early with a Vercel-specific message. This prevents a protected Vercel login page from producing dozens of misleading app test failures.

If the bypass secret was rotated, redeploy the `test` branch before rerunning Regression Tests.

## Notes

When running locally, Google Maps can log `RefererNotAllowedMapError` if the local URL is not allowed in Google Cloud. That warning does not fail the suite; the test environment URL should be allowlisted.

Playwright verifies that ContrataCR submits or renders the correct behavior around Google OAuth, Resend/Brevo, Cloudinary, Google Maps, and WhatsApp. It cannot guarantee that those independent providers deliver a message, keep their service online, or preserve a third-party UI. Use the short manual checklist in the coverage matrix whenever one of those integrations changes.
