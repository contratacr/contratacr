<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
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

Before pushing:

- Run `git status --short --branch` in the target canonical worktree and confirm the branch is the intended one.
- Confirm `main` and `test` resolve to the same commit whenever source changes are shared.
- Confirm `mobile` is based directly on `test` and that its diff contains only mobile-specific files or behavior.
- Confirm `supabase/migrations` matches the target branch and do not create migrations on top of stale numbering.
- Never push `local/pro-suite-no-push`.
