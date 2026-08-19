# macOS migration handoff

Last updated: 2026-08-19

This is the continuation point for moving ContrataCR development from Windows to a Mac. Git is the source of truth; do not copy build output, logs, caches or the detached Windows preservation worktree.

## Canonical Git state

- `main`: production. There is no branch named `prod`.
- `test`: regression; it must resolve to exactly the same commit as `main`.
- `mobile`: based directly on `test`, with native/mobile-only differences.
- `local/pro-suite-no-push`: parked local work. It is not remote and is restored from a private bundle only if needed.

At the start of handoff preparation, `main` and `test` were at `2e7a3be2` and `mobile` was at `448bd738`. Documentation cleanup advances these hashes. On the Mac, always trust `git status --short --branch` and `git log -1 --oneline` over those historical values.

## Create the Mac worktrees

Install Git, Node.js 24, Xcode, Android Studio and a compatible JDK. Then:

```bash
mkdir -p ~/Developer/contratacr
cd ~/Developer/contratacr
git clone git@github.com:contratacr/contratacr.git contratacr-main
cd contratacr-main
git fetch --prune
git worktree add ../contratacr-test test
git worktree add ../contratacr-mobile mobile
npm ci
cd ../contratacr-test && npm ci
cd ../contratacr-mobile && npm ci
```

Do not create extra branches or worktrees. Record these three absolute paths in the Mac Codex workspace instructions.

## Local-only Pro archive

The Windows branch `local/pro-suite-no-push` contains unique parked work and cannot be recovered from GitHub. Transfer `local-pro-suite-no-push.bundle` through private storage, then restore it only if that work will continue:

```bash
cd ~/Developer/contratacr/contratacr-main
git fetch /private/path/local-pro-suite-no-push.bundle \
  local/pro-suite-no-push:local/pro-suite-no-push
git worktree add ../contratacr-pro local/pro-suite-no-push
```

Never push or merge it without Isaac's explicit authorization.

## Secrets and external files

Transfer these through a password manager or another encrypted channel, never through Git or chat:

- Production/test environment values.
- Cloudflare, Supabase, Brevo, Cloudinary/R2, Firebase and Google credentials.
- Android release keystore and passwords, when a signed Play Store build is needed.
- Apple Developer signing access, APNs key/certificate and Firebase iOS `GoogleService-Info.plist`.
- Backup encryption passphrase.

Recreate local environment files from the authoritative secret store and run `npm run security:env`.

## Platform state

- Hosting/API: Cloudflare Workers with OpenNext.
- Application database/Auth/RLS/Realtime: Supabase.
- National padrón: Cloudflare D1; migration 173 removed the Supabase copies.
- Media: R2 when configured, with Cloudinary fallback/legacy inventory.
- Push: Android FCM works; iOS is incomplete and documented on `mobile`.
- Assistant: local documented answers first, then bounded Workers AI.
- Latest shared database migration in Git: 174.

See `docs/platform-cost-roadmap.md` for the provider matrix and remaining architecture work.

## Mobile continuation point

Do not restart the app in React Native yet. Current evidence points to shell, routing, viewport and runtime/data errors in the Capacitor app, not a proven Capacitor limitation.

Open verification items after mobile commit `448bd738`:

1. Intermittent white frame between native splash and first-run chooser.
2. Login/register first-run flow across app termination, cancellation and switching to registration.
3. `/buscar` bottom spacing, search overlay stacking and bottom-nav geometry.
4. `/ofertas` and `/empleos` briefly render and can fall into the global error screen. The branch logs `[native-debug]` route, window error, unhandled rejection and board-mount diagnostics.
5. Bottom navigation must be absent inside full-screen search, assistant, direct-message chat and support chat; verify keyboard/composer geometry on a real device.

For Android, install a debug APK and inspect through Chrome `chrome://inspect/#devices`. Capture the first red error and every `[native-debug]` line before editing. On iOS, use Safari Web Inspector after enabling Develop tools.

## First verification on the Mac

```bash
cd ~/Developer/contratacr/contratacr-main
npm run text:check
npx tsc --noEmit --pretty false
npm run cloudflare:build

cd ../contratacr-mobile
npm run mobile:validate
npm run test:e2e:mobile:smoke
npx cap sync ios
```

Open `ios/App/App.xcodeproj` in Xcode, select the legitimate Apple team and run on a physical device. Do not invent signing IDs or Firebase files.

## Before the next push

1. Work only in the canonical worktree for the target branch.
2. Keep `main` and `test` on the same commit for shared changes.
3. Confirm `test` is an ancestor of `mobile`.
4. Run focused checks locally and make one coherent release-candidate push.
5. Confirm migration numbering is current and contains no stale duplicate.
