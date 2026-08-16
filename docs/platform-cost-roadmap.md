# Platform cost and regression roadmap

## Decision

Keep Supabase Pro as the production backend for now. Do not migrate the live
database to Neon yet.

Neon is a strong Postgres service and can be cheaper for intermittent database
compute. It is not a low-risk drop-in replacement for the complete Supabase
surface currently used by ContrataCR. The application depends on Supabase Auth,
the PostgREST client, service-role operations, Storage, Realtime, SQL RPCs, and
Row Level Security policies. The national padrón also contains more than three
million rows, so a free database tier is not a production target.

A database migration is reconsidered only after these exit criteria are met:

1. Auth access is behind an application-owned adapter instead of direct
   Supabase calls throughout UI and routes.
2. Uploads use an application-owned storage interface that can target
   Cloudinary, R2, S3, or another provider.
3. Browser data access and RLS have a tested replacement using the target
   provider's identity claims and Data API.
4. A sanitized production-size padrón benchmark proves lookup latency, index
   size, backups, restore time, and monthly cost.
5. A rehearsed export/import preserves users, password or reset continuity,
   foreign keys, RLS behavior, files, and rollback.

Until then, the expected saving from replacing a $25 integrated backend does
not justify the migration and operational risk.

## Target low-cost architecture

- Production: Supabase Pro for the real database, Auth, RLS, and padrón.
- Development: local Next.js and local Supabase; no hosted deployment.
- Pull-request and change gates: GitHub Actions with `next start`, a rebuilt
  local Supabase schema, and deterministic synthetic fixtures.
- `test.contratacr.com`: manual review, advertising account, mobile review, and
  a small final hosted smoke only. It must not run the exhaustive suite.
- Production release: promote only a commit that passed the full local GitHub
  regression and the small hosted smoke.

## Regression layers

1. **Fast contracts on every change**
   - TypeScript, lint, text/security checks.
   - Rebuild every migration from an empty local database.
   - Require an explicit regression owner for every page and API route.
   - Unit contracts for locale, permissions, URLs, payloads, and error states.
2. **Affected-area browser tests**
   - Run only the sections changed by the commit.
   - Test desktop and mobile geometry, keyboard behavior, loading, empty,
     success, and failure states.
3. **Full release regression**
   - Run manually once for the release candidate, against `next start` and
     local synthetic data. Ordinary pushes must not launch this tier.
   - Require zero failures, retries/flakies, and unexpected skips.
   - Include transactional UI flows, API ownership, ES/EN, both viewports, and
     selective screenshot baselines for stable high-risk surfaces.
4. **Hosted smoke**
   - Verify the deployed SHA, health, login, one read flow, one write/cleanup
     flow, uploads, and provider integrations that cannot be emulated locally.

## Immediate implementation order

1. Keep the current local migration rebuild and surface-ownership gate green.
2. Add synthetic Auth users, profiles, professionals, padrón samples, and
   relational fixtures to the local Supabase stack. Never copy real padrón or
   customer data into CI.
3. Move public/read-only and authenticated regression groups to that local
   stack, leaving only provider-specific smokes on hosted test.
4. Add a visual contract matrix for dialogs, uploads, date selectors, sticky
   action bars, menus, loading shells, and responsive navigation.
5. Remove duplicate pre-runs once the full suite is ordered and reports failures
   early without executing the same tests twice.

## Cost guardrails

- Do not deploy every development commit to production or hosted test.
- Do not run the exhaustive suite on Vercel URLs.
- Keep one release-candidate deployment and cancel superseded builds before
  they start when the provider supports it.
- Keep test fixtures synthetic and disposable; never mirror private production
  records merely to exercise UI states.
- Review monthly build minutes, function calls, observability events, database
  storage, and object-storage transformations before changing providers.

## Provider references

- [Supabase pricing](https://supabase.com/pricing)
- [Supabase local development](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Neon pricing](https://neon.com/pricing)
- [Neon Data API and Row Level Security](https://neon.com/docs/guides/row-level-security)
- [Neon scale to zero](https://neon.com/docs/introduction/scale-to-zero)
- [GitHub Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing)
