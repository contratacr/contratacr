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
