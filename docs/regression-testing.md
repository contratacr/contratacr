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
- Admin signed-out login surface always; authenticated admin sections if `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` are configured.

No regression suite can prove literally every possible user data combination, but this is the launch safety net for every major product surface and the flows most likely to regress.

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
