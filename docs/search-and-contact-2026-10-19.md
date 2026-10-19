# Search and contact corrections — 2026-10-19

## Search selection

Service/location suggestions now fill their field without navigating, including recent searches and geolocation selection. Missing fields receive focus. An explicit Search button or a subsequent Enter submits the selected category ID and location together. The mobile search sheet has a visible Search professionals button, stays over old results until navigation completes, and dismisses on same-search submission.

The recent-search handler previously changed React state then called a timeout callback from the old render. That could navigate with the previous service. Selecting suggestions now never submits from the old render.

A read-only production audit of Desarrollo web found 19 SQL matches, all with that active service. No catalogue or professional records were changed. Multi-service professionals legitimately match any active service they offer.

## Contact channel

The confirmed contact channel is scoped to the viewing account, and shared by web and native. Reachability is no longer persisted for an entire browser session. Confirmed positives last 60 seconds, negatives 15 seconds, and network failures retry after 5 seconds. Revalidation is batched, pauses while hidden, and runs on focus/online. A transient failure preserves an already confirmed channel; an unknown recipient can use WhatsApp while retrying. Guests retain the existing WhatsApp flow.

A read-only audit confirmed Isaac's professional account has fresh active iOS registrations. The pending contact control remains neutral; it does not provisionally flash WhatsApp while the first lookup is in flight.

## Last-used label

The approved label is a small pale-cyan capsule extending 8px beyond the button's upper-right corner. No extra button outline. The existing successful-sign-in cookie identifies one method on that device; no email is displayed. Spanish and English are supported in the shared web/iOS/Android login.

## Regression

- search-suggestion-confirmation.spec.ts: both field-selection orders, no implicit navigation, exact Desarrollo web + Alajuela submission.
- buscar-servicio-y-lugar.spec.ts: preserved location and selected category from partial input, explicit confirmation.
- mobile-search-focus.spec.ts: keyboard focus transfer, pending navigation and repeated same-search submission.
- contact-channel-stability.spec.ts: web/native, both channels, delayed initial response, temporary-error recovery.
- last-used-sign-in.spec.ts: empty history, all three methods, invalid cookie and English translation.

Candidate run: 81 passed, two skipped, one TEST cleanup timeout (the functional assertions passed). Isolated follow-up: five passed and one skipped, including the cleanup case on all three browsers. Mobile focus/navigation: six passed, three desktop exclusions. Desktop home confirmation: one passed. No production messages were sent by these tests.

The previous GitHub regression could not download its Supabase containers: public.ecr.aws returned toomanyrequests / Data limit exceeded before tests started. Local-stack workflows now explicitly use SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io, the official Supabase mirror. All six pinned image manifests returned HTTP 200 there. YAML parsing passed. Reference: https://github.com/supabase/cli/issues/5785

UTF-8, vocabulary, bilingual budget, TypeScript, changed-test lint and the new authentication/hook lint passed. Whole-file lint on landing hero/navbar still reports existing hook/immutability diagnostics in untouched code; these were not suppressed or counted as passing checks.
