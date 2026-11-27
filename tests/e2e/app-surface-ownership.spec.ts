import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "playwright/test";

type OwnershipRule = {
  match: RegExp;
  owner: string;
  parked?: boolean;
};

const appRoot = resolve(process.cwd(), "src/app");
const e2eRoot = resolve(process.cwd(), "tests/e2e");

function filesNamed(directory: string, fileName: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesNamed(path, fileName) : entry.name === fileName ? [path] : [];
  });
}

function appRoute(file: string, terminal: "page.tsx" | "route.ts") {
  const path = relative(appRoot, file).replaceAll("\\", "/");
  const withoutTerminal = path === terminal ? "" : path.slice(0, -(terminal.length + 1));
  return `/${withoutTerminal}`;
}

// GEMELA de la lista de `scripts/ci/verify-app-surface-ownership.mjs` (el CI la
// corre en cada push). La prueba de más abajo compara las dos y falla si se
// separan: antes se editaba una sola y la otra se enteraba semanas después.
const pageRules: OwnershipRule[] = [
  { match: /^\/\[locale\]\/continuar-perfil$/, owner: "profile-reminder.spec.ts" },
  // Multivertical directory (local Pro, M1): staff queue of the directory inside the admin area.
  { match: /^\/\[locale\]\/admin\/directorio$/, owner: "pro-dir-admin.spec.ts" },
  { match: /^\/\[locale\]\/admin(?:\/|$)/, owner: "admin-smoke.spec.ts" },
  // Round 8 (local Pro): job page deep link and the subcontractor portal.
  { match: /^\/\[locale\]\/dashboard\/(?:pro\/trabajo\/|subcontratista$)/, owner: "pro-round8-suite.spec.ts" },
  // Fix 14 (local Pro): the linked customer's «Mi proyecto» page (deep link, Back, access only for that customer).
  { match: /^\/\[locale\]\/dashboard\/mi-proyecto\//, owner: "pro-fix14.spec.ts" },
  // Multivertical directory (local Pro): Pro inventory of vehicle/property listings and the restaurant menu editor.
  { match: /^\/\[locale\]\/dashboard\/pro\/inventario(?:\/|$)/, owner: "pro-dir-listings.spec.ts" },
  { match: /^\/\[locale\]\/dashboard\/pro\/menu$/, owner: "pro-dir-menu.spec.ts" },
  // Place features round (2026-11-17): owner bookings screen and the place tools (events, «Pedir», brand info).
  { match: /^\/\[locale\]\/dashboard\/pro\/reservas-mesa$/, owner: "pro-dir-reservations.spec.ts" },
  { match: /^\/\[locale\]\/dashboard\/pro\/lugar$/, owner: "pro-dir-events.spec.ts" },
  { match: /^\/\[locale\]\/dashboard(?:\/|$)/, owner: "dashboard-surfaces.spec.ts" },
  // The editors (publish, edit, owner managers) are exercised through their real screens.
  { match: /^\/\[locale\]\/(?:empleos|promociones)\/(?:publicar|\[id\]\/editar|mis-empleos|mis-promociones)$/, owner: "marketplace-editors.spec.ts" },
  { match: /^\/\[locale\]\/(?:empleos|promociones)(?:\/|$)/, owner: "marketplace-lifecycle.spec.ts" },
  { match: /^\/\[locale\]\/profesionales(?:\/|$)/, owner: "professional-profile.spec.ts" },
  { match: /^\/\[locale\]\/notificaciones$/, owner: "notifications-guides-regression.spec.ts" },
  { match: /^\/\[locale\]\/mensajes$/, owner: "direct-chat.spec.ts", parked: true },
  // Role choice, onboarding hand-off, profile completion and the recovery link are driven on the real pages.
  // Sign-up «Empresa o local» (directory on, 2026-11-27): add or claim the business.
  { match: /^\/\[locale\]\/registro\/empresa$/, owner: "pro-dir-business-signup.spec.ts" },
  { match: /^\/\[locale\]\/(?:registro|reset-password|onboarding|completar-perfil)$/, owner: "auth-screens.spec.ts" },
  { match: /^\/\[locale\]\/(?:login|registro|olvide-contrasena|reset-password|onboarding|completar-perfil)(?:\/|$)/, owner: "auth-support.spec.ts" },
  { match: /^\/\[locale\]\/eliminar-cuenta$/, owner: "account-lifecycle.spec.ts" },
  // Round 6D (local Pro): professional website and campaign unsubscribe page.
  { match: /^\/\[locale\]\/sitio(?:\/|$)/, owner: "pro-round6d-site.spec.ts" },
  { match: /^\/\[locale\]\/baja-pro$/, owner: "pro-round6d-marketing.spec.ts" },
  // Rows 51-53 (local Pro): public vendor page of a purchase order link (no ContrataCR account).
  { match: /^\/\[locale\]\/orden-proveedor$/, owner: "pro-po-vendor-link.spec.ts" },
  { match: /^\/\[locale\]\/formulario-contacto\/\[id\]$/, owner: "pro-contact-form.spec.ts" },
  // Post-security fixes: confirmation page of the site-form subscription (double opt-in).
  { match: /^\/\[locale\]\/confirmar-pro$/, owner: "pro-round6d-site.spec.ts" },
  // Multivertical directory (local Pro): place page + public menu, sections with search, listings, how we rank (F0).
  { match: /^\/\[locale\]\/lugar\/\[slug\]\/menu$/, owner: "pro-dir-menu.spec.ts" },
  { match: /^\/\[locale\]\/lugar(?:\/|$)/, owner: "pro-dir-places.spec.ts" },
  // Place features round (2026-11-17): public events, brand pages, saved lists (mine + shared link).
  { match: /^\/\[locale\]\/eventos$/, owner: "pro-dir-events.spec.ts" },
  { match: /^\/\[locale\]\/marca\/\[slug\]$/, owner: "pro-dir-brands.spec.ts" },
  { match: /^\/\[locale\]\/(?:listas|lista\/\[token\])$/, owner: "pro-dir-lists.spec.ts" },
  // Directory app Me tab (WS4): /yo.
  { match: /^\/\[locale\]\/yo$/, owner: "directory-app-me-lists.spec.ts" },
  // Pending fixes round (2026-11-17): the customer's private reservation link and «Mis reservas».
  { match: /^\/\[locale\]\/(?:reserva\/\[token\]|mis-reservas)$/, owner: "pro-dir-reservations.spec.ts" },
  { match: /^\/\[locale\]\/(?:restaurantes|farmacias|supermercados|gasolineras|como-ordenamos)$/, owner: "pro-dir-search.spec.ts" },
  // Sections approved on 2026-11-17 (cafés split out of restaurants, corner stores, hardware, lodging, health, vets,
  // car services, beauty, gyms, tours, banks): listing, kind filter, policy notes and price limits per section.
  { match: /^\/\[locale\]\/(?:cafes|pulperias|ferreterias|hospedaje|salud|veterinarias|talleres|belleza|gimnasios|tours|bancos|parqueos|lavacar|atracciones|tiendas|centros-comerciales|mercados-y-carnicerias|tramites|educacion|transporte)$/, owner: "pro-dir-verticals.spec.ts" },
  // P3: price comparison (supermarkets and OTC pharmacy products), /precios and /en/precios.
  { match: /^\/\[locale\]\/precios$/, owner: "pro-dir-prices-compare.spec.ts" },
  // IA 2026-11-21: the "Lugares" hub and the "Para negocios y profesionales" entry page.
  { match: /^\/\[locale\]\/(?:lugares|negocios-y-profesionales)$/, owner: "pro-dir-hubs.spec.ts" },
  { match: /^\/\[locale\]\/(?:vehiculos|inmuebles)(?:\/|$)/, owner: "pro-dir-listings.spec.ts" },
  // Directory app tabs (WS5): Proyectos hub on /solicitudes (mobile) and the full-screen Asistente.
  { match: /^\/\[locale\]\/asistente$/, owner: "directory-app-projects-assistant.spec.ts" },
  { match: /^\/\[locale\](?:\/|$)/, owner: "public-smoke.spec.ts" },
  { match: /^\/$/, owner: "public-smoke.spec.ts" },
];

const handlerRules: OwnershipRule[] = [
  // Multivertical directory (local Pro): search/facets, place report, claims (mock OTP), contacts and reviews,
  // listing inventory and photos, restaurant menu.
  // Owner/user place photos (upload, moderation and private serving) and "Mi negocio" without Pro (/api/negocio/*).
  { match: /^\/api\/(?:fotos-lugar\/\[id\]|lugar\/\[slug\]\/fotos)$/, owner: "pro-dir-photos.spec.ts" },
  { match: /^\/api\/negocio(?:\/(?:lugar|menu|perfil|reservas|respuestas))?$/, owner: "pro-dir-business-tools.spec.ts" },
  { match: /^\/api\/negocio\/(?:buscar|solicitud)$/, owner: "pro-dir-business-signup.spec.ts" },
  { match: /^\/api\/directorio\/(?:search|facets)$/, owner: "pro-dir-search.spec.ts" },
  // M1: staff queue (+ private claim documents), claim documents upload, user price reports, review flags, owner replies.
  { match: /^\/api\/admin\/directorio(?:\/documento)?$/, owner: "pro-dir-admin.spec.ts" },
  { match: /^\/api\/lugar\/\[slug\]\/reclamo\/documentos$/, owner: "pro-dir-admin.spec.ts" },
  { match: /^\/api\/lugar\/\[slug\]\/precios\/reporte$/, owner: "pro-dir-prices-report.spec.ts" },
  { match: /^\/api\/lugar\/\[slug\]\/resenas\/reporte$/, owner: "pro-dir-replies.spec.ts" },
  { match: /^\/api\/pro\/review-replies$/, owner: "pro-dir-replies.spec.ts" },
  { match: /^\/api\/lugar\/\[slug\]\/reporte$/, owner: "pro-dir-places.spec.ts" },
  { match: /^\/api\/lugar\/\[slug\]\/(?:reclamo|contacto|resenas)$/, owner: "pro-dir-claims-reviews.spec.ts" },
  { match: /^\/api\/reclamos\/\[id\]\/(?:codigo|verificar|buzon-prueba)$/, owner: "pro-dir-claims-reviews.spec.ts" },
  { match: /^\/api\/pro\/(?:dir-listings|dir-listing-photos)$/, owner: "pro-dir-listings.spec.ts" },
  { match: /^\/api\/pro\/menu$/, owner: "pro-dir-menu.spec.ts" },
  // Place features round (2026-11-17): reservations/waitlist, Q&A, saved lists, events + «Pedir», brands.
  { match: /^\/api\/lugar\/\[slug\]\/reservas$/, owner: "pro-dir-reservations.spec.ts" },
  { match: /^\/api\/pro\/table-reservations$/, owner: "pro-dir-reservations.spec.ts" },
  { match: /^\/api\/reservas\/\[token\]$/, owner: "pro-dir-reservations.spec.ts" },
  // Pending fixes round (2026-11-17): directory entries of the Pro hub («Reservas de mesa», «Menú», «Mi lugar»).
  { match: /^\/api\/pro\/place-hub$/, owner: "pro-dir-hub.spec.ts" },
  { match: /^\/api\/pro\/editions$/, owner: "pro-gaps-editions-team.spec.ts" },
  { match: /^\/api\/lugar\/\[slug\]\/preguntas$/, owner: "pro-dir-questions.spec.ts" },
  { match: /^\/api\/listas$/, owner: "pro-dir-lists.spec.ts" },
  { match: /^\/api\/pro\/place-events$/, owner: "pro-dir-events.spec.ts" },
  { match: /^\/api\/pro\/brand-info$/, owner: "pro-dir-brands.spec.ts" },
  { match: /^\/api\/marca\/\[slug\]\/reclamo(?:\/documentos)?$/, owner: "pro-dir-brands.spec.ts" },
  // Local Pro suite (Rounds 1–6C): one exact owner per route handler; each spec drives that route.
  { match: /^\/api\/pro\/access$/, owner: "pro-access-loading.spec.ts" },
  // Round 6C: AI assistant (drafts, plan reading, expense capture) and meeting recordings.
  { match: /^\/api\/pro\/ai$/, owner: "pro-round6c-ai.spec.ts" },
  { match: /^\/api\/pro\/ai-meetings$/, owner: "pro-round6c-meetings.spec.ts" },
  // Round 6D: website builder (owner + public), email campaigns (+ public unsubscribe), tracking, clipper, floor plans.
  { match: /^\/api\/pro\/site$/, owner: "pro-round6d-site.spec.ts" },
  { match: /^\/api\/pro\/site-public$/, owner: "pro-round6d-site.spec.ts" },
  { match: /^\/api\/pro\/marketing$/, owner: "pro-round6d-marketing.spec.ts" },
  { match: /^\/api\/pro\/marketing-unsubscribe$/, owner: "pro-round6d-marketing.spec.ts" },
  // Post-security fixes: RFC 8058 one-click unsubscribe and the double opt-in confirmation.
  { match: /^\/api\/pro\/marketing-unsubscribe\/one-click$/, owner: "pro-round6d-marketing.spec.ts" },
  { match: /^\/api\/pro\/marketing-confirm$/, owner: "pro-round6d-site.spec.ts" },
  { match: /^\/api\/pro\/ads-tracking$/, owner: "pro-round6d-site.spec.ts" },
  // Pro 29 (rows 69, 70): sandbox ad builder with simulated metrics; custom domain with mock DNS verification.
  { match: /^\/api\/pro\/(?:company-ad-builder|company-site-domain)$/, owner: "pro-round13-ads-domain.spec.ts" },
  { match: /^\/api\/pro\/catalog-clipper$/, owner: "pro-round6d-clipper-plans.spec.ts" },
  { match: /^\/api\/pro\/mood-board-templates$/, owner: "pro-board-templates.spec.ts" },
  { match: /^\/api\/pro\/floor-plans$/, owner: "pro-round6d-clipper-plans.spec.ts" },
  { match: /^\/api\/pro\/floor-object-library$/, owner: "pro-floor-library.spec.ts" },
  { match: /^\/api\/pro\/ai-takeoff-review$/, owner: "pro-takeoffs.spec.ts" },
  { match: /^\/api\/pro\/accounting$/, owner: "pro-round6b-accounting.spec.ts" },
  { match: /^\/api\/pro\/accounting-export$/, owner: "pro-round6b-accounting.spec.ts" },
  { match: /^\/api\/pro\/agenda$/, owner: "pro-agenda-operations.spec.ts" },
  { match: /^\/api\/pro\/allowances$/, owner: "pro-allowances.spec.ts" },
  { match: /^\/api\/pro\/allowances-print$/, owner: "pro-allowances.spec.ts" },
  { match: /^\/api\/pro\/allowance-surcharge$/, owner: "pro-allowance-surcharge.spec.ts" },
  { match: /^\/api\/pro\/work-profitability$/, owner: "pro-work-profitability.spec.ts" },
  { match: /^\/api\/pro\/app-manifest$/, owner: "pro-web-app.spec.ts" },
  { match: /^\/api\/pro\/appointment-list$/, owner: "pro-appointment-inbox.spec.ts" },
  { match: /^\/api\/pro\/appointment-preferences$/, owner: "pro-appointment-requests.spec.ts" },
  { match: /^\/api\/pro\/appointment-quote-context$/, owner: "pro-lead-commercial-progress-api.spec.ts" },
  { match: /^\/api\/pro\/appointment-reminders$/, owner: "pro-appointment-reminders.spec.ts" },
  { match: /^\/api\/pro\/appointment-requests$/, owner: "pro-appointment-inbox.spec.ts" },
  { match: /^\/api\/pro\/appointment-reschedule$/, owner: "pro-appointment-reschedule.spec.ts" },
  { match: /^\/api\/pro\/appointment-schedule$/, owner: "pro-appointment-schedule.spec.ts" },
  { match: /^\/api\/pro\/bid-portal\/files$/, owner: "pro-round4b-portal.spec.ts" },
  { match: /^\/api\/pro\/bid-portal\/questions$/, owner: "pro-bid-questions.spec.ts" },
  { match: /^\/api\/pro\/bid-portal$/, owner: "pro-bid-portal.spec.ts" },
  { match: /^\/api\/pro\/bid-portal-links$/, owner: "pro-bid-portal.spec.ts" },
  { match: /^\/api\/pro\/bids$/, owner: "pro-bids.spec.ts" },
  { match: /^\/api\/pro\/catalog$/, owner: "pro-catalog-storage.spec.ts" },
  { match: /^\/api\/pro\/catalog-organizations$/, owner: "pro-catalog-organizations.spec.ts" },
  { match: /^\/api\/pro\/client-balance$/, owner: "pro-round4a.spec.ts" },
  { match: /^\/api\/pro\/client-dashboard$/, owner: "pro-client-dashboard.spec.ts" },
  { match: /^\/api\/pro\/client-finances$/, owner: "pro-round4a.spec.ts" },
  { match: /^\/api\/pro\/client-fiscal$/, owner: "pro-client-fiscal.spec.ts" },
  { match: /^\/api\/pro\/client-operations$/, owner: "pro-client-operations.spec.ts" },
  { match: /^\/api\/pro\/client-pending$/, owner: "pro-client-pending-requests.spec.ts" },
  { match: /^\/api\/pro\/client-statement$/, owner: "pro-client-statement.spec.ts" },
  { match: /^\/api\/pro\/client-statement-print$/, owner: "pro-round4a.spec.ts" },
  { match: /^\/api\/pro\/company-daily-log-files$/, owner: "pro-company-daily-log-files-api.spec.ts" },
  { match: /^\/api\/pro\/company-file-versions$/, owner: "pro-company-file-versions.spec.ts" },
  { match: /^\/api\/pro\/(?:company-file-bulk|work-file-bulk|file-purge)$/, owner: "pro-file-bulk.spec.ts" },
  { match: /^\/api\/pro\/file-annotations$/, owner: "pro-file-annotations.spec.ts" },
  { match: /^\/api\/pro\/company-folder-access$/, owner: "pro-company-folder-access.spec.ts" },
  { match: /^\/api\/pro\/file-import$/, owner: "pro-file-import.spec.ts" },
  { match: /^\/api\/pro\/file-convert$/, owner: "pro-file-formats-preview.spec.ts" },
  { match: /^\/api\/pro\/company-file-tags$/, owner: "pro-files-library.spec.ts" },
  { match: /^\/api\/pro\/company-files$/, owner: "pro-company-files.spec.ts" },
  { match: /^\/api\/pro\/company-vendors$/, owner: "pro-bid-portal.spec.ts" },
  { match: /^\/api\/pro\/connectors$/, owner: "pro-round6b-connectors.spec.ts" },
  { match: /^\/api\/pro\/company-(?:automation|meetings)$/, owner: "pro-round13-webhooks-meetings.spec.ts" },
  { match: /^\/api\/pro\/contract-print$/, owner: "pro-contracts.spec.ts" },
  { match: /^\/api\/pro\/contracts$/, owner: "pro-contracts.spec.ts" },
  { match: /^\/api\/pro\/(?:credits-retainers|credit-ledger)$/, owner: "pro-credits-retainers.spec.ts" },
  { match: /^\/api\/pro\/daily-log-discussion$/, owner: "pro-daily-log-discussion-api.spec.ts" },
  { match: /^\/api\/pro\/daily-log-duplicate$/, owner: "pro-daily-log-duplicate-api.spec.ts" },
  { match: /^\/api\/pro\/daily-log-file-reconciliation$/, owner: "pro-company-daily-log-files-api.spec.ts" },
  { match: /^\/api\/pro\/daily-log-files$/, owner: "pro-company-daily-log-files-api.spec.ts" },
  { match: /^\/api\/pro\/daily-logs$/, owner: "pro-daily-logs.spec.ts" },
  { match: /^\/api\/pro\/discount-presets$/, owner: "pro-discount-presets.spec.ts" },
  { match: /^\/api\/pro\/einvoice$/, owner: "pro-round6a-integrations.spec.ts" },
  { match: /^\/api\/pro\/einvoice-file$/, owner: "pro-round6a-integrations.spec.ts" },
  { match: /^\/api\/pro\/invoice-einvoice$/, owner: "pro-einvoice.spec.ts" },
  { match: /^\/api\/pro\/esign\/mock-sign$/, owner: "pro-round6b-esign.spec.ts" },
  { match: /^\/api\/pro\/esign$/, owner: "pro-round6b-esign.spec.ts" },
  { match: /^\/api\/pro\/esign-file$/, owner: "pro-round6b-esign.spec.ts" },
  { match: /^\/api\/pro\/expense-receipts$/, owner: "pro-round4b-billing.spec.ts" },
  { match: /^\/api\/pro\/expenses$/, owner: "pro-expenses-english.spec.ts" },
  { match: /^\/api\/pro\/file-versions$/, owner: "pro-file-versions.spec.ts" },
  // Row 30 (Ronda F2): @mentions of the job team in file comments and the member inbox.
  { match: /^\/api\/pro\/file-mentions$/, owner: "pro-file-mentions.spec.ts" },
  { match: /^\/api\/pro\/identity-lookup$/, owner: "pro-client-fiscal.spec.ts" },
  { match: /^\/api\/pro\/integrations$/, owner: "pro-round6a-integrations.spec.ts" },
  { match: /^\/api\/pro\/integrations\/webhooks\/esign$/, owner: "pro-round6b-esign.spec.ts" },
  { match: /^\/api\/pro\/integrations\/webhooks\/tilopay$/, owner: "pro-round6a-integrations.spec.ts" },
  { match: /^\/api\/pro\/invoice-document-settings$/, owner: "pro-catalog-item-types.spec.ts" },
  { match: /^\/api\/pro\/invoice-drafts$/, owner: "pro-invoice-drafts.spec.ts" },
  { match: /^\/api\/pro\/invoice-delivery$/, owner: "pro-invoice-delivery.spec.ts" },
  { match: /^\/api\/pro\/invoice-issuer$/, owner: "pro-issuer-settings.spec.ts" },
  { match: /^\/api\/pro\/invoice-management$/, owner: "pro-invoice-management.spec.ts" },
  { match: /^\/api\/pro\/invoice-payments$/, owner: "pro-invoice-payments.spec.ts" },
  { match: /^\/api\/pro\/invoice-print$/, owner: "pro-invoice-management.spec.ts" },
  { match: /^\/api\/pro\/invoice-recurrence$/, owner: "pro-invoice-recurrence.spec.ts" },
  { match: /^\/api\/pro\/lead-center$/, owner: "pro-lead-center-api.spec.ts" },
  { match: /^\/api\/pro\/lead-commercial-progress$/, owner: "pro-lead-commercial-progress-api.spec.ts" },
  { match: /^\/api\/pro\/lead-followups$/, owner: "pro-lead-followups-api.spec.ts" },
  { match: /^\/api\/pro\/lead-inboxes$/, owner: "pro-company.spec.ts" },
  { match: /^\/api\/pro\/lead-origin-create$/, owner: "pro-lead-origin-create-api.spec.ts" },
  { match: /^\/api\/pro\/lead-origins$/, owner: "pro-lead-origins-api.spec.ts" },
  { match: /^\/api\/pro\/lead-private-core$/, owner: "pro-lead-center.spec.ts" },
  { match: /^\/api\/pro\/lead-private-quotes$/, owner: "pro-lead-private-quotes-api.spec.ts" },
  { match: /^\/api\/pro\/lead-private-stages$/, owner: "pro-private-stages-api.spec.ts" },
  { match: /^\/api\/pro\/lead-private-work$/, owner: "pro-lead-commercial-progress-api.spec.ts" },
  { match: /^\/api\/pro\/lead-plans$/, owner: "pro-lead-plan-templates.spec.ts" },
  { match: /^\/api\/pro\/lead-log$/, owner: "pro-lead-log.spec.ts" },
  { match: /^\/api\/pro\/contact-form(?:-public)?$/, owner: "pro-contact-form.spec.ts" },
  { match: /^\/api\/pro\/lead-work$/, owner: "pro-lead-work.spec.ts" },
  { match: /^\/api\/pro\/lead-files$/, owner: "pro-lead-work.spec.ts" },
  { match: /^\/api\/pro\/lead-delete$/, owner: "pro-lead-work.spec.ts" },
  { match: /^\/api\/pro\/manual-lead-quotes$/, owner: "pro-manual-lead-quotes-api.spec.ts" },
  { match: /^\/api\/pro\/manual-lead-work$/, owner: "pro-manual-lead-work-api.spec.ts" },
  { match: /^\/api\/pro\/mood-boards$/, owner: "pro-mood-boards.spec.ts" },
  { match: /^\/api\/pro\/oauth\/callback$/, owner: "pro-round6b-connectors.spec.ts" },
  { match: /^\/api\/pro\/oauth\/mock-authorize$/, owner: "pro-round6b-connectors.spec.ts" },
  { match: /^\/api\/pro\/pay$/, owner: "pro-round6a-integrations.spec.ts" },
  { match: /^\/api\/pro\/payment-links$/, owner: "pro-round6a-integrations.spec.ts" },
  { match: /^\/api\/pro\/payment-metadata$/, owner: "pro-payment-metadata-english.spec.ts" },
  { match: /^\/api\/pro\/payment-overview$/, owner: "pro-payment-overview.spec.ts" },
  { match: /^\/api\/pro\/payment-plan(?:-reminders)?$/, owner: "pro-round5-payment-plan.spec.ts" },
  { match: /^\/api\/pro\/payment-plan-print$/, owner: "pro-round5-payment-plan.spec.ts" },
  { match: /^\/api\/pro\/payment-receipt-print$/, owner: "pro-payment-receipts.spec.ts" },
  { match: /^\/api\/pro\/payment-receipts$/, owner: "pro-payment-receipts.spec.ts" },
  { match: /^\/api\/pro\/private-estimate-destination-copy$/, owner: "pro-private-estimate-destination-copy-journey.spec.ts" },
  { match: /^\/api\/pro\/private-estimate-publication-copy$/, owner: "pro-private-estimate-publication-copy-journey.spec.ts" },
  { match: /^\/api\/pro\/private-estimate-publications$/, owner: "pro-private-estimate-publications-api.spec.ts" },
  { match: /^\/api\/pro\/private-estimate-work$/, owner: "pro-invoice-drafts.spec.ts" },
  { match: /^\/api\/pro\/private-estimates$/, owner: "pro-private-estimate-destination-copy-api.spec.ts" },
  { match: /^\/api\/pro\/project-details$/, owner: "pro-phase2-qa-fixes.spec.ts" },
  { match: /^\/api\/pro\/project-invitation$/, owner: "pro-round4a.spec.ts" },
  { match: /^\/api\/pro\/project-notes$/, owner: "pro-project-notes-details.spec.ts" },
  { match: /^\/api\/pro\/project-planning$/, owner: "pro-project-planning.spec.ts" },
  { match: /^\/api\/pro\/project-quote-context$/, owner: "pro-project-journey.spec.ts" },
  { match: /^\/api\/pro\/project-schedule$/, owner: "pro-project-schedule.spec.ts" },
  { match: /^\/api\/pro\/projects$/, owner: "pro-projects.spec.ts" },
  { match: /^\/api\/pro\/projects-hub$/, owner: "pro-projects-hub.spec.ts" },
  { match: /^\/api\/pro\/time-activity-defaults$/, owner: "pro-time-activity-defaults.spec.ts" },
  { match: /^\/api\/pro\/time-activity-members$/, owner: "pro-time-activity-members.spec.ts" },
  { match: /^\/api\/pro\/notification-extras$/, owner: "pro-notification-extras.spec.ts" },
  { match: /^\/api\/pro\/promotions$/, owner: "pro-local-integration.spec.ts" },
  { match: /^\/api\/pro\/catalog-specs$/, owner: "pro-catalog-specs.spec.ts" },
  { match: /^\/api\/pro\/catalog-pricing$/, owner: "pro-catalog-pricing.spec.ts" },
  { match: /^\/api\/pro\/project-(?:extras|menu)$/, owner: "pro-project-extras.spec.ts" },
  { match: /^\/api\/pro\/work-invoices$/, owner: "pro-work-invoices.spec.ts" },
  { match: /^\/api\/pro\/expense-meta$/, owner: "pro-expense-meta.spec.ts" },
  { match: /^\/api\/pro\/catalog-kind$/, owner: "pro-catalog-kind.spec.ts" },
  { match: /^\/api\/pro\/purchase-order-tracking$/, owner: "pro-po-tracking.spec.ts" },
  { match: /^\/api\/pro\/(?:purchase-order-vendor-links|po-portal|purchase-order-tools)$/, owner: "pro-po-vendor-link.spec.ts" },
  { match: /^\/api\/pro\/purchase-order-print$/, owner: "pro-purchase-orders.spec.ts" },
  { match: /^\/api\/pro\/purchase-orders$/, owner: "pro-purchase-orders.spec.ts" },
  { match: /^\/api\/pro\/quote-change-requests$/, owner: "pro-quote-change-requests.spec.ts" },
  { match: /^\/api\/pro\/quote-choices$/, owner: "pro-client-english.spec.ts" },
  { match: /^\/api\/pro\/quote-create$/, owner: "pro-catalog-item-types.spec.ts" },
  { match: /^\/api\/pro\/quote-link$/, owner: "pro-catalog-item-types.spec.ts" },
  { match: /^\/api\/pro\/quotes$/, owner: "pro-quotes-unified.spec.ts" },
  { match: /^\/api\/pro\/request-followups$/, owner: "pro-request-followups.spec.ts" },
  { match: /^\/api\/pro\/request-pipeline$/, owner: "pro-lead-center-api.spec.ts" },
  { match: /^\/api\/pro\/request-quotes$/, owner: "pro-request-quote-journey.spec.ts" },
  { match: /^\/api\/pro\/reservations$/, owner: "pro-reservations.spec.ts" },
  { match: /^\/api\/pro\/schedule-templates$/, owner: "pro-schedule-templates-api.spec.ts" },
  { match: /^\/api\/pro\/selections$/, owner: "pro-selections.spec.ts" },
  { match: /^\/api\/pro\/(?:selection-boards|selection-board-templates|selection-tracker-views|selections-global)$/, owner: "pro-selection-boards.spec.ts" },
  { match: /^\/api\/pro\/marketing-lists$/, owner: "pro-email-lists.spec.ts" },
  { match: /^\/api\/pro\/saved-reports$/, owner: "pro-saved-reports.spec.ts" },
  { match: /^\/api\/pro\/meeting-types$/, owner: "pro-meeting-types.spec.ts" },
  { match: /^\/api\/pro\/service-packages$/, owner: "pro-service-packages-english.spec.ts" },
  { match: /^\/api\/pro\/social$/, owner: "pro-local-integration.spec.ts" },
  { match: /^\/api\/pro\/social-content$/, owner: "pro-social.spec.ts" },
  { match: /^\/api\/pro\/takeoffs$/, owner: "pro-takeoffs-pdf.spec.ts" },
  { match: /^\/api\/pro\/task-center$/, owner: "pro-task-center-actions.spec.ts" },
  { match: /^\/api\/pro\/task-templates$/, owner: "pro-task-templates-api.spec.ts" },
  { match: /^\/api\/pro\/team$/, owner: "pro-team.spec.ts" },
  { match: /^\/api\/pro\/team-task-discussion$/, owner: "pro-team-task-discussion-api.spec.ts" },
  { match: /^\/api\/pro\/team-task-mentions$/, owner: "pro-team-task-mentions-api.spec.ts" },
  { match: /^\/api\/pro\/time-tracking$/, owner: "pro-time-tracking.spec.ts" },
  { match: /^\/api\/pro\/visit-preparation$/, owner: "pro-visit-preparation-english.spec.ts" },
  { match: /^\/api\/pro\/work-billing$/, owner: "pro-round4b-billing.spec.ts" },
  { match: /^\/api\/pro\/work-budget$/, owner: "pro-purchase-orders.spec.ts" },
  // Row 54 (Ronda F1-B): company cost-code library, budget markup/VAT, forecast and the client summary.
  { match: /^\/api\/pro\/(?:cost-codes|work-budget-forecast)$/, owner: "pro-cost-codes.spec.ts" },
  { match: /^\/api\/pro\/work-budget-sync$/, owner: "pro-budget-sync.spec.ts" },
  // Ronda F2-B (row 05): customer custom fields and additional phones/e-mails.
  { match: /^\/api\/pro\/client-contacts\/fields$/, owner: "pro-sales-contact-fields.spec.ts" },
  // Ronda F2-B (row 35): one-click quote context from a lead.
  { match: /^\/api\/pro\/lead-quick-quote$/, owner: "pro-sales-contracts-quote.spec.ts" },
  { match: /^\/api\/pro\/lead-pipeline$/, owner: "pro-sales-pipeline.spec.ts" },
  { match: /^\/api\/pro\/lead-pipeline\/rules$/, owner: "pro-lead-stage-rules.spec.ts" },
  { match: /^\/api\/pro\/lead-pipeline\/close-dates$/, owner: "pro-lead-close-forecast.spec.ts" },
  { match: /^\/api\/pro\/work-email-log$/, owner: "pro-email-tools.spec.ts" },
  { match: /^\/api\/pro\/quote-acceptance$/, owner: "pro-quote-agreement.spec.ts" },
  { match: /^\/api\/pro\/quote-line-response$/, owner: "pro-quote-agreement.spec.ts" },
  { match: /^\/api\/pro\/client-contacts\/promote-channel$/, owner: "pro-contact-merge-transfer.spec.ts" },
  { match: /^\/api\/pro\/client-presentation(?:\/weather)?$/, owner: "pro-client-presentation.spec.ts" },
  { match: /^\/api\/pro\/work-file-comparisons$/, owner: "pro-before-after.spec.ts" },
  { match: /^\/api\/pro\/quote-proposals$/, owner: "pro-sales-proposal.spec.ts" },
  { match: /^\/api\/pro\/work-changes$/, owner: "pro-work-changes.spec.ts" },
  { match: /^\/api\/pro\/work-client-invitations$/, owner: "pro-round4a.spec.ts" },
  { match: /^\/api\/pro\/work-costs$/, owner: "pro-purchase-orders.spec.ts" },
  { match: /^\/api\/pro\/work-delivery$/, owner: "pro-client-english.spec.ts" },
  { match: /^\/api\/pro\/work-files$/, owner: "pro-work-files.spec.ts" },
  { match: /^\/api\/pro\/work-header$/, owner: "pro-round4a.spec.ts" },
  { match: /^\/api\/pro\/work-overview$/, owner: "pro-round4a.spec.ts" },
  { match: /^\/api\/pro\/work-activity$/, owner: "pro-work-activity.spec.ts" },
  { match: /^\/api\/pro\/reports$/, owner: "pro-round7b-suite.spec.ts" },
  // Round 7C: company roles, Daily Log (Bitácora), catalog item image/vendor, job messages.
  // Final verification 2026-11-14: the team-roles route is owned by the roles security regression.
  { match: /^\/api\/pro\/team-roles$/, owner: "pro-security-roles.spec.ts" },
  { match: /^\/api\/pro\/correos-prueba$/, owner: "pro-round7c-suite.spec.ts" },
  { match: /^\/api\/pro\/(?:work-journal|catalog-details|work-messages)$/, owner: "pro-round7c-suite.spec.ts" },
  // Round 8: job page column, overview layout, person timer, message attachments, file organizer, subcontractors.
  { match: /^\/api\/pro\/(?:work-sidebar|overview-layout|work-timers|work-message-files|work-file-organizer|subcontractors|sub-portal)$/, owner: "pro-round8-suite.spec.ts" },
  // Round 9: hours across jobs, notification center, company trash, branded documents, subcontractor comment files.
  { match: /^\/api\/pro\/(?:time-report|notifications|company-file-trash|document-branding|subcontractors\/files|sub-portal\/files)$/, owner: "pro-round9-features.spec.ts" },
  { match: /^\/api\/pro\/(?:client-contacts|lead-board|schedule-links|daily-log-autofill|task-templates-apply|selections-tracking|quote-print|work-changes-print|selections-print)$/, owner: "pro-round10-features.spec.ts" },
  { match: /^\/api\/pro\/(?:finance-reports|purchase-order-sources|selections-visibility)$/, owner: "pro-round11-features.spec.ts" },
  // Round F1-A (row 55): accounts payable, cash flow and income statement in Statistics › Reports.
  { match: /^\/api\/pro\/(?:payables|cash-flow|income-statement)$/, owner: "pro-payables-cashflow.spec.ts" },
  // Ronda F2-C (rows 13, 15, 17, 20, 22, 24): schedule from quote, saved task views, time clock, crew, channels, custom roles.
  { match: /^\/api\/pro\/(?:estimate-schedule|task-views|time-clock|daily-log-crew|notification-channels|team-roles\/custom)$/, owner: "pro-operations-schedule.spec.ts" },
  // Row 17 and 20 (404/405): module x action permissions; daily log weather provider and automatic drafts.
  { match: /^\/api\/pro\/team-roles\/modules$/, owner: "pro-module-permissions.spec.ts" },
  { match: /^\/api\/pro\/(?:daily-log-settings|daily-log-automation)$/, owner: "pro-daily-log-weather.spec.ts" },
  // Package B (rows 15, 16, 24): notification schedule/sandbox digest and task comments, mentions and job-file links.
  { match: /^\/api\/pro\/notification-schedule$/, owner: "pro-notification-schedule-api.spec.ts" },
  { match: /^\/api\/pro\/task-center-detail$/, owner: "pro-task-center-detail-api.spec.ts" },
  { match: /^\/api\/pro\/work-calendar$/, owner: "pro-work-calendar.spec.ts" },
  { match: /^\/api\/pro\/person-workdays$/, owner: "pro-person-workdays.spec.ts" },
  { match: /^\/api\/pro\/(?:client-project-overview|getting-started)$/, owner: "pro-round12-features.spec.ts" },
  // Round 13 (rows 68 and 74): portfolio publication and profile metrics; training progress and Pro support.
  { match: /^\/api\/pro\/company-portfolio$/, owner: "pro-round13-portfolio.spec.ts" },
  { match: /^\/api\/pro\/(?:company-training|company-support)$/, owner: "pro-round13-help-support.spec.ts" },
  // Fix 14 (local Pro): per-item customer approval of a shared quote version (row 39).
  { match: /^\/api\/pro\/quote-line-decisions$/, owner: "pro-fix14.spec.ts" },
  { match: /^\/api\/pro\/lead\-pipeline\/rules$/, owner: "pro-lead-stage-rules.spec.ts" },
  { match: /^\/api\/pro\/company\-email\-tools$/, owner: "pro-email-tools.spec.ts" },
  { match: /^\/api\/pro\/client\-presentation\/weather$/, owner: "pro-client-presentation.spec.ts" },
  { match: /^\/api\/pro\/client\-presentation$/, owner: "pro-client-presentation.spec.ts" },
  { match: /^\/api\/pro\/client\-contacts\/promote\-channel$/, owner: "pro-contact-merge-transfer.spec.ts" },
  { match: /^\/api\/pro\/quote-line-convert$/, owner: "pro-fix14.spec.ts" },
  { match: /^\/api\/pro\/work-punchlist$/, owner: "pro-project-schedule.spec.ts" },
  { match: /^\/api\/pro\/work-schedule$/, owner: "pro-private-daily-logs-access-api.spec.ts" },
  { match: /^\/api\/pro\/work-tasks$/, owner: "pro-work-tasks.spec.ts" },
  { match: /^\/api\/pro\/work-updates$/, owner: "pro-work-updates.spec.ts" },
  { match: /^\/api\/pro\/workspace$/, owner: "pro-workspace.spec.ts" },
  { match: /^\/api\/privacy(?:\/|$)/, owner: "legal-privacy.spec.ts" },
  { match: /^\/api\/admin\/analytics\/activity$/, owner: "admin-journey.spec.ts" },
  { match: /^\/api\/analytics\/journey$/, owner: "journey-browser.spec.ts" },
  { match: /^\/api\/analytics\/meta$/, owner: "meta-minimal.spec.ts" },
  { match: /^\/descargar$/, owner: "app-download.spec.ts" },
  { match: /^\/abrir-app$/, owner: "app-download.spec.ts" },
  { match: /^\/auth\/callback$/, owner: "product-contract.spec.ts" },
  { match: /^\/api\/admin(?:\/|$)/, owner: "admin-smoke.spec.ts" },
  { match: /^\/api\/moderation(?:\/|$)/, owner: "admin-moderation-runtime.spec.ts" },
  { match: /^\/api\/ai-assistant(?:\/|$)/, owner: "ai-assistant.spec.ts" },
  { match: /^\/api\/account(?:\/|$)/, owner: "account-lifecycle.spec.ts" },
  { match: /^\/api\/auth(?:\/|$)/, owner: "auth-support.spec.ts" },
  { match: /^\/api\/verification\/documents$/, owner: "product-contract.spec.ts" },
  { match: /^\/api\/dashboard\/activity$/, owner: "statistics-dashboard.spec.ts" },
  { match: /^\/api\/(?:projects|reviews|support|quotes)(?:\/|$)/, owner: "seeded-regression.spec.ts" },
  { match: /^\/api\/(?:jobs|offers)(?:\/|$)/, owner: "marketplace-lifecycle.spec.ts" },
  { match: /^\/api\/marketplace\/results$/, owner: "marketplace-paging-server.spec.ts" },
  { match: /^\/api\/direct-chat(?:\/|$)/, owner: "direct-chat.spec.ts", parked: true },
  { match: /^\/api\/(?:push|internal\/push)(?:\/|$)/, owner: "push-outbox-contract.spec.ts" },
  { match: /^\/api\/internal\/soporte(?:\/|$)/, owner: "soporte-cierre-automatico.spec.ts" },
  { match: /^\/api\/internal\/verificacion(?:\/|$)/, owner: "verificacion-repesca.spec.ts" },
  { match: /^\/api\/internal\/resena-google(?:\/|$)/, owner: "resena-google.spec.ts" },
  { match: /^\/api\/internal\/resumen-semanal(?:\/|$)/, owner: "resumen-semanal.spec.ts" },
  { match: /^\/api\/internal\/pro\/digest-tick$/, owner: "pro-digest-scheduler.spec.ts" },
  { match: /^\/api\/internal\/meta(?:\/|$)/, owner: "meta-growth-runtime.spec.ts" },
  { match: /^\/api\/internal\/email(?:\/|$)/, owner: "email-delivery.spec.ts" },
  { match: /^\/api\/internal\/campaigns(?:\/|$)/, owner: "lifecycle-email-policy.spec.ts" },
  { match: /^\/api\/trabajos\/reportar(?:\/|$)/, owner: "resumen-semanal.spec.ts" },
  { match: /^\/api\/block(?:\/|$)/, owner: "bloqueo-de-usuarios.spec.ts" },
  { match: /^\/api\/webhooks(?:\/|$)/, owner: "product-contract.spec.ts" },
  { match: /^\/api\/email(?:\/|$)/, owner: "product-contract.spec.ts" },
  { match: /^\/api\/(?:search|categories)(?:\/|$)/, owner: "api-smoke.spec.ts" },
  { match: /^\/api\/contact(?:\/|$)/, owner: "whatsapp-review-followup.spec.ts" },
  { match: /^\/api\/(?:upload|media)(?:\/|$)/, owner: "extended-lifecycle.spec.ts" },
  { match: /^\/api\/(?:register|cedula|cedula-available|add-cedula|verify-identity)(?:\/|$)/, owner: "product-contract.spec.ts" },
  { match: /^\/api\/(?:appeals|report|client\/connections)(?:\/|$)/, owner: "interaction-surfaces.spec.ts" },
  { match: /^\/api\/(?:check-availability|professionals|buscar)(?:\/|$)/, owner: "search-results.spec.ts" },
  { match: /^\/api\/professional-cv$/, owner: "professional-cv-runtime.spec.ts" },
  { match: /^\/api\/cv\/ai\/(?:adaptar|mejorar|carta)$/, owner: "cv-ia-runtime.spec.ts" },
  { match: /^\/\[locale\]\/profesionales\/\[slug\]\/cv$/, owner: "professional-cv-runtime.spec.ts" },
  { match: /^\/api\/analytics\/professional-ready$/, owner: "meta-growth-runtime.spec.ts" },
  { match: /^\/api\/(?:analytics|attribution|translate|client-error)(?:\/|$)/, owner: "product-contract.spec.ts" },
  { match: /^\/api\/health$/, owner: "health.spec.ts" },
];

function ownership(route: string, rules: OwnershipRule[]) {
  const rule = rules.find((candidate) => candidate.match.test(route));
  expect(rule, `${route} has no regression owner`).toBeTruthy();
  expect(existsSync(resolve(e2eRoot, rule!.owner)), `${route} points to missing ${rule!.owner}`).toBe(true);
  return rule!;
}

test.describe("application surface ownership", () => {
  test("every page route is owned by an active or explicitly parked regression surface", () => {
    const routes = filesNamed(appRoot, "page.tsx").map((file) => appRoute(file, "page.tsx")).sort();
    expect(routes.length).toBeGreaterThan(0);
    const parked = routes.filter((route) => ownership(route, pageRules).parked);
    expect(parked).toEqual(["/[locale]/mensajes"]);
  });

  test("every route handler has a regression owner", () => {
    const routes = filesNamed(appRoot, "route.ts").map((file) => appRoute(file, "route.ts")).sort();
    expect(routes.length).toBeGreaterThan(0);
    const parked = routes.filter((route) => ownership(route, handlerRules).parked);
    expect(parked).toEqual(["/api/direct-chat", "/api/direct-chat/attachments", "/api/direct-chat/mensaje"]);
  });

  test("the default web suite only excludes temporary drafts, parked chat, the app-only shell and the local Pro suite", () => {
    const config = resolve(process.cwd(), "playwright.config.ts");
    expect(existsSync(config)).toBe(true);
    const source = readFileSync(config, "utf8");
    // Solo borradores temporales, el chat aparcado y el armazón nativo, que no es
    // web —vive en `playwright.mobile.config.ts` y ahí sí se corre—. Cualquier
    // otra suite que alguien saque de la corrida web tiene que doler aquí.
    // pro-*.spec.ts necesitan Pro y el directorio encendidos: corren en
    // playwright.pro-local.config.ts (pro-local-regression.yml).
    expect(source).toMatch(/testIgnore:\s*\["\*\*\/\.tmp-\*\.spec\.ts", "\*\*\/direct-chat\.spec\.ts", "\*\*\/mobile-native-shell\.spec\.ts", "\*\*\/pro-\*\.spec\.ts"\]/);
    const ignoreBlock = source.match(/\btestIgnore:\s*\[([^\]]*)\]/)?.[1] ?? "";
    expect(ignoreBlock.match(/"[^"\n]+"/g)).toEqual(['"**/.tmp-*.spec.ts"', '"**/direct-chat.spec.ts"', '"**/mobile-native-shell.spec.ts"', '"**/pro-*.spec.ts"']);
    const mobileConfig = readFileSync(resolve(process.cwd(), "playwright.mobile.config.ts"), "utf8");
    for (const suite of ["direct-chat.spec.ts", "mobile-native-shell.spec.ts"]) {
      expect(mobileConfig, `${suite} must still run somewhere`).toContain(suite);
    }
    const proConfig = readFileSync(resolve(process.cwd(), "playwright.pro-local.config.ts"), "utf8");
    expect(proConfig, "pro-*.spec.ts must still run somewhere").toMatch(/testMatch:[^\n]*pro-/);
  });

  test("the CI ownership script and this contract share the same rules", () => {
    const literales = (source: string, lista: string) => {
      const inicio = source.indexOf(lista);
      const bloque = source.slice(inicio, source.indexOf("];", inicio));
      return [...bloque.matchAll(/\/\^[^\n]*?\/(?=[,\s])/g)].map((match) => match[0]).sort();
    };
    const contrato = readFileSync(resolve(process.cwd(), "tests/e2e/app-surface-ownership.spec.ts"), "utf8");
    const script = readFileSync(resolve(process.cwd(), "scripts/ci/verify-app-surface-ownership.mjs"), "utf8");
    for (const lista of ["const pageRules", "const handlerRules"]) {
      expect(literales(contrato, lista), `${lista} drifted between the contract and the CI script`).toEqual(literales(script, lista));
    }
  });

  test("GitHub result verification rejects retries and skips", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "contratacr-playwright-report-"));
    const reportPath = resolve(directory, "results.json");
    try {
      writeFileSync(reportPath, JSON.stringify({
        suites: [{
          title: "contracts",
          specs: [{
            title: "matrix",
            tests: [
              { projectName: "desktop", expectedStatus: "passed", results: [{ status: "passed" }] },
              { projectName: "mobile", expectedStatus: "passed", results: [{ status: "failed" }, { status: "passed" }] },
              { projectName: "parked", expectedStatus: "skipped", results: [{ status: "skipped" }] },
            ],
          }],
        }],
      }));
      const result = spawnSync(process.execPath, [resolve(process.cwd(), "scripts/ci/verify-playwright-results.mjs")], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, PLAYWRIGHT_JSON_REPORT: reportPath },
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("flaky:");
      expect(result.stderr).toContain("skipped:");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
