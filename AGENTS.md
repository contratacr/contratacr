<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Branch and Worktree Policy

This repository has a fixed branch model. Do not create any additional local or remote branch, temporary branch, backup branch, detached task branch, or extra worktree unless Isaac explicitly authorizes that exact exception first.

The only remote branches are:

- `main`: production.
- `test`: regression environment. Its tracked code must remain exactly equal to `main`; regression-only differences belong in test data or external environment configuration, not divergent source commits.
- `mobile`: the mobile application. It must be based directly on `test` and contain only the native/mobile differences approved by Isaac.

The only local branches are those three plus:

- `local/pro-suite-no-push`: Pro/subscription, billing, quotes, inventory, and clients suite. It is local-only and must never be pushed or merged into `main`, `test`, or `mobile` without Isaac's explicit authorization.

All changes must be made directly in the appropriate existing branch and canonical worktree:

- Production: `C:\Users\isaac\OneDrive\Desktop\contratacr\contratacr-main` (`main`).
- Test: `C:\Users\isaac\OneDrive\Desktop\contratacr\contratacr-test` (`test`).
- Mobile: `C:\Users\isaac\OneDrive\Desktop\contratacr\contratacr\.codex-worktrees\mobile-canonical` (`mobile`).
- Pro local: `C:\Users\isaac\OneDrive\Desktop\contratacr\contratacr-test-plus` (`local/pro-suite-no-push`).

Do not use the default repository folder `C:\Users\isaac\OneDrive\Desktop\contratacr\contratacr` for implementation work while it is a detached preservation worktree.

On macOS, the exact parent directory may differ. The canonical layout is one checkout for `main` plus sibling worktrees named `contratacr-test` and `contratacr-mobile`; record their absolute paths in the local Codex workspace instructions. Do not recreate the detached Windows preservation worktree. See `docs/mac-migration-handoff.md` for the bootstrap commands.

Before pushing:

- Run `git status --short --branch` in the target canonical worktree and confirm the branch is the intended one.
- Confirm `main` and `test` resolve to the same commit whenever source changes are shared.
- Confirm `mobile` is based directly on `test` and that its diff contains only mobile-specific files or behavior.
- Confirm `supabase/migrations` matches the target branch and do not create migrations on top of stale numbering.
- Never push `local/pro-suite-no-push`.

## Service suggestion review

For every service suggestion, inspect the live catalogue (including hidden entries), approved/rejected suggestion history and existing search vocabulary before recommending approval, rejection, naming or grouping. Prefer the shortest clear service name; put trades, synonyms, regional terms, qualified specialties and English equivalents in `src/lib/data/service-search-aliases.ts` rather than lengthening the visible name. For rejected duplicates, map useful wording to the existing service. Do not map ambiguous requests, customer types, work arrangements or multi-service descriptions to a single service. Review search results and neighbouring services to avoid collisions. Preserve service IDs and existing professional associations. Adding aliases must not publish pending services or send decision notifications. Keep this review process for future suggestions as well as the current history.

Validate changes with `node scripts/verify-service-search-aliases.mjs`, plus targeted live search checks after deployment. Historical approvals without an active catalogue entry and test suggestions are not permission to recreate services. Ambiguous historical rejections (for example "Audio", "Pymes", "Certificaciones", "Freelance") require context, not an automatic synonym.

## Mobile release history

Isaac requires a saved release history for every future App Store and Google Play release. Before submitting an update, record its public version, native build number, platform, source commit, actual release date/status, validation and the exact localized store notes in `docs/mobile-release-history.md`. Keep notes concise and user-facing; only describe changes included in that release. Distinguish shared web deployments from native store releases. Never invent missing historical dates, builds or notes, or renumber an already published version for appearance.

## Logo stability (required brand contract)

Reuse `ContrataCRLogo` / `ContrataCRMark` from `src/components/landing/landing-navbar.tsx` for navbar, drawer, footer and account headers. Never recreate the brand name using HTML text, a different font, SVG `<text>`, or per-page typography. The approved wordmarks are `public/brand/wordmark-light.svg` and `wordmark-dark.svg`: outlined paths, independent of web-font loading. Use only the principal navy/cyan version (`wordmark-light.svg`) on every active surface, including exports. Email uses the principal on light backgrounds and the transparent white/cyan variant on dark backgrounds, without a white backing. Exception approved by Isaac: the dark admin sidebar and mobile admin header use the reversed/secondary version (`tone="dark"`) without a white backing. On other dark backgrounds, give the principal logo a white backing instead of switching to the reversed/secondary version. Do not alter lettering, proportions or spacing without Isaac explicitly requesting a brand change. Raster exports must be generated from these same assets using `scripts/generate-primary-brand.mjs`. First-run prepaint must reference the same asset as the hydrated logo. Keep the visible symbol-to-wordmark gap between 4 and 6 CSS pixels, including transparent image padding; the shared component and prepaint use zero added flex gap. This same navbar spacing is mandatory everywhere the symbol and ContrataCR name appear together, including download notices, cards and promotional surfaces. Keep them in one shared logo component; never let a parent row gap or flexible spacer separate the symbol from the wordmark.

For changes touching shared headers, branding or font loading, run `node scripts/ci/verify-brand-wordmark.mjs` and `tests/e2e/navbar-brand-consistency.spec.ts` in desktop Chromium, mobile Chromium and mobile WebKit. Keep this regression in push smoke and Safari runs; do not remove or weaken it to accommodate a font-dependent logo. The cold-load test intentionally blocks WOFF2 requests.
