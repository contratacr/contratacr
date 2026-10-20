# Admin list and counter limits audit

Production was inspected read-only. No user status, moderation decision, campaign or notification was changed by the audit.

## Confirmed

- Verification had 18 pending professionals among 333, but its former first-200 query included only eight. Fixed in the preceding commit.
- Analytics: 5,762 events matched the 14-day query, while the former unpaged read returned 1,000. Search/profile demand matched 9,196 events over 30 days, also truncated to 1,000. Data remains stored; calculation inputs were incomplete.
- The 60-day contact query matched 579 and returned 579: that counter was not currently truncated. Its reader is now paginated and restricted to the 60-day window actually used by the summary.
- Reviews were capped at 500, coverage matches at 300. Users and projects had a silent 10,000-row ceiling. Other growing admin queues/history reads depended on the database's implicit 1,000-row cap.

## Changes

Complete stable-order, paginated reads now precede filtering/aggregation in summary and analytics; review moderation; employment/promotion lists; coverage; reports; insurer/service suggestions; support lists/messages; disabled accounts/deletion requests; account/publication/verification histories; verification outreach history; and admin edit history. Existing visible page sizes remain in users, projects, reviews and marketplace. Coverage no longer silently drops matches after 300.

Related identity lookups are deduplicated, batched by 100 identifiers to avoid long IN URLs, and their results are paginated. A failed later page returns an error instead of partial rows. Administrator/MFA guards remain before database reads.

Summary verification now uses pending/under_appeal, excludes unverified drafts, and includes client-only pending identity reviews without duplicating professional accounts.

Retained intentional limits: recent-activity previews/top rankings, the first event timestamp, autocomplete suggestions (50), cursor-paginated activity journeys, and bounded operational jobs. Existing complete paging in costs, contacts, campaign audience lists, identity review and Meta growth was retained. No campaigns or jobs were executed.

## Validation

Runtime tests use the real route/aggregation source with a PostgREST double enforcing the default 1,000-row cap. Fixtures exceed 1,200 records and 10,000 users/projects; tests cover older search matches, complete counters, enrichment, paging, permission denial and later-page failure. Browser regression uses disposable administrator accounts against isolated TEST. Production checks retrieve only aggregate counts/read-only query results.

No mobile store releases are part of this change.

Final outcome: 36 runtime/contract tests passed; nine browser administrator smoke tests passed (7.4 minutes), with no skips or failures. TypeScript, focused ESLint, production build and inventory verification passed. The read-only production paginated checks recovered 5,762/5,762 and 9,196/9,196 unique event ids. Store versions were not uploaded.
