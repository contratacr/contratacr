# Campaign review — 10 October 2026

Implemented and deployed to `main` and `test`. Migration **236** was applied in both environments through GitHub Actions. The review did not send any real campaign or invitation.

## What stays and what is retired

| Message | Decision | Timing and channel |
| --- | --- | --- |
| General services catalogue | Keep one manual email campaign | Once per recipient; editing its subject does not reset its history |
| First professional reviews — email | Retire | The app already provides this reminder |
| Starting price — email | Retire | The app already provides this reminder |
| Google review invitation | Keep inside the app | After a real interaction; permanent receipt, including after dismissal |
| Publish a project | Keep inside the app | Client accounts only, once; disabled accounts excluded |
| Complete professional profile | Keep inside the app | Professional onboarding, once |
| First professional reviews — app | Keep | From day 3, only without reviews |
| Starting price — app | Keep | From day 7, only without a real price, at least 4 days after the review reminder |

Google/review/price reminders wait at least 24 hours after another recorded one-time notice. The database serializes delivery by account and writes a permanent receipt in the same transaction as the notification. Dismissal and retention cleanup remove the notification without removing the receipt. A failed notification insertion rolls back its receipt. Missing receipt storage blocks sending.

“Consultar precio” and “A convenir” no longer count as actual reference prices. Performance claims without supporting measurements were removed from the retained copy.

## History checked in production, read-only

At audit time there were 442 active accounts, 429 stored Google invitations and 13 accounts without a stored invitation. No duplicate Google invitation rows were present. Absence of a row cannot prove that an old invitation was never sent: it may have been deleted.

Migration 236 therefore backfills the 429 known invitations and marks the other pre-existing accounts as **historical_unknown** for Google invitations. These accounts are excluded from new invitations, rather than risking a repeat. Newly created accounts after the migration remain eligible after an actual interaction. This conservatively omits some accounts that may truly never have been invited; no historical delivery record exists to safely distinguish them.

The only email campaign present in the audited delivery history had 404 sends, 43 tracked opens, 5 tracked clicks and 4 recorded bounces. Its key is retained as the canonical identity of the general-services email, alongside the previous “263 profesionales…” template key, so neither an edited subject nor the replacement template starts a fresh audience.

## Email protections

- Keep unsubscribed recipients, hard bounces and spam complaints out of the eligible audience.
- Keep recipients of the same retained campaign out permanently, across its historical keys.
- Exclude accounts that received another campaign in the preceding 14 days.
- Deduplicate email addresses, including case and surrounding whitespace.
- Remove the extra personal recipient from mass delivery; admin previews remain available.
- Reserve each recipient before contacting the provider. Concurrent clicks cannot deliver the same campaign twice.
- An uncertain provider result or failed confirmation write keeps the recipient reserved; automatic retry is blocked.
- A local skip before contacting the provider releases its unused reservation.
- Calculate displayed pending recipients with the same policy as actual delivery.
- Block sending when campaign history or unsubscribe data cannot be read.
- Match provider events by stable tags, including JSON-encoded tag arrays; use subject-derived keys only for historical untagged events.

Provider event parsing follows [Brevo's event report](https://developers.brevo.com/reference/get-email-event-report) and [transactional webhook documentation](https://developers.brevo.com/docs/transactional-webhooks).

## Verification and release

Tests use an isolated in-memory PostgreSQL engine and disposable admin accounts in the regression database. Campaign and invitation responses in browser UI tests are intercepted; no provider sends are made.

SQL verification (disposable dependency installation outside the repository):

```sh
npm install --prefix /tmp/contratacr-campaign-sql-test --no-audit --no-fund @electric-sql/pglite
PGLITE_MODULE_PATH=/tmp/contratacr-campaign-sql-test/node_modules/@electric-sql/pglite/dist/index.js node scripts/verify-campaign-notification-receipts.mjs
```

The SQL checks exercise backfill, dismissal, unknown-history exclusions, cooldowns, repeated inserts, push capture, transaction rollback, inactive accounts, private receipts and campaign reservation uniqueness. Contract tests cover concurrent requests, uncertain provider responses, unavailable history, local skips, stable campaign keys, audience exclusions, event tags and review/price timing. Browser tests cover desktop/mobile admin controls and API rejection of retired campaigns.

The pre-existing local request logger compilation problem was bypassed only during browser tests and restored unchanged afterwards.

Apply migration 236 using the existing **Supabase migrations** workflow, first a dry run and apply in test, then the same validated migration in production. Publish the accompanying source changes. Missing new schema fails closed; it must not be worked around by reverting to notification-row or empty-history checks. No live migration, release or mass send was performed by this review.
