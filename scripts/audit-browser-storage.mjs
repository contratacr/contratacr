#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";

// Browser storage is allowed only for reviewed caches, presentation preferences,
// or short-lived handoff state. Account-owned records must use the backend as the
// source of truth. The exact occurrence count makes additions fail CI even inside
// a previously reviewed file.
const reviewed = new Map([
  ["src/components/pro/po-vendor-portal.tsx", { count: 2, reason: "random per-device token for the vendor secure link (no account, no identity); only used to tell this browser apart when answering a purchase order" }],
  ["src/components/pro/pro-app-support.tsx", { count: 2, reason: "dismissed state of the install/support banner (presentation preference); no account data" }],
  ["src/lib/analytics/native-measurement.ts", { count: 2, reason: "session-scoped 30-minute timestamp deduplication for a closed event catalog; no identity, search text, business payload or account-owned records" }],
  ["src/lib/privacy/optional-consent.ts", { count: 21, reason: "versioned device-local statistics/advertising/AI choices, expiry reads and legacy refusals; no account content. Reads a refusal saved earlier (even expired) so closing the notice or browsing on never overrides it, and stores how each choice was made (click, close or implicit). Reviewed additions read remaining lifetime, clear optional attribution/first-use markers, and persist/read/remove a boolean-only HttpOnly cleanup retry marker. Cleanup waits for advertising withdrawal; authenticated explicit choices also persist in the consent ledger" }],
  ["src/components/privacy/optional-choice-recorder.tsx", { count: 4, reason: "short-lived session retry queue scoped to the current user and purpose; removed after the backend acknowledges the explicit action, never treated as a server receipt or inherited by another account" }],
  ["src/components/mobile/campaign-app-links.tsx", { count: 2, reason: "welcome-presentation handoff only: set the existing UI-only auth-session marker and remove stale transition state for an accepted external link; launch replay now uses document memory because restored sessionStorage can skip a fresh native launch; no URLs, tokens, identity or account-owned records are stored" }],
  ["src/components/analytics/usage-capture.tsx", { count: 4, reason: "anonymous session ID/time and successful first-use delivery marker; all account access, registration and usage metrics are stored server-side" }],
  ["src/hooks/use-auth.ts", { count: 12, reason: "authenticated user/avatar render cache, plus a session-scoped flag so an unasked sign-out is reported once" }],
  ["src/hooks/use-mode.ts", { count: 5, reason: "tab-scoped panel-mode preference and its storage-event subscription, cleared on sign-out so the next login lands on the account's own panel" }],
  ["src/components/auth/otp-verification.tsx", { count: 2, reason: "short-lived OTP auto-resend cooldown; auth state stays in Supabase" }],
  ["src/components/dashboard/direct-chat-inbox.tsx", { count: 6, reason: "unsent composer drafts kept per conversation as a device convenience; sent messages live in Supabase" }],
  ["src/components/dashboard/pro/profile-completion.tsx", { count: 5, reason: "dismissed, skipped and ignored checklist presentation state; completion truth remains in Supabase" }],
  ["src/components/landing/landing-navbar.tsx", { count: 5, reason: "coarse current-location search cache and a per-user cache of the account capability (does it offer services?) so the navbar paints without shifting; Supabase re-checks it on every load. El idioma NO usa almacenamiento del navegador: vive en la cookie NEXT_LOCALE, que el servidor necesita leer para redirigir" }],
  ["src/components/search/search-filters.tsx", { count: 2, reason: "sessionStorage: una marca por sesión de que ya se intentó ordenar por cercanía con el permiso de ubicación ya concedido (o de que la persona lo apagó); sin coordenadas, búsquedas ni datos de la cuenta" }],
  ["src/components/marketplace/marketplace-controls.tsx", { count: 2, reason: "device-local marketplace recent-search history" }],
  ["src/lib/recent-visits.ts", { count: 9, reason: "device-local list of recently opened records and recent searches, offered back by the search screen, each removable one by one; nothing account-owned" }],
  ["src/components/landing/ai-concierge.tsx", { count: 12, reason: "tab-scoped anonymous conversation, post-auth intent and CTA-origin navigation handoff; route restoration now shares isAssistantReturn instead of a duplicate effect read, removing one access with no new keys, writes or account records; explicit dismissal still clears the origin and authenticated history persists in Supabase" }],
  ["src/components/jobs/preparar-curriculum.tsx", { count: 1, reason: "hands the job post being read (title, employer, text) to the resume builder for one navigation; the builder reads it once and removes it" }],
  ["src/components/dashboard/cv-builder.tsx", { count: 6, reason: "offline copy of the CVs and cover letters the person writes (up to ten of each, saved as they type), a one-time read of the older single draft to move it into the list, and the one-navigation job-post handoff; the account copy lives in Supabase (cv_documents, owner-only RLS) and wins when it was edited more recently, and documents written before it existed are uploaded once" }],
  ["src/components/notifications/resena-invitacion.tsx", { count: 4, reason: "per-device postponement of the review invitation (count and date, sixty days, three times at most) and a session marker so it appears once per app opening; the invitation itself and its read state live in Supabase" }],
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
  ["src/lib/account-cache.ts", { count: 1, reason: "account-scoped removal of reviewed browser caches during disable/deletion; also triggers the Pro cleanup (src/lib/pro/browser-storage-cleanup.ts) without adding accesses here" }],
  ["src/app/[locale]/profesionales/[slug]/profile-client.tsx", { count: 3, reason: "sessionStorage: a dónde vuelve la flecha de la ficha (regreso calculado), más una lectura del origen temporal del asistente para rotular la flecha; no se agregan claves ni datos de la cuenta" }],
  ["src/lib/borrador-sin-sesion.ts", { count: 10, reason: "borrador de proyecto/empleo/promoción escrito sin sesión (texto en localStorage, fotos en IndexedDB), vence a las 48 h y se borra al publicar; lo publicado vive en Supabase" }],
  ["src/lib/volver-por-historial.ts", { count: 13, reason: "sessionStorage de navegación: altura de cada lista, ruta anterior y una pila acotada de rutas visitadas en esta pestaña (2026-11-27, «Volver» sale de la pantalla en vez de recorrer sus entradas internas); solo direcciones de pantallas, no son datos de la cuenta" }],
  ["src/lib/directory/assistant-history.ts", { count: 5, reason: "directory assistant conversations (may hold personal details) kept only in this tab's sessionStorage, at most 20, removed on sign-out (signOutToHome); one removal of the copy older versions left in localStorage; never the account's copy" }],
  ["src/components/directory/projects-hub.tsx", { count: 2, reason: "device-local checklist of the service categories picked for a project plan (category ids only); no identity, request or account-owned records" }],
  ["src/components/saved/recently-viewed.ts", { count: 2, reason: "device-local list of recently opened public places (slug, name, area, photo; at most 12) and which «Comparta su experiencia» cards were dismissed or answered here; like src/lib/recent-visits.ts, nothing account-owned (reviews and lists persist through their APIs)" }],
  ["src/components/pro/finance-table.tsx", { count: 2, reason: "presentation preference: cards/table view per finance table; no records" }],
  ["src/components/pro/lead-onboarding-tiles.tsx", { count: 2, reason: "presentation preference: the lead onboarding tiles were hidden on this device; no records" }],
  ["src/components/pro/leads-table-view.tsx", { count: 4, reason: "presentation preference: lead table column order/visibility and cards/table view; no lead data" }],
  ["src/lib/pro/quote-start-payload.ts", { count: 4, reason: "sessionStorage: per-account one-navigation handoff of the quote draft (title, notes, lines) that starts a new private estimate (ccr:pro:private-estimate-import:v1:<account>:<id>), removed once the estimate editor reads it; estimates live in Supabase; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
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
  ["src/lib/auth/sign-out.ts", { count: 1, reason: "sessionStorage: marca de una sola recarga para que la portada siga diciendo \"Cerrando sesión…\"; se borra al leerla, sin datos de la cuenta" }],
  ["src/components/global-action-loading.tsx", { count: 2, reason: "lee y borra la marca de cierre de sesión de una sola recarga; sin datos de la cuenta" }],
  // Pro suite (PRO_ENABLED=false in production, but the code ships). Only unsent drafts, journals of
  // unconfirmed writes (removed on server ack) and unsent upload bytes, all scoped per account; the server
  // is the source of truth. "Pro cleanup" = src/lib/pro/browser-storage-cleanup.ts, wired into
  // signOutToHome, the SIGNED_OUT auth event and clearAccountLocalCache (disable/deletion).
  ["src/lib/pro/browser-storage-cleanup.ts", { count: 4, reason: "central Pro cleanup: enumerates and removes the Pro keys of both storages and deletes the five Pro recovery databases on sign-out and account disable/deletion; once per load keeps a timestamp and an archive ledger to expire Pro records after 30 days without a signed-in visit and kept-attempt archives after 7; stores no account content" }],
  ["src/components/pro/appointment-reminder-preference.tsx", { count: 4, reason: "sessionStorage: one per-account retry payload for the reminder opt-in toggle while the server answer is uncertain; removed on ack or 400/409; the preference lives in Supabase; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/bid-vendor-portal.tsx", { count: 2, reason: "random 43-char device id for the anonymous supplier bid portal (no account, no bid content); bids and portal access are validated server-side" }],
  ["src/components/pro/business-panel.tsx", { count: 8, reason: "sessionStorage: per-account per-section unsent form draft (ccr:pro:form:<account>:<section>, includes the record being edited and phone), removed on save or discard; records live in Supabase; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/catalog-workspace.tsx", { count: 34, reason: "client and inventory editors: sessionStorage form drafts and owner markers, plus per-account localStorage journals of the unconfirmed PATCH (client-write/inventory-write) mirrored per tab; journals removed on server ack or rejection; catalog lives in Supabase; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/client-operations.tsx", { count: 4, reason: "localStorage: exact request body of one client operation per account/client while its acknowledgement is lost, removed once confirmed; operations persist in Supabase; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/company-files.tsx", { count: 8, reason: "company file editor draft in sessionStorage and unsent upload bytes/metadata in the ccr-pro-company-file-recovery database until the server confirms the upload; files live in Supabase Storage; denied attempts kept in that database until sign-out; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/daily-log-company-file-picker.tsx", { count: 5, reason: "sessionStorage: per-account selection of company files to attach to a daily log (ids only), removed once attached; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/daily-log-discussion.tsx", { count: 16, reason: "daily-log comment: unsent text in sessionStorage and per-account localStorage journal of the unconfirmed comment write, removed on ack; rejected/denied attempts kept as local archives expire after 7 days; comments live in Supabase; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/daily-log-file-duplicate.tsx", { count: 19, reason: "daily-log file duplicate/retire: selection draft in sessionStorage and per-account localStorage journals of the unconfirmed copy and retire writes, removed on ack; rejected/denied attempts kept as local archives expire after 7 days; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/daily-log-file-reconciliation.tsx", { count: 5, reason: "localStorage: per-account journal of one unconfirmed daily-log file reconciliation check, removed on ack; rejected/denied attempts kept as local archives expire after 7 days; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/daily-log-files.tsx", { count: 1, reason: "opens the ccr-pro-daily-log-files database that queues unsent daily-log file bytes until the server confirms them; archived queues stay there until sign-out; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/daily-logs.tsx", { count: 22, reason: "daily-log editor draft in sessionStorage plus per-account localStorage journals of the unconfirmed log and file-publication writes, removed on ack; rejected/denied attempts kept as local archives expire after 7 days; logs live in Supabase; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/expenses-workspace.tsx", { count: 3, reason: "localStorage: per-account journal of the unconfirmed expense (and supplier) write steps, removed on ack or rejection; expenses live in Supabase; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/inline-customer-create.tsx", { count: 1, reason: "passes localStorage to the shared client-write journal for an inline customer creation; removed on ack; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/lead-origin-channels.tsx", { count: 9, reason: "sessionStorage: per-account unsent lead-origin channel draft, removed on save or discard; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/lead-origin-editor.tsx", { count: 14, reason: "lead-origin editor draft in sessionStorage and per-account localStorage journal of the unconfirmed origin write, removed on ack; rejected/denied attempts kept as local archives expire after 7 days; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/lead-stages-editor.tsx", { count: 10, reason: "sessionStorage: per-account unsent pipeline-stage edit/transfer draft, removed on save or discard; stages live in Supabase; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/leads-workspace.tsx", { count: 27, reason: "leads: manual-lead drafts in sessionStorage plus per-account localStorage journals of unconfirmed pipeline, lead-center and lead-origin-create writes, removed on ack; rejected/denied attempts kept as local archives expire after 7 days; leads live in Supabase; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/manual-lead-editor.tsx", { count: 8, reason: "sessionStorage: per-account per-lead unsent manual lead edit (contact fields typed by the pro), removed on save or discard; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/manual-lead-followup.tsx", { count: 14, reason: "lead follow-up draft in sessionStorage and per-account localStorage journal of the unconfirmed follow-up write, removed on ack; rejected/denied attempts kept as local archives expire after 7 days; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/manual-lead-work-action.tsx", { count: 6, reason: "localStorage: per-account journal of the unconfirmed lead-to-work conversion, removed on ack; rejected/denied attempts kept as local archives expire after 7 days; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/payment-link-portal.tsx", { count: 3, reason: "sessionStorage: the payer's own payment-link token moved from the URL fragment into this tab so a reload keeps working; no card data (processor only) and no account; the link expires server-side" }],
  ["src/components/pro/private-estimate-destination-copy-action.tsx", { count: 25, reason: "estimate copy to another destination: sessionStorage draft and kept marker plus per-account localStorage journal of the unconfirmed copy, removed on ack; rejected/denied attempts kept as local archives expire after 7 days; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/private-estimate-editor.tsx", { count: 7, reason: "sessionStorage: per-account per-estimate unsent private estimate draft (max 4 MB), removed on save or discard; estimates live in Supabase; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/private-estimate-publication-copy-action.tsx", { count: 9, reason: "localStorage: per-account journal of the unconfirmed publication copy, removed on ack; rejected/denied attempts kept as local archives expire after 7 days; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/private-estimate-publications.tsx", { count: 19, reason: "estimate publication draft in sessionStorage and per-account localStorage journal of the unconfirmed publication, removed on ack; rejected/denied attempts kept as local archives expire after 7 days; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/private-estimate-work-action.tsx", { count: 17, reason: "estimate-to-work draft in sessionStorage and per-account localStorage journal of the unconfirmed work creation, removed on ack; rejected/denied attempts kept as local archives expire after 7 days; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/private-estimates-workspace.tsx", { count: 14, reason: "per-account localStorage journal of the unconfirmed private estimate write and removal of the estimate draft once saved; rejected/denied attempts kept as local archives expire after 7 days; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/project-create.tsx", { count: 3, reason: "sessionStorage: per-account unsent new-project form draft, removed on create or reset; projects live in Supabase; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/public-reservations.tsx", { count: 5, reason: "sessionStorage: pre-login booking handoff (professional, day and the appointment input), expires after 30 minutes and is removed once read after sign-in; never tied to an account, the booking is created server-side" }],
  ["src/components/pro/quote-editor-loader.tsx", { count: 21, reason: "quote editor: per-account sessionStorage quote draft and owner marker plus local/tab journal of the unconfirmed direct-quote creation, removed on ack or send; quotes live in Supabase; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/request-followup.tsx", { count: 17, reason: "request follow-up draft in sessionStorage and per-account localStorage journal of the unconfirmed follow-up write, removed on ack; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/schedule-templates.tsx", { count: 13, reason: "schedule template draft in sessionStorage and per-account per-work localStorage journal and lock of the unconfirmed template write, removed on ack; rejected/denied attempts kept as local archives expire after 7 days; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/site-page.tsx", { count: 4, reason: "sessionStorage: public mini-site visitor UTM/campaign code and a once-per-tab visit marker; anonymous, no account or personal data" }],
  ["src/components/pro/task-center.tsx", { count: 15, reason: "per-account localStorage journals of the unconfirmed task-center write and batch (with per-tab mirror), removed on ack; tasks live in Supabase; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/task-templates.tsx", { count: 13, reason: "task template draft in sessionStorage and per-account localStorage journal of the unconfirmed template write, removed on ack; rejected/denied attempts kept as local archives expire after 7 days; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/team-space.tsx", { count: 7, reason: "per-account localStorage journal of the unconfirmed team write (invite/accept archives drop the body) and a read of the task-discussion recovery database; removed on ack; rejected/denied attempts kept as local archives expire after 7 days; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/team-task-discussion.tsx", { count: 15, reason: "task discussion: unsent comment text in sessionStorage and unconfirmed comment/file upload in the ccr-pro-team-task-discussion database, removed on ack; denied attempts kept in that database until sign-out; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/team-task-notices.tsx", { count: 5, reason: "localStorage: per-account journal of the unconfirmed team notice write, removed on ack; rejected/denied attempts kept as local archives expire after 7 days; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/work-budget.tsx", { count: 18, reason: "work budget draft in sessionStorage and per-account per-work localStorage journal of the unconfirmed budget write, removed on ack; rejected/denied attempts kept as local archives expire after 7 days; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/work-changes.tsx", { count: 9, reason: "per-account journal (local plus tab mirror) of the unconfirmed change-order write, removed on ack or rejection; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/work-costs.tsx", { count: 9, reason: "per-account per-work journal (local plus tab mirror) of the unconfirmed cost write, removed on ack or rejection; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/work-delivery.tsx", { count: 32, reason: "delivery report: sessionStorage draft and owner marker, local/tab journals of unconfirmed report and client acknowledgement writes, unsent photos in ccr-pro-delivery-photo-recovery; removed on ack; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/work-files.tsx", { count: 4, reason: "unsent work file upload/edit attempt in the ccr-pro-work-file-recovery database, removed on ack or discard; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/work-plan.tsx", { count: 13, reason: "work plan draft in sessionStorage and per-account localStorage journal and lock of the unconfirmed schedule write, removed on ack; rejected/denied attempts kept as local archives expire after 7 days; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/work-tasks.tsx", { count: 19, reason: "work task draft in sessionStorage and per-account localStorage journal of the unconfirmed task write, removed on ack; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/components/pro/work-updates.tsx", { count: 17, reason: "work update draft in sessionStorage and local/tab journal of the unconfirmed update write, removed on ack or rejection; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/lib/pro/client-project-route.ts", { count: 3, reason: "sessionStorage: one-navigation marker (request id plus document token) that the client project was opened from the app, removed when read; no personal data" }],
  ["src/lib/pro/created-customer.ts", { count: 7, reason: "sessionStorage: per-account marker of the customer id created from a lead draft, expires after 2 hours and is removed when read; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/lib/pro/daily-log-file-idb.ts", { count: 1, reason: "comment only: states that raw file bytes never enter localStorage (they stay in the reviewed recovery database)" }],
  ["src/lib/pro/inline-customer.ts", { count: 2, reason: "comments only: document that the inline customer creation reuses the reviewed client-write journal" }],
  ["src/lib/pro/project-invite-handoff.ts", { count: 9, reason: "sessionStorage: pre-login project invite code (30 minutes, consumed on first read) and the joined request id for 30 minutes; the joined marker is also cleared by the Pro cleanup on sign-out" }],
  ["src/lib/pro/quote-draft.ts", { count: 1, reason: "sessionStorage read of the per-account unsent quote draft; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/lib/pro/service-package-recovery.ts", { count: 5, reason: "localStorage: per-account retry payload of the unconfirmed service-package write, removed on ack; packages live in Supabase; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/lib/pro/task-center-batch.ts", { count: 1, reason: "defaults the tab mirror of the task-center batch journal to sessionStorage; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
  ["src/lib/pro/task-center-write.ts", { count: 1, reason: "defaults the tab mirror of the task-center write journal to sessionStorage; cleared by the Pro cleanup on sign-out, account disable/deletion and after 30 idle days" }],
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
