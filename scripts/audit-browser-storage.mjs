#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";

// Browser storage is allowed only for reviewed caches, presentation preferences,
// or short-lived handoff state. Account-owned records must use the backend as the
// source of truth. The exact occurrence count makes additions fail CI even inside
// a previously reviewed file.
const reviewed = new Map([
  ["src/lib/analytics/native-measurement.ts", { count: 2, reason: "session-scoped 30-minute timestamp deduplication for a closed event catalog; no identity, search text, business payload or account-owned records" }],
  ["src/lib/privacy/optional-consent.ts", { count: 10, reason: "versioned device-local advertising/AI preferences and legacy refusal reads; expiry never converts refusal into permission, explicit changes clear legacy state and pending delivery markers; a boolean-only pending withdrawal marker survives offline guest requests until server acknowledgement; authenticated choices also persist in the consent ledger" }],
  ["src/components/privacy/optional-choice-recorder.tsx", { count: 4, reason: "short-lived session retry queue scoped to the current user and purpose; removed after the backend acknowledges the explicit action, never treated as a server receipt or inherited by another account" }],
  ["src/components/mobile/campaign-app-links.tsx", { count: 2, reason: "session-scoped boolean preventing repeated cold-launch navigation; no signed URLs, tokens, identity or account-owned records are stored" }],
  ["src/components/analytics/usage-capture.tsx", { count: 4, reason: "anonymous session ID/time and successful first-use delivery marker; all account access, registration and usage metrics are stored server-side" }],
  ["src/hooks/use-auth.ts", { count: 12, reason: "authenticated user/avatar render cache, plus a session-scoped flag so an unasked sign-out is reported once" }],
  ["src/hooks/use-mode.ts", { count: 5, reason: "tab-scoped panel-mode preference and its storage-event subscription, cleared on sign-out so the next login lands on the account's own panel" }],
  ["src/components/auth/otp-verification.tsx", { count: 2, reason: "short-lived OTP auto-resend cooldown; auth state stays in Supabase" }],
  ["src/components/dashboard/direct-chat-inbox.tsx", { count: 6, reason: "unsent composer drafts kept per conversation as a device convenience; sent messages live in Supabase" }],
  ["src/components/dashboard/pro/profile-completion.tsx", { count: 5, reason: "dismissed, skipped and ignored checklist presentation state; completion truth remains in Supabase" }],
  ["src/components/landing/landing-navbar.tsx", { count: 5, reason: "coarse current-location search cache and a per-user cache of the account capability (does it offer services?) so the navbar paints without shifting; Supabase re-checks it on every load. El idioma NO usa almacenamiento del navegador: vive en la cookie NEXT_LOCALE, que el servidor necesita leer para redirigir" }],
  ["src/components/marketplace/marketplace-controls.tsx", { count: 2, reason: "device-local marketplace recent-search history" }],
  ["src/lib/recent-visits.ts", { count: 9, reason: "device-local list of recently opened records and recent searches, offered back by the search screen, each removable one by one; nothing account-owned" }],
  ["src/components/landing/ai-concierge.tsx", { count: 13, reason: "tab-scoped anonymous conversation, post-auth intent and CTA-origin navigation handoff; the two additional accesses read the same origin on hydration and clear it only on explicit dismissal, preventing a return race without adding keys or account records; authenticated history persists in Supabase" }],
  ["src/components/landing/app-download.tsx", { count: 2, reason: "device-local dismissal of the mobile web download notice, expires after thirty days; no account-owned records" }],
  ["src/components/status/operational-status-banner.tsx", { count: 2, reason: "dismissed operational notice" }],
  ["src/components/professionals/save-button.tsx", { count: 16, reason: "Supabase-backed favorites cache and login handoff" }],
  ["src/components/professionals/leave-review-modal.tsx", { count: 8, reason: "short-lived profile review draft handoff before login, and a tab-scoped copy of the viewer's own review so the box does not flash empty; submitted reviews persist in Supabase" }],
  ["src/hooks/use-profesional-con-app.ts", { count: 2, reason: "tab-scoped cache of which professionals have the app, to pick chat vs WhatsApp without refetching; the source of truth is the database" }],
  ["src/lib/data/use-custom-categories.ts", { count: 2, reason: "session snapshot of the public service catalog so a newly approved service paints on the first frame; the API stays authoritative and revalidates on every start" }],
  ["src/components/projects/publish-project-modal.tsx", { count: 2, reason: "remembers the last request zone (province/canton) so the next request starts with it; the request itself is stored in Supabase" }],
  ["src/lib/dashboard-prefetch-cache.ts", { count: 12, reason: "five-minute backend response cache, session-scoped and cleared on sign-out (entera, de una sola clave al crear algo, o de las variantes del directorio tras una edición administrativa; las nuevas lecturas solo enumeran claves para borrarlas); Supabase remains authoritative" }],
  ["src/app/layout.tsx", { count: 8, reason: "pre-hydration read of the native first-run flag to pre-paint the onboarding screen; presentation only" }],
  ["src/components/mobile/mobile-app-bridge.tsx", { count: 3, reason: "native first-run flag and hardware-back root marker; presentation only" }],
  ["src/components/mobile/native-first-run-onboarding.tsx", { count: 16, reason: "native first-run presentation flag and temporary navigation handoff markers; guest-menu completion writes the same completed flag and clears three existing markers (four additional accesses), without storing identity or account-owned records" }],
  ["src/lib/analytics/attribution.ts", { count: 7, reason: "recent and first marketing touches (utm/referrer) expire after thirty days; account acquisition persists in Supabase, while a short-lived cookie attributes actions" }],
  ["src/components/analytics/attribution-capture.tsx", { count: 4, reason: "session markers for campaign clicks and first-touch claim; attribution and interactions persist server-side; advertising choice is delegated to the versioned consent module" }],
  ["src/lib/account-cache.ts", { count: 1, reason: "account-scoped removal of reviewed browser caches during disable/deletion" }],
  ["src/app/[locale]/profesionales/[slug]/profile-client.tsx", { count: 3, reason: "sessionStorage: a dónde vuelve la flecha de la ficha (regreso calculado), más una lectura del origen temporal del asistente para rotular la flecha; no se agregan claves ni datos de la cuenta" }],
  ["src/lib/borrador-sin-sesion.ts", { count: 10, reason: "borrador de proyecto/empleo/promoción escrito sin sesión (texto en localStorage, fotos en IndexedDB), vence a las 48 h y se borra al publicar; lo publicado vive en Supabase" }],
  ["src/lib/volver-por-historial.ts", { count: 8, reason: "sessionStorage de navegación: altura de cada lista y ruta anterior para volver; no son datos de la cuenta" }],
  ["src/app/[locale]/error.tsx", { count: 2, reason: "marca de una sola recarga cuando la pantalla pide un archivo de la versión anterior; nada de la cuenta" }],
  ["src/lib/app-data-invalidation.ts", { count: 2, reason: "cross-tab cache invalidation timestamp/domain signal; no account-owned records" }],
  ["src/components/notifications/notification-live-toast.tsx", { count: 5, reason: "notification presentation state; records persist in backend; plus a per-app-open flag so the entry summary is checked once" }],
  ["src/components/notifications/notification-bell.tsx", { count: 2, reason: "backend notification render cache" }],
  ["src/components/analytics/meta-pixel.tsx", { count: 1, reason: "measurement preference; no account-owned data" }],
  ["src/lib/analytics/meta-pixel.ts", { count: 12, reason: "per-tab UUID/time/ack markers for minimal PageView, Search and registration requests, expire after 30 minutes; old raw envelopes are only removed, no raw search or account records are stored; server conversion receipts remain authoritative" }],
  ["src/components/push/push-token-manager.tsx", { count: 14, reason: "native push permission presentation (ask count, denied-explained flag), navigation handoff, and legacy token-cache cleanup; active tokens persist in Supabase" }],
  ["src/lib/direct-chat/conversations-cache.ts", { count: 5, reason: "five-minute session-scoped cache of the conversation list so Mensajes paints at once after a reload; cleared on sign-out; messages persist in Supabase" }],
  ["src/lib/notifications-cache.ts", { count: 2, reason: "backend notification render cache; Supabase remains the source of truth" }],
  ["src/lib/notifications/use-actor-photos.ts", { count: 2, reason: "avatar render cache for notification rows; profiles remain the source of truth" }],
  ["src/app/[locale]/login/page.tsx", { count: 1, reason: "short-lived post-login presentation handoff" }],
  ["src/app/[locale]/dashboard/profesional/page.tsx", { count: 10, reason: "section-return handoff and profile-completion navigation cache; backend remains authoritative" }],
]);

const trackedSource = execFileSync("git", ["ls-files", "src"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter((file) => /\.(?:js|jsx|mjs|ts|tsx)$/.test(file))
  // Un archivo borrado y todavía sin confirmar sigue apareciendo en el índice:
  // no hay nada que auditar en él y leerlo rompía la comprobación entera.
  .filter((file) => fs.existsSync(file));

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
