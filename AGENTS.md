<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Branch and Worktree Policy

Until Isaac explicitly decides otherwise, production-ready work must happen from the clean `main` worktree:

- `C:\Users\isaac\OneDrive\Desktop\contratacr\contratacr-main`
- Branch: `main`
- Remote: `origin/main`

Test-environment work must happen from the clean `test` worktree:

- `C:\Users\isaac\OneDrive\Desktop\contratacr\contratacr-test`
- Branch: `test`
- Remote: `origin/test`

Do not push, merge into `main`, or merge into `test` from these local-only branches unless Isaac explicitly asks for that specific line of work:

- `local/capacitor-no-push`: Android/Capacitor mobile app work.
- `local/direct-messages-no-push`: in-app direct messages/chat work that is parked while WhatsApp remains the active contact flow.
- `local/pro-suite-no-push`: Pro/facturacion/cotizaciones/inventario/clientes suite work.

The default repo folder `C:\Users\isaac\OneDrive\Desktop\contratacr\contratacr` is currently reserved for `local/capacitor-no-push`. Do not use it for normal production fixes.

Before pushing:

- Run `git status --short --branch` and confirm the branch is `main` or `test`, not a `local/*-no-push` branch.
- Confirm `supabase/migrations` matches the target remote branch. As of the current production baseline, `origin/main` includes `139_interaction_analytics_saved_actions.sql`.
- Do not create new migrations on top of stale local migration numbering.
- Do not include Pro, direct-message, or Capacitor files in normal production/test pushes.
