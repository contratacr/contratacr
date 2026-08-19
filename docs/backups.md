# Backups

ContrataCR backs up the Supabase database with GitHub Actions.

## What is backed up

The **Supabase backup** workflow creates a daily encrypted logical dump with `pg_dump`.

It includes the database content reachable through the Postgres connection, including:

- `public` app data: profiles, professionals, services, bookings, projects, proposals, notifications, support tickets, reports and admin catalog data.
- Supabase auth/storage metadata stored in Postgres, such as auth users and storage rows.
- Schema objects needed by the dump, without owner or ACL metadata.

The national padrón is not part of Supabase anymore. It is rebuildable operational data stored in Cloudflare D1 and refreshed from TSE through the **Cloudflare D1 padron refresh** workflow.

## What is not backed up

- Cloudinary or R2 original binaries. The database backup stores URLs and metadata, but not the media files themselves.
- Cloudflare Worker/D1/R2 settings, objects and environment variables.
- Supabase dashboard/provider settings outside Postgres.
- External email provider account settings.

Email templates are stored in `supabase/email-templates/` and code/migrations are stored in Git.

Maintain a provider inventory for both R2 and Cloudinary. Avoid deleting production objects or folders manually unless ownership records prove the asset is unused. Database recovery alone does not restore media binaries.

## GitHub secrets

Add this secret to both GitHub Environments:

- `production`
- `test`

| Secret | Required by | Notes |
|---|---|---|
| `SUPABASE_DB_URL` | Supabase backup | Postgres connection string for the environment. Use direct connection or session pooler on port `5432`, not transaction pooler `6543`. |
| `BACKUP_ENCRYPTION_PASSPHRASE` | Supabase backup | Long random passphrase used to encrypt backup artifacts with GPG AES256. Store it outside GitHub too. |

Recommended passphrase: at least 32 random characters. Save it in a password manager. Without it, the artifact cannot be restored.

Use the same `BACKUP_ENCRYPTION_PASSPHRASE` value in `production` and `test`.
The **Sync production data to test** workflow transfers its one-day mirror only
as an AES256-encrypted artifact between those isolated GitHub Environments.

## Production mirror in test

The **Sync production data to test** workflow replaces the test application
data with the production directory and public marketplace content. It runs
automatically when its workflow definition changes and can also be started
manually by entering `SYNC_PRODUCTION_TO_TEST`.

The sync deliberately does not copy production passwords, sessions, tokens,
MFA factors, private conversations, bookings, projects, applications,
notifications, support histories or saved items. Real contact and identity
fields are sanitized. Those private sections are populated only with synthetic
regression data exchanged between ContrataCR and SG Solutions. Their production
names and profile-photo URLs are compared after the restore and must match.

The existing test database is backed up on the ephemeral runner before it is
replaced. A failed restore automatically rolls back during the same run. Mirror
and rollback files are removed from the runner; the encrypted transfer artifact
is retained for one day.

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

6. Verify or rebuild the shared D1 padrón separately with **Cloudflare D1 padron refresh**.
7. Point a test deployment at the restored Supabase project and run regression tests before switching production traffic.

## Monthly check

Once per month, download the latest production artifact and run steps 2-4 locally. A backup that has never been decrypted is only a hope, not a recovery plan.
