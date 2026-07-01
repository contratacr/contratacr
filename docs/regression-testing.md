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

## Test tags

- `@smoke`: public routes, support/login rendering, and public APIs. These do not need seeded users.
- `@seeded`: search cards, professional profile, and profile share image. These skip automatically if the test database has no professionals.

## GitHub Actions

Use **Actions > Regression Tests > Run workflow**.

- Select `test` in **Use workflow from**.
- The workflow is fixed to the test Vercel URL and has no runtime inputs.
- It refuses to run from any branch other than `test`.

If the Vercel test deployment is protected, add `VERCEL_AUTOMATION_BYPASS_SECRET` to the GitHub Environment secrets for `test`. Playwright will send it as the Vercel automation bypass header.

## Notes

When running locally, Google Maps can log `RefererNotAllowedMapError` if the local URL is not allowed in Google Cloud. That warning does not fail the suite; the test environment URL should be allowlisted.
