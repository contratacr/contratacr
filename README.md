This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Branches and Worktrees

Use `C:\Users\isaac\OneDrive\Desktop\contratacr\contratacr-main` for production-ready work on `main` on the current Windows machine.

Use `C:\Users\isaac\OneDrive\Desktop\contratacr\contratacr-test` for test-environment work on `test`.

The only remote branches are `main`, `test`, and `mobile`. The only local branches are
`main`, `test`, `mobile`, and the parked `local/pro-suite-no-push`. Do not create
additional branches. `main` and `test` must resolve to the exact same commit; `mobile`
contains that shared web baseline plus its explicitly mobile-only shell and messaging
differences. Never push `local/pro-suite-no-push`.

Before pushing, confirm `git status --short --branch` shows the intended canonical branch and confirm migrations are current. The current shared baseline ends at `supabase/migrations/174_repair_known_visible_text_encoding.sql`.

For the macOS checkout and exact handoff state, follow [docs/mac-migration-handoff.md](docs/mac-migration-handoff.md). Do not copy `node_modules`, `.next`, Android build output, logs, or the detached Windows preservation worktree.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Regression Tests

The exhaustive Playwright workflow builds the checked-out `test` commit in GitHub
Actions and runs it with `next start` inside the runner. It uses the isolated test
database, but it does not send the full suite through the hosting provider. Configure
these secrets in the GitHub `test` environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`
- `REGRESSION_TEST_PASSWORD`
- `ADVERTISING_TEST_PASSWORD`

Seeded tests refuse to run against the production Supabase project. Run `npm run seed:test:full`, verify with `npm run seed:test:verify`, and set `E2E_FIXTURES_READY=1` (loaded automatically with the local `.env.test`) before a local seeded run.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Cloudflare

The web application is built with OpenNext and deployed to Cloudflare Workers by `.github/workflows/cloudflare-compatibility.yml`. Production uses `main`; test uses `test`. Supabase still owns the application database and Auth, while the national padrón is served from Cloudflare D1.

Use `npm run cloudflare:build` for a local compatibility build. Deployment and traffic cutover remain controlled by the GitHub workflow and its environment-scoped secrets.
