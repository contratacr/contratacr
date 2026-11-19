# Rate limits (shared, Postgres-backed)

LOCAL PRO ONLY — pre-launch hardening, 2026-11-17.

## Why

The previous limiter (`src/lib/rate-limit.ts`) kept counters in a per-process `Map`. On Cloudflare Workers every
isolate has its own memory and is recycled at will, so limits neither held across instances nor survived a deploy.
All routes now share one counter per bucket in Postgres.

## How

- `src/lib/rate-limit.ts`: `enforceRateLimit(req, bucket, limit, windowMs)` (keyed by client IP: `cf-connecting-ip`,
  then `x-forwarded-for`, then `x-real-ip`) and `enforceRateLimitKey(key, limit, windowMs)` (explicit key: user id,
  token digest, slug…). Both are now `async`; every call site uses `await`. Limits and windows are unchanged.
- The key is `HMAC-SHA256(RATE_LIMIT_PEPPER || SUPABASE_SERVICE_ROLE_KEY, 'ccr-rate-limit:v1:' + bucket + ':' + ip/key)`.
  Raw IPs, user ids and tokens never reach the database.
- SQL module `docs/pro/sql/rate-limit-buckets-local.sql` (registered in `scripts/pro/local-sql-manifest.mjs`):
  table `public.app_rate_limit_buckets(key, hits, window_ends_at)` and `public.app_rate_limit_take(key, limit, window_ms)`.
  Same semantics as before: the fixed window starts at the first hit; a denied hit is not counted; a hit after the
  window ends starts a new window. Atomic: `insert … on conflict do nothing` then a row lock (`select … for update`).
