# Email campaign audit — 13 October 2026

## Confirmed incident and containment

The photographed email is `resumen-semanal`, a Monday professional activity survey, not the mobile app announcement. GitHub run 38313588762 reported 18 sends for 5–11 October. The workflow was disabled remotely and its state verified as `disabled_manually`. A source-level pause also blocks manual non-simulation calls before querying recipients. No messages were sent during this audit.

The source counted follow-up records created while preparing contact links. These cannot establish sent messages or distinct people. The old copy asserted both, offered 0/1/2/3+ answers without explaining their relationship to the count, promised privacy too broadly, claimed reviews produced many more messages without evidence, and mixed the survey with price/review reminders. The price detector also differed from the shared legacy-price logic. The weekly sender bypassed the coordinated campaign cooldown, did not check read errors and used a separate reservation table.

Draft copy now calls these records attempts, explicitly disclaims message/person confirmation, asks about work obtained during the week including older contacts, and removes unrelated advice and unsupported claims. Delivery remains paused. Before re-enabling: validate measurement, use coordinated reservations/cooldown, fail closed on all audience reads, paginate, deduplicate and test failure recovery. Existing signed response links remain usable.

## Inventory reviewed in source

| Message | Audience / trigger | Finding |
|---|---|---|
| Complete profile | Incomplete professional intent, from day 2 | Clear single action; shared campaign policy |
| First review | Professional without reviews, from day 7 | No numerical performance claim; shared policy |
| Mobile app | Confirmed account without recorded native usage, from day 7 | Once; unknown usage excluded; shared policy; 300+ is static user-approved copy, current count not revalidated here |
| Reference price | Professional without real price, from day 21 | Simplified awkward subject/button; shared policy |
| Find professionals | Eligible accounts from day 3 | Clear purpose; shared policy |
| Publish project | Eligible account without a project, from day 17 | Clear purpose; shared policy and prior search step |
| Manual services / review emails | Admin-selected eligible recipients | Stable campaign identity and shared reservation/history protections |
| Weekly survey | Professional follow-up records | Paused; issues above |
| Project/job alerts | Matching new publication | Separate event alerts, not the marketing cadence; now abort if exclusion/opt-out reads fail |
| Verification decisions | Identity status change | Removed unsupported visibility promise; transactional message |
| In-app review/price prompts | Missing profile steps | Separate once-only receipts; email and in-app reminders are not coordinated as one cross-channel sequence |

The six lifecycle campaigns use one permanent receipt per campaign/account and a 14-day marketing cooldown, with opt-out/history checks and provider uncertainty blocking repeat delivery. This does not prove zero overlap with event alerts or in-app prompts. An older 10 October draft audit says review/price email was retired; current source has them enabled, so that document is not current operational truth.

Scope: code/templates, workflow state and recorded run counts. Not a complete provider delivery-history audit or rendering certification for every mail client. Authentication/support transactional emails were identified separately; no campaign resend or correction mail was triggered.


## Copy review — 17 October 2026

Isaac requested clearer expectations about the growing community and the work to attract people looking for services. Reviewed the six lifecycle campaigns, the manual first-review template, retired services campaign, paused weekly survey, event alerts, verification, authentication and support messages.

| Message | Decision |
|---|---|
| Mobile app invitation | Full personal message from Isaac: free Android/iPhone app, same account, ongoing work to attract service seekers, opportunities may take time, installation and notification guidance. Conditional professional wording because clients also receive it. Remove the static professional count and the unsupported in-app reply suggestion. |
| Complete professional profile | Brief growth/expectations paragraph, followed by the existing profile completion action. No second download CTA. |
| First review (manual and lifecycle) | Brief growth context followed by requesting a real review from an existing customer; one action, no promise of more contacts. Both paths share the same template. |
| Reference price | Keep the specific price explanation and action; adding general growth language would repeat earlier campaign content. |
| Find professionals / publish project | Keep client-focused copy. Professional acquisition expectations would distract from finding help or publishing a need. |
| Project/job alerts, verification, authentication and support | Keep the event/reason and required action. No general promotion or growth paragraph. |
| Retired services / paused weekly survey | Leave inactive, without changing availability or sending a new campaign. |

Only three existing template bodies changed. Campaign identifiers, audiences, delays, permanent receipts, unsubscribe checks and the 14-day cooldown are unchanged. Editing does not resend delivered campaigns. Previously queued payloads are not rewritten by editing source templates; the new copy applies when a future message is composed. No manual send or new campaign was triggered for this copy review.
