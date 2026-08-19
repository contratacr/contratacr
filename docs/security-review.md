# Security review

Last reviewed: 2026-08-19

This is the launch-readiness security checklist for ContrataCR.

## Current strengths

- Environment files are ignored by Git (`.env*`), and `.env.local` is not tracked.
- Admin API routes use server-side admin checks through `getApiAdmin()`.
- Admin pages use `requireAdmin()` and confirm role from the database, not from client state.
- Service-role Supabase client is isolated in server code.
- Security headers are configured globally in `next.config.ts`:
  - HSTS
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `Content-Security-Policy: frame-ancestors 'self'`
  - `Referrer-Policy`
  - `Permissions-Policy`
- Public abuse-prone endpoints have best-effort rate limiting:
  - password reset
  - auth method lookup
  - cedula lookup
  - contact/support
  - reports
  - portfolio likes
  - image uploads
- Facebook login is hidden to avoid Meta production/review friction before launch.
- Supabase migrations and Cloudflare D1 padrón refreshes are deployable from GitHub Actions with environment scoping.
- Encrypted daily Supabase logical backups are automated from GitHub Actions. Backup artifacts are encrypted before upload and exclude the rebuildable TSE padron data.
- High/critical dependency audit, build, template validation, and secret smoke checks are automated in GitHub Actions.

## Launch blockers to resolve before public traffic

1. Rotate any secrets that were pasted into chats, screenshots, local terminals, or temporary docs while setting up test/prod. A service-role key and a Cloudinary secret were found in tracked project context and have been redacted from the repo; still rotate them before public launch.
2. Add required reviewers to the GitHub `production` Environment.
3. Confirm Cloudflare Worker secrets and GitHub Environment secrets are scoped to the matching production/test Worker. Keep any temporary Vercel rollback project equally isolated while it exists.
4. Confirm Supabase redirect URLs:
   - production app URL
   - production `/auth/callback`
   - test app URL
   - test `/auth/callback`
5. Confirm Google Maps API restrictions include only production/test/local URLs actually used.
6. Confirm Cloudinary unsigned uploads are not enabled. Current server upload routes should keep using signed/server credentials.
7. Confirm `/api/cedula` reads the shared D1 padrón and does not silently depend on the removed Supabase tables.

## Recommended next hardening

- Move rate limiting from in-memory to a shared Cloudflare-compatible store before paid traffic or heavy launch campaigns.
- Add CAPTCHA or invisible bot protection to password reset, support/contact, and public suggestion endpoints if spam starts.
- Add a stricter full CSP after launch testing. Current CSP intentionally only locks framing to avoid breaking maps, Cloudinary, Supabase, and inline email-safe UI.
- Define and rehearse an R2/Cloudinary media inventory and restore plan once production portfolios/support images become business-critical. Database backups store URLs and metadata, not the original media binaries.
- Review Supabase RLS after every migration that adds a table, especially admin/support/payment tables.
- Keep production Supabase service-role key out of local `.env.local` unless actively needed.
- Clean existing full-project ESLint debt and then make `npm run lint` blocking in CI. It currently reports pre-existing React/Next lint errors unrelated to the release automation work.

## Dependency audit status

The launch check should pass:

```bash
npm audit --audit-level=high
```

Moderate framework advisories should be reviewed case by case. Do not blindly downgrade framework packages to satisfy an audit suggestion.
