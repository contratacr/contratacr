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
| `SUPABASE_DB_URL` | Supabase migrations | Percent-encoded Postgres connection string for that environment. |
| `SUPABASE_ACCESS_TOKEN` | Email templates | Supabase personal access token with access to the project. |
| `SUPABASE_PROJECT_REF` | Email templates | Project ref, for example `sodegkfjjrdkbohycqyq`. |

Do not put these in repository variables. Use environment secrets only.

## Database migrations

Use **Actions -> Supabase migrations**.

### One-time baseline check

Because this project started with migrations that were often pasted manually in Supabase SQL Editor, each Supabase environment must be baselined once before applying migrations automatically.

Run `target=test`, `dry_run=true`.

- If it shows only new migrations that really need to run, continue normally.
- If it shows old migrations that already exist in the database, do **not** apply. Ask Codex to repair/baseline Supabase migration history for that environment first.

Repeat the same dry-run check for production before the first real production migration.

Recommended flow:

1. Run `target=test`, `dry_run=true`.
2. If the migration list is correct, run `target=test`, `dry_run=false`.
3. Run **Regression Tests** against the test URL.
4. Run `target=production`, `dry_run=true`.
5. If production dry run matches expectation, run `target=production`, `dry_run=false`.

Production runs are blocked unless the workflow is run from `main`.

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

- **Regression Tests**: manual full Playwright suite against a selected URL.
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