- Access: RLS enabled with no policies, table and functions revoked from `public`, `anon`, `authenticated`; only
  `service_role` (the server's admin client) can call them.
- Cleanup: ~2% of calls delete up to 500 rows expired for more than one minute (`skip locked`);
  `app_rate_limit_prune()` deletes all of them and can be scheduled.
- Responses: limit reached → `429` with `Retry-After` and `Cache-Control: no-store, private`
  (`{"error":"Demasiadas solicitudes. Espere un momento e intente de nuevo."}`). Store unavailable and the bucket
  fails closed → `503`, `Retry-After: 5`, `reason: "rate_limit_unavailable"`.

## Failure policy (store unavailable)

- **closed** (503): default. Public/anonymous routes, authentication, registration, identity/cédula lookups,
  directory claims/OTP codes, reviews, Q&A, reservations, price reports, uploads, payments, vendor portal, marketing
  tokens, webhooks, admin routes, AI assistant, every explicit-key bucket (`enforceRateLimitKey`, including the
  per-account export/finance limits of `proAccountRateLimit`).
- **open** (request continues, error logged): telemetry buckets (`client-error`, `analytics`, `analytics-usage`,
  `analytics-journey`, `minimal-meta`, `professional-ready`) and per-account Pro dashboard buckets whose name ends with
  the authenticated user's UUID (`<route>-<user>`). Those callers already passed session and Pro entitlement checks,
  and a database outage fails the route's own queries anyway.
- The rule lives in `rateLimitFailsOpen()` in `src/lib/rate-limit.ts`; the table below is generated from the call sites.

## Tests

- Only under `next dev` (`NODE_ENV=development`) a request may send `x-ccr-rate-limit-namespace: <[A-Za-z0-9_-]{1,64}>`
  to use its own buckets. `playwright.pro-local.config.ts` sends a random namespace per run, so a re-run does not
  inherit counters. Production and `next start` ignore the header; it never skips a limit (specs that assert a 429
  still reach it).
- `node --test scripts/pro/hardening.test.mjs` (pure), `node scripts/pro/verify-rate-limit-db.mjs` (PGlite),
  `node scripts/pro/verify-rate-limit-concurrency-local.mjs` (loopback Supabase, real parallel connections).

## Per-route table

`<user>` = authenticated user/actor id; `<key>` = caller-chosen value (slug, vertical, token digest).
Window is fixed from the first hit.

| Route | Bucket | Keyed by | Limit | Window | Store down |
|---|---|---|---|---|---|
| `/api/add-cedula` | `add-cedula` | IP | 10 | 10 min | closed |
| `/api/admin/identificaciones/verificar` | `admin-identity-verify` | IP | 20 | 1 min | closed |
| `/api/admin/identificaciones` | `admin-identity-review` | IP | 12 | 1 min | closed |
| `/api/admin/padron` | `admin-padron` | IP | 20 | 1 min | closed |
| `/api/ai-assistant` | `ai-assistant-external` | IP | 3 | 1 min | closed |
| `/api/ai-assistant` | `ai-assistant` | IP | 20 | 1 min | closed |
| `/api/analytics/interaction` | `analytics` | IP | 60 | 1 min | open |
| `/api/analytics/journey` | `analytics-journey` | IP | 30 | 1 min | open |
| `/api/analytics/meta` | `minimal-meta` | IP | 15 | 1 min | open |
| `/api/analytics/professional-ready` | `professional-ready` | IP | 10 | 1 h | open |
| `/api/analytics/usage` | `analytics-usage` | IP | 90 | 1 min | open |
| `/api/appeals` | `verification-appeal` | IP | 6 | 1 min | closed |
| `/api/attribution/claim` | `attribution-claim` | IP | 20 | 10 min | closed |
| `/api/auth/method` | `auth-method` | IP | 12 | 1 min | closed |
| `/api/auth/password-reset` | `password-reset` | IP | 8 | 1 min | closed |
| `/api/block` | `bloquear` | IP | 20 | 1 h | closed |
| `/api/buscar/results` | `buscar-results` | IP | 60 | 1 min | closed |
| `/api/categories/suggest` | `categories-suggest` | IP | 10 | 10 min | closed |
| `/api/cedula-available` | `cedula-available` | IP | 30 | 1 min | closed |
| `/api/cedula/[id]` | `cedula` | IP | 20 | 1 min | closed |
| `/api/check-availability` | `check-availability` | IP | 30 | 1 min | closed |
| `/api/client-error` | `client-error` | IP | 20 | 1 min | open |
| `/api/contact/project-lead` | `contacto-proyecto` | IP | 15 | 1 h | closed |
| `/api/contact/reveal` | `contact-reveal` | IP | 15 | 1 h | closed |
| `/api/contact/whatsapp-link` | `contacto-whatsapp` | IP | 15 | 1 h | closed |
| `/api/contact` | `contact` | IP | 5 | 1 min | closed |
| `/api/direct-chat/attachments` | `direct-chat-attachment` | IP | 18 | 1 min | closed |
| `/api/directorio/facets` | `dir-facets:<key>` | explicit key | 600 | 1 min | closed |
| `/api/directorio/facets` | `dir-facets` | IP | 30 | 1 min | closed |
| `/api/directorio/search` | `dir-search:<key>` | explicit key | 1200 | 1 min | closed |
| `/api/directorio/search` | `dir-search` | IP | 60 | 1 min | closed |
| `/api/listas` | `dir-lists-read` | IP | 60 | 1 min | closed |
| `/api/listas` | `dir-lists` | IP | 30 | 1 min | closed |
| `/api/lugar/[slug]/contacto` | `dir-contact` | IP | 30 | 1 min | closed |
| `/api/lugar/[slug]/precios/reporte` | `dir-price-report:<user>` | explicit key | 10 | 1 h | closed |
| `/api/lugar/[slug]/precios/reporte` | `dir-price-report` | IP | 10 | 1 min | closed |
| `/api/lugar/[slug]/preguntas` | `dir-qa-read` | IP | 60 | 1 min | closed |
| `/api/lugar/[slug]/preguntas` | `dir-qa` | IP | 10 | 1 min | closed |
| `/api/lugar/[slug]/reclamo/documentos` | `dir-claim-docs` | IP | 12 | 1 min | closed |
| `/api/lugar/[slug]/reclamo` | `dir-claim-hacienda` | IP | 5 | 1 min | closed |
| `/api/lugar/[slug]/reclamo` | `dir-claim-open` | IP | 10 | 1 min | closed |
| `/api/lugar/[slug]/reporte` | `place-report:<key>` | explicit key | 20 | 1 min | closed |
| `/api/lugar/[slug]/reporte` | `place-report` | IP | 10 | 1 min | closed |
| `/api/lugar/[slug]/resenas/reporte` | `dir-review-flag` | IP | 10 | 1 min | closed |
| `/api/lugar/[slug]/resenas` | `dir-review` | IP | 10 | 1 min | closed |
| `/api/lugar/[slug]/reservas` | `dir-reservation-read` | IP | 60 | 1 min | closed |
| `/api/lugar/[slug]/reservas` | `dir-reservation` | IP | 10 | 1 min | closed |
| `/api/marca/[slug]/reclamo/documentos` | `dir-brand-claim-docs` | IP | 12 | 1 min | closed |
| `/api/marca/[slug]/reclamo` | `dir-brand-claim` | IP | 6 | 1 min | closed |
| `/api/marketplace/results` | `marketplace-results` | IP | 90 | 1 min | closed |
| `/api/privacy/advertising` | `advertising-withdrawal` | IP | 20 | 1 min | closed |
| `/api/privacy/choices` | `privacy-choice` | IP | 30 | 1 min | closed |
| `/api/pro/accounting-export` | `accounting-export` | account+member | 10 | 1 min | closed |
| `/api/pro/accounting` | `accounting-<user>` | IP | 30 | 1 min | open |
| `/api/pro/ads-tracking` | `ads-tracking-<user>` | IP | 60 | 1 min | open |
| `/api/pro/ai-meetings` | `ai-meetings-<user>` | IP | 40 | 1 min | open |
| `/api/pro/ai` | `ai-<user>` | IP | 40 | 1 min | open |
| `/api/pro/allowances` | `allowances-<user>` | IP | 120 | 1 min | open |
| `/api/pro/appointment-preferences` | `appointment-preferences-<user>` | IP | 60 | 1 min | open |
| `/api/pro/appointment-reminders` | `appointment-reminders-<user>` | IP | 60 | 1 min | open |
| `/api/pro/appointment-requests` | `appointment-slots` | IP | 120 | 1 min | closed |
| `/api/pro/appointment-reschedule` | `appointment-reschedule-read-<user>` | IP | 120 | 1 min | open |
| `/api/pro/appointment-reschedule` | `appointment-reschedule-write-<user>` | IP | 60 | 1 min | open |
| `/api/pro/appointment-schedule` | `appointment-schedule-<user>` | IP | 60 | 1 min | open |
| `/api/pro/bid-portal-links` | `bid-portal-links-<user>` | IP | 30 | 1 min | open |
| `/api/pro/bid-portal/files` | `bid-portal-file-read-session:<key>` | explicit key | 60 | 1 min | closed |
| `/api/pro/bid-portal/files` | `bid-portal-file-read` | IP | 60 | 1 min | closed |
| `/api/pro/bid-portal/files` | `bid-portal-file-write-session:<key>` | explicit key | 20 | 1 min | closed |
| `/api/pro/bid-portal/files` | `bid-portal-file-write` | IP | 30 | 1 min | closed |
| `/api/pro/bid-portal` | `bid-portal-claim` | IP | 20 | 1 min | closed |
| `/api/pro/bid-portal` | `bid-portal-view-session:<key>` | explicit key | 60 | 1 min | closed |
| `/api/pro/bid-portal` | `bid-portal-view` | IP | 60 | 1 min | closed |
| `/api/pro/bid-portal` | `bid-portal-write-session:<key>` | explicit key | 30 | 1 min | closed |
| `/api/pro/bid-portal` | `bid-portal-write` | IP | 40 | 1 min | closed |
| `/api/pro/bids` | `bids-<user>` | IP | 60 | 1 min | open |
| `/api/pro/brand-info` | `dir-brand-info-<user>` | IP | 30 | 1 min | open |
| `/api/pro/catalog-clipper` | `catalog-clipper-<user>` | IP | 20 | 1 min | open |
| `/api/pro/catalog-details` | `catalog-details-<user>` | IP | 30 | 1 min | open |
| `/api/pro/client-contacts` | `client-contacts-<user>` | IP | 60 | 1 min | open |
| `/api/pro/client-contacts` | `contacts-export` | account+member | 10 | 1 min | closed |
| `/api/pro/client-dashboard` | `client-dashboard-<user>` | IP | 60 | 1 min | open |
| `/api/pro/company-daily-log-files` | `company-daily-log-files-<user>` | IP | 30 | 1 min | open |
| `/api/pro/company-file-trash` | `company-file-trash-<user>` | IP | 30 | 1 min | open |
| `/api/pro/company-file-versions` | `company-file-versions-<user>` | IP | 60 | 1 min | open |
| `/api/pro/company-files` | `company-files-<user>` | IP | 60 | 1 min | open |
| `/api/pro/company-vendors` | `company-vendors-<user>` | IP | 60 | 1 min | open |
| `/api/pro/connectors` | `connectors-<user>` | IP | 60 | 1 min | open |
| `/api/pro/contracts` | `contracts-<user>` | IP | 120 | 1 min | open |
| `/api/pro/credits-retainers` | `credits-retainers-<user>` | IP | 120 | 1 min | open |
| `/api/pro/daily-log-autofill` | `daily-autofill` | account+member | 30 | 1 min | closed |
| `/api/pro/daily-log-discussion` | `daily-log-discussion-<user>` | IP | 60 | 1 min | open |
| `/api/pro/daily-log-duplicate` | `daily-log-duplicate-<user>` | IP | 30 | 1 min | open |
| `/api/pro/daily-log-file-reconciliation` | `daily-log-file-reconciliation-<user>` | IP | 30 | 1 min | open |
| `/api/pro/daily-log-files` | `daily-log-files-<user>` | IP | 60 | 1 min | open |
| `/api/pro/daily-logs` | `daily-logs-<user>` | IP | 60 | 1 min | open |
| `/api/pro/dir-listing-photos` | `dir-listing-photos:<user>` | explicit key | 40 | 1 min | closed |
| `/api/pro/dir-listings` | `dir-listings-<user>` | IP | 120 | 1 min | open |
| `/api/pro/document-branding` | `document-branding-<user>` | IP | 20 | 1 min | open |
| `/api/pro/einvoice` | `einvoice-<user>` | IP | 30 | 1 min | open |
| `/api/pro/esign/mock-sign` | `esign-mock-sign-post` | IP | 30 | 1 min | closed |
| `/api/pro/esign/mock-sign` | `esign-mock-sign` | IP | 120 | 1 min | closed |
| `/api/pro/esign` | `esign-<user>` | IP | 30 | 1 min | open |
| `/api/pro/expense-receipts` | `expense-receipts-<user>` | IP | 30 | 1 min | open |
| `/api/pro/file-versions` | `file-versions-<user>` | IP | 60 | 1 min | open |
| `/api/pro/finance-reports` | `finance-reports` | account+member | 30 | 1 min | closed |
| `/api/pro/floor-plans` | `floor-plans-<user>` | IP | 120 | 1 min | open |
| `/api/pro/integrations/webhooks/esign` | `webhook-esign` | IP | 120 | 1 min | closed |
| `/api/pro/integrations/webhooks/tilopay` | `webhook-tilopay` | IP | 120 | 1 min | closed |
| `/api/pro/integrations` | `integrations-<user>` | IP | 40 | 1 min | open |
| `/api/pro/lead-board` | `lead-board-<user>` | IP | 120 | 1 min | open |
| `/api/pro/lead-center` | `lead-center-<user>` | IP | 30 | 1 min | open |
| `/api/pro/lead-followups` | `lead-followups-<user>` | IP | 60 | 1 min | open |
| `/api/pro/lead-inboxes` | `lead-inboxes-<user>` | IP | 30 | 1 min | open |
| `/api/pro/lead-origin-create` | `lead-origin-create-<user>` | IP | 30 | 1 min | open |
| `/api/pro/lead-origins` | `lead-origins-<user>` | IP | 60 | 1 min | open |
| `/api/pro/lead-private-core` | `lead-center-<user>` | IP | 30 | 1 min | open |
| `/api/pro/lead-private-stages` | `request-pipeline-<user>` | IP | 30 | 1 min | open |
| `/api/pro/lead-private-work` | `manual-lead-work-<user>` | IP | 30 | 1 min | open |
| `/api/pro/manual-lead-quotes` | `manual-lead-quote-<user>` | IP | 30 | 1 min | open |
| `/api/pro/manual-lead-work` | `manual-lead-work-<user>` | IP | 30 | 1 min | open |
| `/api/pro/marketing-confirm` | `marketing-confirm:<token prefix>` | explicit key | 20 | 1 min | closed |
| `/api/pro/marketing-confirm` | `marketing-confirm` | IP | 30 | 1 min | closed |
| `/api/pro/marketing-unsubscribe/one-click` | `marketing-one-click:<token prefix>` | explicit key | 10 | 1 min | closed |
| `/api/pro/marketing-unsubscribe/one-click` | `marketing-one-click` | IP | 60 | 1 min | closed |
| `/api/pro/marketing-unsubscribe` | `marketing-unsubscribe` | IP | 30 | 1 min | closed |
| `/api/pro/marketing` | `marketing-<user>` | IP | 60 | 1 min | open |
| `/api/pro/menu` | `dir-menu-<user>` | IP | 120 | 1 min | open |
| `/api/pro/mood-boards` | `mood-board-comments-<user>` | IP | 30 | 1 min | open |
| `/api/pro/mood-boards` | `mood-boards-<user>` | IP | 240 | 1 min | open |
| `/api/pro/notifications` | `notifications-<user>` | IP | 60 | 1 min | open |
| `/api/pro/oauth/callback` | `oauth-callback` | IP | 60 | 1 min | closed |
| `/api/pro/overview-layout` | `overview-layout-<user>` | IP | 60 | 1 min | open |
| `/api/pro/pay` | `pay-link:<link hash>` | explicit key | 60 view / 10 other | 1 min | closed |
| `/api/pro/pay` | `pay-public` | IP | 30 | 1 min | closed |
| `/api/pro/payment-links` | `payment-links-<user>` | IP | 30 | 1 min | open |
| `/api/pro/payment-plan` | `payment-plan-<user>` | IP | 60 | 1 min | open |
| `/api/pro/place-events` | `dir-place-events-<user>` | IP | 60 | 1 min | open |
| `/api/pro/place-hub` | `pro-place-hub` | IP | 60 | 1 min | closed |
| `/api/pro/private-estimate-destination-copy` | `private-estimate-destination-copy-<user>` | IP | 30 | 1 min | open |
| `/api/pro/private-estimate-publication-copy` | `private-estimate-publication-copy-<user>` | IP | 30 | 1 min | open |
| `/api/pro/private-estimate-publications` | `private-estimate-publications-<user>` | IP | 60 | 1 min | open |
| `/api/pro/private-estimate-work` | `private-estimate-work-<user>` | IP | 30 | 1 min | open |
| `/api/pro/private-estimates` | `private-estimates-<user>` | IP | 60 | 1 min | open |
| `/api/pro/project-details` | `project-details-<user>` | IP | 60 | 1 min | open |
| `/api/pro/project-invitation` | `project-invitation-<user>` | explicit key | 20 | 1 min | closed |
| `/api/pro/project-invitation` | `project-invitation-ip` | IP | 60 | 1 min | closed |
| `/api/pro/project-notes` | `project-notes-<user>` | IP | 60 | 1 min | open |
| `/api/pro/project-schedule` | `project-schedule-<user>` | IP | 30 | 1 min | open |
| `/api/pro/purchase-order-sources` | `po-sources` | account+member | 60 | 1 min | closed |
| `/api/pro/purchase-orders` | `purchase-orders-<user>` | IP | 120 | 1 min | open |
| `/api/pro/quote-line-decisions` | `quote-line-decisions` | account+member | 120 | 1 min | closed |
| `/api/pro/reports` | `reports` | account+member | 30 | 1 min | closed |
| `/api/pro/request-followups` | `request-followups-<user>` | IP | 60 | 1 min | open |
| `/api/pro/request-pipeline` | `request-pipeline-<user>` | IP | 30 | 1 min | open |
| `/api/pro/review-replies` | `dir-review-reply` | IP | 20 | 1 min | closed |
| `/api/pro/schedule-links` | `schedule-links-<user>` | IP | 60 | 1 min | open |
| `/api/pro/schedule-links` | `schedule-preview` | account+member | 60 | 1 min | closed |
| `/api/pro/schedule-templates` | `schedule-templates-<user>` | IP | 60 | 1 min | open |
| `/api/pro/selections-tracking` | `selections-tracking` | account+member | 60 | 1 min | closed |
| `/api/pro/selections-visibility` | `selections-visibility-<user>` | IP | 60 | 1 min | open |
| `/api/pro/selections` | `selections-<user>` | IP | 120 | 1 min | open |
| `/api/pro/site-public` | `site-public` | IP | 30 | 1 min | closed |
| `/api/pro/site-public` | `site-sitemap` | IP | 30 | 1 min | closed |
| `/api/pro/site-public` | `site-submit:<key>` | explicit key | 20 | 1 min | closed |
| `/api/pro/site` | `site-<user>` | IP | 60 | 1 min | open |
| `/api/pro/sub-portal` | `sub-portal-<user>` | IP | 30 | 1 min | open |
| `/api/pro/subcontractors` | `subcontractors-<user>` | IP | 60 | 1 min | open |
| `/api/pro/table-reservations` | `dir-table-res-<user>` | IP | 120 | 1 min | open |
| `/api/pro/takeoffs` | `takeoffs-<user>` | IP | 240 | 1 min | open |
| `/api/pro/task-templates-apply` | `task-templates-apply-<user>` | IP | 30 | 1 min | open |
| `/api/pro/task-templates` | `task-templates-<user>` | IP | 60 | 1 min | open |
| `/api/pro/team-roles` | `team-roles-<user>` | IP | 40 | 1 min | open |
| `/api/pro/team-task-discussion` | `team-task-discussion-<user>` | IP | 30 | 1 min | open |
| `/api/pro/team-task-mentions` | `team-task-notices-<user>` | IP | 60 | 1 min | open |
| `/api/pro/team` | `team-<user>` | IP | 60 | 1 min | open |
| `/api/pro/time-tracking` | `time-tracking-<user>` | IP | 60 | 1 min | open |
| `/api/pro/work-billing` | `work-billing-<user>` | IP | 30 | 1 min | open |
| `/api/pro/work-budget` | `work-budget-<user>` | IP | 120 | 1 min | open |
| `/api/pro/work-client-invitations` | `work-client-invitations-<user>` | IP | 30 | 1 min | open |
| `/api/pro/work-delivery` | `work-delivery-<user>` | IP | 60 | 1 min | open |
| `/api/pro/work-file-organizer` | `work-file-organizer-<user>` | IP | 120 | 1 min | open |
| `/api/pro/work-files` | `work-files-<user>` | IP | 30 | 1 min | open |
| `/api/pro/work-journal` | `work-journal-<user>` | IP | 60 | 1 min | open |
| `/api/pro/work-message-files` | `work-message-files-<user>` | IP | 20 | 1 min | open |
| `/api/pro/work-messages` | `work-messages-<user>` | IP | 60 | 1 min | open |
| `/api/pro/work-punchlist` | `work-punchlist-<user>` | IP | 60 | 1 min | open |
| `/api/pro/work-schedule` | `work-schedule-<user>` | IP | 60 | 1 min | open |
| `/api/pro/work-tasks` | `work-tasks-<user>` | IP | 60 | 1 min | open |
| `/api/pro/work-timers` | `work-timers-<user>` | IP | 60 | 1 min | open |
| `/api/pro/work-updates` | `work-updates-<user>` | IP | 60 | 1 min | open |
| `/api/reclamos/[id]/buzon-prueba` | `dir-claim-mailbox` | IP | 30 | 1 min | closed |
| `/api/reclamos/[id]/codigo` | `dir-claim-code` | IP | 10 | 1 min | closed |
| `/api/reclamos/[id]/verificar` | `dir-claim-verify` | IP | 20 | 1 min | closed |
| `/api/register/client` | `register` | IP | 10 | 10 min | closed |
| `/api/register/professional` | `register` | IP | 10 | 10 min | closed |
| `/api/report` | `report-public` | IP | 10 | 10 min | closed |
| `/api/reservas/[token]` | `dir-reservation-cancel` | IP | 10 | 1 min | closed |
| `/api/reservas/[token]` | `dir-reservation-status` | IP | 60 | 1 min | closed |
| `/api/reviews` | `reviews` | IP | 10 | 1 min | closed |
| `/api/support/adjuntos` | `support-attachment` | IP | 18 | 1 min | closed |
| `/api/support/guest/[id]` | `input.action === "open" ? "support-guest-open" : "support-guest-reply` | IP | input.action === "open" ? 30 : 10 | 1 min | closed |
| `/api/support/guest/[id]` | `support-guest-read` | IP | 60 | 1 min | closed |
| `/api/support` | `support-reply` | IP | 10 | 1 min | closed |
| `/api/translate` | `translate` | IP | 20 | 1 min | closed |
| `/api/upload/media` | `delete-owned-media` | IP | 30 | 1 min | closed |
| `/api/upload/photo` | `upload-photo` | IP | 12 | 1 min | closed |
| `/api/upload` | `upload` | IP | 12 | 1 min | closed |
| `/api/verification/documents` | `verification-documents` | IP | 6 | 1 min | closed |
| `/api/verify-identity` | `verify-identity` | IP | 6 | 1 min | closed |
| `src/lib/pro/sub-comment-files-route.ts` | `sub-comment-files-<user>` | IP | 20 | 1 min | open |
