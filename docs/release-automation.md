# Release automation

ContrataCR uses two deploy environments:

- **test**: preview/test Supabase, media providers and Cloudflare Worker deployment.
- **production**: real production services.

The app builds with OpenNext and deploys through Cloudflare Workers. Supabase database changes, Cloudflare D1 padrón refreshes and encrypted Supabase database backups are managed from GitHub Actions so changes are repeatable and reviewable.

## GitHub Environments

Create two GitHub Environments with these exact names:

- `test`
- `production`

Database migrations are manual for both environments.

Each environment needs these secrets:

| Secret | Used by | Notes |
|---|---|---|
| `SUPABASE_DB_URL` | Supabase migrations and backups | Percent-encoded Postgres connection string for that environment. |
| `SUPABASE_URL` | Server runtime and regression | Supabase project URL for that environment. |
| `NEXT_PUBLIC_SUPABASE_URL` | Regression Tests | Optional if `SUPABASE_URL` already exists in the same GitHub Environment; the workflow accepts either one. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server runtime and regression | Server-only service role key. Never expose it as a public build variable. |
| `CLOUDFLARE_API_TOKEN` | Worker deploy and D1 refresh | Scope it to the required account, Workers scripts and D1 database. |
| `CLOUDFLARE_ACCOUNT_ID` | Worker deploy and D1 refresh | Cloudflare account that owns the Workers and `contratacr-padron`. |
| `REGRESSION_TEST_PASSWORD` | Regression Tests | Shared secret for the protected ContrataCR/SG regression actors. |
| `ADVERTISING_TEST_PASSWORD` | Regression Tests | Separate secret for the manual advertising account in test. |
| `BACKUP_ENCRYPTION_PASSPHRASE` | Supabase backup | Long random passphrase used to encrypt backup artifacts. Store a copy in a password manager. |

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

## Cloudflare D1 padrón refresh

The TSE padrón is operational data, not a Supabase schema migration. Its source of truth is the shared Cloudflare D1 database `contratacr-padron`. Migration 173 removed the old Supabase `padron` and `padron_staging` tables after the D1 cutover was verified.

Use **Actions -> Cloudflare D1 padron refresh**.

Run `dry_run=true` first. A real promotion uses `target=production`, `dry_run=false`, and must run from `main`. The workflow downloads the official TSE source, prepares bounded D1 SQL chunks, swaps the live D1 table and verifies a known sample.

Recommended verification flow:

1. Confirm `CLOUDFLARE_API_TOKEN` and the account ID are available in the selected GitHub Environment.
2. Run the D1 refresh with `dry_run=true`.
3. Review the prepared chunk count and sample lookup.
4. Run the real promotion from `main` with `target=production`, `dry_run=false`.
5. Verify `/api/cedula` reports `source=cloudflare_d1_padron` for the known sample.

The refresh is manual unless its workflow schedule is explicitly enabled. Production runs are blocked unless the workflow is run from `main`.

Do not use the legacy Supabase padrón load/check scripts as the production refresh path.

## Supabase backups

Use **Actions -> Supabase backup**.

Production backups run daily at 2:10 AM Costa Rica time and upload an encrypted artifact retained for 30 days. The workflow uses `pg_dump` custom format, encrypts the dump with GPG AES256, and does not upload the raw database dump.

The D1 padrón is outside the Supabase dump. Legacy `public.padron` exclusions may remain in the workflow for restore compatibility, but migrations 173+ do not keep those tables.

Manual backup flow:

1. Confirm `SUPABASE_DB_URL` and `BACKUP_ENCRYPTION_PASSPHRASE` exist in the chosen GitHub Environment.
2. Run **Supabase backup** from `test` with `target=test`, or from `main` with `target=production`.
3. Download the artifact only when needed and decrypt it with the passphrase stored outside GitHub.
4. Restore to a clean recovery Supabase project first, then verify the separate Cloudflare D1 padrón.

Detailed restore steps are in `docs/backups.md`.

## Regression and security checks

- **Regression Tests**: automatic on `test` and manually dispatchable from `test`; it runs the full suite against `next start` inside GitHub Actions while using only the isolated test data environment.
- **Security checks**: automatic on `main`, `test`, pull requests, and manual runs. It runs secret smoke checks, Supabase template validation, automation-script lint, build, and `npm audit --audit-level=high`.
- **Dependabot**: weekly npm PRs and monthly GitHub Actions PRs.
