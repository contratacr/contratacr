# Release automation

ContrataCR uses two deploy environments:

- **test**: preview/test Supabase, Cloudinary and Vercel deployment.
- **production**: real production services.

The app code still deploys through Vercel. Supabase database changes and Supabase Auth email templates are deployed from GitHub Actions so changes are repeatable and reviewable.

## GitHub Environments

Create two GitHub Environments with these exact names:

- `test`
- `production`

For `production`, enable required reviewers so a production database/template change cannot run by accident.

Each environment needs these secrets:

| Secret | Used by | Notes |
|---|---|---|
| `SUPABASE_DB_URL` | Supabase migrations, padron refresh | Percent-encoded Postgres connection string for that environment. |
| `SUPABASE_ACCESS_TOKEN` | Email templates | Supabase personal access token with access to the project. |
| `SUPABASE_PROJECT_REF` | Email templates | Project ref, for example `sodegkfjjrdkbohycqyq`. |
| `SUPABASE_URL` | Padron refresh | Supabase project URL for that environment. |
| `SUPABASE_SERVICE_ROLE_KEY` | Padron refresh | Server-only service role key. Never expose it in Vercel public variables. |

Do not put these in repository variables. Use environment secrets only.

## Database migrations

Use **Actions -> Supabase migrations**.

### One-time baseline check

Because this project started with migrations that were often pasted manually in Supabase SQL Editor, each Supabase environment must be baselined once before applying migrations automatically.

Run `target=test`, `dry_run=true`.

- If it shows only new migrations that really need to run, continue normally.
- If it shows old migrations that already exist in the database, do **not** apply. Use **Actions -> Supabase baseline migrations** first.
- The migration workflow blocks automatically if `001_initial_schema.sql` is pending, unless `allow_initial_migrations=true` is explicitly selected for a brand-new empty database.

Repeat the same dry-run check for production before the first real production migration.

Recommended baseline for an existing environment that was already built manually:

1. Run **Supabase baseline migrations** with `dry_run=true`.
2. Use `baseline_through=083` when the database already has everything before `084_harden_padron_swap.sql`.
3. If the listed versions look correct, run it again with `dry_run=false`.
4. Run **Supabase migrations** with `dry_run=true`; it should now show only newer migrations such as `084_harden_padron_swap.sql`.
5. If the list is correct, run **Supabase migrations** with `dry_run=false`.

Recommended flow:

1. Run `target=test`, `dry_run=true`.
2. If the migration list is correct, run `target=test`, `dry_run=false`.
3. Run **Regression Tests** against the test URL.
4. Run `target=production`, `dry_run=true`.
5. If production dry run matches expectation, run `target=production`, `dry_run=false`.

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

## Supabase Auth email templates

Templates live in:

```text
supabase/email-templates/
```

The deploy manifest is:

```text
supabase/email-templates/templates.json
```

Use **Actions -> Supabase email templates**.

Recommended flow:

1. Edit the HTML template in the repo.
2. Run `target=test`, `dry_run=true`.
3. Run `target=test`, `dry_run=false`.
4. Send the real test email from Supabase/Auth and verify the link/code.
5. Run `target=production`, `dry_run=true`.
6. Run `target=production`, `dry_run=false`.

The sync logs only field names and hashes, not HTML content or secrets.

## Regression and security checks

- **Regression Tests**: manual full Playwright suite fixed to the test branch and test deployment.
- **Security checks**: automatic on `main`, `test`, pull requests, and manual runs. It runs secret smoke checks, Supabase template validation, automation-script lint, build, and `npm audit --audit-level=high`.
- **Dependabot**: weekly npm PRs and monthly GitHub Actions PRs.

## Local commands

Dry-run email templates locally:

```bash
SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... node scripts/sync-supabase-email-templates.mjs --dry-run
```

Apply email templates locally only when needed:

```bash
SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... node scripts/sync-supabase-email-templates.mjs
```

Prefer GitHub Actions for production.
