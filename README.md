This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Branches and Worktrees

Use `C:\Users\isaac\OneDrive\Desktop\contratacr\contratacr-main` for production-ready work on `main`.

Use `C:\Users\isaac\OneDrive\Desktop\contratacr\contratacr-test` for test-environment work on `test`.

The only remote branches are `main`, `test`, and `mobile`. The only local branches are
`main`, `test`, `mobile`, and the parked `local/pro-suite-no-push`. Do not create
additional branches. `main` and `test` must resolve to the exact same commit; `mobile`
contains that shared web baseline plus its explicitly mobile-only shell and messaging
differences. Never push `local/pro-suite-no-push`.

Before pushing, confirm `git status --short --branch` shows `main` or `test`, and confirm migrations are current. The current production baseline includes `supabase/migrations/139_interaction_analytics_saved_actions.sql`.

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

The Playwright regression workflow runs against the `test` deployment and refreshes the authorized ContrataCR/SG Solutions fixture pair before running the seeded suite. Configure these secrets in the GitHub `test` environment:

- `VERCEL_AUTOMATION_BYPASS_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`
- `E2E_TEST_PASSWORD`

Seeded tests refuse to run against the production Supabase project. Run `npm run seed:test:full`, verify with `npm run seed:test:verify`, and set `E2E_FIXTURES_READY=1` (loaded automatically with the local `.env.test`) before a local seeded run.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
