import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = process.cwd();
const appRoot = resolve(root, "src/app");
const e2eRoot = resolve(root, "tests/e2e");

const pageRules = [
  [/^\/\[locale\]\/continuar-perfil$/, "profile-reminder.spec.ts"],
  // Multivertical directory (local Pro, M1): staff queue of the directory inside the admin area.
  [/^\/\[locale\]\/admin\/directorio$/, "pro-dir-admin.spec.ts"],
  [/^\/\[locale\]\/admin(?:\/|$)/, "admin-smoke.spec.ts"],
  // Round 8 (local Pro): job page deep link and the subcontractor portal.
  [/^\/\[locale\]\/dashboard\/(?:pro\/trabajo\/|subcontratista$)/, "pro-round8-suite.spec.ts"],
  // Fix 14 (local Pro): the linked customer's «Mi proyecto» page (deep link, Back, access only for that customer).
  [/^\/\[locale\]\/dashboard\/mi-proyecto\//, "pro-fix14.spec.ts"],
  // Multivertical directory (local Pro): Pro inventory of vehicle/property listings and the restaurant menu editor.
  [/^\/\[locale\]\/dashboard\/pro\/inventario(?:\/|$)/, "pro-dir-listings.spec.ts"],
  [/^\/\[locale\]\/dashboard\/pro\/menu$/, "pro-dir-menu.spec.ts"],
  // Place features round (2026-11-17): owner bookings screen and the place tools (events, «Pedir», brand info).
  [/^\/\[locale\]\/dashboard\/pro\/reservas-mesa$/, "pro-dir-reservations.spec.ts"],
  [/^\/\[locale\]\/dashboard\/pro\/lugar$/, "pro-dir-events.spec.ts"],
  [/^\/\[locale\]\/dashboard(?:\/|$)/, "dashboard-surfaces.spec.ts"],
  // The editors (publish, edit, owner managers) are exercised through their real screens.
  [/^\/\[locale\]\/(?:empleos|promociones)\/(?:publicar|\[id\]\/editar|mis-empleos|mis-promociones)$/, "marketplace-editors.spec.ts"],
  [/^\/\[locale\]\/(?:empleos|promociones)(?:\/|$)/, "marketplace-lifecycle.spec.ts"],
  [/^\/\[locale\]\/profesionales(?:\/|$)/, "professional-profile.spec.ts"],
  [/^\/\[locale\]\/notificaciones$/, "notifications-guides-regression.spec.ts"],
  [/^\/\[locale\]\/mensajes$/, "direct-chat.spec.ts", true],
  // Role choice, onboarding hand-off, profile completion and the recovery link are driven on the real pages.
  [/^\/\[locale\]\/(?:registro|reset-password|onboarding|completar-perfil)$/, "auth-screens.spec.ts"],
  [/^\/\[locale\]\/(?:login|registro|olvide-contrasena|reset-password|onboarding|completar-perfil)(?:\/|$)/, "auth-support.spec.ts"],
  [/^\/\[locale\]\/eliminar-cuenta$/, "account-lifecycle.spec.ts"],
  // Round 6D (local Pro): professional website and campaign unsubscribe page.
  [/^\/\[locale\]\/sitio(?:\/|$)/, "pro-round6d-site.spec.ts"],
  [/^\/\[locale\]\/baja-pro$/, "pro-round6d-marketing.spec.ts"],
  // Rows 51-53 (local Pro): public vendor page of a purchase order link (no ContrataCR account).
  [/^\/\[locale\]\/orden-proveedor$/, "pro-po-vendor-link.spec.ts"],
  // Post-security fixes: confirmation page of the site-form subscription (double opt-in).
  [/^\/\[locale\]\/confirmar-pro$/, "pro-round6d-site.spec.ts"],
  // Multivertical directory (local Pro): place page + public menu, sections with search, listings, how we rank (F0).
  [/^\/\[locale\]\/lugar\/\[slug\]\/menu$/, "pro-dir-menu.spec.ts"],
  [/^\/\[locale\]\/lugar(?:\/|$)/, "pro-dir-places.spec.ts"],
  // Place features round (2026-11-17): public events, brand pages, saved lists (mine + shared link).
  [/^\/\[locale\]\/eventos$/, "pro-dir-events.spec.ts"],
  [/^\/\[locale\]\/marca\/\[slug\]$/, "pro-dir-brands.spec.ts"],
  [/^\/\[locale\]\/(?:listas|lista\/\[token\])$/, "pro-dir-lists.spec.ts"],
  // Pending fixes round (2026-11-17): the customer's private reservation link and «Mis reservas».
  [/^\/\[locale\]\/(?:reserva\/\[token\]|mis-reservas)$/, "pro-dir-reservations.spec.ts"],
  [/^\/\[locale\]\/(?:restaurantes|farmacias|supermercados|gasolineras|como-ordenamos)$/, "pro-dir-search.spec.ts"],
  // Sections approved on 2026-11-17 (cafés split out of restaurants, corner stores, hardware, lodging, health, vets,
  // car services, beauty, gyms, tours, banks): listing, kind filter, policy notes and price limits per section.
  [/^\/\[locale\]\/(?:cafes|pulperias|ferreterias|hospedaje|salud|veterinarias|talleres|belleza|gimnasios|tours|bancos)$/, "pro-dir-verticals.spec.ts"],
  // P3: price comparison (supermarkets and OTC pharmacy products), /precios and /en/precios.
  [/^\/\[locale\]\/precios$/, "pro-dir-prices-compare.spec.ts"],
  // IA 2026-11-21: the "Lugares" hub and the "Para negocios y profesionales" entry page.
  [/^\/\[locale\]\/(?:lugares|negocios-y-profesionales)$/, "pro-dir-hubs.spec.ts"],
  [/^\/\[locale\]\/(?:vehiculos|inmuebles)(?:\/|$)/, "pro-dir-listings.spec.ts"],
  [/^\/\[locale\](?:\/|$)/, "public-smoke.spec.ts"],
  [/^\/$/, "public-smoke.spec.ts"],
];

const handlerRules = [
  // Multivertical directory (local Pro): search/facets, place report, claims (mock OTP), contacts and reviews,
  // listing inventory and photos, restaurant menu.
  // Owner/user place photos (upload, moderation and private serving) and "Mi negocio" without Pro (/api/negocio/*).
  [/^\/api\/(?:fotos-lugar\/\[id\]|lugar\/\[slug\]\/fotos)$/, "pro-dir-photos.spec.ts"],
  [/^\/api\/negocio(?:\/(?:lugar|menu|perfil|reservas|respuestas))?$/, "pro-dir-business-tools.spec.ts"],
  [/^\/api\/directorio\/(?:search|facets)$/, "pro-dir-search.spec.ts"],
  // M1: staff queue (+ private claim documents), claim documents upload, user price reports, review flags, owner replies.
  [/^\/api\/admin\/directorio(?:\/documento)?$/, "pro-dir-admin.spec.ts"],
  [/^\/api\/lugar\/\[slug\]\/reclamo\/documentos$/, "pro-dir-admin.spec.ts"],
  [/^\/api\/lugar\/\[slug\]\/precios\/reporte$/, "pro-dir-prices-report.spec.ts"],
  [/^\/api\/lugar\/\[slug\]\/resenas\/reporte$/, "pro-dir-replies.spec.ts"],
  [/^\/api\/pro\/review-replies$/, "pro-dir-replies.spec.ts"],
  [/^\/api\/lugar\/\[slug\]\/reporte$/, "pro-dir-places.spec.ts"],
  [/^\/api\/lugar\/\[slug\]\/(?:reclamo|contacto|resenas)$/, "pro-dir-claims-reviews.spec.ts"],
  [/^\/api\/reclamos\/\[id\]\/(?:codigo|verificar|buzon-prueba)$/, "pro-dir-claims-reviews.spec.ts"],
  [/^\/api\/pro\/(?:dir-listings|dir-listing-photos)$/, "pro-dir-listings.spec.ts"],
  [/^\/api\/pro\/menu$/, "pro-dir-menu.spec.ts"],
  // Place features round (2026-11-17): reservations/waitlist, Q&A, saved lists, events + «Pedir», brands.
  [/^\/api\/lugar\/\[slug\]\/reservas$/, "pro-dir-reservations.spec.ts"],
  [/^\/api\/pro\/table-reservations$/, "pro-dir-reservations.spec.ts"],
  [/^\/api\/reservas\/\[token\]$/, "pro-dir-reservations.spec.ts"],
  // Pending fixes round (2026-11-17): directory entries of the Pro hub («Reservas de mesa», «Menú», «Mi lugar»).
  [/^\/api\/pro\/place-hub$/, "pro-dir-hub.spec.ts"],
  [/^\/api\/pro\/editions$/, "pro-gaps-editions-team.spec.ts"],
  [/^\/api\/lugar\/\[slug\]\/preguntas$/, "pro-dir-questions.spec.ts"],
  [/^\/api\/listas$/, "pro-dir-lists.spec.ts"],
  [/^\/api\/pro\/place-events$/, "pro-dir-events.spec.ts"],
  [/^\/api\/pro\/brand-info$/, "pro-dir-brands.spec.ts"],
  [/^\/api\/marca\/\[slug\]\/reclamo(?:\/documentos)?$/, "pro-dir-brands.spec.ts"],
  // Local Pro suite (Rounds 1–6C): one exact owner per route handler; each spec drives that route.
  [/^\/api\/pro\/access$/, "pro-access-loading.spec.ts"],
  // Round 6C: AI assistant (drafts, plan reading, expense capture) and meeting recordings.
  [/^\/api\/pro\/ai$/, "pro-round6c-ai.spec.ts"],
  [/^\/api\/pro\/ai-meetings$/, "pro-round6c-meetings.spec.ts"],
  // Round 6D: website builder (owner + public), email campaigns (+ public unsubscribe), tracking, clipper, floor plans.
  [/^\/api\/pro\/site$/, "pro-round6d-site.spec.ts"],
  [/^\/api\/pro\/site-public$/, "pro-round6d-site.spec.ts"],
  [/^\/api\/pro\/marketing$/, "pro-round6d-marketing.spec.ts"],
  [/^\/api\/pro\/marketing-unsubscribe$/, "pro-round6d-marketing.spec.ts"],
  // Post-security fixes: RFC 8058 one-click unsubscribe and the double opt-in confirmation.
  [/^\/api\/pro\/marketing-unsubscribe\/one-click$/, "pro-round6d-marketing.spec.ts"],
  [/^\/api\/pro\/marketing-confirm$/, "pro-round6d-site.spec.ts"],
  [/^\/api\/pro\/ads-tracking$/, "pro-round6d-site.spec.ts"],
  // Pro 29 (rows 69, 70): sandbox ad builder with simulated metrics; custom domain with mock DNS verification.
  [/^\/api\/pro\/(?:company-ad-builder|company-site-domain)$/, "pro-round13-ads-domain.spec.ts"],
  [/^\/api\/pro\/catalog-clipper$/, "pro-round6d-clipper-plans.spec.ts"],
  [/^\/api\/pro\/mood-board-templates$/, "pro-board-templates.spec.ts"],
  [/^\/api\/pro\/floor-plans$/, "pro-round6d-clipper-plans.spec.ts"],
  [/^\/api\/pro\/floor-object-library$/, "pro-floor-library.spec.ts"],
  [/^\/api\/pro\/ai-takeoff-review$/, "pro-takeoffs.spec.ts"],
  [/^\/api\/pro\/accounting$/, "pro-round6b-accounting.spec.ts"],
  [/^\/api\/pro\/accounting-export$/, "pro-round6b-accounting.spec.ts"],
  [/^\/api\/pro\/agenda$/, "pro-agenda-operations.spec.ts"],
  [/^\/api\/pro\/allowances$/, "pro-allowances.spec.ts"],
  [/^\/api\/pro\/allowances-print$/, "pro-allowances.spec.ts"],
  [/^\/api\/pro\/allowance-surcharge$/, "pro-allowance-surcharge.spec.ts"],
  [/^\/api\/pro\/work-profitability$/, "pro-work-profitability.spec.ts"],
  [/^\/api\/pro\/app-manifest$/, "pro-web-app.spec.ts"],
  [/^\/api\/pro\/appointment-list$/, "pro-appointment-inbox.spec.ts"],
  [/^\/api\/pro\/appointment-preferences$/, "pro-appointment-requests.spec.ts"],
  [/^\/api\/pro\/appointment-quote-context$/, "pro-lead-commercial-progress-api.spec.ts"],
  [/^\/api\/pro\/appointment-reminders$/, "pro-appointment-reminders.spec.ts"],
  [/^\/api\/pro\/appointment-requests$/, "pro-appointment-inbox.spec.ts"],
  [/^\/api\/pro\/appointment-reschedule$/, "pro-appointment-reschedule.spec.ts"],
  [/^\/api\/pro\/appointment-schedule$/, "pro-appointment-schedule.spec.ts"],
  [/^\/api\/pro\/bid-portal\/files$/, "pro-round4b-portal.spec.ts"],
  [/^\/api\/pro\/bid-portal\/questions$/, "pro-bid-questions.spec.ts"],
  [/^\/api\/pro\/bid-portal$/, "pro-bid-portal.spec.ts"],
  [/^\/api\/pro\/bid-portal-links$/, "pro-bid-portal.spec.ts"],
  [/^\/api\/pro\/bids$/, "pro-bids.spec.ts"],
  [/^\/api\/pro\/catalog$/, "pro-catalog-storage.spec.ts"],
  [/^\/api\/pro\/catalog-organizations$/, "pro-catalog-organizations.spec.ts"],
  [/^\/api\/pro\/client-balance$/, "pro-round4a.spec.ts"],
  [/^\/api\/pro\/client-dashboard$/, "pro-client-dashboard.spec.ts"],
  [/^\/api\/pro\/client-finances$/, "pro-round4a.spec.ts"],
  [/^\/api\/pro\/client-fiscal$/, "pro-client-fiscal.spec.ts"],
  [/^\/api\/pro\/client-operations$/, "pro-client-operations.spec.ts"],
  [/^\/api\/pro\/client-pending$/, "pro-client-pending-requests.spec.ts"],
  [/^\/api\/pro\/client-statement$/, "pro-client-statement.spec.ts"],
  [/^\/api\/pro\/client-statement-print$/, "pro-round4a.spec.ts"],
  [/^\/api\/pro\/company-daily-log-files$/, "pro-company-daily-log-files-api.spec.ts"],
  [/^\/api\/pro\/company-file-versions$/, "pro-company-file-versions.spec.ts"],
  [/^\/api\/pro\/(?:company-file-bulk|work-file-bulk|file-purge)$/, "pro-file-bulk.spec.ts"],
  [/^\/api\/pro\/file-annotations$/, "pro-file-annotations.spec.ts"],
  [/^\/api\/pro\/company-folder-access$/, "pro-company-folder-access.spec.ts"],
  [/^\/api\/pro\/file-import$/, "pro-file-import.spec.ts"],
  [/^\/api\/pro\/file-convert$/, "pro-file-formats-preview.spec.ts"],
  [/^\/api\/pro\/company-file-tags$/, "pro-files-library.spec.ts"],
  [/^\/api\/pro\/company-files$/, "pro-company-files.spec.ts"],
  [/^\/api\/pro\/company-vendors$/, "pro-bid-portal.spec.ts"],
  [/^\/api\/pro\/connectors$/, "pro-round6b-connectors.spec.ts"],
  [/^\/api\/pro\/company-(?:automation|meetings)$/, "pro-round13-webhooks-meetings.spec.ts"],
  [/^\/api\/pro\/contract-print$/, "pro-contracts.spec.ts"],
  [/^\/api\/pro\/contracts$/, "pro-contracts.spec.ts"],
  [/^\/api\/pro\/(?:credits-retainers|credit-ledger)$/, "pro-credits-retainers.spec.ts"],
  [/^\/api\/pro\/daily-log-discussion$/, "pro-daily-log-discussion-api.spec.ts"],
  [/^\/api\/pro\/daily-log-duplicate$/, "pro-daily-log-duplicate-api.spec.ts"],
  [/^\/api\/pro\/daily-log-file-reconciliation$/, "pro-company-daily-log-files-api.spec.ts"],
  [/^\/api\/pro\/daily-log-files$/, "pro-company-daily-log-files-api.spec.ts"],
  [/^\/api\/pro\/daily-logs$/, "pro-daily-logs.spec.ts"],
  [/^\/api\/pro\/discount-presets$/, "pro-discount-presets.spec.ts"],
  [/^\/api\/pro\/einvoice$/, "pro-round6a-integrations.spec.ts"],
  [/^\/api\/pro\/einvoice-file$/, "pro-round6a-integrations.spec.ts"],
  [/^\/api\/pro\/invoice-einvoice$/, "pro-einvoice.spec.ts"],
  [/^\/api\/pro\/esign\/mock-sign$/, "pro-round6b-esign.spec.ts"],
  [/^\/api\/pro\/esign$/, "pro-round6b-esign.spec.ts"],
  [/^\/api\/pro\/esign-file$/, "pro-round6b-esign.spec.ts"],
  [/^\/api\/pro\/expense-receipts$/, "pro-round4b-billing.spec.ts"],
  [/^\/api\/pro\/expenses$/, "pro-expenses-english.spec.ts"],
  [/^\/api\/pro\/file-versions$/, "pro-file-versions.spec.ts"],
  // Row 30 (Ronda F2): @mentions of the job team in file comments and the member inbox.
  [/^\/api\/pro\/file-mentions$/, "pro-file-mentions.spec.ts"],
  [/^\/api\/pro\/identity-lookup$/, "pro-client-fiscal.spec.ts"],
  [/^\/api\/pro\/integrations$/, "pro-round6a-integrations.spec.ts"],
  [/^\/api\/pro\/integrations\/webhooks\/esign$/, "pro-round6b-esign.spec.ts"],
  [/^\/api\/pro\/integrations\/webhooks\/tilopay$/, "pro-round6a-integrations.spec.ts"],
  [/^\/api\/pro\/invoice-document-settings$/, "pro-catalog-item-types.spec.ts"],
  [/^\/api\/pro\/invoice-drafts$/, "pro-invoice-drafts.spec.ts"],
  [/^\/api\/pro\/invoice-delivery$/, "pro-invoice-delivery.spec.ts"],
  [/^\/api\/pro\/invoice-issuer$/, "pro-issuer-settings.spec.ts"],
  [/^\/api\/pro\/invoice-management$/, "pro-invoice-management.spec.ts"],
  [/^\/api\/pro\/invoice-payments$/, "pro-invoice-payments.spec.ts"],
  [/^\/api\/pro\/invoice-print$/, "pro-invoice-management.spec.ts"],
  [/^\/api\/pro\/invoice-recurrence$/, "pro-invoice-recurrence.spec.ts"],
  [/^\/api\/pro\/lead-center$/, "pro-lead-center-api.spec.ts"],
  [/^\/api\/pro\/lead-commercial-progress$/, "pro-lead-commercial-progress-api.spec.ts"],
  [/^\/api\/pro\/lead-followups$/, "pro-lead-followups-api.spec.ts"],
  [/^\/api\/pro\/lead-inboxes$/, "pro-company.spec.ts"],
  [/^\/api\/pro\/lead-origin-create$/, "pro-lead-origin-create-api.spec.ts"],
  [/^\/api\/pro\/lead-origins$/, "pro-lead-origins-api.spec.ts"],
  [/^\/api\/pro\/lead-private-core$/, "pro-lead-center.spec.ts"],
  [/^\/api\/pro\/lead-private-quotes$/, "pro-lead-private-quotes-api.spec.ts"],
  [/^\/api\/pro\/lead-private-stages$/, "pro-private-stages-api.spec.ts"],
  [/^\/api\/pro\/lead-private-work$/, "pro-lead-commercial-progress-api.spec.ts"],
  [/^\/api\/pro\/lead-plans$/, "pro-lead-plan-templates.spec.ts"],
  [/^\/api\/pro\/manual-lead-quotes$/, "pro-manual-lead-quotes-api.spec.ts"],
  [/^\/api\/pro\/manual-lead-work$/, "pro-manual-lead-work-api.spec.ts"],
  [/^\/api\/pro\/mood-boards$/, "pro-mood-boards.spec.ts"],
  [/^\/api\/pro\/oauth\/callback$/, "pro-round6b-connectors.spec.ts"],
  [/^\/api\/pro\/oauth\/mock-authorize$/, "pro-round6b-connectors.spec.ts"],
  [/^\/api\/pro\/pay$/, "pro-round6a-integrations.spec.ts"],
  [/^\/api\/pro\/payment-links$/, "pro-round6a-integrations.spec.ts"],
  [/^\/api\/pro\/payment-metadata$/, "pro-payment-metadata-english.spec.ts"],
  [/^\/api\/pro\/payment-overview$/, "pro-payment-overview.spec.ts"],
  [/^\/api\/pro\/payment-plan(?:-reminders)?$/, "pro-round5-payment-plan.spec.ts"],
  [/^\/api\/pro\/payment-plan-print$/, "pro-round5-payment-plan.spec.ts"],
  [/^\/api\/pro\/payment-receipt-print$/, "pro-payment-receipts.spec.ts"],
  [/^\/api\/pro\/payment-receipts$/, "pro-payment-receipts.spec.ts"],
  [/^\/api\/pro\/private-estimate-destination-copy$/, "pro-private-estimate-destination-copy-journey.spec.ts"],
  [/^\/api\/pro\/private-estimate-publication-copy$/, "pro-private-estimate-publication-copy-journey.spec.ts"],
  [/^\/api\/pro\/private-estimate-publications$/, "pro-private-estimate-publications-api.spec.ts"],
  [/^\/api\/pro\/private-estimate-work$/, "pro-invoice-drafts.spec.ts"],
  [/^\/api\/pro\/private-estimates$/, "pro-private-estimate-destination-copy-api.spec.ts"],
  [/^\/api\/pro\/project-details$/, "pro-phase2-qa-fixes.spec.ts"],
  [/^\/api\/pro\/project-invitation$/, "pro-round4a.spec.ts"],
  [/^\/api\/pro\/project-notes$/, "pro-project-notes-details.spec.ts"],
  [/^\/api\/pro\/project-planning$/, "pro-project-planning.spec.ts"],
  [/^\/api\/pro\/project-quote-context$/, "pro-project-journey.spec.ts"],
  [/^\/api\/pro\/project-schedule$/, "pro-project-schedule.spec.ts"],
  [/^\/api\/pro\/projects$/, "pro-projects.spec.ts"],
  [/^\/api\/pro\/promotions$/, "pro-local-integration.spec.ts"],
  [/^\/api\/pro\/catalog-specs$/, "pro-catalog-specs.spec.ts"],
  [/^\/api\/pro\/purchase-order-tracking$/, "pro-po-tracking.spec.ts"],
  [/^\/api\/pro\/(?:purchase-order-vendor-links|po-portal|purchase-order-tools)$/, "pro-po-vendor-link.spec.ts"],
  [/^\/api\/pro\/purchase-order-print$/, "pro-purchase-orders.spec.ts"],
  [/^\/api\/pro\/purchase-orders$/, "pro-purchase-orders.spec.ts"],
  [/^\/api\/pro\/quote-change-requests$/, "pro-quote-change-requests.spec.ts"],
  [/^\/api\/pro\/quote-choices$/, "pro-client-english.spec.ts"],
  [/^\/api\/pro\/quote-create$/, "pro-catalog-item-types.spec.ts"],
  [/^\/api\/pro\/quote-link$/, "pro-catalog-item-types.spec.ts"],
  [/^\/api\/pro\/quotes$/, "pro-quotes-unified.spec.ts"],
  [/^\/api\/pro\/request-followups$/, "pro-request-followups.spec.ts"],
  [/^\/api\/pro\/request-pipeline$/, "pro-lead-center-api.spec.ts"],
  [/^\/api\/pro\/request-quotes$/, "pro-request-quote-journey.spec.ts"],
  [/^\/api\/pro\/reservations$/, "pro-reservations.spec.ts"],
  [/^\/api\/pro\/schedule-templates$/, "pro-schedule-templates-api.spec.ts"],
  [/^\/api\/pro\/selections$/, "pro-selections.spec.ts"],
  [/^\/api\/pro\/service-packages$/, "pro-service-packages-english.spec.ts"],
  [/^\/api\/pro\/social$/, "pro-local-integration.spec.ts"],
  [/^\/api\/pro\/social-content$/, "pro-social.spec.ts"],
  [/^\/api\/pro\/takeoffs$/, "pro-takeoffs-pdf.spec.ts"],
  [/^\/api\/pro\/task-center$/, "pro-task-center-actions.spec.ts"],
  [/^\/api\/pro\/task-templates$/, "pro-task-templates-api.spec.ts"],
  [/^\/api\/pro\/team$/, "pro-team.spec.ts"],
  [/^\/api\/pro\/team-task-discussion$/, "pro-team-task-discussion-api.spec.ts"],
  [/^\/api\/pro\/team-task-mentions$/, "pro-team-task-mentions-api.spec.ts"],
  [/^\/api\/pro\/time-tracking$/, "pro-time-tracking.spec.ts"],
  [/^\/api\/pro\/visit-preparation$/, "pro-visit-preparation-english.spec.ts"],
  [/^\/api\/pro\/work-billing$/, "pro-round4b-billing.spec.ts"],
  [/^\/api\/pro\/work-budget$/, "pro-purchase-orders.spec.ts"],
  // Row 54 (Ronda F1-B): company cost-code library, budget markup/VAT, forecast and the client summary.
  [/^\/api\/pro\/(?:cost-codes|work-budget-forecast)$/, "pro-cost-codes.spec.ts"],
  [/^\/api\/pro\/work-budget-sync$/, "pro-budget-sync.spec.ts"],
  // Ronda F2-B (row 05): customer custom fields and additional phones/e-mails.
  [/^\/api\/pro\/client-contacts\/fields$/, "pro-sales-contact-fields.spec.ts"],
  // Ronda F2-B (row 35): one-click quote context from a lead.
  [/^\/api\/pro\/lead-quick-quote$/, "pro-sales-contracts-quote.spec.ts"],
  [/^\/api\/pro\/lead-pipeline$/, "pro-sales-pipeline.spec.ts"],
  [/^\/api\/pro\/lead-pipeline\/rules$/, "pro-lead-stage-rules.spec.ts"],
  [/^\/api\/pro\/lead-pipeline\/close-dates$/, "pro-lead-close-forecast.spec.ts"],
  [/^\/api\/pro\/work-email-log$/, "pro-email-tools.spec.ts"],
  [/^\/api\/pro\/quote-acceptance$/, "pro-quote-agreement.spec.ts"],
  [/^\/api\/pro\/quote-line-response$/, "pro-quote-agreement.spec.ts"],
  [/^\/api\/pro\/client-contacts\/promote-channel$/, "pro-contact-merge-transfer.spec.ts"],
  [/^\/api\/pro\/client-presentation(?:\/weather)?$/, "pro-client-presentation.spec.ts"],
  [/^\/api\/pro\/work-file-comparisons$/, "pro-before-after.spec.ts"],
  [/^\/api\/pro\/quote-proposals$/, "pro-sales-proposal.spec.ts"],
  [/^\/api\/pro\/work-changes$/, "pro-work-changes.spec.ts"],
  [/^\/api\/pro\/work-client-invitations$/, "pro-round4a.spec.ts"],
  [/^\/api\/pro\/work-costs$/, "pro-purchase-orders.spec.ts"],
  [/^\/api\/pro\/work-delivery$/, "pro-client-english.spec.ts"],
  [/^\/api\/pro\/work-files$/, "pro-work-files.spec.ts"],
  [/^\/api\/pro\/work-header$/, "pro-round4a.spec.ts"],
  [/^\/api\/pro\/work-overview$/, "pro-round4a.spec.ts"],
  [/^\/api\/pro\/work-activity$/, "pro-work-activity.spec.ts"],
  [/^\/api\/pro\/reports$/, "pro-round7b-suite.spec.ts"],
  // Round 7C: company roles, Daily Log (Bitácora), catalog item image/vendor, job messages.
  // Final verification 2026-11-14: the team-roles route is owned by the roles security regression.
  [/^\/api\/pro\/team-roles$/, "pro-security-roles.spec.ts"],
  [/^\/api\/pro\/correos-prueba$/, "pro-round7c-suite.spec.ts"],
  [/^\/api\/pro\/(?:work-journal|catalog-details|work-messages)$/, "pro-round7c-suite.spec.ts"],
  // Round 8: job page column, overview layout, person timer, message attachments, file organizer, subcontractors.
  [/^\/api\/pro\/(?:work-sidebar|overview-layout|work-timers|work-message-files|work-file-organizer|subcontractors|sub-portal)$/, "pro-round8-suite.spec.ts"],
  // Round 9: hours across jobs, notification center, company trash, branded documents, subcontractor comment files.
  [/^\/api\/pro\/(?:time-report|notifications|company-file-trash|document-branding|subcontractors\/files|sub-portal\/files)$/, "pro-round9-features.spec.ts"],
  [/^\/api\/pro\/(?:client-contacts|lead-board|schedule-links|daily-log-autofill|task-templates-apply|selections-tracking|quote-print|work-changes-print|selections-print)$/, "pro-round10-features.spec.ts"],
  [/^\/api\/pro\/(?:finance-reports|purchase-order-sources|selections-visibility)$/, "pro-round11-features.spec.ts"],
  // Round F1-A (row 55): accounts payable, cash flow and income statement in Statistics › Reports.
  [/^\/api\/pro\/(?:payables|cash-flow|income-statement)$/, "pro-payables-cashflow.spec.ts"],
  // Ronda F2-C (rows 13, 15, 17, 20, 22, 24): schedule from quote, saved task views, time clock, crew, channels, custom roles.
  [/^\/api\/pro\/(?:estimate-schedule|task-views|time-clock|daily-log-crew|notification-channels|team-roles\/custom)$/, "pro-operations-schedule.spec.ts"],
  // Row 17 and 20 (404/405): module x action permissions; daily log weather provider and automatic drafts.
  [/^\/api\/pro\/team-roles\/modules$/, "pro-module-permissions.spec.ts"],
  [/^\/api\/pro\/(?:daily-log-settings|daily-log-automation)$/, "pro-daily-log-weather.spec.ts"],
  // Package B (rows 15, 16, 24): notification schedule/sandbox digest and task comments, mentions and job-file links.
  [/^\/api\/pro\/notification-schedule$/, "pro-notification-schedule-api.spec.ts"],
  [/^\/api\/pro\/task-center-detail$/, "pro-task-center-detail-api.spec.ts"],
  [/^\/api\/pro\/work-calendar$/, "pro-work-calendar.spec.ts"],
  [/^\/api\/pro\/person-workdays$/, "pro-person-workdays.spec.ts"],
  [/^\/api\/pro\/(?:client-project-overview|getting-started)$/, "pro-round12-features.spec.ts"],
  // Round 13 (rows 68 and 74): portfolio publication and profile metrics; training progress and Pro support.
  [/^\/api\/pro\/company-portfolio$/, "pro-round13-portfolio.spec.ts"],
  [/^\/api\/pro\/(?:company-training|company-support)$/, "pro-round13-help-support.spec.ts"],
  // Fix 14 (local Pro): per-item customer approval of a shared quote version (row 39).
  [/^\/api\/pro\/quote-line-decisions$/, "pro-fix14.spec.ts"],
  [/^\/api\/pro\/lead\-pipeline\/rules$/, "pro-lead-stage-rules.spec.ts"],
  [/^\/api\/pro\/company\-email\-tools$/, "pro-email-tools.spec.ts"],
  [/^\/api\/pro\/client\-presentation\/weather$/, "pro-client-presentation.spec.ts"],
  [/^\/api\/pro\/client\-presentation$/, "pro-client-presentation.spec.ts"],
  [/^\/api\/pro\/client\-contacts\/promote\-channel$/, "pro-contact-merge-transfer.spec.ts"],
  [/^\/api\/pro\/quote-line-convert$/, "pro-fix14.spec.ts"],
  [/^\/api\/pro\/work-punchlist$/, "pro-project-schedule.spec.ts"],
  [/^\/api\/pro\/work-schedule$/, "pro-private-daily-logs-access-api.spec.ts"],
  [/^\/api\/pro\/work-tasks$/, "pro-work-tasks.spec.ts"],
  [/^\/api\/pro\/work-updates$/, "pro-work-updates.spec.ts"],
  [/^\/api\/pro\/workspace$/, "pro-workspace.spec.ts"],
  [/^\/api\/privacy(?:\/|$)/, "legal-privacy.spec.ts"],
  [/^\/api\/admin\/analytics\/activity$/, "admin-journey.spec.ts"],
  [/^\/api\/analytics\/journey$/, "journey-browser.spec.ts"],
  [/^\/api\/analytics\/meta$/, "meta-minimal.spec.ts"],
  [/^\/descargar$/, "app-download.spec.ts"],
  [/^\/abrir-app$/, "app-download.spec.ts"],
  [/^\/auth\/callback$/, "product-contract.spec.ts"],
  [/^\/api\/admin(?:\/|$)/, "admin-smoke.spec.ts"],
  [/^\/api\/moderation(?:\/|$)/, "admin-moderation-runtime.spec.ts"],
  [/^\/api\/ai-assistant(?:\/|$)/, "ai-assistant.spec.ts"],
  [/^\/api\/account(?:\/|$)/, "account-lifecycle.spec.ts"],
  [/^\/api\/auth(?:\/|$)/, "auth-support.spec.ts"],
  [/^\/api\/verification\/documents$/, "product-contract.spec.ts"],
  [/^\/api\/dashboard\/activity$/, "statistics-dashboard.spec.ts"],
  [/^\/api\/(?:projects|reviews|support|quotes)(?:\/|$)/, "seeded-regression.spec.ts"],
  [/^\/api\/(?:jobs|offers)(?:\/|$)/, "marketplace-lifecycle.spec.ts"],
  [/^\/api\/marketplace\/results$/, "marketplace-paging-server.spec.ts"],
  [/^\/api\/direct-chat(?:\/|$)/, "direct-chat.spec.ts", true],
  [/^\/api\/(?:push|internal\/push)(?:\/|$)/, "push-outbox-contract.spec.ts"],
  [/^\/api\/internal\/soporte(?:\/|$)/, "soporte-cierre-automatico.spec.ts"],
  [/^\/api\/internal\/verificacion(?:\/|$)/, "verificacion-repesca.spec.ts"],
  [/^\/api\/internal\/resena-google(?:\/|$)/, "resena-google.spec.ts"],
  [/^\/api\/internal\/resumen-semanal(?:\/|$)/, "resumen-semanal.spec.ts"],
  [/^\/api\/internal\/pro\/digest-tick$/, "pro-digest-scheduler.spec.ts"],
  [/^\/api\/internal\/meta(?:\/|$)/, "meta-growth-runtime.spec.ts"],
  [/^\/api\/internal\/email(?:\/|$)/, "email-delivery.spec.ts"],
  [/^\/api\/internal\/campaigns(?:\/|$)/, "lifecycle-email-policy.spec.ts"],
  [/^\/api\/trabajos\/reportar(?:\/|$)/, "resumen-semanal.spec.ts"],
  [/^\/api\/block(?:\/|$)/, "bloqueo-de-usuarios.spec.ts"],
  [/^\/api\/webhooks(?:\/|$)/, "product-contract.spec.ts"],
  [/^\/api\/email(?:\/|$)/, "product-contract.spec.ts"],
  [/^\/api\/(?:search|categories)(?:\/|$)/, "api-smoke.spec.ts"],
  [/^\/api\/contact(?:\/|$)/, "whatsapp-review-followup.spec.ts"],
  [/^\/api\/(?:upload|media)(?:\/|$)/, "extended-lifecycle.spec.ts"],
  [/^\/api\/(?:register|cedula|cedula-available|add-cedula|verify-identity)(?:\/|$)/, "product-contract.spec.ts"],
  [/^\/api\/(?:appeals|report|client\/connections)(?:\/|$)/, "interaction-surfaces.spec.ts"],
  [/^\/api\/(?:check-availability|professionals|buscar)(?:\/|$)/, "search-results.spec.ts"],
  [/^\/api\/professional-cv$/, "professional-cv-runtime.spec.ts"],
  [/^\/api\/cv\/ai\/(?:adaptar|mejorar|carta)$/, "cv-ia-runtime.spec.ts"],
  [/^\/\[locale\]\/profesionales\/\[slug\]\/cv$/, "professional-cv-runtime.spec.ts"],
  [/^\/api\/analytics\/professional-ready$/, "meta-growth-runtime.spec.ts"],
  [/^\/api\/(?:analytics|attribution|translate|client-error)(?:\/|$)/, "product-contract.spec.ts"],
  [/^\/api\/health$/, "health.spec.ts"],
];

function filesNamed(directory, fileName) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesNamed(path, fileName) : entry.name === fileName ? [path] : [];
  });
}

