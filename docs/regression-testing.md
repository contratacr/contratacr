# Regression testing

This suite is designed to run against the **test environment** first. Production should normally receive the same deployed code after test passes; use production only for a small manual smoke check when needed.

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

Use **Actions > Regression Tests > Run workflow** and pass the test URL, or set a repository variable:

```text
PLAYWRIGHT_BASE_URL=https://your-test-url.vercel.app
```

The workflow is manual on purpose so it does not hit production accidentally.

## Notes

When running locally, Google Maps can log `RefererNotAllowedMapError` if the local URL is not allowed in Google Cloud. That warning does not fail the suite; the test environment URL should be allowlisted.
