# Backups

ContrataCR backs up the Supabase database with GitHub Actions.

## What is backed up

The **Supabase backup** workflow creates a daily encrypted logical dump with `pg_dump`.

It includes the database content reachable through the Postgres connection, including:

- `public` app data: profiles, professionals, services, bookings, projects, proposals, notifications, support tickets, reports and admin catalog data.
- Supabase auth/storage metadata stored in Postgres, such as auth users and storage rows.
- Schema objects needed by the dump, without owner or ACL metadata.

It intentionally excludes data from:

- `public.padron`
- `public.padron_staging`

The padron is large operational data and is reloaded from TSE through the **Padron refresh** workflow.

## What is not backed up

- Cloudinary original image/video binaries. The database backup stores URLs and metadata, but not the media files themselves.
- Vercel project settings and environment variables.
- Supabase dashboard/provider settings outside Postgres.
- External email provider account settings.

Email templates are stored in `supabase/email-templates/` and code/migrations are stored in Git.

For Cloudinary, enable Cloudinary automatic backup when possible. Cloudinary documents automatic backup as the way to recover deleted original assets and previous versions. Until then, avoid deleting production folders manually unless you are sure the asset is unused.

## GitHub secrets

Add this secret to both GitHub Environments:

- `production`
- `test`

| Secret | Required by | Notes |
|---|---|---|
| `SUPABASE_DB_URL` | Supabase backup | Postgres connection string for the environment. Use direct connection or session pooler on port `5432`, not transaction pooler `6543`. |
| `BACKUP_ENCRYPTION_PASSPHRASE` | Supabase backup | Long random passphrase used to encrypt backup artifacts with GPG AES256. Store it outside GitHub too. |

Recommended passphrase: at least 32 random characters. Save it in a password manager. Without it, the artifact cannot be restored.

## Schedule

Production backups run daily at **2:10 AM Costa Rica time**.

Manual backups:

1. Go to **Actions -> Supabase backup**.
2. Click **Run workflow**.
3. Select `test` or `production`.
4. Run from the matching branch:
   - `test` for test backups.
   - `main` for production backups.

Artifacts are retained for 30 days to control GitHub storage use.

## Restore checklist

Restore into a new Supabase project first. Do not restore directly over production unless there is a deliberate emergency plan.

1. Download the artifact from **Actions -> Supabase backup**.
2. Decrypt the dump:

```bash
gpg --decrypt contratacr-production-supabase-YYYYMMDDTHHMMSSZ.dump.gpg > backup.dump
```

3. Verify the checksum:

```bash
sha256sum -c contratacr-production-supabase-YYYYMMDDTHHMMSSZ.dump.sha256
```

4. Inspect the dump:

```bash
pg_restore --list backup.dump | head
```

5. Restore to a clean test/recovery database:

```bash
pg_restore \
  --dbname "$RESTORE_DB_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  backup.dump
```

6. Load the padron separately with **Padron refresh**.
7. Point a test deployment at the restored Supabase project and run regression tests before switching production traffic.

## Monthly check

Once per month, download the latest production artifact and run steps 2-4 locally. A backup that has never been decrypted is only a hope, not a recovery plan.