function appRoute(file, terminal) {
  const path = relative(appRoot, file).replaceAll("\\", "/");
  const withoutTerminal = path === terminal ? "" : path.slice(0, -(terminal.length + 1));
  return `/${withoutTerminal}`;
}

function verify(routes, rules, kind) {
  const parked = [];
  for (const route of routes) {
    const rule = rules.find(([match]) => match.test(route));
    if (!rule) throw new Error(`${kind} ${route} has no regression owner.`);
    const [, owner, isParked] = rule;
    if (!existsSync(resolve(e2eRoot, owner))) {
      throw new Error(`${kind} ${route} points to missing tests/e2e/${owner}.`);
    }
    if (isParked) parked.push(route);
  }
  return parked;
}

const pages = filesNamed(appRoot, "page.tsx").map((file) => appRoute(file, "page.tsx")).sort();
const handlers = filesNamed(appRoot, "route.ts").map((file) => appRoute(file, "route.ts")).sort();

if (!pages.length || !handlers.length) throw new Error("Application surface inventory is unexpectedly empty.");

const parkedPages = verify(pages, pageRules, "Page");
const parkedHandlers = verify(handlers, handlerRules, "Handler");
const expectedParkedPages = ["/[locale]/mensajes"];
const expectedParkedHandlers = ["/api/direct-chat", "/api/direct-chat/attachments", "/api/direct-chat/mensaje"];

