# Release automation

ContrataCR uses two deploy environments:

- **test**: preview/test Supabase, Cloudinary and Vercel deployment.
- **production**: real production services.

The app code still deploys through Vercel. Supabase database changes and padron refreshes are managed from GitHub Actions so changes are repeatable and reviewable.

## GitHub Environments

Create two GitHub Environments with these exact names:

- `test`
- `production`

Database migrations are manual for both environments.

Each environment needs these secrets:

| Secret | Used by | Notes |
|---|---|---|
| `SUPABASE_DB_URL` | Supabase migrations, padron refresh | Percent-encoded Postgres connection string for that environment. |
| `SUPABASE_URL` | Padron refresh | Supabase project URL for that environment. |
| `NEXT_PUBLIC_SUPABASE_URL` | Regression Tests | Optional if `SUPABASE_URL` already exists in the same GitHub Environment; the workflow accepts either one. |
| `SUPABASE_SERVICE_ROLE_KEY` | Padron refresh | Server-only service role key. Never expose it in Vercel public variables. |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Regression Tests | Required in the `test` environment so Playwright can access protected Vercel preview deployments. |

Do not put these in repository variables. Use environment secrets only.

## Database migrations

Use **Actions -> Supabase migrations**.

### Safety check

The workflow refuses to apply `001_initial_schema.sql`. If that ever appears in the migration plan, stop and review the database history before continuing.

New migrations are applied manually from GitHub Actions:

1. Commit a new file in `supabase/migrations/`.
2. Push the code to the `test` branch.
3. Run **Actions -> Supabase migrations** from the `test` branch with `target=test`, `dry_run=true`.
4. If the plan only shows the expected new migration(s), run it again with `target=test`, `dry_run=false`.
5. Run **Regression Tests** against the test URL.
6. Push or merge the same code to `main`.
7. Run **Actions -> Supabase migrations** from the `main` branch with `target=production`, `dry_run=true`.
8. If the production plan matches expectation, run it again with `target=production`, `dry_run=false`.

Production runs are blocked unless the workflow is run from `main`.

## Padron refresh

The TSE padron is operational data, not a schema migration. A new Supabase environment can have all migrations applied and still fail identity lookup if the `padron` table is empty.

Use **Actions -> Padron refresh**.

The refresh only touches `public.padron`, `public.padron_staging`, and `public.finalize_padron_swap()`. Migration `084_harden_padron_swap.sql` must be applied before running it in an environment: it restricts the swap function to server roles and refuses to promote staging if fewer than 3,000,000 rows were loaded. The workflow then verifies both the direct SQL lookup and the REST/RPC lookup used by the app server.

Recommended flow for a new test environment:

1. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the `test` GitHub Environment.
2. Confirm `SUPABASE_DB_URL` is also present in that same `test` Environment.
3. Run **Supabase migrations** with `target=test` first.
4. Run **Padron refresh** with `target=test`.
5. Confirm the workflow finishes without errors.
6. Test a national cedula in the app.

Production refresh runs monthly on schedule and can also be run manually with `target=production`. Production runs are blocked unless the workflow is run from `main`.

Local check:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run padron:check
```

Local load, only when needed:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run padron:load -- ./padron_completo.txt
```

## Regression and security checks

- **Regression Tests**: manual full Playwright suite fixed to the test branch and test deployment.
- **Security checks**: automatic on `main`, `test`, pull requests, and manual runs. It runs secret smoke checks, Supabase template validation, automation-script lint, build, and `npm audit --audit-level=high`.
- **Dependabot**: weekly npm PRs and monthly GitHub Actions PRs.
