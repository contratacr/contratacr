# Required server environment (names only)

LOCAL PRO ONLY — pre-launch hardening, 2026-11-17. Values live in the deployment's secret store (Cloudflare Workers
secrets / CI). Never commit values; `.env.local` is not documentation. This project has no `.env.example`.

## Secrets that must be set in production (fail closed, never random)

`src/lib/security/local-dev-secrets.ts` (`requiredServerSecret`) reads these. In production (`NODE_ENV=production`,
which includes the Workers build) a missing value, a value shorter than 32 characters, or the public local-development
value is refused: a server error naming the variable is logged once and the feature answers 503. No random value is
ever generated (a per-isolate random pepper would break codes and links at random on Workers).

| Name | Used for | Missing in production |
|---|---|---|
| `DIR_CLAIM_OTP_PEPPER` | HMAC of directory claim one-time codes (`/api/reclamos/[id]/codigo`, `/verificar`) | claim codes 503 |
| `DIR_VISITOR_PEPPER` | HMAC of the anonymous device id (guest reviews, contacts, reservations, review flags) and reservation access tokens | those routes 503 |
| `PRO_BID_PORTAL_SECRET` | HMAC of vendor-portal link/session tokens (≥ 32 bytes; hex, base64 or base64url) | vendor portal 503 (`reason: config`) |

Development only (`next dev`): when none of `.env.test`, `.env.development.local`, `.env.local`, `.env.development`,
`.env` or the shell defines them, `scripts/dev-local-test-env.js` and `requiredServerSecret` use the deterministic,
public, NOT secret value `sha256hex('contratacr-local-dev-only:' + NAME)`. It is stable across restarts and refused in
production. `NODE_ENV=test` gets no fallback.

## Secrets with a documented server-side fallback

| Name | Fallback when unset | Used for |
|---|---|---|
| `RATE_LIMIT_PEPPER` | `SUPABASE_SERVICE_ROLE_KEY` | HMAC of rate-limit bucket keys (`src/lib/rate-limit.ts`, see `docs/pro/rate-limits.md`); neither set → limited routes fail closed (503) |
| `PRO_IDENTITY_RATE_LIMIT_SECRET` | `SUPABASE_SERVICE_ROLE_KEY` | identity-lookup quota tokens |
| `SUPPORT_GUEST_SECRET` | `SUPABASE_SERVICE_ROLE_KEY` | guest support links |
| `EMAIL_BAJA_SECRET` | `SUPABASE_SERVICE_ROLE_KEY` | email unsubscribe links |

## Platform variables the server needs

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (the shared rate limiter calls
`public.app_rate_limit_take` with the service role), `NEXT_PUBLIC_APP_URL`, `CRON_SECRET` and/or `PUSH_WORKER_SECRET`
(internal jobs answer 503 without one), `BREVO_API_KEY`, `BREVO_WEBHOOK_SECRET` (webhook disabled without it),
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`. Pro integrations list their own variables per provider in
`src/lib/pro/integrations/registry.ts` (for example `PRO_OAUTH_TOKEN_KEY`).

## Database prerequisites

Apply `docs/pro/sql/rate-limit-buckets-local.sql` (shared limiter) before deploying code that uses it; without it every
fail-closed limited route answers 503.

## Directory launch flags (server variables, never `NEXT_PUBLIC_`)
| Name | Values | Default when unset | Effect |
|---|---|---|---|
| `DIR_HEALTH_ENABLED` | `true` / `false` | ON in local development, OFF in any production build | OFF: `/salud` (+`/en/salud`) and every health place page (`/lugar/<slug>` of vertical `health`) answer 404 with `noindex`; `/api/directorio/search` and `/facets` refuse the section and drop health places/facet values from every other list (all-places search, assistant). Keep OFF at launch until legal review of health listings. |
| `DIR_ENABLED` | `true` / `false` | ON in local development, OFF in any production build | The whole public directory: the 15 place sections, `/lugar/*`, `/marca/*`, `/eventos`, `/precios`, `/listas`, `/lista/*`, `/reserva/*`, `/mis-reservas`, `/admin/directorio` and `/api/{directorio,lugar,reclamos,listas,marca,reservas,admin/directorio}/*`. OFF: all answer 404, the navbar/drawer show no directory links, the sitemaps and robots list no directory URL. Development-only pieces (claim test mailbox `/api/reclamos/<id>/buzon-prueba`, SMS mock code echo) stay development-only. Set `true` to launch the directory. |
| `DIR_INDEX_IMPORTED` | `true` / `false` | `true` | Indexing rule for `/lugar/<slug>` and `/sitemap-directorio/sitemap/<section>.xml`: claimed/verified places are always indexable; imported unclaimed places only with a phone, opening hours or a website (`false`: never). Search/filter pages, brands, events and prices stay `noindex`. |
| `PRO_ENABLED` | `true` / `false` | ON in local development, OFF in any production build | ContrataCR Pro. OFF: the middleware answers 404 for `/dashboard/pro`, `/admin/pro`, `/pro-preview`, `/pagar`, `/sitio`, `/baja-pro`, `/confirmar-pro`, `/licitacion-proveedor`, `/dashboard/{cotizaciones,subcontratista,unirse-proyecto,mi-proyecto}` and `/api/pro/*` (`src/lib/pro/enabled.ts`); `proApiAccess` refuses; public texts drop the Pro mentions (claim benefits, `/eventos`), the admin shell hides «ContrataCR Pro». Since 2026-11-22 the per-route development locks inside the Pro files are replaced by this flag (client mirror `NEXT_PUBLIC_PRO_ENABLED`); it is `true` only in the isolated test Worker (`EFFECTIVE_PRO_ENABLED` in `cloudflare-compatibility.yml`) and `false` in production. Appointment reminders and the vehicle/property listings stay closed. |
| `DIRECTORY_LISTINGS_ENABLED` | `true` | OFF | Vehicle and property classified listings (`src/lib/directory/feature-flags.ts`). |
| `DIR_CLAIM_SMS_ENABLED` | `true` | OFF | SMS/voice claim codes (also needs `dir_claim_settings.sms_enabled`). |
| `DIR_CLAIM_EMAIL_MODE` | `mock` / `sandbox` | `mock` | Claim-code e-mail sender. A production build never echoes `devCode`/`testMailbox` (guard + unit test: `src/lib/directory/claim-local-echo.ts`, `scripts/directory/claim-local-echo.test.mjs`). |