if (JSON.stringify(parkedPages) !== JSON.stringify(expectedParkedPages)) {
  throw new Error(`Parked pages changed: ${JSON.stringify(parkedPages)}.`);
}
if (JSON.stringify(parkedHandlers) !== JSON.stringify(expectedParkedHandlers)) {
  throw new Error(`Parked handlers changed: ${JSON.stringify(parkedHandlers)}.`);
}

// El enlace corto de un perfil (contratacr.com/nombre-apellido) vive en la raíz:
// si una sección nueva no está en RUTAS_DEL_SITIO, el middleware la mandaría al
// buscador de perfiles y la sección quedaría muerta.
const rutasSitio = new Set(
  [...readFileSync(resolve(root, "src/lib/site-routes.ts"), "utf8").matchAll(/"([^"]+)"/g)].map((m) => m[1]),
);
const carpetas = [
  ...readdirSync(appRoot, { withFileTypes: true }),
  ...readdirSync(resolve(appRoot, "[locale]"), { withFileTypes: true }),
]
  .filter((entry) => entry.isDirectory() && entry.name !== "[locale]" && !entry.name.startsWith("["))
  .map((entry) => entry.name);
const sinDeclarar = [...new Set(carpetas)].filter((name) => !rutasSitio.has(name)).sort();
if (sinDeclarar.length) {
  throw new Error(`Missing from RUTAS_DEL_SITIO in src/lib/site-routes.ts: ${sinDeclarar.join(", ")}.`);
}

console.log(`Verified regression ownership for ${pages.length} pages and ${handlers.length} route handlers.`);
