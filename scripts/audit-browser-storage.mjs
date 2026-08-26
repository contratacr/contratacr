#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";

// Browser storage is allowed only for reviewed caches, presentation preferences,
// or short-lived handoff state. Account-owned records must use the backend as the
// source of truth. The exact occurrence count makes additions fail CI even inside
// a previously reviewed file.
const reviewed = new Map([
  ["src/hooks/use-auth.ts", { count: 9, reason: "authenticated user/avatar render cache" }],
  ["src/hooks/use-mode.ts", { count: 3, reason: "tab-scoped panel-mode preference and its storage-event subscription" }],
  ["src/components/auth/otp-verification.tsx", { count: 2, reason: "short-lived OTP auto-resend cooldown; auth state stays in Supabase" }],
  ["src/components/auth/client-registration-modal.tsx", { count: 2, reason: "short-lived booking registration handoff" }],
  ["src/components/booking/booking-modal.tsx", { count: 4, reason: "short-lived booking registration handoff" }],
  ["src/components/dashboard/pro/profile-completion.tsx", { count: 5, reason: "dismissed and ignored optional checklist presentation state; completion truth remains in Supabase" }],
  ["src/components/landing/landing-navbar.tsx", { count: 4, reason: "language preference and coarse current-location search cache; no account-owned records" }],
  ["src/components/marketplace/marketplace-controls.tsx", { count: 2, reason: "device-local marketplace recent-search history" }],
  ["src/components/landing/ai-concierge.tsx", { count: 8, reason: "tab-scoped anonymous conversation and post-auth intent handoff; authenticated history persists in Supabase" }],
  ["src/components/dashboard/pro/proposals-tab.tsx", { count: 2, reason: "dismissed opportunity UI state" }],
  ["src/components/status/operational-status-banner.tsx", { count: 2, reason: "dismissed operational notice" }],
  ["src/app/api/portfolio-like/route.ts", { count: 1, reason: "documentation for anonymous browser guard" }],
  ["src/components/professionals/save-button.tsx", { count: 16, reason: "Supabase-backed favorites cache and login handoff" }],
  ["src/components/professionals/follow-button.tsx", { count: 7, reason: "Supabase-backed follows cache and short-lived post-login follow handoff" }],
  ["src/components/professionals/leave-review-modal.tsx", { count: 6, reason: "short-lived profile review draft handoff before login; submitted reviews persist in Supabase" }],
  ["src/components/professionals/follow-network-summary-link.tsx", { count: 2, reason: "account-keyed backend follow-count render cache; Supabase remains authoritative" }],
  ["src/lib/dashboard-prefetch-cache.ts", { count: 9, reason: "five-minute backend response cache, session-scoped and cleared on sign-out; Supabase remains authoritative" }],
  ["src/app/layout.tsx", { count: 8, reason: "pre-hydration read of the native first-run flag to pre-paint the onboarding screen; presentation only" }],
  ["src/components/mobile/mobile-app-bridge.tsx", { count: 3, reason: "native first-run flag and hardware-back root marker; presentation only" }],
  ["src/components/mobile/native-first-run-onboarding.tsx", { count: 11, reason: "native first-run completed flag, pending-route and post-auth handoff markers; no account-owned records" }],
  ["src/lib/analytics/attribution.ts", { count: 4, reason: "marketing attribution (utm/referrer) held only until sign-up, then persisted with the account in Supabase" }],
  ["src/components/analytics/attribution-capture.tsx", { count: 2, reason: "session marker that the account already claimed its first-touch attribution; the attribution itself persists server-side" }],
  ["src/lib/account-cache.ts", { count: 1, reason: "account-scoped removal of reviewed browser caches during disable/deletion" }],
  ["src/lib/app-data-invalidation.ts", { count: 2, reason: "cross-tab cache invalidation timestamp/domain signal; no account-owned records" }],
  ["src/components/professionals/case-like-button.tsx", { count: 3, reason: "anonymous like guard; count persists in backend" }],
  ["src/components/notifications/notification-live-toast.tsx", { count: 3, reason: "notification presentation state; records persist in backend" }],
  ["src/components/notifications/notification-bell.tsx", { count: 2, reason: "backend notification render cache" }],
  ["src/components/analytics/meta-pixel.tsx", { count: 1, reason: "measurement preference; no account-owned data" }],
  ["src/components/push/push-token-manager.tsx", { count: 15, reason: "native push permission presentation, navigation handoff, and legacy token-cache cleanup; active tokens persist in Supabase" }],
  ["src/lib/notifications-cache.ts", { count: 2, reason: "backend notification render cache; Supabase remains the source of truth" }],
  ["src/app/[locale]/login/page.tsx", { count: 1, reason: "short-lived post-login presentation handoff" }],
  ["src/app/[locale]/dashboard/profesional/page.tsx", { count: 12, reason: "seen opportunity presentation state, section-return handoff, and profile-completion navigation cache; backend remains authoritative" }],
]);

const trackedSource = execFileSync("git", ["ls-files", "src"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter((file) => /\.(?:js|jsx|mjs|ts|tsx)$/.test(file));

const storagePattern = /\b(?:localStorage|sessionStorage|indexedDB|CacheStorage)\b/g;
const findings = [];

for (const file of trackedSource) {
  const content = fs.readFileSync(file, "utf8");
  const count = [...content.matchAll(storagePattern)].length;
  if (count === 0) continue;

  const approval = reviewed.get(file);
  if (!approval) {
    findings.push(`${file}: ${count} unreviewed browser-storage occurrence(s)`);
    continue;
  }
  if (count !== approval.count) {
    findings.push(`${file}: expected ${approval.count} reviewed occurrence(s), found ${count}`);
  }
}

for (const [file, approval] of reviewed) {
  if (!trackedSource.includes(file)) {
    findings.push(`${file}: reviewed entry is stale (${approval.reason})`);
  }
}

if (findings.length > 0) {
  console.error("Browser storage audit failed.");
  console.error("Account-owned data must persist in the backend; review every new browser-storage use:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Browser storage audit passed (${reviewed.size} reviewed files).`);
