# ContrataCR.com — Project Context

_Last updated: 2026-06-12 (sprint 133 - **public profile flattening** (Task A finish). On profesionales/[slug] the tab content already lives in one card; removed the box-in-box offenders inside it: the "Solo clientes que recibieron un servicio..." reviews note lost its border (bg-[#EBF5FB] only), and the Certificaciones items changed from per-item bordered cards to flat divided rows (divide-y), matching the already-flat Servicios list. With the earlier pro-dashboard de-nest (sprint 129) and the standing "no nested bordered containers" rule, both dashboards + the public profile now stay at one border level. tsc + next build clean._

_Last updated: 2026-06-12 (sprint 132 - **smaller design fixes** (Task E). (E1) Photo step: "Eliminar" is now a proper outlined (red) button matching "Cambiar foto" (was a ghost link); removed the redundant "Despues agregas tus servicios..." line and the "Tip: casos de exito..." box from registration step 2 (that guidance lives in the panel profile-completion flow). (E2) The "No tengo identificacion costarricense" checkbox no longer sits under the cedula field - moved to a muted toggle below the main flow (under a divider, near the submit) in both the email/password and OAuth registration paths, so cedula->nombre reads cleanly. (E3) OAuth email/password guidance blocks in account-security: dropped the border (bg-[#f0f9ff] only) so they no longer nest a box inside the card - clean light info style. (E4) Client panel: removed the Briefcase icon next to "Ofreces servicios?" so the content aligns flush with the cards above. (E5) Client header is now fully responsive: greeting row + a full-width "Buscar profesionales" button on mobile (always fits, good tap size), inline on desktop; Salir collapses to an icon on mobile. (E6) "Nombre comercial o marca" relabeled "Nombre comercial o de tu empresa" with helper clarifying it's the company/brand name. (E7) Registration trimmed to essentials: the optional brand/business name moved out of signup to the panel (already had the field); registration now collects only identity, email/pw, profession(s), how-you-offer + location, WhatsApp, optional photo. tsc + next build clean._

_Last updated: 2026-06-12 (sprint 131 - **Disponibilidad redesign** (Task C). (1) Privada OFF by default: registration now inserts professionals with availability_public=true + contact_preference="ambas" (was availability_public:false) - new pros are reachable and can publish hours immediately; they can switch "Disponibilidad privada" ON anytime. (2) Default workday 8:00 a.m. to 5:00 p.m.: the slot generator pre-fills Desde 08:00 -> Hasta 17:00 (initialStart changed from nextFullHourCR(today) to "08:00"; for today the start-floor effect bumps it to the next full hour so no past time is offered). Adjustable freely. (3) Simpler, lower-border layout matching the dashboard de-nesting: the two numbered bordered "STEP 1/STEP 2" boxes are gone; controls now live in soft tinted panels (bg-[#f9fafb], no hard border) under plain headings ("Como te contactan los clientes" with privada/llamada/videoconsulta toggles; "Agrega tus horarios" generator). Unified logic kept intact (privada controls schedule + videoconsulta visibility; WhatsApp/call independent; uniform Manana/Tarde/Noche time chips). tsc clean._

_Last updated: 2026-06-12 (sprint 130 - **simpler professions + "como ofreces tus servicios" setup** (Task B). PROFESSIONS: the confusing second always-visible "Agrega otra profesion (opcional)" dropdown is gone. Now: principal profession field + chips for extras + a single on-demand action "+ Agregar otra profesion" (reads "Tienes mas de una profesion? Agregala" when none yet) that reveals a search then collapses. Applied in BOTH registration step (registro/profesional) and the panel profile-editor "Profesiones" section. Copy clarifies you can have one or several professions, each with its own services (managed in Servicios). HOW YOU OFFER: the work-mode choice (Me desplazo / Trabajo desde un lugar fijo) is now immediately followed by its matching location block(s) - workplaces map (fixed) / coverage selector (mobile) - grouped together in ONE soft panel (bg-[#f9fafb], no extra hard border) with clear icon + sub-heading, so the user never loses track of where to set the location. tsc clean._

_Last updated: 2026-06-12 (sprint 129 - **dashboard de-nesting + profile-completion redesign**. (A) The professional dashboard main content no longer sits inside an outer bordered Card: the section heading (TAB_LABELS + subtitle) now renders directly on the page background and each section brings only the light containers it needs - removes a full "box in box" layer across every tab. Sidebar stays one Card. (D) ProfileCompletion moved OUT of the "Mi perfil" section to a prominent full-width card at the TOP of the dashboard (above the sidebar+content columns), shown on the profile tab and auto-hidden (returns null) once 100% AND verified. Redesigned: linear progress bar (was a ring), flat benefit-framed pending rows (no per-item border boxes), a done-items chip row, and identity verification as a separate tinted CTA. CALC FIX: the % was stuck at 83% because identity verification (5/6 items) is approval-gated and CANNOT auto-pass for non-padron IDs (DIMEX/NITE) - verification is now excluded from the percentage and shown as a recommended action, so completing the controllable items (photo, bio>=30, >=1 service, location, WhatsApp, +aseguradoras for health) always reaches 100%. Location detection no longer depends on service_type: done on ANY of workplaces/coverage_areas/coverage_provincias/coverage_country/provincia_id/canton_id. Standing design rule added: no nested bordered containers (max one border level; use spacing/dividers/typography). tsc clean._

_Last updated: 2026-06-12 (sprint 128 - **bug-fix sweep**. (1) PROJECT FILTERS unified with solicitudes: PROYECTO_TABS = Activos/Finalizados/Cancelados (status-filter-tabs.tsx); "Activos" = open+in_progress+awaiting_confirmation; the per-card badge still distinguishes "Abierto" vs "En curso . Asignado"; default filter is now "activos" (client-activity + proposals-tab). (2) proposals-tab "Proyectos disponibles" shows the client's FULL name (was first name only). (3) Review counts are singular/plural: "1 resena" / "N resenas" (professional-card, profile header + aside). (4) Clients can REPORT a professional in EVERY booking state (was gated to confirmed+). (5) SELF-FAVORITE blocked: the bookmark on a pro's OWN /buscar card opens SelfActionModal (SELF_MSG.favorite) instead of saving; wired via isOwn = viewerProfileId === pro.profileId through SaveableCard -> SaveButton. (6) HEALTH TAXONOMY completed: added medicina_domicilio, terapia_lenguaje, terapia_ocupacional, podologia, acupuntura, cuidado_discapacidad (ES + EN labels in categories.ts); HEALTH_CATEGORY_IDS now covers the full set so the booking DOB question fires for them; **migration 051_health_categories.sql MUST be applied in Supabase** (inserts the new categories + sets es_salud=true). (7) NOTIFICATIONS: distinct icons so actions are never read as accept/reject - check (green) = "Marcar como leida", trash (red) = "Eliminar" in both the bell dropdown and the in-panel list; the bell unread badge auto-refreshes via a realtime UPDATE handler PLUS a same-tab "notificationsChanged" CustomEvent that every read/delete dispatches; notificationHref only honors a stored data.link when it startsWith "/", else falls through to the live dashboard tab so a stale click never dead-ends. tsc + next build clean._

_Last updated: 2026-06-11 (sprint 127 - **notifications in header/menu + "Identidad verificada" label + post-login lands on panel home**. (1) NOTIFICATIONS access: added a role-aware "Notificaciones" item (with unread badge) to BOTH the desktop account dropdown and the mobile drawer MI CUENTA section in landing-navbar (notificationsHref = pro -> /dashboard/profesional?tab=notifications, client -> /dashboard/cliente?tab=notifications; notifUnread fetched from notifications where read=false, refreshed when the drawer/menu opens). The bell remains in the expanded desktop header. (2) "Verificado" -> "Identidad verificada" next to the locked "Nombre completo" in profile-editor; the label row is now flex-wrap with the verified chip whitespace-nowrap + shrink-0 so it never gets cut off ("Identidad veri...") on mobile - it wraps to the next line instead. (3) POST-LOGIN DEFAULT: the client dashboard now defaults to "profile" (Mi perfil = panel home) instead of "bookings" (a deep sub-section); the pro dashboard already defaulted to "profile". Both land on the panel home. tsc+next build clean. Earlier sprint 126 - **removed "Todas/Todos" status-filter tab; verified wording**. The shared SOLICITUD_TABS/PROYECTO_TABS (status-filter-tabs.tsx) dropped the all-bucket - the status tabs already cover every lifecycle state, so it only added noise. Solicitudes recibidas + Mis solicitudes enviadas now default to **"Activas"** (Activas/Finalizadas/Canceladas); Mis propuestas + Mis proyectos publicados default to **"Abiertos"** (Abiertos/En curso/Finalizados/Cancelados). Verified the labels match the actual lifecycle: solicitudes activas = pending/confirmed/in_progress/awaiting_confirmation, finalizadas = completed, canceladas = cancelled/rescheduled; proyectos abiertos = open (recibiendo propuestas), en curso = in_progress/awaiting_confirmation, finalizados = completed, cancelados = cancelled. No items lost (every status still has a tab). The `solicitudMatches`/`proyectoMatches` "todas/todos" branch is now dead but harmless. (Support tickets keep their own filter incl. "Todas" - out of scope.) tsc+next build clean. Earlier sprint 125 - **Disponibilidad UI: full-time mobile chips + removed icons** (presentation only). (1) "Tus horarios próximos" time chips were truncating on mobile (grid-cols-3 cells too narrow for "12:00 PM"+X). Now: the part label (Mañana/Tarde/Noche) sits ABOVE the chips (not a w-12 side column), and chips use grid-cols-2 sm:grid-cols-3 md:grid-cols-4 with whitespace-nowrap + tabular-nums (no truncate) so the FULL time always shows; uniform width in an even grid. (2) Removed icons: the Lock/Globe circle next to "Disponibilidad privada", the Video circle next to "Ofreces videoconsulta", and the CalendarPlus next to the "Agregar horarios disponibles" heading - labels are clean now (step number badges kept). Dropped the now-unused lucide imports. tsc+next build clean. Earlier sprint 124 - **certifications: fixed saving + made per-profession**. (1) SAVE BUG: certifications were bundled in `identityFields`, so if ANY other optional column in that update errored (e.g. a not-yet-migrated column) the retry dropped the WHOLE identityFields block - silently losing certs. Fix: persist certifications in their OWN dedicated `update({ certifications })` call AFTER the main update (errors there are non-fatal), so they always save when the column exists (migration 044). (2) PER-PROFESSION: each Certification now carries a `profession` (category id). Profile editor groups the certs UI BY profession (heading per profession when >1; "Agregar certificación a <Profesión>"), tagging new certs with that profession; untagged legacy certs default to the principal profession on save. Public profile "Certificaciones" tab groups certs under each profession heading (certGroups). The /buscar "Ver certificaciones (N)" count is unchanged (total). Still TEXT-only (nombre + institución opcional + año opcional), no images. tsc+next build clean. (Requires migration 044_certifications.sql if not already run.) Earlier sprint 123 - **no self-service + separate call/WhatsApp numbers**. RUN MIGRATION 046_call_phone.sql (adds professionals.call_phone text; notify pgrst). (1) NO SELF-SERVICE: a pro cannot request a service from THEMSELVES nor propose to their OWN project. Added profileId (professionals.profile_id) to ProfessionalCardData + queries (card + detail). /buscar passes viewerProfileId (server session) -> ProfessionalCard computes isOwn -> hides the top WhatsApp/call icons and renders "Este es tu perfil" (link to /dashboard/profesional) via ProfessionalSchedule instead of booking/WhatsApp. BookingButton self-detects (useAuth + professional.profileId) -> "Este es tu perfil". Public profile (slug) computes isOwn (viewerId vs profileId) -> replaces the WhatsApp/Solicitar/Llamar CTAs with "Este es tu perfil · Editar". Projects: api/projects?role=professional now excludes the pro's OWN projects (.neq client_id), and api/proposals POST rejects proposing to your own project (client_id === session.user). (Booking API already had the self-guard.) (2) SEPARATE CALL vs WHATSAPP NUMBERS: new optional "Número para llamadas" in the profile editor (Contacto y precios) next to "Número de WhatsApp"; empty -> WhatsApp number used for calls. Stored in professionals.call_phone (saved in identityFields w/ retry guard). The WhatsApp button always uses whatsapp; the "Llamar"/call icon uses callPhone ?? whatsapp (card telHref + both profile tel links + callDigits). Both validated via PhoneInput. tsc+next build clean. Earlier sprint 122 - **Disponibilidad simplified: removed "¿Cómo recibes clientes?" + uniform time chips**. RUN MIGRATION 045_availability_unify.sql (set availability_public=false where contact_preference='solo_whatsapp'; notify pgrst). (1) The redundant "¿Cómo recibes clientes?" (Solo WhatsApp / Agenda + WhatsApp) block + CONTACT_PREFERENCES radios are GONE - "Disponibilidad privada" is now the SINGLE control: ON = WhatsApp-only/no agenda (hides videoconsulta + "Agregar horarios" + clears slots, shows the amber note), OFF = public agenda (shows Permitir contacto por llamada [always, independent], Ofreces videoconsulta, and the schedule section). WhatsApp always available. Section re-numbered to TWO steps: STEP 1 "Tu disponibilidad" (privada toggle + Permitir llamada + videoconsulta-when-public), STEP 2 "Agregar horarios disponibles" + "Tus horarios próximos". The toggle handlers now KEEP contact_preference in sync for downstream /buscar card + schedule logic (makePublic/insertSlots -> 'ambas'; confirmMakePrivate -> 'solo_whatsapp'); removed contactPreference/schedulingEnabled/changeContactPreference state. Migration: solo_whatsapp pros -> privada ON; ambas/solo_citas keep their existing availability_public. (2) UNIFORM time chips: "Tus horarios próximos" chips now render in an even GRID (grid-cols-3 sm:grid-cols-4, w-full cells, tabular-nums, time truncates + X shrink-0) so every chip is the SAME width; the booking modal time picker likewise uses grid-cols-4 sm:grid-cols-5 + tabular-nums text-center. tsc+next build clean. Earlier sprint 121 - **/categorias search autocomplete no longer hides behind the category list** (presentation-only). Root cause: the CategorySearchBox dropdown is `absolute` inside the HERO `<section>`; the hero was a static sibling BEFORE the opaque category-grid `<section>` (bg-#f4f7fa), so the later grid painted over the dropdown that overflows below the hero - the dropdown z-50 was scoped inside the hero stacking context and could not beat a later root-level sibling. Fix: hero section is now `relative z-30`, lifting the whole hero (and its overflowing suggestions) above the grid section; stays below the fixed navbar (z-50). No logic change - suggestions still go to /buscar?categoria=, outside-click/blur still closes, scrollable (max-h-[340px]). Works mobile + desktop. tsc+next build clean. Earlier sprint 120 - **logged-OUT mobile menu order optimized for real usage**. New visitors on a services marketplace: CLIENTS do NOT register upfront - the account is created AT booking/request time - so the menu has NO "register as client" option (would add useless friction). Logged-out order is now: search (primary - clients explore by searching) -> CATEGORÍAS + "Ver todas" (clients browse) -> **CUENTA** (Ingresar [returning users] + Registrarse como profesional [people who offer services]) surfaced right after browse so it is clearly visible but not first -> RECURSOS -> Idioma ES/EN (utility, bottom). Previously the account actions were buried dead-last under Recursos+Idioma; moved them up under a "Cuenta" header. Logged-in order unchanged (search -> MI CUENTA -> Categorías -> Recursos -> Idioma -> Cerrar sesión). Implemented by branching the drawer: {!user} CUENTA block after Categorías, {user} Cerrar sesión at the very bottom. Left drawer behavior, role-aware logic, and all links kept. tsc+next build clean. Earlier sprint 119 - **click-outside/tap-away + Escape dismiss audit; responsive rules codified**. Audited every overlay: Radix Dialogs (booking-modal, client-registration-modal, selects) and the report/leave-review modals + time-select already dismiss on outside-click + Escape - left as-is. Hardened the CUSTOM handlers that listened to mousedown only (so a TAP outside reliably closes on mobile) and added Escape where missing: navbar user menu (mousedown+touchstart), notification-bell (mousedown+touchstart+Escape), public-profile "Más opciones" dropdown (mousedown+touchstart+Escape), availability "hacer privada" confirm (added Escape; already closed on scrim tap). StatusFilterTabs uses flex-wrap (no mobile overflow). Standing standard now in the design guide: every dropdown/menu/popover/modal/date-time picker MUST close on outside click/tap AND Escape (listen to mousedown+touchstart for custom ones; prefer Radix which handles it). Responsive guidance (>=360px, no horizontal scroll/truncation, comfortable tap targets, full-width-stacked actions on mobile) codified as a standing rule - recent sprints already fixed the major offenders (cards 110/117, dashboards, header/search, booking warnings, Solicitudes). tsc+next build clean. Earlier sprint 118 - **mobile menu reorganized into clear sections for BOTH auth states + friendlier auth label "Ingresar"**. landing-navbar.tsx left drawer rebuilt with grouped, labeled sections (uppercase tracking-widest headers). LOGGED-IN order: search -> **MI CUENTA** (avatar + name/email header, then Mi panel [bold, brand icon], Mis solicitudes [enviadas for pro], Mis proyectos [publicados for pro], Mis favoritos, Ofrecer mis servicios [client only], Cuenta y seguridad - each role-aware via primaryPanelHref/sentBookingsHref/sentProjectsHref/savedHref/accountHref, with lucide icons) -> CATEGORÍAS (curated 9 + "Ver todas") -> RECURSOS -> Idioma ES/EN -> **Cerrar sesión** (red, bottom). LOGGED-OUT order: search -> CATEGORÍAS -> RECURSOS -> Idioma -> auth actions: **"Ingresar"** (outline) + "Registrarse como profesional" (brand pill). The auth label **"Iniciar sesión" -> "Ingresar"** (friendlier, non-medical, marketplace-appropriate) applied to BOTH the mobile drawer and the desktop nav trigger consistently. Kept the left slide-in drawer behavior, swipe-to-close, scrim, role-aware visibility, and all destinations. tsc+next build clean. Earlier sprint 117 - **Solicitudes recibidas responsive redesign + "Volver a mi panel" on the profile preview**. (1) booking-requests.tsx BookingCard rebuilt with a clear vertical hierarchy: header (status badge + created date) -> details block (client, phone, DOB, beneficiary box, descripcion, fecha, profesion/ubicacion) -> a footer separated by border-top with the status actions. Actions are full-width STACKED on mobile (flex-col, each Button w-full sm:w-auto) and inline-wrap on desktop (sm:flex-row sm:flex-wrap); WhatsApp + "Reportar cliente" (subtle link, self-start) included; the awaiting-confirmation note sits above the buttons. Uniform footer shape across every status (confirmada/completado/finalizada/cancelada) so cards never look cramped or misaligned. Dropped the old shrink-0 right-column that cramped buttons on mobile. (2) Profile preview: the pro dashboard "Ver como me ven los clientes" link now opens SAME-tab with ?preview=1 (was target=_blank); the public profile (profesionales/[slug]) reads preview=1 and shows a prominent "Volver a mi panel" bar (-> /dashboard/profesional) instead of the /buscar back link, so the pro never gets stuck. Audit: other standalone flows (registro, soporte, contacto, publicar-proyecto, cuenta) keep the global Navbar (logo->home + account menu), so they already have a way back; the preview was the only full view lacking one. tsc+next build clean. Earlier sprint 116 - **profile-photo upload reliability fix + confirm 5-photo limit is casos-only**. Root cause of "No se pudo subir la foto": the upload endpoint (api/upload/photo) rejected iPhone HEIC/HEIF (allowed list was jpeg/png/webp) and capped at 5 MB (phone photos exceed it), and the client swallowed the specific error into a generic message. Fixes: (a) endpoint now accepts ANY image incl. HEIC/HEIF (type startsWith image/ OR empty type from mobile HEIC; data URI falls back to image/heic so it stays valid; Cloudinary converts) and the size cap is 10 MB; clearer error messages. (b) profile-editor handlePhotoSelect + cliente handlePhotoUpload now send type=avatar, surface the SERVER error message (size/format), check the supabase update error, and revert the optimistic preview on failure; avatar <input accept> widened to image/*. The 5-photo limit (MAX_PORTFOLIO_PHOTOS) lives ONLY in photo-gallery.tsx (casos de exito, on portfolio_urls/items) and never touched the avatar (separate profiles.avatar_url path) - confirmed, limit kept at 5 for launch. tsc+next build clean. Earlier sprint 115 - **Certificaciones (text-only) for professionals**. RUN MIGRATION 044_certifications.sql (adds professionals.certifications jsonb default []; notify pgrst). Each entry = { id, name, institution?, year? } - TEXT ONLY, no images/uploads (avoids exposing documents with personal data). (1) Profile editor (profile-editor.tsx): new collapsible "Certificaciones" Section - add/edit/remove rows (nombre required, institucion + ano optional), saved in identityFields.certifications (blank-name rows dropped; retry regex includes certifications). (2) Public profile (profesionales/[slug]): a "Certificaciones" TAB appears only when the pro has any, listing each as name + "institucion - ano" with an Award icon; honest note that authenticity is not verified yet. (3) /buscar cards (professional-card.tsx): a compact "Ver certificaciones (N)" link (Award icon) shown ONLY if certificationCount>0, sharing ONE bottom flex-wrap row with "Ver casos de exito" so the card height stays uniform (no extra line). Links to ?tab=certificaciones. Card type gained Certification + certificationCount; queries map certificationCount (card) and certifications (profile, best-effort fetch so a pre-migration DB never breaks the profile). Authenticity verification is a future admin enhancement. tsc+next build clean. Earlier sprint 114 - **Disponibilidad reorganized into a guided, conditional 3-step flow** (availability-editor.tsx). Progressive disclosure with numbered step badges (1/2/3): STEP 1 "¿Como recibes clientes?" (Solo WhatsApp / Agenda + WhatsApp) + "Permitir contacto por llamada" (always shown, every mode). If Solo WhatsApp -> nothing else shows (info note). If Agenda + WhatsApp -> STEP 2 "Tu disponibilidad" with the "Disponibilidad privada" toggle: when PRIVATE (isPublic=false) videoconsulta + the whole schedule section are HIDDEN and a short amber note explains clients contact by WhatsApp/llamada; when PUBLIC, "Ofreces videoconsulta" appears (nested under isPublic) and STEP 3 "Agregar horarios disponibles" + "Tus horarios proximos" render. So a pro only ever sees options relevant to their choices. All underlying functionality kept (contact_preference, allow_phone_call, videoconsulta, availability_public + slot CRUD); reorganization + conditional visibility only. Responsive, no voseo. tsc+next build clean. Earlier sprint 113 - **client cedula at booking (link + name-override; beneficiary isolated), slot double-booking guard, masked cedula + client verification, health DOB required, insurance filter no "Todas"**. (1) Client cedula at booking (booking-modal.tsx): a logged-in account WITHOUT a cedula booking "para mi" with a national cedula -> the padron official name is compared to the account name; if it DIFFERS an amber warning shows ("La cedula ingresada pertenece a [Nombre oficial]. Al confirmar, tu cuenta usara este nombre oficial. Usa unicamente tu propia cedula.") and on confirm the OFFICIAL name prevails (writes profiles.full_name + auth metadata), the cedula is linked + persists and prefills future bookings (hasStoredCedula); if it MATCHES it links silently. "Para otra persona": the beneficiary cedula (benCedula) is used ONLY on that booking (beneficiary_cedula), NEVER linked to the account and never changes the holder name (override gated on !forSomeoneElse via selfOfficialName). Warning is responsive (contained amber box, break-words, ~360px ok); guests get the same warning. (2) Slot double-booking guard (api/bookings POST): rejects 409 when an active (pending/confirmed/in_progress) booking already holds that pro+date+time; modal shows it inline. Cancel/complete free the slot (existing takenFor filter excludes non-active). (3) Masked cedula + client identity (cedula.ts maskId -> X-XXXX-1234): client panel profile tab has an Identidad card (once a cedula is saved) with masked cedula + status: national cedula = "Identidad verificada" (green; derived, was padron-confirmed at booking), DIMEX/NITE = "Pendiente de revision". When verified the client Nombre completo is LOCKED (read-only + lock icon, corrections -> soporte) and saveProfile wont overwrite it. No new DB column - verified derived via detectIdType(cedula)==="cedula". (4) Health DOB required (booking-modal.tsx): es_salud bookings require the patient DOB for myself (new manual input, padron has none) AND for another person (beneficiary DOB no longer optional); details Continue/Submit blocked until provided. (5) Insurance filter (search-filters.tsx): removed "Todas" - default NONE selected (placeholder "Cualquiera", no filtering); pick an insurer to filter, X button clears it. tsc+next build clean. Earlier sprint 112 — **support tickets: one-way states, reopen-same-thread, bell integration, per-status badges/markers, client filtering, auto-refresh, two confirmation actions**. **RUN MIGRATION `043_support_notification_type.sql`** (adds `support_reply` to the `notifications` type CHECK; `notify pgrst`). **(1) One-way flow** open(Pendiente)→in_progress(En proceso)→resolved(Resuelto): admin PATCH rejects backward moves (no →open; resolved only stays), and the admin status `<select>` only offers valid forward targets. **(2) Reopen = same thread:** an **admin reply** now always sets status `in_progress` (`user_confirmed=false`) — reopening a resolved ticket in the SAME thread (no new ticket); **user reply/reabrir** on resolved also → `in_progress` (was `open`). **(3) Bell integration:** an admin reply inserts a **`support_reply` notification** (`data.ticketId` + link `/dashboard/cliente?tab=soporte&ticket=…`) so it shows in the user's general Notifications, tagged **"Soporte"** (green) in the bell + list, click opens the ticket; `notification-link.ts` gained the `support` context + soporte pro-remap. **(4) Per-status badges + markers:** admin GET returns `counts {open,in_progress,awaiting}`; admin status tabs show a badge ("Pendientes"=open, "En proceso"=awaiting-reply) + per-ticket "Espera respuesta" dot. User side: `SupportTickets` reads unread `support_reply` notifications → per-ticket **"Nueva respuesta"** dot/ring + per-status filter badges + the dashboard **Soporte tab badge** (`supportUnread` in both dashboards). **(5) Auto-refresh:** admin "Soporte" nav badge **polls every 30s + on window focus**; opening a ticket (user) marks its `support_reply` notifications read via the browser client (`.contains("data",{ticketId})`) → badge/marker clear live (`onUnreadChange`); the bell already updates via realtime. **(6) Client-side filtering:** "Mis tickets" got Todas/Pendiente/En proceso/Resuelto filter tabs. **(7) Confirmation:** "¡Ticket creado!" now shows **both** "Ver mis tickets" AND **"Ir a mi panel"** (logged-in); guests keep the email-reply message. `tsc`+`next build` clean. Earlier sprint 111 — **availability "¿Cómo recibes clientes?" → 2 options + official name locked post-verification**. **RUN MIGRATION `042_contact_preference.sql`** (`update professionals set contact_preference='ambas' where contact_preference='solo_citas'`; `notify pgrst`). (1) **Two options** (`CONTACT_PREFERENCES` in `constants.ts`): **"Solo WhatsApp"** ("Los clientes te escriben directo para coordinar.") and **"Agenda + WhatsApp"** ("Los clientes ven tus horarios y agendan, o te escriben por WhatsApp."). Removed the standalone app-only **"Citas en la app" (`solo_citas`)** — misleading because WhatsApp is always present; rationale: the only real choice is whether they ALSO offer in-app scheduling. `solo_citas` kept in the TS type as a **legacy value** but treated as `ambas` everywhere: `availability-editor` normalizes the initial value (`solo_citas`→`ambas`), `professional-card` now **always shows the WhatsApp icon** when a number exists (dropped the `canWhatsApp` solo_citas gate), `professional-schedule`/queries already defaulted to `ambas`. The reg-flow "¿Cómo ofreces tus servicios?" is a separate **service_type** (mobile/fixed) field — untouched. (2) **Official name lock** (`profile-editor`): when `verification_status === "verified"` the **"Nombre completo"** is **read-only** (disabled + lock icon + "Verificado" mark) with a note routing corrections to **admin review via a support ticket** (`/soporte`) — and the save **never overwrites** `full_name` for verified pros (`if (fullName && !nameLocked)`). The **"Nombre comercial o marca"** stays freely editable. Not-yet-verified pros edit their name as before (until verification locks it). `tsc`+`next build` clean. Earlier sprint 110 — **/buscar card: professional name no longer truncated on mobile**. The card's top row crammed name + "Identidad verificada" badge + WhatsApp/call icons into a narrow width, so the name cut to "K…". Fix in `professional-card.tsx` (presentation only): the **name now has horizontal priority** — top line = name (`flex-1`) + the compact right-aligned contact icons only; the **verified mark drops BELOW the name on mobile** (`md:hidden` badge under the name) and stays **inline beside the name on desktop** (`hidden md:inline-flex`). The name uses **`line-clamp-2 md:line-clamp-1`** so on mobile it **wraps to 2 lines instead of truncating with "…"** (full long names like "Isaac Alberto Sanchez Monge" show), single-line on desktop. Row switched to `items-start`; extracted a `verifiedBadge` JSX const (rendered in both placements). Card height effectively unchanged (badge moves into space already there; ≤2 name lines). `tsc`+`next build` clean. Earlier sprint 109 — **support channel hierarchy: ticket = primary/featured, WhatsApp = discreet secondary**. Partially walks back sprint 108's full WhatsApp removal: WhatsApp Business (`SUPPORT_WHATSAPP_URL` → `wa.me/50687454360`) is back as a **subtle secondary** option, never visually competing with the ticket. **/soporte:** the ticket form stays the hero; a small grey line below it — "¿Prefieres WhatsApp? Escríbenos · en horario laboral" (tiny WhatsApp-green link). **/contacto:** the info-column "Abre un ticket de soporte" card is now the **featured** card (`border-2 border-[#bfe3f5]`, solid brand button) with a discreet "¿Prefieres WhatsApp? Escríbenos" line beneath. **/ayuda** footer: primary "Abrir ticket de soporte" button + a tiny grey "¿Prefieres WhatsApp?" link under it. Honest copy (no instant/24-7; "en horario laboral"). **Reports & disputes stay ticket-only** (report-professional / report-client / disputes go through the moderation APIs → admin tickets; NO WhatsApp offered there — unchanged). **Client↔professional coordination WhatsApp is untouched** (booking/profile/cards — that's the core service, separate from support). Presentation/copy only; `tsc`+`next build` clean. Earlier sprint 108 — **support system refinements: 3 statuses, single channel, confirm/reopen, guest flow + account linking, admin badge**. **RUN MIGRATION `041_support_status.sql`** (migrate `closed`→`resolved`; narrow status check to **`open|in_progress|resolved`**; add `user_confirmed boolean default false`; `notify pgrst`). **3 states only** — "Pendiente" (open) → "En proceso" (in_progress) → "Resuelto" (resolved); dropped "Cerrado"; admin tab "Abiertos"→**"Pendientes"**. **Single channel:** removed the WhatsApp button + `soporte@contratacr.com` lines from `/soporte`, `/contacto`, `/ayuda` support footer, and the `/api/contact` + `/registro/cliente` error copy (product↔client WhatsApp coordination on como-funciona/atraer-clientes/profile stays — that's the service, not support). **Confirmations** ("¡Ticket creado!"): logged-in → **"Ver mis tickets"** button (→ `/dashboard/cliente?tab=soporte`); guest → "te responderemos por correo" + a soft "Inicia sesión para seguir tus tickets" (no panel link). **User confirm/reopen:** on a Resuelto ticket the user sees "¿Se solucionó?" → **"Sí, está resuelto"** (`action=confirm` → `user_confirmed=true`) or **"No, sigo con el problema"** (`action=reopen` → status `open`, notifies inbox + system message). A normal user reply also re-opens resolved→in_progress. **Admin inbox:** each ticket now shows a **Registrado/Invitado** chip (by `user_id` presence) + the email; the **"Soporte" nav badge** (`admin-shell`) shows needs-attention = pending + in-progress-awaiting-user-reply (`/api/admin/support` returns `needsAttention`). **Guest→account linking:** `claimGuestTickets()` attaches prior GUEST tickets (`user_id` null) to a user whose **verified** email (`email_confirmed_at`) matches — runs in `/api/support` GET AND the `/auth/callback` after session exchange (case-insensitive `ilike`; never claims another person's tickets, no duplicates). Emails unchanged (branded, clickable links). `tsc`+`next build` clean. Earlier sprint 107 — **full admin-managed support-ticket system (threads + replies + status + user view + emails)**. **RUN MIGRATION `040_support_threads.sql`** (NOTE: `support_tickets` was first created by **migration 027** as verification tickets — `professional_id/type/subject/detail/status` — so the richer **039** `create table` was a NO-OP and the `user_id/name/email/message` columns never landed. 040 is now **defensive**: it `add column if not exists` for every app column — `user_id, name, email, subject, message, reviewed_at` + the new thread fields — and folds any old `detail` into `message`, so it works on either shape.) (widens `support_tickets.status` to `open|in_progress|resolved|closed`; adds `topic, handled_by, handled_by_name, handled_at, last_reply_at, last_reply_role`; new **`support_ticket_messages`** thread table `(ticket_id→support_tickets cascade, sender_role user|admin, sender_id, sender_name, body, created_at)` — NOTE distinct name because a legacy `support_messages` table (migration 012, unrelated schema) already exists; RLS on / no policies = service-role only; backfills a first message per existing ticket). **Creation:** `/api/contact` (used by `/contacto` + `/soporte`) now inserts the ticket AND seeds the thread's first user message (+ optional `topic`); still emails support. **Admin inbox** (`AdminSupport` + `/api/admin/support`): list filterable by the 4 statuses (with "Espera respuesta"/handled-by hints), open a ticket → **full chat thread**, **reply in-panel** (POST inserts an admin message, bumps status open→in_progress, emails the user via `notifyUserOfReply`), change **status** with audit (`handled_by_name`/`handled_at`). **User side** (`SupportTickets` + `/api/support`): a **"Soporte" tab** in BOTH dashboards (client + unified pro; pro-redirect map gained `soporte→soporte`) listing their tickets + thread + **reply box** (POST inserts a user message, re-opens resolved/closed→in_progress, emails support via `notifySupportInbox`); "Nueva respuesta" hint. **Emails** (`src/lib/support-notify.ts`, branded, **clickable links only**): support inbox notified on new ticket/user reply ("Abrir en el panel"); user notified on admin reply ("Ver conversación" → `/dashboard/cliente?tab=soporte`). **/contacto** copy made honest (dropped "inmediata"/"menos de 24 horas" promises; tickets are the channel, replies by email + panel). Admin-only access preserved (service-role + `getApiAdmin`). `tsc` + `next build` clean. Earlier sprint 106 — **change-password: verify current password via re-auth + forgot-password escape hatch**. `AccountSecuritySection` change-password now has THREE fields — **contraseña actual**, nueva, confirmar. It verifies the current password by **re-authenticating** (`supabase.auth.signInWithPassword({ email, password: currentPw })` — Supabase validates the hash; we never read/decrypt it) before calling `updateUser({ password })`; wrong current → "Tu contraseña actual no es correcta." **No emailed code while logged in** (re-auth is enough). A **"¿Olvidaste tu contraseña actual?"** link sits in the form → `resetPasswordForEmail(email, { redirectTo: …/auth/callback?next=/<locale>/reset-password })` (the standard reset flow, unchanged) → "Te enviamos un enlace…". **OAuth (Google/Facebook) accounts** still show the provider note, no fields. Friendly CR Spanish, no voseo; `tsc` + `next build` clean. Earlier sprint 105 — **smart search on /categorias**. Added a reusable **`CategorySearchBox`** (`src/components/search/category-search-box.tsx`) to the /categorias hero (above the grouped listing, which stays for browsing): accent-insensitive autocomplete via `searchCategories` + an **edit-distance typo fallback** (so "elec"/"plomeira"/"niñ" resolve), ↑/↓/Enter keyboard nav, suggestions show label + group; selecting → `/buscar?categoria=<id>`, free text → `/buscar?q=`. Single source of truth = `categories.ts`/`ALL_CATEGORIES`. Responsive, mobile-friendly. Also fixed a stray voseo on the page ("Encontrá"→"Encuentra"). `tsc` + `next build` clean. Earlier sprint 104 — **project Categoría is now REQUIRED (routes the project to the right pros)**. In `publicar-proyecto`: label "Categoría (opcional)" → **"Categoría *"** (red asterisk) + helper "Así dirigimos tu proyecto a los profesionales de ese servicio."; client validation blocks submit with a friendly message ("Elige una categoría para que tu proyecto llegue a los profesionales correctos."); server guard in `POST /api/projects` returns 400 if `categoryId` is missing. The selector is the shared `CategorySearch` (single source of truth = `categories.ts`). **Routing already keyed on category** (unchanged): on create, `/api/projects` POST notifies every professional whose `category_id`/`professions` matches the project's category; the pro GET shows open projects where `category_id` ∈ the pro's professions (the legacy `category_id.is.null` catch-all now rarely applies since new projects always have a category). `tsc` clean; no migration. Earlier sprint 103 — **professionals' client activity routes through the unified panel (no separate /dashboard/cliente)**. (1) The **client dashboard** now redirects a logged-in **professional** (role==="professional") into the unified **"Mi panel"**, mapping the tab: `bookings→sent_bookings`, `projects→sent_projects`, `saved→saved`, `notifications→notifications`, `profile→cuenta` (no tab → dashboard home). A professional never lands on the separate client panel; a **plain client stays** on `/dashboard/cliente`. (2) BUG FIX: the **"¡Proyecto publicado!"** screen buttons ("Ver mis proyectos" / "Ir a mi panel") in `publicar-proyecto` sent everyone to `/dashboard/cliente`; now role-aware — professionals → `/dashboard/profesional?tab=sent_projects` and `/dashboard/profesional`; clients keep the client panel. Routing/navigation only (no data/permission changes); `tsc` + `next build` clean. Earlier sprint 102 — **mobile dashboard nav bounce fix + "Cuando contrato" → "Contratar servicios" rename**. (1) BUG: on mobile, tapping a unified-dashboard sidebar item scrolled to the section then JUMPED BACK — Next App Router's default **scroll-to-top on navigation** fired after our `scrollIntoView`. Fixed by passing **`{ scroll: false }`** to `router.push` in the pro dashboard `setTab` (then the mobile `scrollIntoView` to `contentRef` stays put). (2) Renamed the client-activity sidebar group **"Cuando contrato" → "Contratar servicios"** in the pro dashboard sidebar header + the header account-menu group label (+ comments). Presentation only; `tsc` clean. Earlier sprint 101 — **context-aware profile fields (completeness counts only what applies)**. (1) **Aseguradoras only for HEALTH (es_salud) pros:** in `profile-editor.tsx` the Aseguradoras field now renders ONLY when `anyHealthCategory(professions)` is true (the section title flips "Idiomas y aseguradoras" ↔ "Idiomas"); a plumber/electrician never sees it and it's not part of their profile, so it can't count as "missing". (2) **Explicit "No trabajo con seguros":** `AseguradorasInput` gained a checkbox storing a sentinel `NO_INSURERS = "ninguna"` — choosing it means the field is ANSWERED (counts as complete), distinct from a blank one; it never appears in the /buscar aseguradora options (static `INSURERS` + admin-approved only) and never matches a filter, and chips hide the sentinel. (3) **Idiomas default to "Español":** languages seed `["Español"]` when a pro has none, so a Spanish-only professional is never penalized; extra languages are an optional bonus. PRINCIPLE recorded for any future "% completo" indicator: compute it from fields RELEVANT to that pro only — non-applicable fields are excluded entirely (not "missing"); any field where "ninguno/no aplica" is valid must offer that explicit choice and choosing it = complete. `tsc` + `next build` clean; no migration (sentinel stored in existing `insurance_networks`). Earlier sprint 100 — **account "Cuenta y seguridad" (change email + password, OAuth-aware)**. New reusable `src/components/account/account-security.tsx` `AccountSecuritySection` (`showHeading` prop): **Email** — change via `supabase.auth.updateUser({ email })` → confirmation email ("revisa tu bandeja"); **Password** — change via `updateUser({ password })` (min 8, confirm match, show/hide, success toast). **OAUTH-AWARE:** detects `app_metadata.provider` / non-email identities (Google/Facebook) and, instead of fields that wouldn't work, shows clear notes ("Iniciaste sesión con Google/Facebook. Tu correo se administra desde esa cuenta." / "…no usas una contraseña en ContrataCR."). Wired in: **client dashboard** "Mi perfil" tab (replaced the old inline email-only card — removed its now-dead state/`sendEmailChange`/OAuth consts), and the **unified pro dashboard** as a new standalone sidebar item **"Cuenta y seguridad"** (`tab=cuenta`, `Settings` icon, account-level, below Notificaciones) rendering `<AccountSecuritySection showHeading={false}/>` + `<CloseAccountSection/>`. Header **account dropdown** gained a "Cuenta y seguridad" link (pro → `?tab=cuenta`, client → `?tab=profile`). Friendly CR Spanish, no voseo; `tsc` + `next build` clean; no migration. Earlier sprint 99 — **Supabase email templates: no raw URLs — clean clickable links**. The link-based templates (`change-email`, `magic-link`, `reset-password`, `invite-user`) printed the full `{{ .ConfirmationURL }}` as visible text under "O copia y pega este enlace en tu navegador:" — replaced each with a short clickable fallback: **"¿No funciona el botón? <a href="{{ .ConfirmationURL }}">Abre este enlace</a>."** (URL is the href, never visible text). Primary action stays the branded button. `confirm-signup` + `reauthentication` are code-based (`{{ .Token }}`, no link) so they had no raw URL. All required variables preserved. **Paste targets:** Authentication → Email Templates → Change Email Address / Magic Link / Reset Password / Invite user. Branded design + Spanish (no voseo) intact. Earlier sprint 98 — **unified dashboard: "Mi panel" rename + mobile tap-to-section nav**. (1) Since the pro + client areas are unified, renamed **"Panel profesional" → "Mi panel"** everywhere in `landing-navbar.tsx` (header right action — was `isPro ? "Panel profesional" : "Mi panel"`, now always "Mi panel"; account-menu pro link now "Mi panel" with a `LayoutDashboard` icon; mobile drawer "Mi panel"). Destination unchanged (the unified `/dashboard/profesional`). (2) **Mobile dashboard navigation:** on mobile the pro dashboard's vertical sidebar stacks ABOVE the content, so tapping a menu item left the user on the menu. `setTab()` now, on `matchMedia("(max-width:1023px)")`, smooth-scrolls to the content (`contentRef.scrollIntoView`) after navigating; the content wrapper got `scroll-mt-20 lg:scroll-mt-0` so the fixed header doesn't cover the section title. Desktop unchanged (side-by-side). The client dashboard already had a top horizontal tab bar (content directly below), so no change there. Presentation/nav only; `tsc` + `next build` clean. Earlier sprint 97 — **fix mobile LEFT drawer (was rendering as a top panel + double X)**. ROOT CAUSE: the sprint-94 drawer + scrim lived **inside `<header>`**, which has `backdrop-blur-md`; `backdrop-filter` (like `filter`/`transform`) makes it the **containing block for `position:fixed` descendants**, so the drawer's `fixed top-0 left-0 bottom-0` resolved relative to the 64px-tall header box → it looked like a top-down panel and the `fixed inset-0` scrim only covered the header strip. FIX (presentation only): moved the scrim + drawer **OUTSIDE `<header>`** (now siblings of the header within the fragment) so `fixed` is viewport-relative → the drawer correctly slides in from the LEFT at `w-[84%] max-w-[360px]`, the scrim covers the whole viewport, and the page shows on the right. **Double-X fix:** the header hamburger used to flip to an X when open; it now **only opens** (always shows `Menu`, `onClick={() => setMobileOpen(true)}`), leaving the **single** X inside the drawer header. Slide (`-translate-x-full`↔`translate-x-0`, 300ms ease), swipe-left + scrim-tap + X close, body-scroll-lock — all unchanged. `tsc` + `next build` clean. Earlier sprint 96 — **confirm-signup email must be the 6-digit CODE, not a link (re-affirmed)**. The app confirms signup via **OTP code** — `supabase.auth.verifyOtp({ type: "signup" })` in `OtpVerification` ("Ingresa el código de 6 dígitos"), used by `registro/cliente`, `registro/profesional`, and the client-registration modal. Therefore the Supabase **Confirm signup** template MUST use **`{{ .Token }}`** (the 6-digit code), NEVER `{{ .ConfirmationURL }}` (a link) — a link email can't complete our code-entry flow. The repo template `supabase/email-templates/confirm-signup.html` is already the **code** version (shows `{{ .Token }}` in a large box, "Ingresa este código de 6 dígitos"); the live mismatch was the **Supabase dashboard** still holding the old link version → re-paste the repo HTML into Authentication → Email Templates → Confirm signup, subject `Tu código de confirmación · ContrataCR`. No app/repo code change (template already correct in repo). Earlier sprint 95 — **final pro-registration button copy → "Publicar mi perfil"**. Changed `registro.create` "Crear mi perfil gratis" → **"Publicar mi perfil"** (en "Publish my profile") and `registro.creating` → "Publicando perfil..." ("perfil" = what clients see; "publicar" = becomes visible). The button is the `flex-1` submit beside "Atrás" in `registro/profesional/page.tsx`; the shorter text fits cleanly with no truncation/awkward wrap down to ~360px. Copy only; `tsc` clean. Earlier sprint 94 — **mobile menu → slide-in LEFT drawer**. Replaced the old top-down accordion mobile menu (a `max-h` panel covering the screen) in `landing-navbar.tsx` with a standard **left side drawer**: a `fixed inset-0 bg-black/50` **scrim** (fades in, `pointer-events-none` when closed, tap-to-close) + a `fixed top-0 left-0 bottom-0 w-[84%] max-w-[360px]` **panel** that slides via **GPU transform** (`-translate-x-full` ↔ `translate-x-0`, `duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]`, `will-change-transform`), leaving part of the page visible on the right. Closes on **scrim tap, an X button** (drawer header, beside a home-linked logo), or **swipe-left** (`onTouchStart/End`, Δx < −55px). **Body scroll locked** while open (`document.body.style.overflow="hidden"` effect). Contents unchanged + role-aware (smart search, Categorías + "Ver todas", Recursos, ES/EN, logged-out login/registrarse, client/professional items). Presentation only; `tsc` + `next build` clean. Earlier sprint 93 — **logo always links to home (incl. collapsed/mobile header + footer)**. In the **compact/scrolled** header the `ContrataCRMark` was a `Link` but its 36px tap target was wedged at the screen edge beside the full-width search box and hard/impossible to tap on mobile; enlarged + raised it (`relative z-20 -ml-1 grid place-items-center p-1 rounded-lg active:bg-gray-100 touch-manipulation`) so it's a comfortable, reliably-tappable home link. The **footer** logo (`ContrataCRLogo`) was NOT a link — wrapped it in `<Link href="/">`. The full-header logo + login-modal logo were already home links. Now the logo navigates home in every state (full header, compact header, footer) on mobile + desktop. Presentation only; `tsc` clean. Earlier sprint 92 — **reduce redundant verification emails**. At professional registration the user was getting the OTP "Confirma tu correo" email AND, seconds later, an auto "¡Tu identidad fue verificada!" email — for an event that ALSO raises an in-app notification. Now: **registration-triggered verification = in-app notification ONLY (no email)**; the OTP email is untouched. `notifyVerificationDecision()` gained a `channel: "both" | "in_app"` param (default "both") — it always inserts the in-app notification but only emails when `channel === "both"`. `runIdentityVerification()` gained `notifyChannel` (passed through to the decision) + `isInitial`. The two registration call sites in `/api/register/professional` pass **`notifyChannel: "in_app"`** (the brand-new insert also `isInitial: true`). **External/later changes keep email + in-app** (unchanged, default "both"): admin decision (`/api/admin/providers/[id]/decision`), appeal (`/api/appeals`), add-cédula (`/api/add-cedula`), and the manual "verificar" panel action (`/api/verify-identity`) — the user may not be online then, so the email is useful. **No-duplicate-on-resave fix:** `runIdentityVerification` now only notifies when the verification **status actually changes** (`fromStatus !== newStatus`) OR it's the first run (`isInitial`); re-saving/editing an already-verified (or already-pending) pro no longer re-fires the "identidad verificada" email/notification. DB updates + verification logs unchanged; honest intermediary wording intact. `tsc` + `next build` clean; no migration. Earlier sprint 91 — **zone card: province name no longer truncated on mobile**. In "Encuentra profesionales en tu zona" (`find-by-zone.tsx`) the active-province header crammed the province name (with `truncate`) + status + "Ver profesionales" button onto one row, cutting "San José"→"San…" at narrow widths. Fixed by making the header **stack on mobile** (`flex-col sm:flex-row sm:items-center sm:justify-between gap-4`): the **MapPin + full province name + status** on their own line (removed `truncate` and the `min-w-0` clamps so the name always shows in full) and the **"Ver profesionales" button full-width below** (`w-full sm:w-auto justify-center`), reverting to a single row at `sm+`. Verified the longest names (Puntarenas/Guanacaste) fit. ALSO — the **"Así funciona ContrataCR"** section (`why-contratacr.tsx`) "Coordina por WhatsApp" point now uses the **official `WhatsAppIcon`** (was the generic lucide `MessageCircle`); it renders in `currentColor` so it stays brand-blue inside the monochrome tile (consistent with the serious-tone icon rule). Presentation only; `tsc` clean. Earlier sprint 90 — **responsive search placeholder (no clipping on mobile)**. The long placeholder "¿Qué servicio estás buscando?" was getting cut off in narrow inputs, so small screens now use a SHORT placeholder **"¿Qué necesitas?"** (en "What do you need?") while ≥sm keeps the long one. Added `landing.hero.searchPlaceholderShort` to `messages/{es,en}.json`; the **hero mobile** input (`landing-hero.tsx`, the `sm:hidden` stacked block) uses `t("searchPlaceholderShort")` while the desktop row keeps `t("searchPlaceholder")`; the **compact/scrolled header** input (`landing-navbar.tsx`) picks the placeholder via a `matchMedia("(max-width: 639px)")` `isSmallScreen` state (`isSmallScreen ? "¿Qué necesitas?" : "¿Qué servicio estás buscando?"`). Presentation only; `tsc` + `next build` clean. Earlier sprint 89 — **copy: "Convertirme en profesional" → "Ofrecer mis servicios" everywhere**. Renamed the client→professional CTA label across the header (desktop right action + account menu + mobile drawer in `landing-navbar.tsx`); the client dashboard already used "Ofrecer mis servicios" (sprint 88). Destination/flow unchanged (still → `/registro/profesional`, the convert flow). Design guide header section updated to mandate the "Ofrecer mis servicios" label. Text-only; `tsc` clean. Earlier sprint 88 — **unified professional dashboard (Mercado Libre-style: one account, labeled role groups) + role-tagged unified notifications**. A professional no longer switches between two panels — the **professional dashboard now contains EVERYTHING** in one place, with the sidebar split into two clearly-labeled groups: **"Mi perfil profesional"** (Mi perfil · Servicios · Casos de éxito · Disponibilidad · **Solicitudes recibidas** · **Proyectos recibidos** · Verificación) and **"Cuando contrato"** (**Mis solicitudes enviadas** · **Mis proyectos publicados** · **Mis favoritos**), plus a standalone **Notificaciones**. The received-vs-sent wording prevents role confusion (pro side "recibidas/recibidos", client side "enviadas/publicados"); each section title carries a one-line context subtitle. **Extraction:** the client area's bookings/projects/saved views moved into a new reusable `src/components/dashboard/client-activity.tsx` (`<ClientActivity section="bookings|projects|saved"/>`) — owns all the booking/project/proposal state + handlers + review modal (faithful move, same endpoints `/api/bookings|projects|proposals|reviews|report-professional`). Both the **plain client dashboard** (`/dashboard/cliente`, tabs Solicitudes/Proyectos/Guardados/Notificaciones/Mi perfil — kept as-is for non-pros, with "Ofrecer mis servicios" → convert) and the **unified pro dashboard** render `ClientActivity` for those sections (no duplicated logic). New pro tabs: `sent_bookings|sent_projects|saved` (+ relabeled `bookings`→"Solicitudes recibidas", `proposals`→"Proyectos recibidos"). **Unified notifications:** the stream is one `notifications` table keyed on `user_id` (already holds BOTH contexts). `lib/notification-link.ts` gained `notificationContext(type)` + `notificationContextLabel(type)` ("Como profesional"/"Como cliente"); the bell + `NotificationsList` now render a small **context tag** on every item (blue = profesional, purple = cliente) and `notificationHref(n, role)` is **role-aware** — for a professional, client-context notifications (and stored `data.link`s) route into the unified dashboard's "Cuando contrato" tabs (`sent_bookings`/`sent_projects`/`saved`); for a plain client, to `/dashboard/cliente`. Header account menu updated to match (pro client-area links → unified tabs, "Cuando contrato" heading; plain client unchanged). Badge counts unchanged (count of unread on the single stream). Pure reorganization/relabeling + unified-notification tagging — no new business logic, no migration; `tsc` + `next build` clean. Earlier sprint 87 — **content-accuracy review of /atraer-clientes, /ayuda, /como-funciona**. Corrected the information to match how ContrataCR actually works (intermediary; **identity verification confirms identity, NOT quality**; verified profiles **rank first** but **unverified pros DO appear** labeled "Identidad sin verificar"; coordination + payment off-platform via WhatsApp; free / no commissions for clients AND professionals). **/como-funciona FAQ:** rewrote "¿Es gratis…?" (free for both sides, no commissions, payment off-platform) and replaced "¿Cómo verifican…? — Solo aparecen una vez confirmada su identidad" (FALSE — contradicted sprint 61) with an accurate "¿Qué significa que un profesional esté verificado?" (padrón TSE, identity-not-quality, verified-first, unverified-still-appear). **/ayuda:** verification FAQ rewritten the same way ('Verificado'→'Identidad verificada', padrón TSE, ranking, unverified appear); "filtrar por calificación"→"ordenar por calificación"; help card "Verificación de cédula"→"Verificación de identidad". **/atraer-clientes:** (done in sprint 85) dropped the two fabricated stats and reframed cédula→identity verification. Text-only; `tsc` clean. Earlier sprint 86 — **single role-aware shared header app-wide + Categorías mega-menu w/ autocomplete + fixed category links + registro guard**. ONE header everywhere: there were TWO headers — the rich `LandingNavbar` (mega-menus) on marketing pages and a simpler `layout/navbar.tsx` `Navbar` (Buscar/Categorías/Cómo funciona) on dashboards/registro/login/etc. — so the nav was inconsistent (e.g. "Categorías" showed on some pages, Interior/Exterior on others). `Navbar` is now a **thin wrapper** that renders `<LandingNavbar/>` + the `h-16` spacer (LandingNavbar is `position:fixed`), so all ~13 `<Navbar/>` pages + the ~10 `<LandingNavbar/>` pages now show the **identical** header. **Header nav redesigned**: replaced Interior/Exterior/Más servicios/Recursos with a single **"Categorías" mega-menu** (a 680px panel: a **smart autocomplete search** at top + 3 curated columns — Hogar e interior / Exterior y jardín / Más servicios, every `id` verified against `categories.ts` — + "Ver todas las categorías" → /categorias), a **"Cómo funciona"** direct link, and a small **"Recursos"** dropdown (Cómo funciona · Centro de ayuda · Consejos para profesionales · Soporte). **Autocomplete** (`CategoryAutocomplete` + `matchCategories`): uses the existing accent-insensitive `searchCategories` and falls back to a small **edit-distance** match for typos; suggestions show label + group; ↑/↓/Enter keyboard nav; selecting jumps to `/buscar?categoria=<id>`, free text → `/buscar?q=`. Same autocomplete wired into the **compact/scrolled** header search (suggestions dropdown under the bar). **Category-link bug FIXED**: "Lavado a presión" AND "Impermeabilización" both pointed at `categoria=impermeabilizacion`; "Lavado a presión" isn't a real category in the taxonomy so it was **removed**, Impermeabilización keeps `impermeabilizacion`; audited every curated link → no two services share a wrong slug. **Role-aware states** (`role = user.user_metadata.role`, `isPro = role==="professional"`): LOGGED-OUT → "Iniciar sesión" + "Registrarse como profesional"; LOGGED-IN CLIENT → "Convertirme en profesional" + "Mi panel" (/dashboard/cliente) + bell + account menu (Mis solicitudes/Proyectos/Favoritos via `?tab=bookings|projects|saved` + Convertirme en profesional), NO "Iniciar sesión"; LOGGED-IN PROFESSIONAL → "Panel profesional" (/dashboard/profesional) + bell + account menu offering BOTH the pro panel AND the **client area** (Panel de cliente + Mis solicitudes/Proyectos/Favoritos), NO login/registrarse. **Professional = superset of client** (already true in the data model: client capabilities live in /dashboard/cliente which has no role gate, and `professionals` rows are keyed on `profile_id`; the header just exposes both). **Registro guard**: `/registro/profesional` now redirects a user who ALREADY has a `professionals` row to /dashboard/profesional (shows the existing `redirecting` loader); a client converting (no pro row yet) stays in the flow. Mobile drawer mirrors all of this (smart search + Categorías + Recursos + role-aware actions). `tsc` + `next build` clean; no migration. Earlier sprint 85 — **app-wide voseo removal (standard Spanish everywhere)**: swept the entire app and converted every remaining Costa Rican **voseo** form to standard Spanish — imperatives (Buscá→Busca, Publicá→Publica, Describí→Describe, Registrá→Registra, Usá→Usa, Verificá→Verifica, Respondé→Responde, Pedí→Pide, Escribí→Escribe, Completá→Completa, Agendá→Agenda, Coordiná→Coordina, Elegí→Elige, Creá→Crea, Empezá→Empieza, Actualizá→Actualiza), present-tense (Podés→Puedes, Necesitás→Necesitas, Querés→Quieres, Tenés→Tienes, Hacés→Haces, Elegís→Eliges, Describís→Describes, Sos→Eres, Coordinás→Coordinas, Aparecés→Apareces, Trabajás→Trabajas), pronouns/reflexives (vos→ti/tú, "cerca de vos"→"cerca de ti", Registrate→Regístrate, Escribinos→Escríbenos, Contactanos→Contáctanos, mencionalo→menciónalo, decilo→dilo, pedile→pídele, puedás→puedas, creés→crees, reportás→reportas, Debés→Debes). Files: `como-funciona`, `ayuda`, `atraer-clientes`, `categorias`, `completar-perfil` pages; `resources-section`, `landing-footer`, `app-section`, `phone-mockup`, `explore-tabs` landing comps; `booking-requests` (pro) + `admin/providers/[id]/decision` API. `messages/es.json` was already clean. **Migration seed strings left untouched** (immutable history — editing breaks Supabase checksums; runtime notification copy in code is clean). Also dropped TWO fabricated stats on /atraer-clientes ("hasta 3 veces más contactos", "El 95% de la coordinación… por WhatsApp" → honest non-numeric phrasing) and reframed "Verificá tu cédula"→"Verifica tu identidad" (verification confirms identity, not quality). Design guide §5 voseo rule expanded with present-tense + reflexive examples and a "no voseo anywhere, ever" line. Text-only; `tsc` clean. Earlier sprint 84 — **search placeholder copy**: changed the main search bar placeholder from "Describe tu proyecto…" to **"¿Qué servicio estás buscando?"** (es `landing.hero.searchPlaceholder`, en "What service are you looking for?", and the compact/scrolled bar's hardcoded placeholder in `landing-navbar.tsx`). Earlier sprint 83 — **borderless contact icons on /buscar cards**: removed the bordered boxes around the top-row WhatsApp/call icons in `professional-card.tsx` — now bare icons (~18px) in a `h-7 w-7` `rounded-full` tap target with a **hover-only** subtle circular highlight (WhatsApp `text-[#1ebe5d] hover:bg-[#25D366]/10`; call `text-[#6b7280] hover:bg-[#EBF5FB] hover:text-[#009FD9]`). Same position/actions/visibility; card height + full-width Solicitar unchanged. Earlier sprint 82 — **home animations ignore reduced-motion + rotating word starts with "Plomería"**. Removed `prefers-reduced-motion` gating from the **category carousel** (`category-carousel.tsx` — dropped the `reduced` ref/matchMedia; auto-scroll always runs) and the **hero rotating word** (`landing-hero.tsx` `RotatingLine` — dropped the `reduced` state + static fallback; always animates). Reordered `ROTATING_LINES` (es/en) to start with **Plomería** (Plomería · Electricidad · Limpieza · Jardinería · Pintura · Niñera · Mudanzas · Fumigación). Presentation only; `tsc`+`next build` clean. Earlier sprint 81 — **search bar: short placeholder + responsive fix**. Shortened `landing.hero.searchPlaceholder` (es/en) from the long "Describe tu proyecto o problema — sé tan detallado…" to **"Describe tu proyecto…"** (and the compact bar's hardcoded one). Rebuilt the **compact/scrolled header search** from an absolute-centered box over an absolute logo (which overlapped/clipped on mobile) into a **flex row**: `ContrataCRMark` (shrink-0) + a `flex-1 min-w-0` form centering a `max-w-5xl` box; input `flex-1 min-w-0`, "Ubicación" `hidden sm:flex`, **"Buscar" icon-only `<sm`** / text `sm+`. No clipping/overflow from ~360px up. Hero bar already stacks on mobile. Presentation only; `tsc`+`next build` clean. Earlier sprint 80 — **/buscar card refinements**: (1) ACTION LAYOUT — "Solicitar servicio" is now a **single full-width** button on every card; the WhatsApp + call **contact icons moved to the card's TOP row next to the name** (`ml-auto`, `h-7 w-7`) reusing existing space so the card doesn't get taller; contact-only cards show a **full-width "Solicitar por WhatsApp"**. Removed the old bottom secondary-icon row from `professional-schedule.tsx` (and its now-unused `Phone`/`telHref`/`canWhatsApp`). (2) WORDING — card verified mark "Verificado" → **"Identidad verificada"** (profiles already used it). (3) BUG — category chips showed the raw key `categories.otro`; added `otro` to `messages/{es,en}.json` AND a `catLabel()` fallback in `professional-card.tsx` (raw `categories.*` → `getCategoryLabel`). No business-logic changes (booking/map/ranking/casos/schedules intact). `tsc`+`next build` clean. Earlier sprint 79 — **fixed the clipped "Agrega una profesión" dropdown** (`CategorySearch`). The dropdown was `absolute` inside the accordion `Section`/card whose `overflow` cropped it. Now it **renders in a portal to `document.body`** with `position:fixed` positioning computed from the trigger's `getBoundingClientRect()` (recomputed on capture-`scroll`/`resize`), **flips up** when more room above than below, caps `max-height` to available space (list scrolls), `z-index:9999`. Outside-click checks the portaled `panelRef` too; input auto-focus moved to a rAF effect. All functionality intact (search, approved list, "¿No ves tu categoría?", PRINCIPAL, multi-profession). Fix applies everywhere `CategorySearch` is used (profile editor, publicar, registro). Presentation only; `tsc`+`next build` clean. Earlier sprint 78 — **branded Supabase auth email templates**. Added `supabase/email-templates/` (`confirm-signup`, `invite-user`, `magic-link`, `change-email`, `reset-password`, `reauthentication` + README) — table-based, inline-CSS, email-client-safe HTML in ContrataCR branding (navy `#162543` text, blue `#008ce0` buttons, white card on `#f4f7fa`). Logo is a **public PNG** hosted on Cloudinary (`contratacr/brand/email-logo` → `https://res.cloudinary.com/dxxrjx2go/image/upload/f_png,w_128/contratacr/brand/email-logo.png`). Spanish, no "vos"; required `{{ .ConfirmationURL }}`/`{{ .Token }}`/`{{ .Email }}`/`{{ .NewEmail }}` tokens preserved. Paste into Supabase → Authentication → Email Templates. No app code/build change. Earlier sprint 77 — **carousel mobile perf + new logo inside the phone mockup**. CAROUSEL (`category-carousel.tsx`): motion is now **time-based** (`pos -= 0.019px/ms * dt`, dt capped 50ms) → identical speed on 60/90/120Hz + resilient to dropped frames; **removed per-card `will-change`/3d** (was promoting ~38 cards to separate GPU layers → mobile jank) keeping it only on the moving track; images `loading="lazy"` + mobile-aware `sizes="(max-width:640px) 250px, 300px"` + base `w_600,h_400`; lighter shadow on mobile. PHONE (`phone-screens.tsx` `AppBar`): in-phone screen now shows the **NEW ContrataCR logo** — CR mark (`/logo-mark.png`) + "ContrataCR" wordmark in **Poppins** ("Contrata" navy + "CR" `#008ce0`), replacing the old text-only Inter/#009FD9 wordmark. Earlier sprint 76.1 — **bigger header logo**: `ContrataCRLogo` gained a `size` prop; the main header (`LandingNavbar` default row) now uses `size="lg"` (mark `h-8 sm:h-9`, wordmark `text-[19px] sm:text-[22px]`, `gap-2.5`) for proper brand presence within the `h-16` header; compact/scrolled mark bumped to `h-9 w-9`. Footer/legacy stay `md`. Crisp via the `@2x` mark. Earlier sprint 76 — **integrated brand assets from `/marca`**. **Favicons/PWA:** copied the full package to `/public` (`favicon.ico`, `favicon-96x96.png`, `apple-touch-icon.png` 180, `web-app-manifest-192/512.png`, `site.webmanifest`) + replaced `src/app/favicon.ico`; wired via `metadata` in `[locale]/layout.tsx` (icons + `manifest`). **Logo (SVG mark):** the raw `logo.svg`/`favicon.svg` are ~1.1 MB (embedded raster) so I generated a tiny transparent **`logo-mark.png`(+@2x)** from it for on-page use and kept `logo.svg` in `/public` for large needs. New `ContrataCRMark` + updated `ContrataCRLogo` (mark + wordmark, `chip` variant for dark footer) in `landing-navbar.tsx`; mark added to the **compact/scrolled header** (pinned left, search stays centered); footer uses `chip`. Both navbars + login/404 inherit the logo. **OG/social:** `metadataBase=https://contratacr.com`, `og:image=/og-image.png` (1200×630), og/twitter title "ContrataCR" + honest desc "Encuentra y contrata profesionales en Costa Rica", `summary_large_image`. Self-hosted; `tsc`+`next build` clean. Earlier sprint 75 — **polish the "Así funciona ContrataCR" phone section**: (1) removed the rounded glow box/container behind the phone — it now **floats** on the white section with only a subtle blurred **ground shadow**; (2) the left step icons are no longer heavy dark/grey circles → **light brand-tint tiles** (`bg-[#EBF5FB] text-[#009FD9] ring-1 ring-[#dcebf6]`); (3) **rebuilt `PhoneFrame`** to a premium realistic device — titanium metal rail + thin black bezel + crisp `rounded-[41px]` screen, dynamic island, side buttons, real status bar (signal/battery), layered shadows. Copy/layout/CTAs unchanged. Earlier sprint 74.2 — **"Así funciona ContrataCR" simplified to ONE phone** (was a 5-screen sticky-scroll). Now a static showcase: a single `PhoneFrame`+`ResultsScreen` (verified pros — the most representative screen) over a soft brand glow on one side, and ALL the info organized as a clean list (4 monochrome-icon points: Describe · Profesionales verificados · Coordina por WhatsApp · Soporte) + a professional pitch box ("¿Ofreces servicios?" → `SmartRegisterLink` + Cómo funciona) on the other. Phone shows first on mobile. Dropped the scroll/active-step logic → `why-contratacr.tsx` is now a server component. The single screen is swappable for a real video/screenshot later. Earlier sprint 74.1 — **folded the professional pitch into the sticky-phone section too** (all 3 sections now in one). Added a 5th scrolling point to `why-contratacr.tsx` — "¿Ofreces servicios? Haz crecer tu negocio" with a `SmartRegisterLink` "Registrarse como profesional" CTA + "Cómo funciona" link — and a 5th phone screen `ProScreen` (pro panel: verified-ranks-first badge, incoming solicitudes, "100% gratis · sin comisiones"). Section retitled "Así funciona ContrataCR" (clients + pros). Removed the standalone `GrowBusinessCta` from the home and **deleted `grow-business-cta.tsx` + `app-phone.tsx`** (now unused). Home content is now Hero → Carousel → Así funciona (sticky phone, 5 points) → CR map. Screens still swappable for real videos/screenshots. Earlier sprint 74 — **merged how-it-works + trust into ONE Thumbtack-style sticky-phone section**. User chose Opción A direction but asked to combine "Contrata en tres pasos" + "Contrata con tranquilidad" into a single phone-driven story (kept "Haz crecer tu negocio" separate — pro audience). New `why-contratacr.tsx` (client): 4 scrolling points (Describe · Compara verificados · Coordina por WhatsApp · Soporte) on the left, a **sticky phone on the right that swaps real app screens** per active point (deterministic rAF scroll calc; NO overflow-hidden ancestor so sticky works). Phone + screens in new `phone-screens.tsx` (PhoneFrame + Search/Results/Chat/Support, on-brand, swappable for videos later). Monochrome icons. Removed `how-it-works.tsx`, `how-it-works-rows.tsx`, `how-it-works-sticky.tsx`, `trust-benefits.tsx`, `step-screens.tsx` (superseded); the handshake cutout asset stays in Cloudinary, now unused. CR map (find-by-zone) untouched per user. Presentation only; `tsc`+`next build` clean. Earlier sprint 73 — **redesign Contrata en tres pasos (2 variants to compare) + Encuentra profesionales en tu zona (interactive CR map)**. **Tres pasos:** built TWO options now BOTH on the home (labeled "Opción A/B") for the user to choose — `how-it-works-rows.tsx` (Stripe/Linear alternating rows with real mock app screens) and `how-it-works-sticky.tsx` (sticky-scroll: steps scroll left, one visual swaps right via IntersectionObserver); shared mock screens in `step-screens.tsx` (Search/Results/WhatsApp-chat, on-brand). After the user picks, remove the loser + labels (old `how-it-works.tsx` still present, unused). **Tu zona:** `find-by-zone.tsx` rebuilt as an **interactive SVG map of Costa Rica** — 7 clickable provinces (`src/lib/data/cr-map-paths.ts`, generated from amCharts geodata, Cocos dropped) coloured by real coverage; click → panel shows that province's real cantones/count + Ver profesionales + Usar mi ubicación; touch pills mirror selection. All coverage/geolocation logic intact. Presentation only; `tsc`+`next build` clean; no migration. Earlier sprint 72.3 — **hero image → San José, Costa Rica cityscape + deal image HD + circle removed**. HERO_IMAGE now a high-res golden-hour aerial of San José self-hosted on Cloudinary (`contratacr/home/hero-sanjose.jpg`, 2400×1800, delivered `w_1600`), replacing the worker photo. The trust-section deal cutout was re-cut at **HD** (re-ingested a 3600px base — the 30MP original exceeded the bg-removal limit — then `e_background_removal` at w_1800; the earlier 1400px base caused the softness) and the **backdrop circle was removed** (only a subtle ground shadow remains; delivery bumped to `w_1100`). Earlier sprint 72.2 — **Contrata con tranquilidad image → user-provided "good deal" handshake**. Used the user's local file (`business-man-woman-black-suite-white-good-deal-concept.jpg`): uploaded to Cloudinary, removed the white background via `e_background_removal` (had to resize first — the 30MP source exceeded the add-on limit; re-ingested a 1400px base, then cut), verified visually, saved as `contratacr/home/deal-tranquilidad.png`. `PRO_IMAGE` now points there (alt = handshake/acuerdo); right-column container enlarged to fit the full-body two-person scene (`h-[380px] sm:h-[540px]`, bigger brand circle). Monochrome icons retained. Earlier sprint 72.1 — **serious tone pass on Contrata con tranquilidad**: swapped the cutout to a **composed professional in a blazer + glasses** (`contratacr/home/pro-tranquilidad.png`, re-cut via Cloudinary `e_background_removal`, CDN invalidated) and made the benefit-checklist icons **monochrome grey/black** (`bg-[#f3f4f6] text-[#1a2744]`, removed the colored tints). New design-guide rule: **serious/restrained icon tone — prefer no icons; if used, grey/black, not colorful** (brand/functional marks like green verification, rating star, WhatsApp green, brand CTA exempt). Earlier sprint 72 — **Contrata con tranquilidad → Handy-style split with a cutout professional**. Replaced the bento with a clean two-column: left = eyebrow + heading + 4 benefits as a **checklist** (tinted icon tiles) + "Explorar profesionales" → /buscar CTA; right = a **transparent-PNG cutout** of a friendly professional on a soft brand circle/glow backdrop (`object-contain object-bottom`, drop shadow), swappable via `PRO_IMAGE` constant. The cutout was sourced from an Unsplash photo, background removed via **Cloudinary `e_background_removal`** (AI add-on confirmed enabled on cloud `dxxrjx2go`), visually verified, and re-ingested as flat PNG `contratacr/home/pro-tranquilidad.png`. Design guide gained the **cutout-image pattern** (Cloudinary bg-removal → verify by viewing → re-ingest; place over a soft shape, never a rectangle). Presentation only; `tsc`+`next build` clean; no migration. Earlier sprint 71 — **premium polish of 3 home sections** to the grow-business/phone quality bar. **Cómo funciona** (`how-it-works.tsx`): gradient progress path threading **glowing gradient icon nodes** (ring-6 white, blurred glow) + white connector dot/`ArrowRight` between steps; elevated cards w/ ghost numeral + `Paso NN` pill. **Trust** (`trust-benefits.tsx`): bento featured pillar now has a **shield watermark** + honest detail chips (Cédula validada / Registro oficial), glowing icon tiles, dual radial glows. **Find-by-zone** (`find-by-zone.tsx`): `rounded-[28px]` panel, dark `#111a2e` rail with **radar-rings + MapPin watermark + glow** motif, glowing geolocation button; right pane gets **gradient active province tab**, province header icon tile + green coverage count, cantón chips with status dots. All logic/handlers/coverage unchanged. Presentation only; `tsc`+`next build` clean. Earlier sprint 70 — **hero rotating word → PER-LETTER staggered vertical slide-up**. `landing-hero.tsx` `RotatingLine`: each letter rises from below in sequence (left→right, `STAGGER_MS=46`, `LETTER_MS=520` springy `cubic-bezier(0.16,1,0.3,1)`), word holds ~1.4s, letters slide up and out staggered, next word enters. Per-letter `inline-block` spans keyed `${index}-${i}` inside a `flex justify-center overflow-hidden` mask (`1.18em` tall); state machine (`shown`/`leaving`) driven by rAF×2 + timeouts. Centered, no layout shift, no caret. Reduced-motion → static word. Presentation only; `tsc`+`next build` clean. Earlier sprint 69 — **four home sections redesigned distinct + real-app phone mockup**. The four sections no longer share one card pattern: **Cómo funciona** (`how-it-works.tsx`) is now a typographic journey — oversized **ghost numerals** (`text-[7rem]` at 4% opacity) behind each step + gradient icon node on a faint path line, asymmetric header. **Trust** (`trust-benefits.tsx`) is an **asymmetric BENTO** — a large dark-green featured pillar (Identidad verificada) spanning 2 cols, two small white pillars (Reseñas/WhatsApp), a wide support card spanning 2 cols. **Find-by-zone** kept (dark interactive). **Grow-business** (`grow-business-cta.tsx`) is now a dark **product showcase** with a **fixed phone mockup of the real app** (new `app-phone.tsx`): clean iPhone frame whose in-phone screen is swappable via one `PHONE_SCREEN={src,alt}` constant (self-hosted Cloudinary screenshot), with a faithful on-brand /buscar JSX placeholder (result cards w/ Verificado, rating, "Desde ₡…", Solicitar servicio + WhatsApp) until a real screenshot is set. All staggered `FadeInUp` reveals + hover lifts; no false claims; presentation only; `tsc`+`next build` clean. Earlier sprint 68 — **hero rotating word → VERTICAL SLIDE-UP (masked roll)**, replacing the typewriter. `landing-hero.tsx` `RotatingLine` now is a slot-machine roll: a vertically-stacked column of all words inside a clipping mask (`overflow-hidden`, `1.18em` tall) moved by `translateY(-index·1.18em)` with a springy `cubic-bezier(0.16,1,0.3,1)` ~620ms ease; each word holds ~2.2s. Whole word slides up from below, holds, slides up and out as the next rolls in. Seamless loop via a cloned first word + no-transition snap back to 0 (rAF×2). Words `flex justify-center` → centered above static "sin complicaciones." with no layout shift. No typewriter, no caret. Reduced-motion → static word. Presentation only; `tsc`+`next build` clean. Earlier sprint 67.1 — **hero typewriter: removed the cursor + centered the word**. Dropped the blinking caret `|` entirely (and its `.tw-caret`/`caret-blink` CSS) — letters now type in then un-type cleanly with no pipe. The rotating word is rendered as a plain centered line (`text-center` from the `h1`, `min-height:1.1em` to hold the row), so it stays horizontally centered above "sin complicaciones." with no layout shift (removed the old invisible-sizer/absolute-left-aligned wrapper). Reduced-motion still shows a static word. Presentation only; `tsc`+`next build` clean. Earlier sprint 67 — **hero rotating word → TYPEWRITER effect** (`landing-hero.tsx` `RotatingLine`). Replaced the fade/slide with a typewriter: types each word letter-by-letter (~78ms), holds ~1.5s, deletes (~42ms), ~380ms gap, next word — with a **blinking caret `|`** (globals.css `caret-blink`). Same word list (Limpieza/Plomería/…/Fumigación); "`, sin complicaciones`" stays static. **No layout jump** (invisible sizer reserves the widest word's width, typed text left-aligned inside). **Reduced-motion** → static word + steady caret. Presentation only; `tsc`+`next build` clean. Earlier sprint 66 — **elevated the two flat home sections to premium depth** (presentation only). **Cómo funciona (`how-it-works.tsx`)** is now a connected **journey**, not 3 isolated boxes: a horizontal gradient "path" line + `ChevronRight` connectors link 1→2→3, each step leads with a **large gradient number disc** sitting on the path above an elevated `rounded-3xl` card (hover lift), with **staggered scroll reveals** (`FadeInUp delay={i*130}`); section bg `from-white to-[#eef4f9]` + soft radial glow. **Trust (`trust-benefits.tsx`)** pillars are now prominent: bold **gradient icon tiles** (`h-16 w-16`) per pillar color (verde/ámbar/WhatsApp/marca) + top accent bar + radial glow behind icon, `hover:-translate-y-2` + `group-hover:scale-105`, staggered reveals; section bg `from-[#eef4f9] to-white`. Removed the outer `FadeInUp` wrappers for these two in `page.tsx` (they self-reveal per item). Dark sections (find-by-zone, grow-business) kept as the quality bar. New design-guide **DEPTH/CONTRAST standard** documented. `tsc`+`next build` clean. Earlier sprint 65.2 — **carousel card refinements to match Bark**: slowed the auto-glide (`AUTO_SPEED` 0.5→0.32 px/frame, ~19px/s); cards changed from square to **landscape rectangle** `w-[248px] h-[168px] sm:w-[300px] sm:h-[200px]` (~3:2, Cloudinary crop `w_640,h_440`); corners less rounded (`rounded-2xl`→`rounded-lg`); **hover now scales the whole card up** (`hover:scale-[1.04] hover:z-10`, eased `transition-transform`) instead of the `card-lift` shadow/translateY + inner image zoom. Everything else (single zigzag track, auto+arrows+drag, no on-screen dups, reduced-motion, click→/buscar) unchanged. Presentation only; `tsc`+`next build` clean. Earlier sprint 65.1 — **carousel actually moves + square larger cards**. The auto-scroll was dead because it incremented native `scrollLeft` by a sub-pixel/frame, which browsers round to integers → never accumulates. Rewrote motion to be **TRANSFORM-based**: a float `translateX` accumulator (`pos`) advanced ~0.5px/frame via rAF, wrapped into `[-half, 0]` (`half = scrollWidth/2`, re-measured with `ResizeObserver` as images paint). Arrows now work (eased rAF tween of `pos`); drag/swipe update the same `pos` (pointer events; `touch-action: pan-y`; viewport `overflow:hidden`). Auto pauses on hover/drag/tween, resumes; reduced-motion disables auto only. Cards are now **uniform SQUARE** and larger: `w-[220px] h-[220px] sm:w-[264px] sm:h-[264px]` (1:1), Cloudinary square crop `w_600,h_600`, zigzag `translateY(±20px)`. Presentation only; `tsc`+`next build` clean. Earlier sprint 65 — **category carousel rebuilt as ONE staggered (zigzag) track** (previous two-row interpretation was wrong). New client component `category-carousel.tsx` (used by `pros-section.tsx`): a SINGLE horizontal scroller where all 19 categories sit in one track that moves as a unit; the alternating up/down offset (`translateY(±18px)` even/odd) is purely visual zigzag. **Auto-scroll** via rAF advancing `scrollLeft` (~0.45px/frame, seamless loop by keeping `scrollLeft` within `scrollWidth/2`) PLUS **manual control** — mouse drag (pointer events, drag suppresses the trailing click), touch swipe (native `overflow-x`), and **left/right arrow buttons** (`scrollBy`, desktop only). Auto **pauses on hover/interaction**, resumes after; **`prefers-reduced-motion` → no auto-scroll** (manual still works). Cards uniform fixed size `w-[200px] sm:w-[248px] h-[150px] sm:h-[186px]`, `line-clamp-2` labels, `card-lift` hover, ONE Cloudinary image each, → `/buscar?categoria=<id>`. Because it's ONE track with all categories, a set is far wider than any viewport so the off-screen duplicate never shows. globals.css `.cat-carousel` now a hidden-scrollbar `overflow-x` scroller (replaced the old two-row `cat-track--left/right` keyframes). Presentation only; `tsc`+`next build` clean; no migration. Earlier sprint 64.1 — **carousel on-screen-duplicate fix**: the visible repeat (e.g. "DJ y sonido" twice) on ultra-wide ~2558px monitors was because a 9-card row (~2300px) was NARROWER than the viewport, so the seamless-loop's off-screen copy bled into view. Fixed by enlarging the uniform cards to Bark-like `w-[230px] sm:w-[284px] h-[160px] sm:h-[196px]` with `mr-4 sm:mr-7` spacing → each row's single set is now ~2800–3120px, comfortably wider than an ultra-wide screen, so the duplicate stays off-screen. Cards remain identical fixed size (no flex-auto); rows still distinct sets + opposite directions. Presentation only; `tsc`+`next build` clean. Earlier sprint 64 — **new home sections + carousel fix**. Added four sections to the home (Claude-Design references, real tokens): **(1) Cómo funciona — "Contrata en tres pasos"** (`how-it-works.tsx`, 3 numbered cards: Describe tu proyecto · Compara profesionales · Coordina y contrata); **(2) Trust — "Contrata con tranquilidad"** (`trust-benefits.tsx` restyled with eyebrow chip + colored icon tiles — verificada green / reseñas amber / WhatsApp green / soporte brand); **(3) Find-by-zone — "Encuentra profesionales en tu zona"** (`find-by-zone.tsx`, client: dark "¿Dónde lo necesitas?" rail with **"Usar mi ubicación"** geolocation → `/buscar?sortBy=cercania&lat&lng` + honest disclaimer; white pane with 7 province tabs → REAL cantón chips → `/buscar?provincia&canton`); **(4) CTA profesional — "Haz crecer tu negocio con ContrataCR"** (`grow-business-cta.tsx`, dark panel: session-aware `SmartRegisterLink` "Registrarse como profesional" + "Cómo funciona", 3 honest perks). **NO FALSE COVERAGE DATA:** new server query **`getZoneCoverage()`** (in `professionals.ts`) computes per-province covered cantones from real data (fixed `canton_id`/`provincia_id` + `search_cantones`/`search_provincias` + `coverage_provincias` + `coverage_country`); the count + chips show only genuinely-covered cantones, hidden when zero (honest empty state). Home `page.tsx` is now `async` (fetches coverage). Old `trusted-provinces.tsx` deleted. **Carousel fixes (`pros-section.tsx` + globals.css):** rows now drift in CLEARLY OPPOSITE directions (top LEFT `0→-50%`, bottom RIGHT `-50%→0`); **uniform fixed card size** (`w-[200px] sm:w-[236px] h-[150px] sm:h-[164px]`, long labels `line-clamp-2`, never widen); **no on-screen duplicates** — the two rows hold DISTINCT category sets and spacing is a per-card **right-margin (not flex gap)** so `translateX(-50%)` is pixel-exact; ~70s desktop / ~48s mobile, pause-on-hover, reduced-motion safe. Presentation only; `tsc` + `next build` clean; no migration. Earlier sprint 63 — **home category carousel (Bark-style two-row band)**: the "Profesionales para cada proyecto" section (`pros-section`) is now a **full-bleed, two-row auto-scrolling marquee** — top row drifts LEFT, bottom row drifts RIGHT, both slow/continuous (CSS `transform` keyframes `cat-scroll-left`/`cat-scroll-right` in globals.css, ~64s desktop / ~46s mobile, `linear infinite`), **pauses on hover**, **respects `prefers-reduced-motion`** (→ plain horizontal scroll). Each row renders its cards **twice** for a seamless `-50%` loop (duplicate set `aria-hidden`); soft **edge mask** fades cards at the rails. **All cards identical** (fixed `w-[210px] sm:w-[244px] h-[150px] sm:h-[168px]`, `rounded-2xl`, soft shadow, same `card-lift` + image zoom hover), each links to `/buscar?categoria=<id>`, labels via `getCategoryLabel`, ONE self-hosted Cloudinary image each (`contratacr/categorias/<id>`). **No "Disponible en línea"/"available online" badge anywhere.** Presentation only; no logic. `tsc` + `next build` clean; no migration. Earlier sprint 62.2 — **/buscar header consistency + card hierarchy**: /buscar now uses the app-wide **`LandingNavbar`** (same header everywhere; `h-16` spacer for the fixed header); **"Verificado" moved to the right of the NAME** as a subtle green `ShieldCheck`+label (not a pill), unverified → amber "Sin verificar"; profession tags are now **soft muted pills capped at 2** (no wall of brand-bordered chips); icons kept small/uniform (lucide + official WhatsApp). Earlier sprint 62.1 — **/buscar card tweaks**: favorite/bookmark smaller + subtle (`w-7`) and pinned so it never overlaps the price; WhatsApp + llamar kept as **small square secondary icon-buttons** next to "Solicitar servicio" (shown when enabled, official WhatsApp icon, one-tap). Earlier sprint 62 — **/buscar result cards + availability redesigned** (visual layer only, from a Claude-Design reference; all functionality preserved). Cards are now `rounded-2xl` two-zone with **content-driven `md:min-h-[190px]`** (not fixed height): identity zone (52px avatar · name · verification pill + business · profession **pills** `+N` · one-star rating · location/coverage lines · "Ver casos de éxito") and an action zone with a **"Desde ₡…/hora" price header** + the availability panel. Availability now shows **packed day columns** (only days with slots, uppercase `Hoy`/`Mañana`/`Jue 11`, brand when soon), brand-tint time chips + **dashed `+N`**, a **location dropdown** when multi-location, chevron paging, "Ver horario completo" + "Solicitar servicio". Number badge inset top-left. ALL wiring intact (numbered cards↔pins + `ring-2` pin-hover highlight, one-click slot→booking pre-selected, filters/sort, "Solo identidad verificada" + verified-first, favorites, verified vs "sin verificar" labels, private/contact-only, WhatsApp/llamar). Reference folder `design/buscar` deleted. No migration. Earlier sprint 61 — **verification gating relaxed: unverified professionals can use the app, clearly labeled, verified ranked first**. No-ID / "¿No es tu información?" pros (no_cr_id / pending / under_appeal) are no longer hidden from /buscar — they appear with an explicit amber **"Identidad sin verificar"** label (vs green "Identidad verificada"), and `searchProfessionals` ranks **verified above unverified** across every sort (stable JS pass + DB `is_verified` order); only `rejected`/banned/disabled stay hidden. Booking modal shows an honest notice for unverified pros; the pro panel reframes "pending" as "Identidad sin verificar · visible para clientes" with the verify path (add cédula → padrón; appeals/admin unchanged); the single "Solo identidad verificada" filter is kept. Intermediary framing — ContrataCR only displays status, no endorsement. No migration (gating was in-query; RLS already public). Earlier sprint 60 — **categories finalized + consistent + home images self-hosted on Cloudinary**. Locked taxonomy = the existing 12-group `CATEGORY_GROUPS` in `src/lib/data/categories.ts` (CR-tailored, no foreign categories) — kept as-is, **no DB migration needed** (already seeded by migrations 001/013; category FKs on professionals/projects are dropped). `categories.ts` is the **single source of truth**; user-facing surfaces already read from it (home, mega-menu, /buscar filter via `category-search`, Publicar, profile `services-editor`, suggest, Ayuda). **Zones (7 provinces) untouched.** Home category section (`pros-section`) rebuilt → grid of **19 category cards, ONE self-hosted Cloudinary image each** (`contratacr/categorias/<id>`, cloud `dxxrjx2go`, `f_auto,q_auto,c_fill,g_auto`), labels via `getCategoryLabel`, + "Ver todas las categorías" → /categorias (replaced its own list + 80 hotlinked Unsplash URLs). `next build` clean. Earlier sprint 59 — **home honesty + scroll + trust** (HOME + shared header; no logic). HEADER scroll now collapses to **ONLY a centered compact search bar** (logo/nav/buttons hidden, rounded pill) — Thumbtack-style. HERO image is now a **single swappable `HERO_IMAGE` constant** (placeholder = a CR service worker, not a house). **Removed the false coverage claim** "No te preocupés… cubrimos cada provincia y cantón" and the "en toda Costa Rica" heading → honest **zones** block ("Encuentra profesionales en tu zona", province chips → `/buscar?provincia=<id>`, no coverage promise). New **TrustBenefits** section — 4 client-benefit pillars (identidad verificada · reseñas reales · coordina por WhatsApp · soporte), no invented numbers. Swept **"vos"** out of the header (nav "Registra tu perfil"; login modal). `next build` clean; no migration. Earlier sprint 58 — **Thumbtack-style home header + hero polish** (HOME + shared header only; no logic). HEADER (`landing-navbar`) is now **full-width** (dropped `mx-auto max-w-7xl`) so the logo sits flush far-left with the nav menus right after; right actions already in the target order (Registrarse como profesional pill · Iniciar sesión · ES/EN); scroll-to-compact-search kept. HERO (`landing-hero`): rotating-word list refined to the highest-demand CR services — **Limpieza · Plomería · Electricidad · Jardinería · Pintura · Niñera · Mudanzas · Fumigación** (es+en), kept the smooth fade/slide; headline stays "`<servicio>`, sin complicaciones." + subtitle "Describe tu proyecto y te conectamos con el profesional perfecto." (already no-"vos"); replaced the US-style house hero image with **one fixed Costa-Rican service-worker photo** in the same dome shape (not rotating). `next build` clean; no migration. Earlier sprint 57 — **home cleanup + legal pages** (no logic touched). HOME (`page.tsx`) trimmed to **Hero · ProsSection · TrustedProvinces** — removed the brand-logo strip (`MarqueeStrip`), "Por qué los clientes eligen ContrataCR" (`PhoneMockupSection`), "Explora más proyectos" (`ExploreTabs`), "Recursos útiles" (`ResourcesSection`) and "La app que necesitas para todo" (`AppSection`); those component files remain but are no longer imported. FOOTER (`landing-footer`) bottom bar now links **Términos y Condiciones** + **Política de Privacidad**. **`/terminos` and `/privacidad` rebuilt** to a clean legal-document layout (amber **draft banner** — borrador pendiente de revisión por abogado CR, not legal advice — + "Contenido" table of contents with anchors + numbered `<section id>` with `scroll-mt-24`); content is a **BASE DRAFT pending legal review**, ContrataCR-specific, intermediary framing + Ley 8968/minimization, no-"vos". `next build` clean; no migration. Earlier sprint 56 — **reverted the Bark.com home/header experiment** back to the pre-Bark state (`c57ff80`, the sprint-53 baseline-revert). `git checkout c57ff80 -- src/app/[locale]/page.tsx src/components/landing/landing-navbar.tsx contratacr-design-guide.md` + deleted `src/components/landing/bark-home.tsx`. Home is again the baseline composition (LandingHero/MarqueeStrip/ProsSection/PhoneMockupSection/ExploreTabs/ResourcesSection/TrustedProvinces/AppSection); the header is back to the multi-menu `LandingNavbar` (Interior/Exterior/Más servicios/Recursos) with its scroll-to-compact-search; the design guide's home/header sections are back to their pre-Bark text. Sprints 54–55 (Bark home + corrections) are thus superseded/rolled back. `next build` clean; no migration; /buscar, panels, booking untouched. Earlier sprint 55 — **corrected the Bark match on the HOME + shared HEADER** (no logic touched). HEADER (`landing-navbar`) is now minimal Bark-style: logo · a **single "Categorías" mega-menu** (replaces the old Interior/Exterior/Más servicios/Recursos menus — Explore-style: groups list that sets an active group on hover · that group's items → `/buscar?categoria=` · "Servicios populares" · "Ver todas" → /categorias) · right side **"Iniciar sesión" + pill "Únete como profesional"**; logged-in state (Mi panel/notifications/avatar/idioma) kept; scroll past hero still condenses to a compact **"Busca un servicio…"** bar. HOME (`bark-home`): copy de-vos'd ("Encuentra al profesional perfecto para ti", "Recibe cotizaciones gratis en minutos", "¿Qué servicio buscas?"); hero location field is now a **typeahead** over provincias+cantones (no postcode); **removed all "Disponible en línea" badges**; **all category cards now share ONE uniform design + hover**; the auto-scroll carousel is now **two slow rows drifting in opposite directions** (eased, pause-on-hover, reduced-motion safe) instead of one fast strip; **removed the "Categorías más populares" section** (deferred to post-launch — avoid promoting categories with no professional coverage). `next build` clean. Earlier sprint 54 — **new home page modeled on Bark.com's structure, with ContrataCR content** (replaces the reverted baseline home). New `src/components/landing/bark-home.tsx` (client) composed by `page.tsx` with the existing `LandingNavbar`/`LandingFooter`: a centered hero ("Encontrá al profesional perfecto para vos" + "Recibí cotizaciones gratis en minutos") with a service+provincia search → `/buscar`, an **auto-scrolling category marquee** (slow infinite CSS loop, pause on hover, `prefers-reduced-motion` safe), four **grouped service sections** (Hogar y jardín · Salud y bienestar · Bodas y eventos · Servicios para empresas) of photo cards with "Ver todas", and a **"Categorías más populares" arrow carousel**. Cards are Unsplash photos (allowed in `next.config`; ids validated) linking to `/buscar?categoria=`, with a "Disponible en línea" badge on online services. The **navbar already reveals a compact "Buscar" search field on scroll** (its `hero-search-sentinel` IntersectionObserver) — kept the sentinel in the new hero. `next build` clean; no migration. `/buscar`, panels and booking untouched. Earlier sprint 53 — **git-reverted the design-guide redesign of the marketing/landing surface back to the pre-design baseline `6925b1c`** (supersedes sprint 52's restyle). `git checkout 6925b1c --` restored home (`page.tsx` + `landing-hero`, and the old sections it composes: `pros-section`/`phone-mockup`/`explore-tabs`/`marquee-strip`/`resources-section`/`trusted-provinces`/`app-section`), `como-funciona`, `categorias`, `ayuda`, `atraer-clientes`, `not-found`, plus `landing-navbar` and `landing-footer`; deleted the net-new marketing pages `para-profesionales` + `sobre-nosotros` and the new home components `home-sections.tsx`/`pro-cta.tsx`. **KEPT exactly as-is (not reverted): `/buscar`, the client + professional panels/dashboards, the booking/"Solicitar servicio" flow** — plus everything they depend on: `messages/es.json`/`en.json` (shared copy + /buscar sort labels), all auth/registration/api/maps/ui/admin code, `profesionales/[slug]`, and the soporte ticket backend. **`terminos` + `privacidad` kept** (new pages, but the kept registration flow links to them — deleting would 404). Note: this reverts the shared global footer too, so the footer below /buscar+panels returns to its pre-design form (their own content/functionality untouched). `next build` clean. No migration. Earlier sprint 51 — **"Contactar soporte" now creates an admin ticket** (new `support_tickets` table + Admin → Soporte queue; form prefills logged-in users, works for guests, WhatsApp for urgent) — **run migration `039_support_tickets.sql`**. Sprints 45-50 redesigned the public site to the design guide: ¿Cómo funciona? (two-audience flow + trust), Categorías (live search + suggest), new `/para-profesionales` recruitment landing, global header/footer + legal/about pages (Sobre nosotros/Términos/Privacidad) + friendlier 404, Centro de ayuda (searchable grouped FAQ), and Consejos para profesionales — all no-"vos", session-aware CTAs, subtle reveals. Earlier sprint 44 — **home page refocused** (less-is-more): removed the phone mockups, the "Muy pronto" app-store section, the unaffiliated brand-logo marquee, and editorial filler; kept/refined Hero (search + honest trust chips, mansion photo → subtle brand glow), Servicios populares (icon grid), Así de fácil (3 steps), Por qué ContrataCR (trust), and a session-aware professional CTA — no logic touched. Sprint 43 — Disponibilidad "Agregar horarios" tidy (removed presets row + obvious preview, sensible hora-puntual default). Sprint 42 — **/buscar redesigned to a full-width 3-column directory** (filters sidebar · results · larger map; `max-w-7xl`→`max-w-[1920px]`) with **uniform fixed-height result cards** (`md:h-[216px]`+`overflow-hidden`, actions pinned to the bottom, featured→inline chip, "Verificado" badge) and a new **"Ordenar por"** set (Mejor calificados · Precio de menor a mayor · Disponibilidad inmediata · Cercanía); all search functionality preserved (numbered pins, hover preview, one-click booking, verified filter, cerca de mí, favorites). No migration. See "Sprint 42" below. Earlier sprint 41 — app-wide cleanup following the design guide: rewrote ALL "vos" conjugations to standard CR Spanish (~420 fixes/~70 files — "Describe/Agrega/Elige", "puedes/quieres/tienes", "Inicia sesión", "cerca de ti"); required-field asterisks ("¿Para quién es la cita? *"); category input now typeable+selectable with "¿No ves tu categoría?" in BOTH Publicar proyecto and the /buscar filter (shared CategorySearch); published projects show their category chip (client + pro views); /buscar — full "Busca un servicio…" placeholder, "Buscar profesionales cerca de mí", private-availability notice moved to a compact inline chip (no extra card height); pro panel header shows account status (Identidad verificada / Pendiente de revisión) instead of the profession + "Ver cómo me ven los clientes"; reviews trust label reworded + duplicate casos-de-éxito images removed (shown once); booking "Sin comisiones" chips replaced with a client-useful "Qué sigue" list. No migration. See "Sprint 41" below. Earlier sprint 40 — created **contratacr-design-guide.md**, the mandatory single source of UI/UX direction (read it before ANY UI work) + a deeper presentation-only **Disponibilidad redesign** following it: privada + videoconsulta toggles merged into one settings card (less top noise), "Agregar horarios" made an obvious 2-step flow (profesión+ubicación grid, then presets above the Fecha·Desde→Hasta·Intervalo row, **Generar on its own row**), the duplicate end-after-start warning removed (ONE inline error on "Hasta", Generar clearly disabled), no-"vos" copy — NO scheduling/validation/save changes. No migration. See "Sprint 40" below. Earlier sprint 39 — professional "Disponibilidad" presentation-only polish: rewrote the contradictory "Disponibilidad privada" copy, made "Generar" read clearly disabled (solid gray + explicit "ajustá la hora de fin" reason) when the range is invalid, grouped "Tus horarios próximos" chips by Mañana/Tarde/Noche for easy scanning, tighter spacing — NO scheduling/validation/save changes. No migration. See "Sprint 39" below. Earlier sprint 38 — professional "Mi perfil" presentation-only polish: grouped the long form into collapsible sections (Datos básicos · Profesión · Ubicación y cobertura · Contacto y precios · Idiomas y aseguradoras), unified the work-location copy into ONE add-flow, added a "Todo el país makes narrower zones redundant" note, compacted the workplaces map (220→168 via optional mapHeight prop, registration unchanged), tighter spacing/clearer CR copy — NO logic/validation/save changes. No migration. See "Sprint 38" below. Earlier sprint 37 — client dashboard presentation-only polish: "Buscar profesionales" primary action surfaced in the header, tighter spacing (py-6, smaller tab nav, p-4 cards), friendlier CR empty states, Profile tab cleaned up (photo+name+phone merged into one card, consistent spacing), "Dejar reseña" copy consistency — NO logic/data/permission/functionality changes. No migration. See "Sprint 37" below. Earlier sprint 36 — /buscar moved to a 3-column layout: sticky filters SIDEBAR (xl+) · results list · sticky map, so the tall top filter block no longer pushes results down (more pros in the first viewport); below xl the filters collapse into a "Filtros" slide-over drawer, below lg a List/Map toggle; SearchFilters restyled as a vertical sidebar; private-availability shown as a flush top band on the card (compact WhatsApp/llamar actions, no floating paragraph); subtler "+N" indicator + narrower availability column + balanced map width; all functionality preserved. No migration. See "Sprint 36" below. Earlier sprint 35 — /buscar professional result cards redesigned for a clean, dense, uniform directory feel: bounded left column (48px avatar, name+price header, verified pill inlined with capped profession chips +N overflow), ONE consolidated location/coverage line replacing the ragged province/cantón/workplaces/coverage/bio stack (bio dropped), compact casos link, tighter availability panel with WhatsApp+Llamar side-by-side; all info + functionality preserved (number↔pin, pin hover, one-click slot booking, verified filter, sorting), responsive with no favorite/price overlap; TimeSelect shows AM/PM not a.m./p.m. No migration. See "Sprint 35" below. Earlier sprint 34 — redesigned Desde/Hasta time picker (shared TimeSelect: 12h labels with intrinsic a.m./p.m. that flips across noon) + explicit validation (end-after-start inline message, no silent "Generar" no-op, CR future/15-min lead surfaced); "Tus horarios próximos" groups + labels each block by profesión + ubicación (resolves coverage/videoconsulta labels); /buscar keeps ONE professional card with location chips/tabs (defaults to first place + "Horarios de <servicio> · <lugar>" caption) and the picked slot's (service + location) flows into the booking — recorded on bookings.category_id/slot_location_id/slot_location_label, shown to the pro, added to the WhatsApp message. Run migration 038. See "Sprint 34" below. Earlier sprint 33 — app-wide required/optional field convention: required fields show red "*", optional show "(opcional)", no empty submits (friendly Spanish inline errors), correct per-field validation; the account holder's PHONE is now REQUIRED across client + professional registration, completar-perfil, the booking complete-profile step and the pro profile editor (only the third-party/beneficiary phone stays optional); specific fixes — client correo/contraseña/confirmar "*", cantón "(opcional)", pro "Confirmar contraseña *", plus a sweep of booking/proyecto/proposals/profile-editor/close-account. No migration. See "Sprint 33" below. Earlier sprint 32 — schedules now belong to a (profession/service + location) pair (migration 037 availability_slots.category_id; profession selector in the generator; /buscar card shows only the searched profession's hours); traveling "me desplazo" coverage schedulable at every level (cantón/provincia/país) — fixes the can't-add-hours bug; "Profesiones → servicios" naming (registration "Profesión *", profile editor "Profesiones"); required "*" on "¿Cómo ofrecés tus servicios?"; default /buscar sort best-rated→reviews→recent; post-registration no flash-back (redirecting loader + dashboard retries); admin keeps appealing pending cases visible ("Pendientes" includes under_appeal, relabeled "Pendiente — en apelación"); "Reportar suplantación de identidad" → high-priority moderation ticket + documented biometric-is-the-real-fix limitation; /buscar numbered cards mirrored on numbered map pins + pin-hover mini preview that highlights the card; non-blocking geolocation "Usar mi ubicación / Cerca de mí" (proximity sort + nearest-provincia autofill, graceful text-search fallback). Run migration 037. See "Sprint 32" below. Earlier sprint 31 — booking modal reliably auto-scrolls to time slots on day-select + one-click day+time from the /buscar card opens it pre-selected/scrolled (larger modal); CRITICAL cédula-field-vanishing fix for social-login accounts (gate on stable hasStoredCedula, not the live input value — field stays, validates, stores); unified status-filter tabs + naming (shared StatusFilterTabs) across solicitudes + proyectos in BOTH client and professional panels (removed Próximas/Historial + duplicate "Mis proyectos" header, single consistent filtered list). No migration. See "Sprint 31" below. Earlier sprint 30 — pro action wording "Marcar como completado" (not "finalizado"; client confirms → Finalizado) on projects+solicitudes; proposals kept after finalización (accepted→"Finalizada" locked, others collapsed); reviews show the job title ("Reseña de '<title>'"); "editada" hidden on the public profile; status filter pill-tabs in solicitudes + proyectos; client phone shown to the pro on accepted proposals; es_salud category flag gates DOB (requested/shown/stored only for health categories) across /buscar booking, the pro's solicitud view, and the panel — bookings.client_dob stored health-only (Ley 8968). Run migration 036. See "Sprint 30" below. Earlier sprint 29 — availability "Desde" + "hora puntual" both default to the next rounded full hour (reliable init); booking re-checks the DB for a cédula each open so social-login accounts with none are prompted; project lifecycle status now visible in the PRO panel for accepted proposals (Asignado/Trabajo realizado/Finalizado/Cancelado) with focus-refetch so a client cancel/delete clears the stale "Aceptada"; PER-FINISHED-JOB reviews (each booking/project reviewable + editable, tied to the item, aggregated on the profile) + button flips to "Ver/Editar reseña" with a filled star once reviewed. Run migration 035. See "Sprint 29" below. Earlier sprint 28 — 17-item batch: CRITICAL identity fix ("¿No es tu información?" discards the padrón match → manual review, no verified email/badge); friendly duplicate-cédula messages; "¿No ves tu categoría?" → admin ticket; readable listing addresses (pro-labeled, Plus Codes hidden) + exact pin on map; "Contáctanos por llamada" opt-in in Disponibilidad; availability "Desde" rounds to next full hour + /buscar hides slots within the 15-min lead; proposal-edit + project-status persistence (service-role) + either-party project cancel + review-on-finalizado; publish "Ir a mi panel"; editable reviews (filled-star + "editada"); booking DOB wired through cédula lookup (padrón has none); numeric PhoneInput on beneficiary/client/completar-perfil; /buscar real coverage label (cantón/provincia/país); account soft-disable with reason → admin Cuentas tab. Run migration 034. See "Sprint 28" below. Earlier sprint 27.2 — fixed-location adds one pin at a time: "Agregar lugar" blocked until the current pin's provincia+cantón are confirmed (then the next pin can be added); cantón shown disabled-until-provincia everywhere with NO "elegí provincia primero" instructional text (workplaces, travel zones, search filters). Earlier sprint 27.1 follow-up — notifications "Ver todas" opens the in-panel notifications tab (role-routed, both panels); cantón select disabled until provincia chosen (fixed + travel); fixed-location "Agregar lugar" fixed — dropping a pin reverse-geocodes + auto-adds a listed removable location (no more false "no location" error) + manual provincia/cantón add, multiple locations; removed user-facing "/buscar" jargon app-wide (→ "los resultados de búsqueda"). See "Sprint 27.1" below. Earlier sprint 27 — 28-item batch: fixed-location typed provincia/cantón FIRST (authoritative for /buscar) then pin (visual only, no reverse-geocode); hierarchical travel coverage (cantón/provincia/país) + hierarchy-aware /buscar; aseguradoras official-list chip/autocomplete (no free-text) + "¿No ves tu aseguradora?" → admin ticket (approve-before-filterable) + admin Aseguradoras tab; 15-min booking lead time — pickers OFFER only valid times (error as repeatable safety-net) + availability dates dd/mm/aaaa; no-CR-ID pros hidden from /buscar until admin-approved + "pendiente de revisión" panel + add-cédula-later (auto padrón verify) + appeal-straight-to-support; removed manual block toggle (visibility = verification status; rejected never visible); casos de éxito per profession/service (portfolio_items tagged); booking beneficiary cédula auto-fills confirmed info (manual name only if not found) + cédula never flashes for registered clients + submit "Confirmar solicitud"; auth — social on LOGIN only, post-registration lands on panel (role persisted to auth metadata), ContrataCR Términos+Privacidad line, "Confirmar contraseña"; client→pro conversion reuses on-file cédula + role persists; notifications full panel management (mark/delete single+all); solicitudes lifecycle (pro "trabajo realizado" → client confirma → finalizada, 7-day auto-confirm, either-party cancel + reason, notify both) + report on active/finished/cancelled → admin ticket; pro name links to public profile everywhere + search-by-name. Run migration 033. See "Sprint 27" below._

_Earlier: 2026-06-07 (sprint 26 — unified cédula→padrón auto-fill + confirm info block (name + cédula + DOB/age WHEN AVAILABLE + "¿No es tu información?") across client registration, guest booking, logged-in booking, professional registration; 18+ gate via padrón presence (electoral roll = adults; padrón has NO birth date); "No tengo identificación costarricense" → admin exceptions queue (no_cr_id + document note, pending); aseguradoras (insurance networks on profile + /buscar filter); public reviews gated by confirmed completion (already enforced); two-way no-show / non-performance / non-payment reporting (report pro + report client → flag_count → admin moderation; NO in-app monetary penalties — payments off-platform); minors blocked from accounts via padrón; booking-for-someone-else (responsible adult vs beneficiary, ¿tiene cédula? branch, beneficiary cédula always optional, under-18 beneficiary marked "para un menor"). Run migration 032. See "Sprint 26" below._

_Earlier: 2026-06-07 (sprint 25 — cédula→padrón auto-fill+confirm for pros (no name matching) + integrity guard; designed unsaved-changes dialog + profile auto-save; "Este correo ya está registrado" detection; call-contact option in /buscar; booking CTA "Solicitar por WhatsApp"; pro solicitudes confirm/complete persistence fix (service-role update); no past dates/times in Costa Rica time (client + DB trigger); "Casos de éxito" restructure + /buscar preview link; client confirm-password; admin re-scoped to exceptions + moderation + support (reports queue, ban/unban, remove fake photos); location model — pins as single source of truth (per-pin reverse-geocoded provincia/cantón/distrito) + coverage-area selector for "me desplazo" + location-aware /buscar via denormalized search arrays; client cédula at BOOKING not signup (guest booking, format + padrón-existence, recoverable UX) + two-way reputation (report clients, flag, admin moderation). Run migrations 028-031. See "Sprint 25" below._

_Earlier: 2026-06-07 (sprint 24 — fully automatic identity verification: self-hosted TSE padrón + IdentityVerifier abstraction (swappable, biometric extension point), auto-grant "Identidad verificada" on registration (match → verified, else pending; never auto-reject), name normalization + similarity threshold, appeals re-run-then-ticket, admin panel exception-only + side-by-side padrón compare + assisted TSE button, work photos removed as criterion, badge renamed Proveedor Autorizado → Identidad verificada, /buscar "Solo con identidad verificada" (?verificados=1), data minimization (store result only); run migration 027 + load padrón + set GitHub Action secrets). Earlier: sprint 23 — 28-item batch: route-change unsaved guard, condensed OTP, unified input focus color, post-verify lands on panel, robust Google client onboarding, client→professional upgrade, per-user favorites scoping, booking-persistence fix, admin login at /admin, smart verification CTA, TSE-assisted manual check, geolocation + both work modes + map re-init, availability single contact-mode decision + privada toggle + per-location-only schedules, 5-photo text + registration work-photos tip, booking slot auto-scroll + "Continuar por WhatsApp", notifications corner badge + pro notifications tab, proposal WA/revert/edit/cancel, project cancel-delete notify, self-interaction guards, project-confirmed reviews). Earlier: sprint 22 — 43-item batch: admin role + "Proveedor Autorizado" verification system (lifecycle/audit/appeals/badge/explainer), single Nombre completo, phone-input alignment, OTP email context, languages chip, contact-mode in Disponibilidad + per-location & videoconsulta schedules, work-mode toggle, unsaved-changes guard, compact /buscar cards + unified WhatsApp + no-reviews state, home-search autocomplete + canton→province, panel-aware register links + error/out-of-service pages, notifications badge + /notificaciones, Cloudinary transforms + 5-photo limit + profile gallery, numeric-only PriceInput, project completion lifecycle + delete; run migrations 023-026). Earlier: sprint 21 — shared CedulaInput: live X-XXXX-XXXX masking, clean-digit storage, auto type detection (cédula/DIMEX/NITE), format-only validation, label "Número de identificación" with required/optional prop. Earlier sprint 20 — unified workplaces (map autocomplete, multiple pins, supersedes affiliations + single fixed pin), PhoneInput flag/selection/length fixes, registration location flow reordered (province/canton required first, optional pin after); run migration 022. Earlier sprint 19 — flexible professional identity: replaced persona física/empresa binary with optional brand name + affiliations (institutions/workplaces), searchable + visible in /buscar; run migration 021. Earlier sprint 18 — registration hardening: account-creation error fix + retry/friendly errors, navbar scrolled label, reliable canton geocode, full country phone selector, form validation (defaults/onBlur/scroll/red asterisks), per-service experience; run migrations 019 + 020. Earlier sprint 17 — see "Sprint 17" section: client OTP, standardized PhoneInput, booking phone capture, contact_preference, languages, account_type/business_name, per-service pricing, reverse-geocode province/canton, completion CTA, footer cleanup; run migration 019. Earlier sprint 14/15/16 — see "Sprint 14-16" section below: multi-profession + multi-category, pricing tiers, HuliHealth /buscar split + inline schedules, real-time email/cédula checks, availability auto public/private, project→pro notifications, .ics export, emoji blocking, brands marquee, footer/social/support, OAuth pro cédula+name, sign-out fix). Earlier: sprint 13 — date-based availability + public/private toggle, search map clustered pins, verified-only reviews, booking notifications; sprint 12 — OAuth pro registration, category FK migration 013)_

---

## ⚠️ Design guide is mandatory — read `contratacr-design-guide.md` first for ANY UI work

`contratacr-design-guide.md` (repo root, created sprint 40) is the **single source of truth** for visual/UX direction. **Every task that touches UI, layout, components, or user-facing copy must read it before writing code and conform to it.** It defines: the simplicity-first principle; the canonical color/typography/spacing tokens + component standards (compact buttons with a clear primary/secondary hierarchy and a real disabled state, inputs, chips, cards, toggles, badges); the layout patterns (/buscar 3-column filters·results·map, uniform compact cards, Hulihealth-style availability strip + location chips, collapsible long forms with the first section open); density/sizing rules; the **app-wide copy standard — normal Costa Rican Spanish WITHOUT "vos" imperatives** ("Describe lo que necesitas", "Agrega", "Elige" — never "Describí", "Agregá", "Elegí"); and the required-field convention (red `*` / `(opcional)`). If existing UI violates it while you're in the area, align it (within scope).

---

## Sprint 104 (2026-06-13) — Visual cleanup (part 1): de-box + filter toggles + photo hint

Contained parts of the visual-cleanup pass:
- **/buscar filters** (`search-filters.tsx`): "cerca de mí" and "Solo identidad verificada" are now **consistent toggle rows** (label + on/off switch, brand-blue when on), **icons removed** (dropped `MapPin`/`ShieldCheck` imports). Don't touch the rest of /buscar.
- **De-boxed** (text + icon only, no colored container): the public-profile **reviews-gate** note (`reviewsGate`, now neutral grey) and the **OAuth guidance blocks** in Cuenta y seguridad (`OAuthGuide` — removed bg/border, neutral dark text, brand-blue link only, grey step badges).
- **Client photo control** matches the pro panel: removed the "JPG, PNG o WebP — máx 5MB" hint (`photoHint` <p>).
- **Projects "Aceptada" chip** centered properly (`justify-center`, `leading-none`, wrapped label).
Follow-ups (same pass, committed after): **favoritos** → one container with divider rows + "Sin reseñas" for 0-review pros; **"Sobre mí"** quick facts → one bordered container with label→value rows (no per-fact colored boxes, verification accent only); **dashboards unified** — the **client panel now uses the same vertical left sidebar** as the professional panel (was a horizontal tab strip): `max-w-5xl` + `flex lg:flex-row gap-6`, nav buttons in a bordered `lg:sticky` rail (`bg-[#EBF5FB] text-[#009FD9]` active), content in `flex-1 min-w-0`. The client "Identidad verificada" boxed card was already removed in Sprint 99, so nothing boxed remains there. Build green, `tsc` clean.

## Sprint 103 (2026-06-13) — "Profesiones" section: naming, consolidation, principal, project matching

- **Naming:** the dashboard tab `proPanel.tabs.services` is now **"Profesiones"** ("Professions") — professions are the group, services nest under each (per the Servicios redesign).
- **Consolidated:** removed the duplicate **Profesiones** block from **Mi perfil** (`profile-editor.tsx`) — professions are managed only in the Profesiones tab now. Dropped `addProfession`/`removeProfession`/`addCat`/`CategorySearch`; `professions` is read-only there (still saved unchanged; the editor remounts per tab so it's never stale).
- **No icon:** removed the Briefcase chip from each profession card header (`services-editor.tsx`).
- **Mark principal:** non-principal profession cards get a **"Hacer principal"** action (`makePrincipal` moves it to index 0 = principal everywhere). New `servicesEditor.makePrincipal` key.
- **Project matching — surfacing, NOT auto-routing (recommended + implemented):** `ProposalsTab` now receives the pro's `services`; in "Buscar proyectos" it flags projects whose title/description match the pro's **service keywords** (≥4-char tokens) with a **"Coincide con tus servicios"** badge and **sorts those first**. Open projects are still category-filtered server-side; this is a lightweight client-side relevance cue — no notifications/auto-assignment (avoids spam/false matches at this scale). New `proposalsTab.matchesServices` key. Build green, `tsc` clean.

## Sprint 102 (2026-06-13) — Disponibilidad restructured (one flow), call toggle → Mi perfil

`availability-editor.tsx` + `profile-editor.tsx` + dashboard + i18n:
- **Removed the privada explanatory paragraph** (`privateOnDesc`/`privateOffDesc` no longer rendered — just the "Disponibilidad privada" label + toggle).
- **Merged into ONE cohesive card:** the privada toggle + (when pública) the slot generator under a **divider in the same card** (was two bordered cards). The slot **list** is now a sibling below, gated on `isPublic`; the private note is its own `{!isPublic && …}`.
- **"Permitir contacto por llamada" moved to Mi perfil → Contacto** (`profile-editor.tsx`): new `allowPhoneCall` state seeded from `initial.allow_phone_call`, saved in `identityFields` (`allow_phone_call`); a toggle row under the call-number field. Removed it (and `toggleAllowPhoneCall`/`allowPhoneCall` state/`initialAllowPhoneCall` prop) from the availability editor + dashboard. Copied `allowCallLabel`/`allowCallDesc` into the `profileEditor` namespace. Default stays **público** (privada OFF). Build green, `tsc` clean.

## Sprint 101 (2026-06-13) — Mi perfil trimmed: fewer labels, no Dirección, collapsed Datos básicos

`profile-editor.tsx` + i18n:
- **"Datos básicos" collapsed by default** (removed `defaultOpen`) so the panel isn't overwhelming on entry; the completion meter sits above.
- **Removed the free-text "Dirección (opcional)" field** (provincia/cantón + optional pin already capture location). `address` is now a non-editable const so an existing value isn't wiped. (The optional **map pin is already off-by-default** in `WorkplacesPicker`.)
- **Trimmed verbose helpers:** removed the business-name helper (`businessHelp` <p>), the `workplacesHelp` <p>, and the `priceNote` box (+ unused `Info` import); shortened `nameLockedHelp` ("Tu nombre oficial proviene del padrón y no se edita aquí. ¿Error o cambio legal? Escríbele a soporte."), `travelsDesc` (dropped the "detalles del traslado…" sentence), and `secLangDesc` ("Idiomas en los que atiendes").
- **"Contacto y precios" → "Contacto"** (`secContact`/`secContactDesc`).
- **Verificación:** dropped "Recuerda: verificamos tu identidad, no la calidad…" from `verifiedBody`.
- **Visibility wording:** `proPanel.identityVerified` is now just "Identidad verificada" (removed "· visible para clientes"); the **unverified** badge keeps "· visible para clientes". Build green, `tsc` clean.

## Sprint 100 (2026-06-13) — "Ej."→"Ejemplo:" app-wide + GAM→SG Solutions

App-wide i18n sweep (both `messages/es.json` + `messages/en.json`, all namespaces): replaced the abbreviation **`Ej.` / `Ej:` / `ej.` → `Ejemplo:` / `ejemplo:`** and **`e.g.` / `E.g.` → `example:` / `Example:`** in every placeholder/helper/example; and the sample company name **"Servicios Eléctricos GAM" → "SG Solutions"** (so `businessPlaceholder` = "Ejemplo: SG Solutions"). No hardcoded `Ej.` user-facing strings remain in `.tsx` (only code comments use "e.g."). Build green.

## Sprint 99 (2026-06-13) — Identity display removed, Soporte "Abrir ticket", notifications role cue

- **Identity/cédula display block removed** from the **client panel** (`dashboard/cliente/page.tsx` — the "Identidad / cédula enmascarada / verificada / Solo mostramos los últimos dígitos" card; dropped unused `maskId`/`ShieldAlert`). The **professional panel has no such block** (only the verified badge next to the locked name) — nothing to remove there.
- **Soporte button:** `supportTickets.newTicket` "Nuevo ticket" → **"Abrir ticket"** / "Open ticket".
- **Notifications role distinction WITHOUT literal labels** (`notifications-list.tsx`): replaced the "Como profesional / Como cliente / Soporte" text chips with a quiet **context ICON badge** — Briefcase (offering services / professional), ShoppingBag (contracting / client), LifeBuoy (support), each with its own tint; the unread dot now rides the badge corner. `notificationContext()` still drives it; `notificationContextLabel` no longer used in the list.
- **Client panel: no "completa tu perfil %"** — confirmed none exists (a client only needs a phone); none added. Build green, `tsc` clean.

## Sprint 98 (2026-06-13) — Close-account moved to Cuenta y seguridad

Removed `<CloseAccountSection/>` (Cerrar/deshabilitar cuenta) from **Mi perfil** (`profile-editor.tsx`) — it already renders in the **Cuenta y seguridad** tab (`dashboard/profesional/page.tsx`, cuenta tab, alongside `AccountSecuritySection`), where account-level actions belong. Same functionality (deactivate/recoverable). Build green.

## Sprint 97 (2026-06-13) — Certifications: required fields + explicit save

`profile-editor.tsx` certifications section (per profession): (1) **no image mentions** — removed "No subas imágenes ni documentos" + "(texto, sin imágenes)" from `certsHelp`/`secCertsDesc` (image upload simply isn't offered). (2) **All three fields required** — replaced the always-editable inline rows with a **read-only list of SAVED certs** + an explicit **add FORM** (`certDraft`) whose **"Guardar certificación"** button validates nombre + institución + año(4 dígitos) (`certAllRequired`); an incomplete cert can't be saved. (3) **Clear SAVE vs ADD-ANOTHER:** "Agregar certificación" opens the form; "Guardar certificación" commits THIS one; saved certs then render as read-only rows with remove. Dropped `updateCertification`/`addCertification`; `institution` no longer "(opcional)". Build green, `tsc` clean.

## Sprint 96 (2026-06-13) — "Completa tu perfil" refinements

`profile-completion.tsx` + i18n: (1) **bio minimum raised to 40 chars** so junk like "test" never counts as a real description. (2) **Show ONLY pending items** — removed the green "done items" chip summary (and `doneItems`/`Check`); the card now lists just what's left + the verification CTA. (3) **Clearer services wording:** `services` label → "Agrega los servicios que ofreces en tu profesión" / "Add the services you offer in your profession". Build green.

## Sprint 95 (2026-06-13) — Phone: explicit one-vs-two + booking prefill

- **One number = both; two = split.** Added an explicit `whatsappHelp` line under the WhatsApp field ("También se usa para las llamadas, salvo que agregues un número aparte abajo"). Logic unchanged: WhatsApp button → `whatsapp`; Llamar → `callPhone ?? whatsapp`.
- **Booking prefills the phone** (`booking-modal.tsx`): already loaded `profiles.phone` via `get_my_profile`; now if that's empty it falls back to the booker's `professionals.whatsapp` (a pro's number lives there), so a professional booking someone never re-enters it. `needsPhone` stays `isLoggedIn && !profilePhone` → the prompt is skipped when a number is on file. Build green, `tsc` clean.

## Sprint 94 (2026-06-13) — Places autocomplete: robust + legacy fallback + dropdown visibility

Address/place search ("Clínica Bíblica") returned no suggestions. Hardened the shared Places setup in BOTH `workplaces-picker.tsx` (registration + panel) and `location-picker.tsx` (booking):
- **Legacy fallback:** prefer the new `PlaceAutocompleteElement`; on `gmp-error` (e.g. **"Places API (New)" not enabled** on the key while the legacy Places API is) or if the element is unavailable, mount the legacy `google.maps.places.Autocomplete` widget (`componentRestrictions: { country: "cr" }`) so search keeps working either way. Selecting a result still drops the draft pin.
- **Dropdown visibility (globals.css):** `.pac-container { z-index:100000 !important }` + `.cr-pac { position:relative; z-index:60 }` so the suggestions float ABOVE modals/cards and the host cell never clips them (a clipped dropdown reads as "no suggestions").
- **Re-open fix (workplaces-picker):** the map lives behind the optional "Marcar en el mapa" toggle; closing it now resets `mapInstanceRef` so re-opening re-binds the map AND re-mounts the search box (previously the second open showed no search). Added `requestedRegion: "cr"`.
- **If still empty in prod:** verify in Google Cloud the API key has **Places API (New)** (or legacy Places API for the fallback) enabled and the HTTP-referrer restriction allows the production domain. Build green, `tsc` clean.

## Sprint 93 (2026-06-13) — Two bug fixes: early cédula-taken check + no fake ratings

1. **Cédula already-registered, validated EARLY (booking).** Before, the "ya está registrada en otra cuenta" message only appeared on the DB unique-constraint failure AFTER pressing confirm (and the name-mismatch warning showed first). New endpoint **`GET /api/cedula-available?cedula=…` → `{ taken }`** (server session + admin client, excludes the requester's own account, returns only the boolean — no account info leaked). In `booking-modal.tsx` the live self-ID effect now checks availability the moment the ID validates (any type), sets `cedulaTaken` + a friendly inline error, and **takes precedence over the name-mismatch warning** (`nameWillChange` gated on `!cedulaTaken`); `validateClientCedula` re-checks as a confirm-time safety net; both `CedulaInput` onChanges reset the flag. Message: "Esa cédula ya está registrada en otra cuenta. Inicia sesión en esa cuenta o usa una cédula diferente."
2. **No fake ratings for pros with 0 reviews.** The public profile Reseñas tab hardcoded per-category scores (`4.8/4.9/5.0/4.7` via `SubRating`) and a `0.0` aggregate. **Removed the fake per-category breakdown + `SubRating` entirely** (no real per-category data exists). The aggregate (big number + stars + count) now renders **only when `reviewCount > 0`**; zero reviews → honest empty state (ReviewSection's "sé el primero"). **`StarRating` fixed globally:** never prints the numeric value when `reviewCount === 0` (stars render empty, only the `(0)` count shows) — fixes every card/profile, not just this page. Build green, `tsc` clean.

## Sprint 92 (2026-06-13) — Soporte: drop the "Todas" filter tab

`support-tickets.tsx`: removed the **"Todas"** filter — `FILTER_IDS` is now just `["open", "in_progress", "resolved"]` (Pendiente / En proceso / Resuelto) and the default tab is **"open" (Pendiente)**. `filtered` always filters by the selected status; the per-tab unread badge uses `unreadByStatus` only; `filterLabel` drops the all-bucket branch. A filtered-but-empty status still shows `noneInView`. Matches the no-all-bucket convention already used by solicitudes/proyectos. (`filterAll` i18n key now unused.) Build green.

## Sprint 91 (2026-06-13) — Disponibilidad simplified (no videoconsulta, robust defaults, tidy schedule)

`availability-editor.tsx` (+ dashboard prop, design guide):
- **Removed "Ofreces videoconsulta" entirely** — toggle, state, `toggleVideoconsulta`, the location option, and the `initialVideoconsulta` prop. **Back-compat kept:** old slots with `location_id = "videoconsulta"` still render with a label in the editor (`VIDEO_LOC` branch in `locationLabel`) and on the public schedule; the `professionals.videoconsulta` column is left untouched (no migration, no data loss).
- **Robust default times (never a false validation error):** added `defaultStartFor(date)` (future → 08:00; today → next valid rounded full hour) and `defaultEndFor(start)` (**always strictly after** start; aims at 17:00, ≥ start+1h for a late start, capped 23:30). Wired into initial state, the date-change handler, the today-floor effect, and `setDesde`. **Fixed bug:** today's floor used to push "Desde" past the fixed 17:00 "Hasta" → false "Hasta debe ser después" error; now "Hasta" bumps with "Desde" everywhere. The `end <= start` check still exists and fires only on real invalid user input.
- **Cleaner UI:** dropped the numbered STEP 1/STEP 2 badges (plain headings, `rounded-2xl` cards). **Upcoming schedule redesigned** — tidy per-day cards (soft `bg-[#f9fafb]` header bar with date + "Quitar día"), optional profession/location tags, and **uniform same-width time chips** in an even grid; removed the Mañana/Tarde/Noche sub-grouping (and `DAY_PARTS`/`partOfDay`) for simplicity.
- Privada logic unchanged (off by default; controls only the published schedule; WhatsApp/call independent). Build green, `tsc` clean.

## Sprint 90 (2026-06-13) — Servicios redesigned (one card per profession)

Made the profession → services structure instantly clear (`services-editor.tsx` + i18n). Replaced the numbered **STEP 1 (profesiones) / STEP 2 (servicios)** layout with **one card per profession**:
- Each profession is a bordered group: header = icon chip + name + "Principal" tag (first) + "N servicios" count + remove ✕ (when >1); its services are a hairline-divided list inside (name, optional desc/years, price, edit/delete).
- **Empty profession → clickable dashed prompt "Agrega tu primer servicio en {profesión}".** With services, a quiet "+ Agregar servicio" sits under the list.
- **"+ Agregar profesión"** is a subtle action at the bottom (replaces the STEP 1 box). The inline add/edit form opens on a **tinted surface (no border)** — no box-in-box (R1).
- Logic unchanged: services still tie to a profession via `category`, autosave via `persist`, price/experience as before. New i18n keys `servicesCount` (plural, =0/one/other) + `addFirstInProfession` (ES/EN); reframed `intro`. Build green, `tsc` clean.

## Sprint 89 (2026-06-13) — Location & coverage simplified (work zones first, travel = toggle)

Made location effortless for non-technical pros (Uber/Airbnb: structured field first, map optional). Touches `workplaces-picker.tsx`, `profile-editor.tsx`, `registro/profesional/page.tsx` + i18n.

- **WorkplacesPicker rebuilt:** provincia → cantón selects FIRST (authoritative for `/buscar`) + optional name, then a **collapsed-by-default "Marcar el punto exacto en el mapa (opcional)"**. A pin stores **lat/lng only** — the reverse-geocode admin derivation/confirmation was **removed** (the selects always win; no duplicate question). Multiple zones, each removable (shows "· con punto en el mapa" when pinned). Dropped `deriveAdmin`/`matchProvinceCanton`.
- **Travel/coverage → panel toggle:** "Me desplazo a donde está el cliente" sets `service_type` `mobile` and adds **no separate coverage zones** — coverage = the listed zone(s); exact travel coordinated with the client. **`CoverageAreaSelector` retired** from panel + registration.
- **Registration simplified:** only the zone picker (≥1 zone required, `errWorkplace`); travel enabled later in the panel. `serviceType` defaults to `"fixed"`.
- **Search intact:** zones' provincia/cantón → `computeSearchAreas(workplaces, [])` → `search_provincias`/`search_cantones`; `/buscar` cantón/provincia filtering unchanged. New flow writes `coverage_areas`/`coverage_provincias`/`coverage_country` **empty**.
- **Back-compat:** profile-editor `seedZones(initial)` seeds the zone list from `workplaces`, else legacy canton-level `coverage_areas`, else primary `provincia_id`+`canton_id` — so existing pros never lose search presence on re-save. (Whole-province/country legacy coverage isn't a zone and isn't seeded.)
- **i18n (ES/EN):** workplacesPicker `lead`/`markOnMap`/`pinPlaced`/`clearPin`/`pinnedTag`; profileEditor `travelsLabel`/`travelsDesc`; reframed `workplaces`/`workplacesHelp`/`errWorkplace`. Build green, `tsc` clean.

## Sprint 88 (2026-06-13) — "Completa tu perfil" redesigned (strength meter + actionable checklist)

Rebuilt `ProfileCompletion` (`src/components/dashboard/pro/profile-completion.tsx`) as a best-in-class profile-completion, inspired by **Airbnb's "complete your listing" checklist + LinkedIn's profile-strength meter**.

- **Strength meter:** a linear bar (brand-blue gradient `#009FD9→#33b4e0`, flips green `#16a34a` at 100%) with a big live **percent** and a motivating **"Te faltan N pasos"** line (ICU plural `stepsLeft`).
- **Actionable checklist:** ONLY the remaining steps, as flat divider-separated rows (no nested boxes) — each a ≥56px tap target with a one-line benefit, a **"Completar"** action + chevron, that jumps straight to the exact tab via `onGo→setTab` (+ `scrollIntoView`, works on mobile).
- **% reaches 100% (fix):** identity verification is now a **separate "Recomendado" action excluded from the blocking %** (it's approval-gated and can't auto-pass for non-padrón IDs, which used to pin the bar below 100). **Location detection is signal-based** (`workplaces` / `coverage_areas` / `coverage_provincias` / `coverage_country` / `provincia_id` / `canton_id`), no longer tied to `service_type`, so it never sticks. Context-aware as before (aseguradoras only for `es_salud`; Spanish-only / "no aplica" never penalized).
- **Live recompute:** `handleSaved → refreshKey → fetchPro` re-reads the pro on every save, so the % is never stale. Quiet green "done" summary gives a sense of progress; the whole card **hides once everything is done AND verified**.
- **Placement:** moved to a prominent **full-width slot at the TOP of the dashboard** (above the sidebar+content row), compact/responsive from ~360px. Removed the in-tab copy.
- **i18n:** new keys `stepsLeft` (plural), `completeAction`, `recommended` (ES/EN). Build green (`ƒ Proxy (Middleware)`), `tsc` clean, ICU plurals verified for count 1/2 in both locales.

## Sprint 87 (2026-06-12) — DESIGN REVERT: pre-redesign visual baseline restored (logic + i18n kept)

Reverted the recent **design-redesign** passes back to the pre-redesign look (boundary `8a2f6ac`, "sprint 128 bug-fix sweep") while **keeping every bug/logic fix and the full ES/EN i18n**. Done on a throwaway branch (selective `git revert`, then fast-forwarded to main).

- **Pure-design commits reverted in full:** `67db0a6` (de-nest pro dashboard + profile-completion redesign → **bordered `Card` shell + progress-ring checklist restored**, verification back as a checklist item), `438eb63` (onboarding "simpler professions" + grouped "cómo ofreces" → **always-visible profession search + separate location blocks restored**), `dcfe495`, `53d58a3`/`1c7d712` (locations area-first restructure → **pre-restructure WorkplacesPicker/CoverageAreaSelector restored**), `2edad38` (no-CR-ID disclosure link → **checkbox toggle restored**), `14b1997` (account OAuth note), `d662f32`/`1f56f1f`/`a84389c`/`1bd4f98` (availability step labels / Mi-perfil icon chips / Servicios empty-state / Verificación icon accents).
- **Mixed commits hand-split — design reverted, logic kept:** `5be8417` (reverted availability soft-panels → **bordered STEP 1/STEP 2 boxes**; **KEPT** `availability_public:true`, `contact_preference:"ambas"`, and the 8:00–17:00 generator default), `263f1d1` (reverted the Ver-perfil map info-window override; **KEPT** the authoritative login redirect), `7b69730` (restored the **OAuth box border** + ghost "Eliminar" photo buttons; **left** the responsive client header + lean-registration content to avoid reintroducing untranslated Spanish).
- **Conflict rule applied (R10-safe):** where a design revert collided with a later i18n edit, the **old layout was restored but the current `t()` strings were kept** (registro location blocks, profile-editor professions/location, dashboard tab headings, profile-completion). Added `proPanel.completion.verification`/`verificationBenefit` keys (ES/EN) for the re-added verification checklist item.
- **NOT touched (preserved):** padrón/cédula server-side lookup (`/api/cedula/[id]` still gateless), the Realtime NotificationBell crash fix, the Places API (New) migration, booking/cédula logic, filter/label fixes, and the entire i18n sweep. Build green (`ƒ Proxy (Middleware)`), `tsc` clean, ES/EN JSON valid.

## Sprint 86 (2026-06-12) — "Completa tu perfil" navigates to the section

- **Bug:** clicking a checklist item changed the tab but `setTab` only scrolled to the section on **mobile**; on desktop the completion widget (which sits above the sidebar+content row) vanished on navigate and nothing scrolled, so it felt like "nothing happened." Fix: `setTab` now **always** `scrollIntoView`s the content section (`contentRef`), so selecting any nav OR completion item lands you on the section.
- **Design:** the verification CTA inside the widget used blue text on a blue tint (same low-contrast issue as Cuenta y seguridad) → dark readable title/benefit text, brand-blue kept only on the shield icon + chevron.

## Sprint 85 (2026-06-12) — login lands on the right panel + clean map info-window

- **Login redirect is now authoritative.** `login/page.tsx` resolved the panel from `user_metadata.role` only, which is often missing/stale → professionals were dumped on the client panel. Now it falls back to `profiles.role`, then to the existence of a `professionals` row, before routing to `/dashboard/profesional` vs `/dashboard/cliente`.
- **Map "Ver perfil" info-window:** removed the "double border" — Google auto-focuses the link when the InfoWindow opens, drawing a focus ring that read as a second border on the blue button. Added `outline/border/box-shadow:none` on the link + a scoped `.gm-style-iw*` override (flatten inner wrapper, kill focus ring) so only ONE clean rounded card shows.

## Sprint 84 (2026-06-12) — locations step restructured (area-first, separate panels)

Fixed the cluttered/redundant "¿Cómo ofreces tus servicios?" locations step in BOTH registration (`registro/profesional`) and the panel editor (`profile-editor`) — same pattern in both.
- **New order in `WorkplacesPicker`:** **provincia → cantón FIRST** (authoritative, drives `/buscar`), optional place name, THEN an **optional** map pin for precision. The pin is coordinates ONLY now — removed the reverse-geocode prefill of provincia/cantón (`onPinPlaced` no longer takes/uses admin areas; deleted `deriveAdmin` + the `matchProvinceCanton` import). **No more "confirm the provincia/cantón of your pin" double question.**
- **Two separate panels:** Fixed location (Panel 1) and Travel/coverage (Panel 2) are now distinct `bg-[#f9fafb]` blocks (fixed listed first), not one mixed block. Both modes still combinable; multiple fixed places preserved.
- **EN parity:** `CoverageAreaSelector` fully translated (new `coverageSelector` namespace); `workplacesPicker` keys updated (`lead`/`mapOptional`/`hintSelectArea`; dropped obsolete `confirmMarked`/`addByProvinceCanton`/`hintProvinceCanton`/`hintCanton`).
- **Data model unchanged** — workplace `provinciaId`/`cantonId` (from the selects) + coverage zones still feed `computeSearchAreas`; `/buscar` filtering by cantón/provincia/coverage works as before. Pattern documented in design-guide ("Locations step").

## Sprint 83 (2026-06-12) — usability audit + fix pass (R1–R10)

Hard usability rules **R1–R10** were codified as permanent standards in `contratacr-design-guide.md` §1.5 (no nested borders, no 360px truncation, one obvious primary, no dead ends, no unexplained controls, form rules, consistency, feedback, dismissal/selection, English parity) + an explicit **off-limits list** (verification/auth/booking/payment).

**Method:** audited the listed screens against R1–R10, prioritizing high-traffic surfaces. The dominant concrete violation class was **R10 (Spanish leaking into EN)** in components the earlier i18n passes had missed — the structural rules (R1–R9) largely already passed after the 7 prior design passes (dashboards spot-checked R10-clean; admin already unified in the prior consistency pass).

**Fixed (committed):**
- **R10 · professional card** (`professional-card.tsx`, high-traffic /buscar): verified/unverified badge + tooltips, rating "reseña/reseñas" + "Sin reseñas todavía", "Desde/Tarifa" price label, "Ver casos de éxito / Ver certificaciones" → new `card.*` keys (incl. `reviewsCount` ICU plural).
- **R10 · registro/profesional**: hardcoded step-2 photo caption → `registration.pro.photoCaption`.
- **R10 · error boundary** (`[locale]/error.tsx`): offline + generic error screens, bilingual via an inline URL-keyed map (NOT next-intl — an error boundary must not depend on the provider it may be catching).
- **R10 · leave-review modal** (`leave-review-modal.tsx`): full `reviewModal` namespace.
- **R10 · WorkplacesPicker + LocationPicker** (`maps/*`, used in registration + profile + booking-address): fully translated → new `workplacesPicker` / `locationPicker` namespaces.

**Flagged (NOT changed — needs a decision or is off-limits):**
- **`booking-modal.tsx`** has a leftover Spanish placeholder ("Tu nombre como aparece en tu cédula"), but **booking is on the off-limits list** → flagged, not touched.
- **`phone-input.tsx`** country names ("México", "España"…) + the "País" aria-label are Spanish in EN — this is the **deferred taxonomy-DATA category** (same as the languages/insurers data), would need an `_EN`-style map; left as a known gap, not half-fixed.
- **Home phone-mockup** (`phone-screens.tsx` "Plomería · San José") is decorative and the **home is excluded** from the audit.

**Where I stopped / not exhaustively audited:** the pass concentrated on R10 across shared/high-traffic components; it did NOT line-by-line re-audit every one of the ~25 screens for R1–R9 (e.g. each admin sub-page, every dashboard tab, /publicar-proyecto, /ayuda, /soporte form `inputMode`/`autoComplete` coverage). Those rely on the prior design passes' structural conformance; a deeper R6 (mobile-keyboard/autocomplete) sweep is the natural next pass.

## Sprint 82 (2026-06-12) — registration "no CR ID" exception → progressive-disclosure link

- The "No tengo identificación costarricense" exception in `/registro/profesional` is no longer a checkbox sitting in the form. It's now a **subtle text link** ("¿No tienes identificación costarricense?") placed **directly below the identity block** (both the email/password step-0 path and the OAuth step-1 path); clicking it reveals the foreigner fields and offers a way back ("Tengo identificación costarricense"). New `registration.pro.noCrIdLink` / `hasCrIdLink` keys (ES+EN). `NoCrIdToggle` → `NoCrIdDisclosure`.
- **Presentation only** — the `noCrId` state wiring and the cédula/padrón verification logic were untouched (that flow is off-limits to UI passes; see the WARNING under "URGENT FIX #2").

## Sprint 81 (2026-06-09) — search bar: short placeholder + responsive clipping fix

- **`messages/{es,en}.json`** `landing.hero.searchPlaceholder` → "Describe tu proyecto…" / "Describe your project…".
- **`landing-navbar.tsx` compact row**: was `absolute inset-0 flex justify-center` with an `absolute left-4` mark over a `w-full max-w-5xl` form → overlapped/clipped on mobile. Now `absolute inset-0 flex items-center gap-2 px-4` with the **mark as a `shrink-0` flex item** + **`form flex-1 min-w-0 flex justify-center`** holding a `w-full max-w-5xl` box. Input `flex-1 min-w-0`; location `hidden sm:flex` (`min-w-[120px]`); **Buscar = `Search` icon `<sm`, "Buscar" text `sm+`** (`px-3 sm:px-8`). Placeholder shortened.
- Hero bar unchanged (already stacks input + full-width Buscar on mobile; desktop input is `flex-1 min-w-0`).
- `tsc`+`next build` clean. No migration.

## Sprint 80 (2026-06-09) — /buscar card: full-width Solicitar + top contact icons + verified wording + otro label fix

- **`professional-card.tsx`**: contact icons (WhatsApp/call) rendered in the **name row** (`ml-auto`, `h-7 w-7`, official WhatsApp + `Phone`), shown via `showTopWhatsApp = !contactOnly && contactPreference!=="solo_citas" && whatsapp` and `showTopCall = allowPhoneCall && whatsapp`. "Verificado" → "Identidad verificada". Added `catLabel(id)` (raw `categories.*` → `getCategoryLabel`) used for `categoryName` + profession chips. Imports `Phone`, `WhatsAppIcon`, `getWhatsAppLink`, `getCategoryLabel`.
- **`professional-schedule.tsx`**: bookable action = single `w-full` "Solicitar servicio" (removed the inline WA/call icons); contact-only = `w-full` "Solicitar por WhatsApp" (removed the phone icon). Deleted now-unused `Phone` import, `telHref()`, `canWhatsApp`.
- **`messages/es.json` / `en.json`**: added `categories.otro` = "Otro servicio" / "Other service".
- Card height unchanged (icons reuse the identity column which is shorter than the action column). `tsc`+`next build` clean. No migration.

## Sprint 79 (2026-06-09) — fix clipped "Agrega una profesión" dropdown (CategorySearch)

- **`src/components/ui/category-search.tsx`**: the dropdown was `absolute top-full` and got clipped by the parent accordion `Section`/card `overflow`. Rewired to **`createPortal(..., document.body)`** with a `fixed`-positioned panel: `reposition()` reads the trigger container's `getBoundingClientRect()` and sets `{left,width,top|bottom,maxH}` (flip-up when `spaceBelow<240 && spaceAbove>spaceBelow`, `maxH = clamp(160..340, availableSpace)`); listeners on `scroll` (capture) + `resize`; `z-index:9999`. Outside-click handler now also ignores clicks inside `panelRef`. Input focus moved to a `requestAnimationFrame` effect (panel mounts a tick later). The results list keeps `overflow-y-auto flex-1` so it scrolls within `maxH`. No logic/data changes; benefits every `CategorySearch` usage (profile editor, publicar, registro).
- `tsc`+`next build` clean. No migration.

## Sprint 78 (2026-06-09) — branded Supabase auth email templates

- Added `supabase/email-templates/` (confirm-signup, invite-user, magic-link, change-email, reset-password, reauthentication + README): table-based, inline-CSS, email-safe HTML in ContrataCR branding. Public logo PNG on Cloudinary (`contratacr/brand/email-logo`). Paste into Supabase → Authentication → Email Templates. No app/build change.

## Sprint 77 (2026-06-09) — carousel mobile performance + new logo inside phone mockup

- **`category-carousel.tsx`** (mobile perf, no logic change): (1) **time-based** auto-scroll — `AUTO_SPEED` now `0.019 px/ms`, advanced by `dt = now-last` (capped 50ms) → consistent ~19px/s on any refresh rate, dropped frames don't slow it. (2) **Removed `will-change-transform` from each card** (was forcing ~38 GPU layers → mobile jank); `will-change` stays only on the moving `cat-track`; hover scale still works (auto-promoted on desktop). (3) Images: `loading="lazy"`, `sizes="(max-width:640px) 250px, 300px"`, Cloudinary base trimmed to `w_600,h_400`; lighter shadow on `<sm`. Drag/arrows/reduced-motion unchanged.
- **`phone-screens.tsx` `AppBar`** (used by Results/Search/Pro screens): replaced the old text wordmark with the **new logo** — `/logo-mark.png` mark (`h-4`, srcSet @2x) + "ContrataCR" in **Poppins** (`next/font/google`), "Contrata" `#1a2744` + "CR" `#008ce0`. The shown screen (ResultsScreen) reflects the updated branding.
- `tsc`+`next build` clean. No migration.

## Sprint 76 (2026-06-09) — integrate brand assets (favicons, SVG logo, OG/social)

- **Assets → `/public`:** `favicon.ico`, `favicon-96x96.png`, `apple-touch-icon.png` (180), `web-app-manifest-192x192.png`, `web-app-manifest-512x512.png`, `site.webmanifest`, `logo.svg` (full, for large/crisp), `og-image.png` (from `ContrataCR-og-1200x630.png`). Also replaced `src/app/favicon.ico`. Generated **`logo-mark.png` + `logo-mark@2x.png`** (transparent 256/512) from `logo.svg` via Cloudinary svg→png (the raw SVGs are ~1.1 MB embedded-raster — too heavy per page).
- **`[locale]/layout.tsx` `metadata`:** added `metadataBase`, `applicationName`, `manifest`, `icons` (ico + 96 png + apple-touch 180), `openGraph` (siteName/title/description/url/locale es_CR/`og-image.png` 1200×630), `twitter` (`summary_large_image`). Title/desc honest.
- **`landing-navbar.tsx`:** new `ContrataCRMark` (`<img>` mark + srcSet @2x); `ContrataCRLogo` now = mark + wordmark with a `chip` prop (white rounded square behind the mark for dark bg). Compact/scrolled header gets `ContrataCRMark` pinned left (search stays centered). Legacy `layout/navbar.tsx` + login already import `ContrataCRLogo` → inherit the mark.
- **`landing-footer.tsx`:** `<ContrataCRLogo chip … />` for contrast on the dark footer.
- Note: `layout/footer.tsx` (unused/dead) still has a text-only wordmark; `phone-screens.tsx` wordmark is intentional (in-app mock UI). `tsc`+`next build` clean. No migration.

## Sprint 75 (2026-06-09) — polish the "Así funciona ContrataCR" phone section

- **`why-contratacr.tsx`**: removed the `-inset-10` gradient glow box behind the phone → phone **floats** with only a blurred ground-shadow ellipse. Step icon tiles changed from `bg-[#f3f4f6] text-[#1a2744]` to **light brand tint** `bg-[#EBF5FB] text-[#009FD9] ring-1 ring-[#dcebf6]` (soft/refined, no dark circles).
- **`phone-screens.tsx` `PhoneFrame`** rebuilt premium/realistic: outer **titanium metal rail** (gradient), thin **black bezel**, crisp white screen `rounded-[41px]` (h 580), **dynamic island**, **side buttons** (mute/volume/power), real **status bar** (signal bars + battery glyph), layered drop shadows. Width 286.
- Copy/layout/CTAs unchanged. `tsc`+`next build` clean. No migration.

## Sprint 74.1 (2026-06-09) — fold the professional pitch into the sticky-phone section (all 3 → one)

- **`why-contratacr.tsx`**: added a 5th point `{ pro: true }` "¿Ofreces servicios? Haz crecer tu negocio" rendering a `SmartRegisterLink` ("Registrarse como profesional", session-aware) + a `Link` to /como-funciona. Retitled "Así funciona ContrataCR" / subtitle "Para quienes buscan un profesional y para quienes ofrecen sus servicios."
- **`phone-screens.tsx`**: added `ProScreen` (pro panel — "Perfil verificado · apareces primero", two incoming solicitudes with Ver solicitud + WhatsApp, "100% gratis · sin comisiones"); appended to `SHOWCASE_SCREENS` (now 5).
- **`page.tsx`**: removed `<GrowBusinessCta/>` + import. Home = Hero → Carousel → WhyContratacr → FindByZone(map).
- **Deleted** `grow-business-cta.tsx`, `app-phone.tsx` (unused). `tsc`+`next build` clean. No migration.

## Sprint 74 (2026-06-09) — merged how-it-works + trust → one sticky-phone section ("Por qué ContrataCR")

- **`why-contratacr.tsx`** (new, client) replaces the separate tres-pasos + tranquilidad sections: Thumbtack-style sticky-phone story. Left = 4 scrolling point-cards (active = closest to viewport center via deterministic rAF scroll calc, gets border+shadow+dark icon tile; others fade). Right = `sticky top-24` phone swapping the matching app screen (`key={active}` + `animate-tab-cards`). Mobile: phone inline under each point. **No `overflow-hidden` on the section** (would break sticky).
- **`phone-screens.tsx`** (new): `PhoneFrame` + `SearchScreen`/`ResultsScreen`/`ChatScreen`/`SupportScreen` (on-brand recreations of real ContrataCR UI; `SHOWCASE_SCREENS`). Easy to swap for short screen-recording videos later.
- **`page.tsx`**: removed the two how-it-works variants + labels + `TrustBenefits`; renders `<WhyContratacr/>` between the carousel and the CR map. Grow-business kept (pro audience).
- **Deleted** (superseded): `how-it-works.tsx`, `how-it-works-rows.tsx`, `how-it-works-sticky.tsx`, `trust-benefits.tsx`, `step-screens.tsx`. `contratacr/home/deal-tranquilidad.png` handshake cutout now unused (still in Cloudinary).
- Sprint 73 (interactive CR map for find-by-zone) kept untouched per user. `tsc`+`next build` clean. No migration.

## Sprint 72 (2026-06-09) — Contrata con tranquilidad → Handy-style split + cutout professional

- **`trust-benefits.tsx`** rebuilt from bento to a **clean split** (`bg-white`, `lg:grid-cols-2`): left column = eyebrow "Confianza" + heading + lead + the 4 benefits as a **`<ul>` checklist** (soft tinted icon tiles: shield green, star amber, WhatsApp green, lifebuoy brand) + a primary **"Explorar profesionales" → /buscar** CTA; right column = a **cutout professional** (transparent PNG) over a soft brand backdrop (a `from-[#EBF5FB] to-[#d7ecf7]` circle + blurred ground shadow), `object-contain object-bottom` + drop shadow. `FadeInUp` both sides. Swappable via `PRO_IMAGE.src`.
- **Image asset:** sourced a friendly Unsplash portrait (commercial license), removed the background with **Cloudinary `e_background_removal`** (AI add-on is enabled on cloud `dxxrjx2go` — verified working this sprint), inspected the cutout visually, re-ingested as a stable flat PNG **`contratacr/home/pro-tranquilidad.png`**. Temp candidate uploads cleaned from Cloudinary.
- Design guide: new **cutout-image pattern** entry (bg-removal → view-to-verify → re-ingest; place over a soft shape; swappable constant; avoid foreign stock) and the updated trust-section spec.
- `tsc --noEmit` + `next build` clean. No migration.

## Sprint 71 (2026-06-09) — premium polish of 3 home sections (steps · trust · find-by-zone)

Elevated the three non-phone sections to the grow-business quality bar. Presentation only — no logic changed.
- **`how-it-works.tsx`** — connected journey: gradient progress path threads **glowing gradient icon nodes** (`h-[4.5rem]`, blurred radial glow, `ring-[6px] ring-white`, hover-raise); white connector dot + `ArrowRight` between steps; elevated `rounded-3xl` cards with ghost numeral watermark + `Paso NN` brand pill. `FadeInUp delay={i*140}`.
- **`trust-benefits.tsx`** — bento: featured green pillar gains a **decorative `ShieldCheck` watermark** + two honest detail chips (`Cédula validada`, `Registro oficial`); `PillarCard` icon tiles get a blurred glow; section has two faint radial glows. Hover lift + icon scale.
- **`find-by-zone.tsx`** — `rounded-[28px]` + deep shadow/ring. Dark `#111a2e` rail with **radar concentric rings + `MapPin` watermark + brand radial glow**, glowing geolocation button. Right pane: **gradient-filled active province tab**, province header (icon tile + green "N cantones con cobertura"), beefier "Ver profesionales" button (+arrow), cantón chips with a green **status dot** (hover→brand). All router/geolocation/coverage logic untouched.
- `tsc --noEmit` + `next build` clean. No migration.

## Sprint 70 (2026-06-09) — hero rotating word → per-letter staggered vertical slide-up

- **`landing-hero.tsx` `RotatingLine`** rewritten from whole-word roll to **per-letter staggered slide-up**: renders the current word as per-letter `inline-block` spans (key `${index}-${i}`) inside a `flex justify-center overflow-hidden` mask (`ROLL_LINE=1.18em`). State machine: per `index`, `setShown(false)`+`setLeaving(false)` (letters sit `translateY(110%)`, `transition:none`) → `rAF×2` → `setShown(true)` (enter to `translateY(0)`, per-letter `transitionDelay i·STAGGER_MS=46`, `LETTER_MS=520`, `cubic-bezier(0.16,1,0.3,1)`); `setTimeout` at `enterDur+WORD_HOLD_MS(1400)` → `setLeaving(true)` (exit to `translateY(-110%)`, same stagger); `setTimeout` at `enterDur+HOLD+exitDur` → `setIndex((i+1)%len)`. Centered, no layout shift, no caret. Reduced-motion → static `lines[0]`.
- `tsc`+`next build` clean. No migration.

## Sprint 69 (2026-06-09) — four home sections made distinct + real-app phone mockup

**Goal:** the four sections looked too similar/flat. Give each its own treatment + add a fixed phone mockup showing the real app. Presentation only.

- **`how-it-works.tsx`** — typographic journey: `bg-white`, asymmetric header (heading left / subtitle right), faint horizontal path line; each step has an **oversized ghost numeral** (`text-[7rem] font-black text-[#1a2744]/[0.04]`) behind a **gradient icon node** (`h-14 w-14 from-[#009FD9] to-[#0078a8]`) + `NN` accent + title + line. Staggered `FadeInUp`.
- **`trust-benefits.tsx`** — asymmetric **bento**: large featured **dark green** pillar (`from-[#16a34a] to-[#0f7a37]`, white glass icon) `md:col-span-2`; two small white pillars (`PillarCard`: Reseñas amber, WhatsApp green, gradient tile + radial glow); wide horizontal **Soporte** card (brand gradient) `md:col-span-2`. Hover lift + icon scale, staggered reveals.
- **`grow-business-cta.tsx`** — dark **product showcase** `bg-[#111a2e]` (layered radial glows): left = eyebrow + heading + 3 perk rows + session-aware `SmartRegisterLink` + "Cómo funciona"; right = **`AppPhone`** fixed mockup. `FadeInUp` both columns.
- **`app-phone.tsx`** (new) — fixed iPhone frame (gradient bezel, dynamic island, `rounded-[34px]` screen, deep shadow). In-phone content is swappable via `PHONE_SCREEN={src,alt}` (set `src` to a Cloudinary screenshot → renders via `next/image`); default = `BuscarScreen`, a faithful on-brand /buscar placeholder (`MiniCard` with avatar, name + green `ShieldCheck` Verificado, soft profession chip, star rating, "Desde ₡…", "Solicitar servicio" + WhatsApp). Illustrative sample data only.
- **`find-by-zone.tsx`** unchanged (already distinct). `page.tsx` order unchanged.
- `tsc --noEmit` + `next build` clean. No migration.

## Sprint 68 (2026-06-09) — hero rotating word → vertical slide-up (masked roll)

- **`landing-hero.tsx` `RotatingLine`** rewritten from typewriter to a **vertical slide-up roll**: state `index` advances every `ROLL_HOLD_MS` (2200ms); the rendered stack is `[...lines, lines[0]]` (cloned first word) inside a `block overflow-hidden` mask of height `ROLL_LINE=1.18em`; the inner column is `translateY(-index·1.18em)` with `transition transform ROLL_MS=620ms cubic-bezier(0.16,1,0.3,1)` (gentle springy). On reaching the clone (`index===lines.length`), after the slide a `setAnimate(false)`+`setIndex(0)` snaps back with no transition, re-enabled next frame (rAF×2) — seamless. Each word `display:flex; justify-center; height:1.18em` → horizontally centered, accents not clipped. `aria-label` exposes the current word; the moving stack is `aria-hidden`. Reduced-motion → static `lines[0]`.
- No globals/CSS needed (caret CSS already removed in 67.1). `tsc`+`next build` clean. No migration.

## Sprint 67.1 (2026-06-09) — hero typewriter: remove cursor + center the word

- **`landing-hero.tsx` `RotatingLine`**: removed the caret span (no more `|`) and the `reduced` caret state; the typed `text` now renders as a single centered line `<span className="block" style={{minHeight:"1.1em", color:"#009FD9"}}>{text}</span>`. Removed the `relative inline-block` + invisible sizer + `absolute left-0` wrapper that was left-aligning the word — it now centers via the `h1`'s `text-center` and recenters as length changes (the `sin complicaciones.` line never shifts). Typing/holding/deleting timings unchanged; reduced-motion → static `lines[0]`.
- **`globals.css`**: removed the now-unused `@keyframes caret-blink` + `.tw-caret`/`.tw-caret-static` block.
- `tsc`+`next build` clean. No migration.

## Sprint 67 (2026-06-09) — hero rotating word → typewriter effect

- **`landing-hero.tsx` `RotatingLine`** rewritten from fade/slide to a **typewriter**: state `text` driven by a self-scheduling `setTimeout` loop (type `TYPE_MS=78`, hold `HOLD_MS=1500`, delete `DELETE_MS=42`, gap `GAP_MS=380`), cycling the same `ROTATING_LINES` list. Blinking caret `|` via `.tw-caret` (globals `caret-blink`). **No reflow:** a `relative inline-block` with an `invisible` sizer (widest word) + an `absolute` left-aligned typed span. `prefers-reduced-motion` → `setReduced`, static `lines[0]` + `.tw-caret-static` (steady caret), no typing.
- **`globals.css`** — added `@keyframes caret-blink` + `.tw-caret`/`.tw-caret-static` (+ reduced-motion override).
- Rest of the hero (search, suggestions, dome image, popular tags) untouched. `tsc`+`next build` clean. No migration.

## Sprint 66 (2026-06-09) — premium redesign of the two flat home sections (connected steps + prominent pillars)

**Goal:** the light "Contrata en tres pasos" + "Contrata con tranquilidad" sections looked flat/generic vs the dark panels. Add depth, hierarchy, motion. Presentation only.

- **`how-it-works.tsx`** — connected **journey**: section `bg-gradient-to-b from-white to-[#eef4f9]` + radial brand glow. A horizontal gradient **path line** (desktop, behind the numbers) + **`ChevronRight`** connectors link the steps. Each step = a **large number disc** (`5.5rem` white ring → `from-[#009FD9] to-[#0078a8]` gradient circle) on the path, above an elevated `rounded-3xl` white card (brand-tint icon tile, title, desc) that lifts on hover. Per-item **`FadeInUp delay={i*130}`** staggered reveal.
- **`trust-benefits.tsx`** — prominent **pillars**: section `bg-gradient-to-b from-[#eef4f9] to-white`. Each `rounded-3xl` card has a **gradient icon tile** (`h-16 w-16 rounded-2xl`, white icon) in the pillar color (verde `#16a34a→#15803d` · ámbar `#f59e0b→#d97706` · WhatsApp `#25D366→#1da851` · marca `#009FD9→#0078a8`), a **top accent bar**, and a **radial glow** behind the icon. `hover:-translate-y-2` + `group-hover:scale-105`; **`FadeInUp delay={i*110}`** staggered.
- **`page.tsx`** — dropped the outer `FadeInUp` around these two (they self-reveal per item now); order unchanged.
- find-by-zone + grow-business-cta left as-is (already the quality bar). Design guide gained the **DEPTH/CONTRAST standard** + upgraded section specs.
- `tsc --noEmit` + `next build` clean. No migration.

## Sprint 65.2 (2026-06-09) — carousel cards refined to match Bark (rectangular, near-square corners, scale-up hover, slower)

- **Speed:** `AUTO_SPEED` 0.5 → **0.32** px/frame (~19px/s) — slower, more relaxed glide.
- **Card shape:** square → **landscape rectangle** `w-[248px] h-[168px] sm:w-[300px] sm:h-[200px]` (~3:2); Cloudinary crop `w_600,h_600` → `w_640,h_440`.
- **Corners:** `rounded-2xl` → **`rounded-lg`** (subtle, near-square).
- **Hover:** dropped `card-lift` (shadow + translateY) and the inner image `group-hover:scale` → the **whole card scales up** `hover:scale-[1.04] hover:z-10` with eased `transition-transform duration-300`. Constant soft shadow kept.
- Spacing `mr-4 sm:mr-6` → `mr-4 sm:mr-5`. All else unchanged (single zigzag track, auto + arrows + drag, wrap/no-dups, reduced-motion, label `line-clamp-2`, → `/buscar?categoria=<id>`).
- `tsc --noEmit` + `next build` clean. No migration.

## Sprint 65.1 (2026-06-09) — carousel actually moves (transform-based) + square larger cards

- **Root cause of "it doesn't move":** auto-scroll incremented native `el.scrollLeft += 0.45`; browsers round `scrollLeft` to integers, so a sub-pixel/frame step never accumulates → stuck. Arrows (`scrollBy`) were also fighting the `onScroll`→normalize.
- **`category-carousel.tsx` rewritten to transform-based motion:** viewport `overflow:hidden`; the track is moved with `transform: translate3d(pos,0,0)` where `pos` is a **float ref** advanced ~0.5px/frame in a single rAF loop and wrapped into `[-half,0]` (`half = track.scrollWidth/2`, measured + re-measured by `ResizeObserver` as images load + on resize). **Arrows** = eased rAF tween of `pos` (`easeInOut`, 480ms). **Drag/swipe** = pointer events updating `pos` (mouse + touch; `setPointerCapture`; real drag swallows the trailing click). Auto pauses on `mouseenter`/drag/tween, resumes on leave/up; `prefers-reduced-motion` disables auto only.
- **Square larger cards:** `w-[220px] h-[220px] sm:w-[264px] sm:h-[264px]` (1:1, was ~3:2), Cloudinary square crop `w_600,h_600`, zigzag `translateY(±20px)`, `line-clamp-2` label, `card-lift` hover.
- **globals.css `.cat-carousel`:** now `overflow:hidden` + `touch-action: pan-y` + edge `mask-image` (replaced the native-scroll/hidden-scrollbar version).
- `tsc --noEmit` + `next build` clean. No migration.

## Sprint 65 (2026-06-09) — category carousel rebuilt: ONE staggered (zigzag) track

**Correction:** earlier sprints (63/64.1) built the carousel as TWO rows in opposite directions. That was a misread. The real design is **ONE single horizontal carousel** with the cards in a **staggered/zigzag** vertical pattern, moving together as a single unit, with **auto-scroll + manual drag/swipe/arrow control**.

- **`src/components/landing/category-carousel.tsx`** (new, client): single scroller. One `cat-track` holding the 19 categories **twice** (loop). `translateY(±18px)` on even/odd cards = the zigzag (purely visual; horizontally one strip). rAF auto-advances `scrollLeft` by `AUTO_SPEED` (0.45px/frame); `normalize()` keeps `scrollLeft` in `[0, scrollWidth/2)` for a seamless wrap. Starts mid-set (`scrollWidth/4`). Manual: `onPointerDown/Move/Up` mouse drag (sets `paused`, `is-dragging`, suppresses the post-drag click when `moved`); touch uses native `overflow-x` scroll (`onScroll`→normalize); `nudge(±1)` arrow buttons `scrollBy` (desktop only, `hidden md:flex`). Pause on `mouseenter`/drag, resume on leave/up. Reduced-motion (`matchMedia`) disables auto only. Per-card `mr-4 sm:mr-6` spacing (not gap) so one set width is exact.
- **`src/components/landing/pros-section.tsx`**: trimmed to the heading/subtitle + `<CategoryCarousel />` + "Ver todas las categorías".
- **`src/app/globals.css`**: replaced the two-row `cat-track--left/right` keyframes with a single `.cat-carousel` hidden-scrollbar `overflow-x` scroller (+ `.is-dragging`, edge `mask-image`, `touch-action: pan-x`).
- Cards: uniform `w-[200px] sm:w-[248px] h-[150px] sm:h-[186px]`, `rounded-2xl`, soft shadow, dark gradient + `line-clamp-2` white label, `card-lift` + image zoom; ONE Cloudinary image per id; → `/buscar?categoria=<id>`; no online badge.
- `tsc --noEmit` + `next build` clean. No migration.

## Sprint 64 (2026-06-09) — new home sections (3-steps · trust · find-by-zone · pro CTA) + carousel fix

**Goal:** add the four home sections from Claude Design (re-implemented with our tokens, wired to real data) and fix the category carousel. Presentation/content only — no business logic changed.

**New / changed sections (`src/components/landing/`):**
- **`how-it-works.tsx`** (new) — "Contrata en tres pasos" on `bg-[#f4f7fa]`: eyebrow "ASÍ DE FÁCIL" + 3 `rounded-2xl` cards (brand number chip top-left, muted icon top-right) — Describe tu proyecto / Compara profesionales / Coordina y contrata. Honest "no intermediarios" framing.
- **`trust-benefits.tsx`** (restyled) — "Contrata con tranquilidad": eyebrow "CONFIANZA" + 4 pillars now with **colored icon tiles** (Identidad verificada green · Reseñas reales amber · Coordina por WhatsApp green/official icon · Soporte brand). Still benefits-not-features, no invented numbers.
- **`find-by-zone.tsx`** (new, client; replaces `trusted-provinces.tsx` which was **deleted**) — "Encuentra profesionales en tu zona": dark left rail ("¿Dónde lo necesitas?" + **"Usar mi ubicación"** → `navigator.geolocation` → `router.push('/buscar?sortBy=cercania&lat&lng')` + honest disclaimer) and white right pane with **7 province tabs** → active province's **real cantón chips** → `/buscar?provincia=<id>&canton=<id>`; "Ver profesionales" → `/buscar?provincia=<id>`. Takes a `coverage: ZoneCoverage` prop.
- **`grow-business-cta.tsx`** (new) — "Haz crecer tu negocio con ContrataCR": dark `#1a2744` panel w/ radial glow — eyebrow "PARA PROFESIONALES", pitch, **`SmartRegisterLink` "Registrarse como profesional"** (session-aware) + white "Cómo funciona" (→ /como-funciona), 3 perk rows (100% gratis · Destácate con tu verificación · Clientes que te contactan directo). Honest: free, no commissions.

**Real coverage (no fake counts):**
- **`getZoneCoverage()`** added to `src/lib/queries/professionals.ts` — returns `{ byProvince: Record<provId, cantonId[]>, countryWide }`. Best-effort + modern/legacy column fallback (`is_banned`/`search_*`/`coverage_*`), skips disabled/rejected. Aggregates covered cantones from fixed `canton_id`/`provincia_id`, `search_cantones`/`search_provincias`, whole-province `coverage_provincias` (→ all its cantones), and `coverage_country` (→ every zone). `find-by-zone` shows the count + chips **only when > 0**, else an honest empty state.
- **`src/app/[locale]/page.tsx`** now `async` — awaits `getZoneCoverage()` and renders Hero → ProsSection → HowItWorks → TrustBenefits → FindByZone(coverage) → GrowBusinessCta (each in `FadeInUp`).

**Carousel fixes (`pros-section.tsx` + `globals.css`):**
- **Opposite directions** — top row `cat-track--left` (`0→-50%`), bottom row `cat-track--right` (`-50%→0`); clearly alternating.
- **Uniform cards** — fixed `w-[200px] sm:w-[236px] h-[150px] sm:h-[164px]`; long labels `line-clamp-2` (never widen).
- **No on-screen duplicates** — the two rows hold **distinct** category sets (`ROW_ONE` first 10, `ROW_TWO` next 9); spacing is a per-card **right-margin `mr-4 sm:mr-5` (not flex `gap`)** so each set is exactly `N×(card+margin)` wide and `translateX(-50%)` lands pixel-perfect; the doubled set stays off-screen (`aria-hidden`).
- ~70s desktop / ~48s mobile, `linear infinite`, pause-on-hover, `prefers-reduced-motion` → plain scroll, soft edge mask.

`tsc --noEmit` + `next build` clean. No migration.

## Sprint 63 (2026-06-09) — home category carousel (Bark-style two-row band)

**Goal:** model the home "Profesionales para cada proyecto" section on Bark's category bands (no "available online" badge). Presentation only — no logic changes.

- **`src/components/landing/pros-section.tsx`** rebuilt: the 19 `HOME_CATEGORIES` are split into two rows (`ROW_ONE` = first 10, `ROW_TWO` = next 9) rendered as a **full-bleed two-row marquee**. `MarqueeRow` renders `[...ids, ...ids]` (cards twice; the duplicate half is `aria-hidden`) so the `-50%` translate loops seamlessly. Cards are **uniform** — fixed size `w-[210px] sm:w-[244px] h-[150px] sm:h-[168px]`, `rounded-2xl`, soft shadow, `card-lift` hover + `group-hover:scale-[1.07]` image, dark bottom gradient + label + arrow. Each links to `/buscar?categoria=<id>`; ONE self-hosted Cloudinary image per id (`contratacr/categorias/<id>`, cloud `dxxrjx2go`). **No availability/online badge.** Heading + "Ver todas las categorías" stay in the centered max-w container; only the carousel rows are full-bleed.
- **`src/app/globals.css`**: added keyframes `cat-scroll-left` (0→-50%) / `cat-scroll-right` (-50%→0) and classes `.cat-carousel` (edge `mask-image` fade), `.cat-track` + `.cat-track--left`/`--right` (64s desktop, 46s ≤640px, `linear infinite`), pause via `.cat-carousel:hover .cat-track { animation-play-state: paused }`, and a `prefers-reduced-motion: reduce` block that drops the animation + mask and makes the carousel a normal `overflow-x:auto` scroll.
- Design guide updated (home category cards → added the "Category carousel (Bark-style two-row band)" bullet). `tsc --noEmit` + `next build` clean. No migration.

## Sprint 62.2 (2026-06-09) — /buscar header consistency + verified-mark / tag hierarchy

Presentation only; no logic touched.
- **Header consistency** (`buscar/page.tsx`): swapped the old `@/components/layout/navbar` `Navbar` for the app-wide **`LandingNavbar`** (Thumbtack-style) so /buscar's header is identical to the rest of the app; since it's `fixed`, added an `h-16` spacer so the title bar/content clear it (the layout's `sticky top-16/20` offsets already assume a 64px header). *(Other old-`Navbar` pages — dashboards, login, profile, registro… — were left as-is; only /buscar was in scope.)*
- **Verified mark moved next to the NAME** (`professional-card.tsx`): "Verificado" is now a **subtle green `ShieldCheck` + label to the right of the name** (unverified → amber `ShieldAlert` + "Sin verificar"), **not** a bordered pill — so the trust state reads differently from category tags.
- **Tag hierarchy / cleaner chips:** profession tags are now **soft muted pills** (`bg-[#f3f4f6] text-[#6b7280]`, no brand border), **capped at 2** + `+N`; contact-only/featured are soft no-border tinted chips. Removed the "wall of identical bordered pills" look.
- **Icons:** kept small/few/one set (lucide `h-3`–`h-4`, muted) + official WhatsApp icon only for WhatsApp — documented as a standard.
- **Action buttons** unchanged from 62.1 (uniform "Solicitar servicio" + small `w-9` secondary WhatsApp/llamar icons, only when enabled). All functionality intact: numbered cards↔pins, slot booking, filters, verified-first + toggle, casos, private state. `tsc`/`next build` clean.

## Sprint 62.1 (2026-06-09) — /buscar card refinements (favorite + secondary actions)

Follow-up tweaks to the sprint-62 cards (visual layer; functionality unchanged):
- **Favorite** (`save-button.tsx`): smaller + subtler — `w-9 h-9` → **`w-7 h-7`**, `Bookmark` `h-3.5`, white/subtle border (`#e5e7eb`, brand only when saved), pinned consistently at `top-2.5 right-2.5`. The card's name (`pr-9 md:pr-0`) and **price row** (now `pr-9 md:pr-10`) clear it so it **never overlaps the price**, desktop or mobile.
- **Secondary actions** (`professional-schedule.tsx`): the WhatsApp + llamar buttons are **small square `w-9` secondary icon-buttons next to "Solicitar servicio"** (rows use `items-stretch` so they match the primary's height), shown only when enabled — kept one-tap, official WhatsApp icon, never folded into the primary. Applied to both the bookable and contact-only branches.
- Verified nothing lost vs. before: WhatsApp/llamar appear when enabled, private/contact-only renders, casos-de-éxito link, verified/"sin verificar" pills, numbered cards ↔ numbered pins. `tsc`/`next build` clean.

## Sprint 62 (2026-06-09) — /buscar result cards + availability redesign (visual layer)

Adapted a Claude-Design reference (`design/buscar`, now deleted) into the real /buscar — **visual layer only; no business logic touched**, all functionality preserved.

- **Card** (`professional-card.tsx`, server): rewrapped from a `<Card>` fixed `md:h-[216px]` to a `rounded-2xl bg-white border` div with **content-driven `md:min-h-[190px]`** (`pl-10` clears the number badge). **Price moved** out of the name row into the **action zone header** ("Desde ₡14 000/hora" — `Desde` eyebrow when numeric, else "Tarifa"). Identity zone: 52px avatar · name (truncate, hover→brand) · **verification pill** (green "Verificado" / amber "Sin verificar") + business name · **profession pills** (`rounded-full #EBF5FB/#0089bb/#bfdbfe`) + `+N` + contact-only/featured chips · **one-star rating** (`#ff9b32` + value + "· N reseñas") · **MapPin location** + **Truck coverage** lines · "Ver casos de éxito (N)" (`mt-auto`). Dropped the `Badge`/`Card`/`StarRating` deps in this card.
- **Availability** (`professional-schedule.tsx`, client): **packed day columns** (filter to days with slots — no "—" filler), uppercase `dayLabel` (`Hoy`/`Mañana`/`Jue 11`, brand when `soon` ≤ tomorrow), brand-tint time chips + **dashed `+N`** (both `pick()` → booking pre-selected), chevron paging (`w-4` arrows). Multi-location chips → a **brand-tint `select` dropdown**; single-location → `MapPin`+label or "Próximos horarios". Kept the contact-only branch, "Ver horario completo", and the "Solicitar servicio" + WhatsApp/llamar action row + booking/registration modals **unchanged**.
- **Page** (`buscar/page.tsx`): number badge moved to an inset `top-2.5 left-2.5 h-6 w-6`. Wrapper `#pro-card-<id>` / `data-pro-id` / `scroll-mt-24` kept so the **map pin-hover highlight** (`ring-2 ring-[#009FD9]` + scroll) still works. Empty/loading/error states unchanged (no-results card; server-rendered). Filters sidebar + 3-column shell + real `GoogleMapPanel` untouched (they already matched the reference).

Validation: `tsc --noEmit` clean; `next build` succeeded.

## Sprint 61 (2026-06-09) — verification gating: unverified pros usable + labeled, verified ranked first

Changed the model so professionals who chose "¿No es tu información?" or "No tengo identificación costarricense" (no_cr_id / pending / under_appeal) are **no longer blocked from search** — they appear, clearly labeled, ranked below verified. Appeals, admin review, and add-cédula-later all unchanged. **No migration** (RLS already public; gating was in-query).

- **Search query** (`src/lib/queries/professionals.ts`): removed the `no_cr_id.eq.false,verification_status.eq.verified` visibility gate — unverified now listed; only `verification_status = 'rejected'` (and banned/disabled) stay hidden. **Verified-first ranking**: DB orders `is_verified → is_featured → <sort>`, then a **stable JS pass** `rank = verified(2)+featured(1)` finalizes it authoritatively across all sorts (incl. cercanía), so verified always outrank unverified while the chosen sort is preserved within each group.
- **Two unmistakable states everywhere:** green **"Identidad verificada"** (`ShieldCheck`) vs amber **"Identidad sin verificar"** (`ShieldAlert`) — added to the /buscar card (`professional-card`), the public profile (`profesionales/[slug]`, both the header chip and the stats card), so no pro is ever shown without an indicator.
- **Booking/contact notice** (`booking-modal`): when the pro isn't verified, an amber band — "Este profesional aún no ha verificado su identidad. Coordina con cuidado." (informative, not an endorsement).
- **Pro panel** (`verification-panel` + dashboard header): reframed the no_cr_id/pending banners from "no apareces en búsquedas" → **"Identidad sin verificar"** ("ya apareces… por debajo de los verificados; verifica para obtener la insignia y subir"); header badge now "Identidad sin verificar · visible para clientes". Add-cédula-later + appeals unchanged.
- **Filter unchanged:** the single "Solo identidad verificada" toggle stays (no extra filter added).
- **Legal framing:** ContrataCR only *displays* verification status; wording informs, never implies endorsement or guarantees. Rejected profiles remain hidden.

Validation: `tsc --noEmit` clean; `next build` succeeded.

## Sprint 60.1 (2026-06-09) — header compact search = hero search twin (sticky transition)

`landing-navbar` compact (scrolled) search rebuilt to **mirror the hero search bar exactly** — same `rounded-[6px]` white bar, Search-icon + service input + divider + provincia select + "Buscar", same placeholder ("Describe tu proyecto o problema — sé tan detallado como quieras!"), centered `max-w-5xl` to align with the hero — so on scroll it reads as the **same search "sticking" to the header**. No logic change; `next build` clean.

## Sprint 60 (2026-06-09) — categories finalized + consistent; home category images self-hosted on Cloudinary

Category taxonomy + home imagery only. Business logic, /buscar logic, booking logic, panels untouched. Zones (provinces/cantones) untouched.

**Part A — taxonomy (final):** locked to the existing **`CATEGORY_GROUPS`** in `src/lib/data/categories.ts` — 12 CR groups (Hogar y construcción · Jardín y exterior · Limpieza · Tecnología · Servicios profesionales · Salud y bienestar · Belleza y estética · Educación · Mudanzas y transporte · Eventos · Seguridad · Automotriz), ~110 sub-services, **no foreign categories** (no limousine/magician/PI). Kept as-is → **no migration** (DB already seeded by migrations 001/013; the `professionals`/`projects` category FKs were dropped in 013, so ids stay flexible; `bookings.category_id` still references `categories(id)` and all current ids exist there).

**Part B — consistency:** `categories.ts` is the **single source of truth**. Verified the user-facing surfaces all read from it: home category section, the "Categorías" mega-menu, the /buscar category filter (`category-search`), Publicar proyecto, professional profile `services-editor`, the "¿No ves tu categoría?" suggest flow, and Ayuda. (`cr-geography.ts` keeps a legacy internal `CATEGORIES` list used only by `/buscar`'s `hero-search` — left untouched to avoid touching search logic.)

**Part C — home images (self-hosted):** rebuilt `src/components/landing/pros-section.tsx` from its own 20-category list + 80 **hotlinked** Unsplash URLs into a clean grid of **19 category cards, ONE image per category**, each a **self-hosted Cloudinary** image. Sourced license-safe stock, **uploaded into Cloudinary** `contratacr/categorias/<categoryId>` (cloud `dxxrjx2go`) via the uploader (remote-URL ingest), delivered with `f_auto,q_auto,c_fill,g_auto,w_600,h_450` (already whitelisted: `res.cloudinary.com`). Labels via `getCategoryLabel` (taxonomy), card → `/buscar?categoria=<id>`, uniform card + hover, + "Ver todas las categorías" → /categorias. Categories shown (have matching imagery): limpieza, plomería, electricidad, jardinería, pintura, carpintería, construcción, cerrajería, mudanzas, mecánica, peluquería, entrenamiento personal, masajes, psicología, desarrollo web, contabilidad, marketing digital, fotografía, DJ y sonido.

Validation: `tsc --noEmit` clean; `next build` succeeded; Cloudinary delivery URLs return 200.

## Sprint 59 (2026-06-09) — home: honest copy, scroll-to-search, trust benefits, swappable hero

HOME + shared header only. Panels, /buscar, booking, business logic untouched. No migration. Reference: Thumbtack.

- **Header scroll** (`landing-navbar`): the compact (scrolled) row is now **only a single centered search bar** (rounded pill, `max-w-2xl`, `justify-center`) — the logo, nav menus and right-side buttons are hidden once past the hero. Compact placeholder de-vos'd → "Busca un servicio o profesional…".
- **Hero image** (`landing-hero`): extracted to a **single `HERO_IMAGE = { src, alt }` constant** (one-line swap). Placeholder is a local service professional at work (Unsplash `1504148455328…`), not a house; final CR photo to be self-hosted on Cloudinary when provided.
- **Honest copy / no false claims** (`trusted-provinces` → zones): removed "Profesionales en toda Costa Rica" + "No te preocupés… cubrimos cada provincia y cantón del país". New honest zones block: **"Encuentra profesionales en tu zona"**, 7 province chips → `/buscar?provincia=<id>`, "Ver todos los profesionales". No coverage promise; dropped the canton sub-row.
- **New `trust-benefits.tsx`** section (added to `page.tsx` between categories and zones): 4 **client-benefit** pillars — Identidad verificada · Reseñas reales · Coordina fácil por WhatsApp · Soporte cuando lo necesites — icon + title + one line, no invented numbers/ratings, no internal/technical features.
- **"vos" sweep** in the header: nav "Registra tu perfil"; login modal ("Completa…", "Inicia sesión para continuar", "Regístrate en segundos", "¡Revisa tu correo…!", "¿No tienes cuenta?", "Regístrate gratis", "¿Ya tienes cuenta?", "Inicia sesión").

Validation: `tsc --noEmit` clean; `next build` succeeded.

## Sprint 58 (2026-06-09) — Thumbtack-style home header + hero polish

HOME + shared header only. Panels, /buscar, booking, business logic untouched. No migration. Reference: **Thumbtack** (single target).

- **Header** (`src/components/landing/landing-navbar.tsx`): inner container changed from `mx-auto max-w-7xl px-…` to **full-width** `px-4 sm:px-6 lg:px-8`, so the **logo is flush far-left**, nav menus (Interior/Exterior/Más servicios/Recursos) right after, and the right actions sit flush far-right. Right-action order was already the target — **"Registrarse como profesional" (pill) · "Iniciar sesión" · ES/EN** — kept; logged-in state (Mi panel/notifications/avatar/idioma) kept. Scroll-to-compact-search (IntersectionObserver on `#hero-search-sentinel`, both rows in the same full-width container) kept.
- **Hero** (`src/components/landing/landing-hero.tsx`): `ROTATING_LINES` refined to the highest-demand CR services — **Limpieza, Plomería, Electricidad, Jardinería, Pintura, Niñera, Mudanzas, Fumigación** (es) / Cleaning, Plumbing, Electrical, Gardening, Painting, Babysitting, Moving, Pest control (en); dropped niche words (Carpintería/Soldadura). Animation unchanged (smooth fade/slide, ~2.5 s/word). Headline format kept ("`<servicio>`, sin complicaciones." via `landing.hero.headline2`), subtitle kept ("Describe tu proyecto y te conectamos con el profesional perfecto." — already no-"vos").
- **Hero image**: replaced the US-style house (Unsplash `1570129477492…`) with **one fixed Costa-Rican service-worker photo** (Unsplash `1581578731548-c64695cc6952`, validated) in the **same half-circle/dome** shape, `priority`, not rotating. Per-category hero images are documented in the design guide as a **future enhancement**, not now.

Validation: `tsc --noEmit` clean; `next build` succeeded.

## Sprint 57 (2026-06-09) — home cleanup + legal pages (Términos / Privacidad)

HOME + footer + two legal pages only. Panels, /buscar, booking, business logic untouched. No migration.

- **Home** (`src/app/[locale]/page.tsx`): now just `LandingNavbar · LandingHero · ProsSection · TrustedProvinces · BackToTop · LandingFooter`. **Removed** `MarqueeStrip` ("Impulsando proyectos…" brand-logo strip), `PhoneMockupSection` ("Por qué los clientes eligen ContrataCR"), `ExploreTabs` ("Explora más proyectos"), `ResourcesSection` ("Recursos útiles") and `AppSection` ("La app que necesitas para todo"). Component files kept on disk (unused) — easy to restore if ever wanted.
- **Footer** (`src/components/landing/landing-footer.tsx`): bottom bar now has **Términos y Condiciones** → `/terminos` and **Política de Privacidad** → `/privacidad` (next to "Hecho en Costa Rica").
- **`/terminos` + `/privacidad`** rebuilt to a clean legal-document layout: a visible amber **draft banner** ("Borrador pendiente de revisión legal… No constituye asesoría legal ni la versión definitiva"), `h1` + last-updated, a **"Contenido" table of contents** with in-page anchors, and **numbered `<section id>`** blocks (`scroll-mt-24`) of readable prose, plus a support-contact box. Costa Rican Spanish, no-"vos".
- **Content is a BASE DRAFT pending review by a licensed Costa Rican lawyer before launch** — not authoritative legal text. Framing: ContrataCR is an **intermediary** (connects, does not guarantee outcomes/quality), identity verification confirms identity only, payments off-platform, two-way reviews/reports, **Ley 8968** + data minimization. References ContrataCR only.

Validation: `tsc --noEmit` clean; `next build` succeeded. (Sprints 54–56 — Bark home experiment + its revert — already superseded.)

## Sprint 55 (2026-06-09) — corrected Bark match: minimal header + Categorías mega-menu, uniform cards, slow alternating carousel

Corrections to the sprint-54 home/header (HOME + shared HEADER only — panels, /buscar, booking, business logic untouched). No migration.

**Header** (`src/components/landing/landing-navbar.tsx`):
- Removed the four top-nav menus (Interior · Exterior · Más servicios · Recursos). Now a **single "Categorías" mega-menu** (Explore-style, 3-pane, 780px): a left **groups** column (`CATEGORY_GROUPS`, emoji+label) that sets `activeGroup` on hover + "Ver todas" → /categorias; a middle column with the active group's **items** → `/buscar?categoria=<id>`; a right **"Servicios populares"** column.
- Right side: **"Iniciar sesión"** then a pill **"Únete como profesional"** (was "Registrarse como profesional"). Logged-in state (Mi panel, NotificationBell, avatar menu, idioma) unchanged.
- Scroll-to-compact-search kept (IntersectionObserver on `#hero-search-sentinel`); compact placeholder is now **"Busca un servicio…"**.
- Mobile drawer rebuilt around Categorías (popular services + "Ver todas") + a "Más" group; pill renamed.

**Home** (`src/components/landing/bark-home.tsx`):
- Copy **de-vos'd** (design-guide standard): "Encuentra al profesional perfecto para ti", "Recibe cotizaciones gratis en minutos", "¿Qué servicio buscas?".
- Hero **location typeahead** (CR has no postcode): types a provincia/cantón, accent-insensitive suggestions from `cr-geography` `PROVINCES`, click to fill; passes `provincia` (+ `canton`) to `/buscar`.
- **Removed every "Disponible en línea" badge**; dropped the `online` flag.
- **One uniform `ServiceCard`** used everywhere (bands + grids): `aspect-[4/3] rounded-xl` photo over `#EBF5FB`, `group-hover:scale-105`, label below turning brand on hover, → `/buscar?categoria=<id>`.
- Carousel is now **two rows in opposite directions** (`barkLeft` 72s / `barkRight` 86s, linear, `will-change: transform`), **pause on hover**, `prefers-reduced-motion` safe — replaces the single fast strip.
- **Removed the "Categorías más populares" arrow carousel** (deferred to post-launch; documented in the design guide — don't promote categories without professional coverage).

Validation: `tsc --noEmit` clean; `next build` succeeded.

## Sprint 54 (2026-06-09) — new home page modeled on Bark.com (ContrataCR content)

Per request, rebuilt the **main page** to mirror the structure/interactions of bark.com (their layout + behaviors, our brand/content/categories — no Bark assets). No migration.

- **`src/components/landing/bark-home.tsx`** (new, client) — the whole home body; `page.tsx` now renders `LandingNavbar` + `BarkHome` + `BackToTop` + `LandingFooter`.
- **Hero**: centered "Encontrá al profesional perfecto para vos" / "Recibí cotizaciones gratis en minutos" + a two-field search (¿Qué servicio buscás? · Provincia · **Buscar**) → `/buscar?q=&provincia=`, with a "Popular: …" link row. Keeps `#hero-search-sentinel` so the navbar's compact search reveals on scroll (the requested behavior — already implemented in `LandingNavbar` via IntersectionObserver, untouched).
- **Auto-scrolling category marquee**: full-width strip of photo cards (label overlaid), slow infinite CSS keyframe loop (`barkMarquee` ~55s), **pauses on hover**, disabled under `prefers-reduced-motion`. List duplicated for a seamless loop.
- **Grouped sections** (label below image, Bark style): Hogar y jardín · Salud y bienestar · Bodas y eventos · Servicios para empresas — 3 photo cards each + "Ver todas" → `/categorias`.
- **"Categorías más populares" carousel**: horizontal scroll row with ◀ ▶ buttons (`scrollBy`).
- **Images**: Unsplash (`images.unsplash.com`, already whitelisted in `next.config`); photo ids were HTTP-validated. Plain `<img loading="lazy">` over a `#EBF5FB` tint so any gap degrades on-brand. Each card links to `/buscar?categoria=<id>`; online-capable services show a "Disponible en línea" badge.
- Voice matches the (reverted) marketing pages + navbar: Costa Rican "vos".

Validation: `tsc --noEmit` clean; `next build` succeeded. **/buscar, the panels, and booking remain untouched.**

## Sprint 53 (2026-06-09) — git revert: marketing/landing surface back to pre-design baseline `6925b1c`

The sprint-52 "strip styling, keep content" restyle wasn't what was wanted — the goal was a true **revert** of the design-guide redesign of the public/marketing pages back to their state **before the design work began** (baseline `6925b1c`, last commit before the design guide `5cd7ab6`), **keeping `/buscar`, the panels, and booking exactly as they are now**.

Method — version control, not a hand redesign:
- **`git checkout 6925b1c -- <files>`** restored: `src/app/[locale]/page.tsx` (home — now composes the old `LandingHero`/`ProsSection`/`PhoneMockupSection`/`ExploreTabs`/`MarqueeStrip`/`ResourcesSection`/`TrustedProvinces`/`AppSection`, all of which still exist), `como-funciona`, `categorias`, `ayuda`, `atraer-clientes`, `not-found`, `landing-hero`, `landing-navbar`, `landing-footer`, `app-section`, `explore-tabs`, `phone-mockup`, `resources-section`, `trusted-provinces`.
- **Deleted** the net-new marketing files: `para-profesionales/page.tsx`, `sobre-nosotros/page.tsx`, `home-sections.tsx`, `pro-cta.tsx`.
- **Kept (NOT reverted):** `/buscar` (+ search-filters/results-layout/professional-card/professional-schedule/category-search/search map), client + professional **panels** (`dashboard/**`), the **booking** flow (`booking-modal`), `messages/es.json`+`en.json` (shared — reverting would break /buscar sort labels and reintroduce "vos" in the kept areas), all auth/registration/api/maps/ui/admin code, `profesionales/[slug]`, and the **soporte ticket backend** (`/api/contact`, `support_tickets`, Admin → Soporte).
- **Kept the two new legal pages** `terminos` + `privacidad`: they have no baseline version, but the **kept registration flow links to them** — deleting would 404 the consent links. (`layout/footer.tsx` also links them but is dead code / unused.)

Caveat surfaced to the user: `landing-footer.tsx` is the shared global footer (also rendered under /buscar + the panels), so reverting it returns those pages' **footer** to the pre-design form — their own content/search/booking functionality is untouched.

Validation: source `tsc --noEmit` clean (only stale `.next` generated route-validator entries for the deleted pages, which regenerate); full `next build` succeeded with the deleted routes gone and all kept routes present. No migration.

## Sprint 52 (2026-06-09) — marketing pages: strip design-guide styling, keep content ("plain baseline look") — SUPERSEDED by sprint 53

Per request, rolled back the **design-guide visual layer** on the marketing/static pages while keeping **all current copy, sections, and the two newer pages** — a restyle, not a git revert (a pure revert would have lost the current content and deleted the new pages). The kept areas (**/buscar, client + professional panels, the booking/"Solicitar servicio" flow**) were deliberately **not touched**.

What was stripped (the consistent design-guide signatures):
- **Radial brand-glow hero overlays** (`bg-[radial-gradient(70%_60%_at_50%_0%,#EBF5FB…)]` + `relative overflow-hidden` hero shells) → plain white heroes.
- **Heavy multi-layer / brand-colored shadows** (`shadow-[0_8px_48px…]`, `shadow-[0_8px_32px_rgba(0,159,217,…)]`, hover-glow) → `shadow-sm`.
- **`active:scale-[0.97]` + `transition-all duration-150`** micro-interactions → plain `transition-colors`.
- **Decorative blur circles** + **floating `rounded-3xl` dark CTA panels** → flat full-width `bg-[#1a2744]` CTA bands (consistent with the already-plain CTAs).
- `rounded-3xl` callout cards → `rounded-2xl`.

Files: `src/components/landing/landing-hero.tsx`, `src/components/landing/pro-cta.tsx` (home), and pages `como-funciona`, `para-profesionales`, `atraer-clientes`, `ayuda`, `sobre-nosotros`. `home-sections.tsx` (PopularCategories/HowItWorks/WhyContrataCR) was already plain → untouched. `tsc --noEmit` clean. No migration.

> Note: this intentionally diverges from `contratacr-design-guide.md`'s polish on these specific marketing pages, by request. The guide still governs /buscar, the panels, and booking.

## Sprint 51 (2026-06-09) — "Contactar soporte" creates an admin ticket (+ Admin → Soporte queue)

**Run this migration in Supabase SQL Editor:**
```
039_support_tickets.sql  -- support_tickets (admin ticket queue for the contact form)
```

The `/soporte` page was already solid (prefills the logged-in user, guests welcome, required-field validation, attachments, WhatsApp option, <24 h expectation) — the gap was that the form only emailed.
- **`/api/contact` now records every message as an admin ticket** in the new `support_tickets` table (service-role insert; captures `user_id` when logged in) AND still emails support. The form succeeds if EITHER the ticket is saved OR the email sends, so it works even if email isn't configured.
- New **Admin → Soporte** queue (`/admin/soporte`, `/api/admin/support`, `admin-support.tsx`, tab in `admin-shell`): Abiertos/Cerrados tickets with the message, a "Responder" mailto, and Resolver/Reabrir — mirroring the category/insurer queues.
- Page polish: clearer expectations copy ("te respondemos por correo en menos de 24 horas. Para algo urgente, escríbenos por WhatsApp"), official `WhatsAppIcon`. No-"vos".

---

## Sprint 50 (2026-06-09) — "Consejos para profesionales" (atraer-clientes) refresh

No migration. Presentation/content only. The page's tips (foto profesional, verifica cédula, casos de éxito, responde rápido, pide reseñas, cobertura por cantón, bio específica, disponibilidad al día), the Do/Don't list and the CR-market reality section were already strong and no-"vos" — refreshed to the guide: **brand-glow hero** + token alignment (#111827/#6b7280, rounded-2xl), and the CTA is now **session-aware** ("Registra tu perfil gratis" via `SmartRegisterLink` → registration logged-out / panel logged-in) with a "Por qué ContrataCR" → `/para-profesionales` secondary (replacing the bouncing "Ir a mi panel").

---

## Sprint 49 (2026-06-09) — "Centro de ayuda" rebuilt (searchable, grouped FAQ)

No migration. Presentation/content only.
- Added a **live search** (accent-insensitive over question + answer) — flat results while querying, otherwise FAQ **grouped by audience**: **Para clientes** (costo/sin comisiones, buscar+contactar, publicar proyecto, pago off-platform, qué es identidad verificada, reseñas, reportes, privacidad/Ley 8968), **Para profesionales** (registro, verificación/insignia TSE, recibir clientes, disponibilidad, sin comisiones, propuestas), **Cuenta y seguridad** (intermediary framing — no garantiza el trabajo, cerrar/desactivar cuenta, contraseña).
- One-open-at-a-time accordion in bordered cards; **Contactar soporte** + **WhatsApp** footer; brand-glow hero; no-"vos"; responsive.

---

## Sprint 48 (2026-06-09) — global header/footer polish + legal/about pages + friendlier 404

No migration. Presentation/content only.
- **Footer**: added a **"ContrataCR"** column (Sobre nosotros · Para profesionales · Términos · Privacidad) + legal links (Términos · Privacidad) in the bottom bar (grid 5→6 cols). "Registra tu perfil" stays session-aware (`SmartRegisterLink`).
- **Header (navbar)**: the megamenu **"Registra tu perfil"** now routes to the user's **panel when logged in** (`renderLink` role check); the top-right "Registrarse como profesional" CTA stays logged-out-only.
- **New static pages** (none existed before): **Sobre nosotros** (brand story + values), **Términos y condiciones** and **Política de Privacidad** — ContrataCR-specific, intermediary framing (connects, no guarantees, no commissions, payments off-platform, identity-verified ≠ quality guarantee), **Ley 8968** data-protection basics, support contact. Linked from the footer.
- **404** redesigned: brand-glow, "404" numeral + clear **Ir al inicio** / **Buscar profesionales** actions; the error/"fuera de servicio" boundary kept (already on-brand). No-"vos", subtle reveals, responsive.

---

## Sprint 47 (2026-06-09) — professional recruitment landing `/para-profesionales` (new)

No migration. Presentation/content only — registration flow & logic untouched.
- Created a dedicated **"Para profesionales"** recruitment landing (none existed; the CTAs previously jumped straight to the registration flow): hero value prop ("Haz crecer tu negocio en Costa Rica") + **session-aware** "Registra tu perfil gratis" (`SmartRegisterLink` → registration logged-out, panel logged-in) + honest trust chips; a **benefits** grid (clientes directos por WhatsApp · **sin comisiones — te quedas con el 100%** · identidad verificada gratis · visible en tu cantón · controlas tu agenda · muestra tu trabajo); a **3-step** "Empieza" recap (crea perfil → verifica identidad/TSE → recibe clientes); a green **identity-verified** trust band linking to `/proveedores-autorizados`; and a dark final CTA. Claims kept honest & consistent with the intermediary framing (it's free, no commissions — not "pay-when-you-win").
- Linked it from the navbar **Recursos → Profesionales → "Para profesionales"**.

---

## Sprint 46 (2026-06-09) — "Categorías" page redesigned (live search + grouped grid + suggest)

No migration. Presentation/content only.
- Rebuilt with a **live category search** (accent-insensitive `normalizeText` filter across all groups → flat results), a cleaner **grouped grid** (icon + group header + category links → `/buscar?categoria=…`), and a **"¿No ves tu categoría?"** suggest box → `POST /api/categories/suggest` (admin ticket) with a thank-you state.
- Brand-glow hero, design-guide tokens, subtle `FadeInUp`, no-"vos".
- **Category-name cleanup** (wording only — ids/data relationships unchanged): "Limpieza post construcción" → "Limpieza post-construcción"; "CCTV" → "Circuito cerrado (CCTV)".

---

## Sprint 45 (2026-06-09) — "¿Cómo funciona?" redesigned (clear two-audience flow + trust)

No migration. Presentation/content only.
- Restructured into clearly separated **Para clientes** (3 numbered steps: Busca → Elige con confianza → Coordina por WhatsApp, plus the two ways to start: buscar / publicar proyecto) and **Para profesionales** (3 steps: Crea tu perfil → **Verifica tu identidad — cédula contra el padrón/TSE** → Recibe clientes) paths.
- Added a **"Pensado para la confianza"** section (identidad verificada · sin intermediarios — *ContrataCR conecta, no garantiza resultados ni cobra comisiones* · reseñas en ambas vías) and refreshed the FAQ (payments off-platform, intermediary framing, two-way reviews).
- Pro CTA is **session-aware** (`SmartRegisterLink`); fixed residual "vos" (Acordás→Acuerdan, Revisás→Revisas); design-guide tokens (numbered Step cards, brand-glow hero, dark final CTA); subtle FadeInUp. Recorded the informational-page pattern in the guide.

---

## Sprint 44 (2026-06-09) — home page refocused (less-is-more) + honest trust, no fake brands/app

No migration. Presentation/content only — no panels/buscar/booking/logic touched. Recorded as the standard home structure in the design guide.
- **Removed** the crowded/filler + misleading sections: the phone mockups (`PhoneMockupSection` + the app-section phone), the **"Muy pronto" App Store/Google Play section** (`AppSection`), the **brand-logo marquee** (`MarqueeStrip` — unaffiliated CR brands implied a false partnership/legal risk), and editorial filler (`ExploreTabs`, `ResourcesSection`, `ProsSection`, `TrustedProvinces`). (Component files left in place but no longer composed.)
- **Kept/refined the essentials** (new `home-sections.tsx`): **Hero** (headline + primary search + popular + honest trust chips; the US-style mansion hero photo replaced with a subtle brand glow), **Servicios populares** (clean icon grid → `/buscar?categoria=…`), **Así de fácil** (3 steps), **Por qué ContrataCR** (identidad verificada · sin intermediarios · reseñas reales · todo el país).
- **Professional CTA** (`pro-cta.tsx`) rebuilt as a dark brand band with benefit chips + a **session-aware** "Registra tu perfil gratis" (`SmartRegisterLink` → registration logged-out, panel logged-in); stock photo removed.
- Copy is normal Costa Rican Spanish (no "vos"); subtle `FadeInUp` reveals only.

---

## Sprint 43 (2026-06-09) — Disponibilidad "Agregar horarios" cleanup (no logic changes)

No migration. Presentation-only tidy of the slot generator (`availability-editor.tsx`); scheduling/validation/save unchanged.
- Removed the **"Rápido: Mañana / Tarde / Noche"** quick-preset row (and its `PRESETS`/`applyPreset`).
- Removed the redundant **"Generas N espacios entre… y…"** preview line (and `previewCount`) — it stated the obvious; the single inline "Hasta" error + the disabled "Generar" remain.
- **"o agrega una hora puntual"** now defaults sensibly via `puntualDefault()`: today → the next rounded full hour (same as "Desde"); a future date → 8:00 a.m.; resets when the date changes (it could previously show 11:59 p.m. late at night). The CR future-time + 15-min lead are still enforced by the picker `min` + the insert safety-net.

---

## Sprint 42 (2026-06-09) — /buscar redesigned: full-width 3-column + uniform fixed-height cards + new sort set

No migration. Recorded as THE standard search layout in `contratacr-design-guide.md`.

- **Full-width layout.** The page container went from `max-w-7xl` (narrow, centered, wasting horizontal space next to the map) to **`max-w-[1920px]`** so /buscar fills the screen on laptops/desktops. The three-column shell widened: filters sidebar `w-56→w-64`, map `xl:w-[34%]→w-[38%]` (larger, well-proportioned, full-height sticky). Filters stay ONLY in the left sidebar / mobile drawer.
- **Uniform, fixed-height cards.** Every result card is now the EXACT same size: **`md:h-[216px]` + `overflow-hidden`** (replacing the `min-h` that still let content grow). Both columns are `h-full`; the left column pins **"Ver casos de éxito"** to the bottom (`mt-auto`) and the availability column pins its **action buttons to the bottom**, so actions align across all cards. Sparse cards get breathing room, rich cards cap/truncate ("+N") — no card is tall while another is short. The **featured** indicator moved from a top band (which broke uniform height) to an inline chip; the verified pill became a compact **"Verificado"** badge.
- **New "Ordenar por" set** (Hulihealth-style, adapted): **Mejor calificados** (`rating`) · **Precio (de menor a mayor)** (`priceAsc`) · **Disponibilidad inmediata** (`availability`) · **Cercanía** (`cercania`). "Disponibilidad inmediata" sorts pros by their soonest upcoming bookable slot (computed in the page from `availability_slots`, best-effort, no migration); "Cercanía" requests geolocation when selected.
- **Preserved:** numbered cards ↔ numbered map pins, pin-hover preview + card highlight, one-click slot booking (service+location context), identity-verified filter, "Buscar profesionales cerca de mí", favorites (no mobile overlap), typeable+selectable category, pagination.

---

## Sprint 41 (2026-06-08) — app-wide no-"vos" copy, required-field audit, typeable categories, project category, /buscar polish, pro header status, reviews + casos de-dup, booking "Qué sigue"

No migration. All following `contratacr-design-guide.md`.

1. **No-"vos" copy, app-wide.** Swept the entire app and rewrote every Costa Rican **"vos"** conjugation — imperative, present-indicative, clitic imperatives, and the "vos/sos" pronoun — to standard CR Spanish: "Describe lo que necesitas" (not "Describí…"), "Agrega/Elige/Activa/Busca/Marca/Confirma", "puedes/quieres/tienes/ofreces/atiendes/necesitas", "Inicia sesión", "Regístrate", "cerca de ti", "Tú eres". ~420 replacements across ~70 files (marketing pages, registration, dashboards, booking, modals, API error/notification messages). Stem-changing verbs handled correctly (podés→puedes, querés→quieres, elegí→elige, encontrá→encuentra, recordá→recuerda). This is the documented copy standard.
2. **Required-field asterisks.** Added the missing red **"*"** to **"¿Para quién es la cita?"** and "¿La persona tiene cédula?" in the booking flow; re-verified the sprint-33 convention (required "*", optional "(opcional)").
3. **Category input — typeable AND selectable, everywhere.** Both **Publicar proyecto** and the **/buscar** category filter now use the shared **`CategorySearch`** (type to autocomplete with highlighting, OR open the list to browse the grouped categories) including the **"¿No ves tu categoría?"** → admin-suggestion flow. Replaced a plain `<select>` (publish, dropped its dead local category list) and a grouped Radix `<Select>` (filter, dropped now-unused `CATEGORY_GROUPS`/`getCategoryLabel` imports).
4. **Project category shown.** A published project now displays its **category chip** on the project card in BOTH the **client dashboard** and the **professional's browse view** (the projects API already resolves `categories.name`; chip only shows when a category was set — it's optional).
5. **/buscar polish.** Search placeholder shortened to show in full (**"Busca un servicio…"**); **"Usar mi ubicación" → "Buscar profesionales cerca de mí"**; the private-availability notice moved OUT of the full-width top band into a **compact inline chip** ("🔒 Coordina por WhatsApp" / "Solo WhatsApp") inside the card's existing chips row → **no extra card height**; "coordiná"→"coordina".
6. **Professional panel header.** Under the name it no longer shows the profession ("Electricidad"); it shows the useful **account status at a glance** — "Identidad verificada · visible para clientes" (verified), "Pendiente de revisión" (pending/appeal), or "Verificación rechazada". **"Ver mi perfil" → "Ver cómo me ven los clientes".**
7. **Reviews + casos de éxito.** Trust label reworded to **"Solo clientes que recibieron un servicio de este profesional pueden dejar una reseña."** Removed the **duplicate** work-image thumbnail strip under the profile summary — casos de éxito images now show in **ONE** place only (the "Casos de éxito" tab).
8. **Booking — replaced the low-value trust chips** ("Sin comisiones / Contacto directo / Respuesta por WhatsApp") with a client-useful **"Qué sigue"** 3-step list (envías la solicitud y se abre WhatsApp → el profesional confirma disponibilidad y precio → coordinan directamente).

---

## Sprint 40 (2026-06-08) — design guide created + deeper "Disponibilidad" redesign (no logic changes)

No migration.

**1. `contratacr-design-guide.md` created** (repo root) — the mandatory single source of UI/UX direction (see the callout above). One-time deliverable so future UI work is cohesive.

**2. Professional "Disponibilidad" redesigned to follow the guide** (`dashboard/pro/availability-editor.tsx`) — **presentation/UX only**; no scheduling rules, validation, generate/insert/remove, or save behavior changed (every handler, state, the CR future + 15-min-lead checks, and persistence are identical).
- **Less top-of-page noise:** the three separate setting cards collapsed — the **"Disponibilidad privada"** and **"Videoconsulta"** toggles now live as two rows inside **ONE** settings card (was two `rounded-2xl` cards). Contact-preference card stays first (it still gates scheduling). All `rounded-2xl` cards → `rounded-xl` per the guide.
- **"Agregar horarios disponibles" simplified & made obvious** — clear two-step flow: **(1)** profesión/servicio + ubicación in a responsive 2-col grid; **(2)** the time range — quick presets (Mañana/Tarde/Noche) sit directly above the **Fecha · Desde → Hasta · Intervalo** row; the **"Generar horarios" button is on its OWN row** (full-width on mobile, left-aligned on desktop) instead of being squeezed into the wrapping inputs row.
- **Removed the duplicate validation message.** The amber "Ajustá la hora de fin ('Hasta' debe ser posterior a 'Desde')…" paragraph (which duplicated the inline "Debe ser posterior a 'Desde'." on the Hasta picker) is gone — now there is **ONE** inline error only, on the "Hasta" field. The live "Generas N espacios…" preview shows only when the range is valid; **"Generar" stays clearly disabled (solid gray, `aria-disabled`)** when invalid.
- **"Tus horarios próximos" kept** (still grouped by Mañana/Tarde/Noche with profesión + ubicación tags), refined to `rounded-xl`.
- **No-"vos" copy throughout** per the guide: recibís→recibes, ofrecés→ofreces, atendés→atiendes, podés→puedes, necesitás→necesitas, agregá→agrega, activá/desactivala→activa/desactívala, elegí→elige, generás→generas, usá→usa, cambiá/querés→cambia/quieres.

---

## Sprint 39 (2026-06-08) — professional "Disponibilidad" presentation polish (no logic changes)

No migration. **Presentation-only** pass on `AvailabilityEditor` (`dashboard/pro/availability-editor.tsx`); no scheduling rules, validation, or save behavior changed.

- **Clearer "Disponibilidad privada" copy.** The contradictory line ("Tus horarios se muestran y los clientes pueden reservar. Activá esto para ocultarlos") is rewritten by state: when public → "Activá para ocultar tus horarios. Los clientes deberán contactarte para conocer tu disponibilidad. (Se eliminan los horarios publicados.)"; when already private → "Activada: tus horarios están ocultos… Desactivala para volver a mostrarlos." Behavior unchanged.
- **"Generar" reads clearly disabled.** When the range is invalid (`rangeInvalid`, e.g. Hasta ≤ Desde) the button is now **solid gray** (not a faded blue that still looks clickable) with `aria-disabled`, and the preview line is replaced by an explicit amber reason: "Ajustá la hora de fin ('Hasta' debe ser posterior a 'Desde') para generar." The existing validation/disabled logic is unchanged — only the visual state + messaging.
- **"Tus horarios próximos" chips grouped by Mañana / Tarde / Noche** (within each profesión+ubicación block) so a dense list (5:00, 5:15, 5:30…) is easy to scan; each part only renders when it has slots (`partOfDay`: Mañana <12h · Tarde 12–18h · Noche ≥18h). Same chips, same remove buttons.
- **Tighter spacing/hierarchy:** outer `gap-6→gap-4`, the contact-preference and generator cards `p-5→p-4`. Clearer CR copy throughout.

---

## Sprint 38 (2026-06-08) — professional "Mi perfil" presentation polish (no logic changes)

No migration. **Presentation-only** pass on the professional profile editor (`dashboard/pro/profile-editor.tsx`); no business logic, data flows, validation, or save behavior changed — every field still saves exactly as before (same state, handlers, auto-save, unsaved-changes guard).

- **Grouped into collapsible sections** (kills the endless single-column scroll): **Datos básicos** (foto, nombre, nombre comercial, descripción — open by default), **Profesión** (open by default), **Ubicación y cobertura**, **Contacto y precios**, **Idiomas y aseguradoras** — each an accordion `Section` (header + chevron). "Cerrar cuenta" stays as its own block below. Same fields, just reorganized; the save bar stays always-visible and auto-save is unchanged.
- **Location flow unified (de-confused).** The work-location copy was reworded so the map-search and the provincia/cantón selects read as **ONE** add-flow ("Buscá el lugar en el mapa o elegí provincia y cantón, y tocá **Agregar lugar**"), instead of looking like two competing ways. (`WorkplacesPicker` logic untouched — both inputs already feed one "Agregar lugar".)
- **"Todo el país" redundancy note.** When travel coverage includes **Todo el país** AND a narrower zone, a small amber note appears: "Ya cubrís todo el país, así que las zonas más específicas no agregan nada. Podés quitarlas para simplificar." Purely informational — nothing is auto-removed; all chips still save.
- **Compact map.** Added an optional `mapHeight` prop to `WorkplacesPicker` (default **220**, so registration is byte-identical) and the profile passes **168** — the map takes less vertical space.
- **Tighter spacing + clearer CR copy** throughout (section gaps, "Precios (opcional)", etc.).

---

## Sprint 37 (2026-06-08) — client panel presentation polish (no logic changes)

No migration. **Presentation-only** pass on the **client dashboard** (`dashboard/cliente/page.tsx`) — no business logic, data flows, statuses, permissions, or functionality changed; every action/outcome is identical, just better presented.

- **Surfaced the most-used action:** a primary **"Buscar profesionales"** button now sits in the header (next to Salir), so booking a service is one tap from anywhere in the panel (links to existing `/buscar`). Header subtitle reworded to "Tu panel en ContrataCR"; header truncates safely on mobile (Salir collapses to an icon).
- **Tighter, less-cluttered layout:** page padding `py-8→py-6`, tab nav `py-2.5→py-2` + `mb-6→mb-5`, booking/project cards `p-5→p-4`, section gaps `space-y-6→4` / `gap-4→3`. More visible without scrolling; nothing removed.
- **Friendlier empty states:** dashed bordered cards with clearer Costa Rican copy ("Todavía no tenés solicitudes" / "Buscá un profesional y solicitá tu primer servicio"; "Todavía no publicaste proyectos" / "Publicá lo que necesitás y recibí propuestas…") and an icon on the CTA.
- **Cleaner Profile tab:** the separate **photo** and **name/phone** cards are merged into **one** card (photo row → divider → fields → save); the previously touching "become a professional"/email/close-account cards now sit in a consistent `space-y-4` stack at `p-5`; dropped the redundant "Mi información" heading (the tab is already "Mi perfil").
- **Copy consistency:** the completed-booking review button now reads **"Dejar reseña"** (matching the projects tab) instead of "Reseña".

All filters/tabs/statuses, per-job review flow, proposal accept/decline/revert, cancel/confirm/delete, photo upload, email change, and "convertirme en profesional" behave exactly as before.

---

## Sprint 36 (2026-06-08) — /buscar 3-column layout (filters sidebar · results · map) + flush private band

No migration.

**Layout approach & why.** The filters used to be a tall full-width block at the top that pushed the results far down the page. They're now a **left sidebar**, freeing the first viewport for results. Responsive tiers (chosen so cards never get squeezed):
- **xl+ (≥1280):** three columns — **sticky filters sidebar (`w-56`) · results list (`flex-1`) · sticky map (`xl:w-[34%]`)**.
- **lg–xl (1024–1279):** two columns — **results · map (`lg:w-[40%]`)**; filters move behind a **"Filtros" slide-over drawer** (a 3-col sidebar here would squeeze the side-by-side cards too narrow).
- **<lg:** one column; a **"Filtros"** button opens the drawer and a **List/Map toggle** swaps results/map.
- `SearchResultsLayout` now takes a `filters` prop and owns all three slots + the drawer; the page no longer renders a top filter band. `SearchFilters` was restyled as a **vertical sidebar** (full-width stacked search + selects + full-width geolocation/verified buttons + clear).

**Private-availability as a flush top band (item 2).** Instead of a floating lock paragraph inside the panel, contact-only pros (hidden availability OR WhatsApp-only) get a **slim band flush to the card's top edge** ("🔒 Disponibilidad no pública — coordiná por WhatsApp", `pl-8` clears the number badge). The availability panel then renders only the **compact contact actions** (WhatsApp filled + llamar icon), so private and full cards feel equal-height.

**Buttons + density (items 3–5).** Action buttons are smaller with clear hierarchy: **primary** "Solicitar servicio" (filled, `flex-1`, `py-2`) + **secondary** icon-only WhatsApp/llamar; the empty-day grid collapses to "Sin horarios en los próximos días"; the overflow indicator is a subtle muted **"+N"**; availability column narrowed to `212px` and the map width balanced so the list stays readable. Everything preserved: number↔pin, pin hover, one-click slot booking (carries service+location), verified filter, sorting, favorites (no price overlap).

---

## Sprint 35 (2026-06-08) — /buscar result-card redesign (clean, dense, uniform) + AM/PM label

No migration.

**`TimeSelect`** now renders **AM/PM** (uppercase, no dots) instead of "a.m./p.m.".

**/buscar professional-card redesign — approach & why.** The cards were ragged: each one stacked a variable number of optional rows (separate province chip, cantón chip, mobile-coverage chip, multiple workplace chips, a 2-line bio, casos link), so heights varied wildly and wasted vertical space. The redesign makes them **uniform, dense, and aligned** without losing any information a pro actually has:
- **Bounded, consistent left column** (`flex flex-col gap-1`): smaller 48px avatar; a **name + price** header row (price `whitespace-nowrap`, `pr-10 md:pr-0` so the absolute favorite never covers it on mobile); the **"Identidad verificada" pill inlined with the profession chips** on one wrapped row; profession chips **capped** (the searched one, else first up to 3) with a **"+N"** overflow indicator; rating or "Sin reseñas".
- **ONE consolidated location/coverage line** replacing the old multi-row stack: a fixed pro shows their first readable workplace (`prettyPlace`, **+N** if more) else province/cantón; a mobile pro shows their real `coverageLabel`; both bits `truncate` so it's always a single line — the single biggest source of height variance removed.
- **Bio dropped** from the card (it's not in the required-info set and was the other big variance driver; the full bio still lives on the profile).
- **Tighter availability panel**: `gap-2`, `py-2` buttons, and the secondary channels (**WhatsApp + Llamar**) are now **side-by-side compact buttons** (short labels) instead of two stacked full-width rows — only those the pro enabled show.
- **Everything preserved**: numbered card ↔ numbered map pin, pin-hover mini-preview + card highlight, location chips/tabs + upcoming-slot one-click booking (carrying service+location context), the private-availability state + "Ver horario completo", "Ver casos de éxito (N)", the identity-verified filter and sorting. Fully responsive (`md:flex-row`), no favorite/price overlap.

**Follow-up 2 (same sprint) — uniform + shorter cards.** The availability panel was driving wildly different card heights (private card short, slot-rich card tall). Fixes: the panel's actions collapse into **ONE row** — "Solicitar servicio" (flex-1) + **icon-only** WhatsApp/Llamar buttons (only those enabled); each day shows **at most 2 slot chips + "+N más"** so the carousel height is bounded; a consistent **`md:min-h-[184px]`** on the card lifts the short private card to match the public ones. Also **deduped the location chips by label** (slots are grouped per label so two coverage zones that both read "A domicilio" collapse into a single chip; the group still filters all its slots). Result: the three reference cards now read as the same tidy height.

**Follow-up (same sprint) — smaller filter + smaller cards (Hulihealth density pass).** The filter bar was bulky (its own "Filtros" header + 3 separate bordered rows). Now: dropped the redundant inner "Filtros" header (the page already labels it), `p-4→p-3`, tighter label margins, and the **geolocation + verified + Limpiar controls merged into ONE compact row of small pills** (`text-xs`, `py-1.5`). Cards shrunk too: `CardContent p-4→p-3`, avatar `48→44px`, column gap `4→3`, availability column `260→244px`; page list/section spacing reduced (`gap-4→3`, filter `py-2.5`, content `py-4`). Result: more professionals per screen, closer to the Hulihealth reference.

---

## Sprint 34 (2026-06-08) — time picker redesign + validation, upcoming-slots profession/location, /buscar location chips + booking context

**Run this migration in Supabase SQL Editor:**
```
038_booking_slot_context.sql  -- bookings.category_id, slot_location_id, slot_location_label
```

1. **Desde/Hasta time picker — redesigned + smart logic.** Shared **`TimeSelect`** (`components/ui/time-select.tsx`) is a **polished custom popover** (clock trigger; scrollable 12h list; the selected option highlighted + scrolled into view; click-outside / Escape to close). Every option is a full unambiguous label ("10:00 a.m.", "3:00 p.m.") — the meridiem is **intrinsic**, so crossing noon flips a.m./p.m. automatically (no separate, sticky AM/PM control). Used for **Desde**, **Hasta** and **hora puntual** in the `AvailabilityEditor` (30-min grid, `min` = next full hour today). **Smart range logic (invalid combo can't be made):** "Hasta" only offers times **after** "Desde" (`hastaMin = Desde + 30min`); picking "Desde" **auto-bumps** "Hasta" to stay valid (1-hour default span); **quick presets** (Mañana 8–12 / Tarde 13–17 / Noche 17–21, clamped to today's lead floor); a **live "Generás N espacios entre … y …" preview**; "Generar" is **disabled with a visible reason** (inline "Debe ser posterior a 'Desde'.") when somehow invalid, and `generate()` still blocks `end ≤ start` as a safety net (never a silent no-op). The CR past-date + 15-min-lead checks still fire with their messages. `to12h()` helper formats stored 24h values.
2. **"Tus horarios próximos" — shows profession + location.** Persistence already worked (migration 037 `category_id`); the display was the gap. Each day now **groups slots by (profesión + ubicación)** with a labeled header (profession chip + location chip with a pin) and 12h times. Location labels resolve correctly for **workplaces, coverage zones (`cov_*`), and videoconsulta** via a map built from the same `locationOptions` (previously `cov_*` showed a bare "Ubicación").
3. **/buscar — single card, location chips, context into booking.** A professional stays in **ONE card** (never split per location). Inside, **location chips/tabs** (Hulihealth-style) let the client choose the place; it **defaults to the first location** (never an undifferentiated mix), with a **"Horarios de &lt;servicio&gt; · &lt;lugar&gt;"** caption so the place + service are always clear. `cov_*`/videoconsulta chips are labeled ("A domicilio" / "Videoconsulta"). The picked slot's **(service + location)** flows through: `ScheduleSlot` carries `categoryId`/`locationId`; `ProfessionalSchedule` passes `initialCategoryId`/`initialLocationId`/`initialLocationLabel` to `BookingModal`, which records them on the booking (`bookings.category_id`, `slot_location_id`, `slot_location_label` — migration 038, retry-away pre-migration). The pro sees the **profession + location** on each request in Solicitudes, and the WhatsApp message includes a "Lugar:" line.

---

## Sprint 33 (2026-06-08) — app-wide required/optional field convention + phone-now-required

No migration.

**The convention (applied everywhere):** every **required** field shows a red **"*"**; every **optional** field shows **"(opcional)"** (parenthesized, never bare "opcional" or "(requerido)"); no required field submits empty (blocked with a **friendly Spanish inline error**, never a browser default); per-field validation (email format, password rules, numeric `PhoneInput`, cédula via shared `CedulaInput`/`IdentityField` which already render "*"/"(opcional)").

**Phone is now REQUIRED** — the account holder's own phone is mandatory because client↔professional coordination happens by WhatsApp/call. Required (with "*" + numeric validation + friendly error) in **client registration**, **professional registration** (WhatsApp, already required), **completar-perfil**, the **booking complete-profile step**, and the pro **profile editor** (WhatsApp). The **only** optional phone is a **third-party/beneficiary** contact (booking "para alguien más" → "Teléfono de contacto (opcional)") — that's a secondary contact, not the account holder's.

Specific fixes:
1. **Client registration** — "Correo electrónico", "Contraseña", "Confirmar contraseña" now show **"*"**; phone changed from `optional` → **`required`** with `isPhoneComplete` validation + inline error; "Cantón" labeled **"(opcional)"**.
2. **Professional registration** — "Confirmar contraseña" now shows **"*"** (already match-validated via zod).
3. **Sweep** — booking modal (service description "*" replacing "(requerido)"; beneficiary/guest/complete-profile "Nombre completo" "*"; complete-profile phone required); `publicar-proyecto` "Cantón (opcional)"; `completar-perfil` "Nombre completo *" + phone required; proposals "Tu mensaje *" + "Tu precio (₡) (opcional)"; pro `profile-editor` ("Nombre completo *", "Profesiones *", WhatsApp required, "Descripción (opcional)", "Dirección (opcional)"); client dashboard profile "Nombre completo *"; `close-account-section` proper "Motivo *" label. `services-editor` already conformed.

---

## Sprint 32 (2026-06-08) — schedules per profession+location, traveling availability, naming, sort, redirect, admin appeals, impersonation, numbered map, geolocation

**Run this migration in Supabase SQL Editor:**
```
037_schedule_category.sql  -- availability_slots.category_id (profession/service the schedule belongs to)
```

1. **Schedules per (profession/service + location)** — `availability_slots.category_id` (migration 037). The `AvailabilityEditor` generator now has a **Profesión / servicio** selector (shown when the pro has >1 profession; defaults to the only/primary one) alongside the location selector — each schedule belongs to a (profession + location) pair. Slot chips are tagged with the profession; dedup is per (date, location, profession). /buscar fetches `category_id` and the card's schedule (`ProfessionalSchedule`) shows **only the searched profession's hours** when a category filter is active (slots with no category always show — legacy/pre-migration safe). Read/insert both retry without the column pre-migration.
2. **Traveling "me desplazo" availability fixed** — coverage areas are now schedulable at **every level** (cantón / provincia / país), not just cantón-level. Previously a pro whose travel coverage was province- or country-level had **no** schedulable location and couldn't add hours. `locationOptions` now builds a stable id + label per coverage area regardless of level.
3. **Naming hierarchy "Profesiones → servicios"** — registration label **"Profesión *"** (+ hint "Tu profesión (ej. Nutricionista). Luego agregás los servicios…", placeholder "Buscá tu profesión", extra "Agregá otra profesión"); profile editor section **"Profesiones"** (was "Categorías / servicios") with a hint pointing to the Servicios tab. The Servicios tab already grouped services under each profession.
4. **Required asterisk** — added **"*"** to "¿Cómo ofrecés tus servicios?" in BOTH registration (already validated) and the profile editor.
5. **Default /buscar sort** — best-rated → most reviews → **most recent** (`created_at` added as final tiebreaker); default "Mejor calificados" is the visible selected option in "Ordenar por".
6. **Post-registration redirect fixed** — a `redirecting` full-screen loader ("Creando tu cuenta…") renders before the hard nav so the photo step never flashes back; the pro dashboard now **retries the pro-record fetch a few times** (700ms × 4, replication/RLS lag) before bouncing to `/registro/profesional`, so a freshly-created account doesn't flash the registration flow.
7. **Admin pending-in-appeal kept visible** — when a pending account files an appeal (status → `under_appeal`) it no longer vanishes from the actionable view: the **"Pendientes de revisión"** admin tab now includes `under_appeal` rows (API `status=pending` queries `in('pending','under_appeal')`; the tab count sums both), and `under_appeal` is relabeled **"Pendiente — en apelación"** everywhere. The dedicated "Apelaciones" tab still lists them too.
8/10. **Impersonation handling + honest limits** — documented accepted-risk model: non-existent cédula → not found → manual review; real cédula belonging to someone else with the name changed / "¿No es tu información?" → manual review (no auto-verify). **KNOWN LIMITATION** (not pretended solved): a real cédula + correct matching name confirmed → the padrón proves the cédula+name are real but **cannot prove the physical person is the holder**, so it verifies — the definitive fix is the future **biometric/liveness tier** (extension point reserved). **Mitigation shipped now:** a **"Reportar suplantación de identidad"** report reason (first option, with in-modal explainer) → **HIGH-PRIORITY** moderation ticket + `[PRIORIDAD ALTA]` email/stored reason; reputation + reports + admin suspension/badge-revocation are the practical deterrent.
9. **Numbered cards ↔ map pins + hover preview** — result cards are numbered **1..N** (top-to-bottom badge) for the current page and the **same number is drawn on the matching map pin** (Hulihealth-style). Hovering a pin opens a **mini profile preview** (photo, name, rating) AND highlights + scrolls to the matching card (`data-pro-id` / `#pro-card-<id>` bridge across the RSC/client boundary). `MapProfessional.proId` carries the canonical id; `numbering` prop threads page → layout → `GoogleMapPanel`.
10. *(merged into 8 above — impersonation.)*
11. **Geolocation on /buscar (non-blocking, well-timed)** — a **"Usar mi ubicación / Cerca de mí"** control requests permission **only on tap** (never auto-popped). Granted → **proximity sort** (`sortBy=cercania`, distance via exact pin → workplace → province centroid, Haversine) + **autofills the nearest provincia**; the active proximity sort shows in "Ordenar por". Denied/unavailable → a soft inline message and the **text provincia/cantón search keeps working** (never required). Coords ride in `lat`/`lng` query params (preserved across filter changes + pagination). New helpers in `cr-geography.ts`: `PROVINCE_CENTROIDS` (by id), `haversineKm`, `nearestProvinceId`.

---

## Sprint 31 (2026-06-08) — booking UX (auto-scroll, one-click slot), social-login cédula fix, unified panel filters

No migration.

1. **Auto-scroll to time slots** — when a day is picked in the booking modal, the time-slot section reliably scrolls into view (`requestAnimationFrame` + retries at 120/350ms, `block:"center"`, re-runs when slots finish loading). Works on day-click and when the modal opens pre-selected.
2. **One-click slot booking from /buscar** — clicking a day+time on the card opens the modal with that day + hour pre-selected and auto-scrolled to the hour (the scroll effect now also keys on `availabilityLoaded` so it fires after async slot load). The modal is larger/clearer (`max-w-4xl`, `md:max-h-720px`).
3. **CRITICAL — cédula field no longer vanishes** for social-login (Facebook/Google) accounts with no cédula. Root cause: `needsCedula` was gated on the **live** `profileCedula` value, so typing filled it and hid the field. Now gated on a **stable `hasStoredCedula`** flag (captured from the DB when the modal opens) — the field stays visible while typing, validates, runs padrón auto-fill/confirm, and stores the cédula. Only hidden when a cédula genuinely exists on the account (any login method).
4-5. **Unified status filters + naming, BOTH panels** — new shared `StatusFilterTabs` (+ `SOLICITUD_TABS` Todas/Activas/Finalizadas/Canceladas, `PROYECTO_TABS` Todos/Abiertos/En curso/Finalizados/Cancelados, and `solicitudMatches`/`proyectoMatches` helpers). Applied identically to the **client** panel (solicitudes + proyectos) and the **professional** panel (`booking-requests` solicitudes + `proposals-tab` "Mis propuestas"). Removed the inconsistent "Próximas"/"Historial" split and the duplicate "Mis proyectos" header; each section is now a single filtered list with a consistent card (status badge, title, date, actions). Default tab "Todas/Todos".

---

## Sprint 30 (2026-06-08) — wording, proposals post-finalización, review context, status filters, client info, es_salud DOB

**Run this migration in Supabase SQL Editor:**
```
036_es_salud_dob_review_title.sql  -- categories.es_salud (+ set true for health ids);
                                      bookings.client_dob; reviews.job_title
```

1. **State-button wording** — the professional's action is **"Marcar como completado"** (projects + solicitudes), NOT "finalizado" (it's pending client confirmation). The client then **"Confirmar finalización"** → "Finalizado". The intermediate state reads "Trabajo realizado · esperando confirmación" / "Esperando confirmación".
2. **Proposals after finalización** (client panel) — proposals are NOT deleted. Once a project is **completed**: the accepted proposal stays visible marked **"Finalizada"**, **"Cambiar decisión" is removed** (decision locked once finalized/cancelled), and the non-accepted proposals are **collapsed** behind a "Ver propuestas no elegidas (N)" disclosure.
3. **Reviews show the job name** — each review snapshots its **job_title** (booking `service_description` / project `title`) at submit time; the public profile shows **"Reseña de '<title>'"** under each, so per-job reviews are distinguishable. (Best-effort fetch; pre-migration safe.)
4. **"editada" hidden publicly** — the edited marker is no longer shown on the public profile (other clients never see it); only the author edits via their dashboard.
5. **Status filters** — mini pill-tabs in BOTH sections of the client panel: solicitudes **Todas / Activas / Finalizadas / Canceladas**; proyectos **Todos / Abiertos / En curso / Finalizados / Cancelados** (default Todas).
6. **Client info to the professional** — solicitudes already show the client's name + phone (+ DOB for health, below); proyectos now show the client's **phone** to the pro once their proposal is **accepted** (name was already shown).
7. **`es_salud` flag drives DOB** — DOB is only requested/shown/stored for **health** categories. `categories.es_salud` (migration 036) + the authoritative code helper `isHealthCategory`/`anyHealthCategory` (`lib/data/categories.ts`, health ids: entrenamiento_personal, nutricion, masajes, psicologia, fisioterapia, enfermeria, cuidado_adultos, cuidado_infantil — never inferred from names). Consistent across the three places: **/buscar booking** (DOB field + self/beneficiary DOB display only when `proIsHealth`; non-health omits DOB and never sends it), **professional's solicitud view** (`booking-requests` shows the client DOB only when present — and it's only stored for health), and the **panel**. New `bookings.client_dob` stored only for health (Ley 8968 data minimization). DOB value still comes from the cédula/padrón lookup (the TSE padrón has none, so it shows when a DOB source exists or for a manually-entered beneficiary DOB).

---

## Sprint 29 (2026-06-08) — availability defaults, social-login cédula, project lifecycle visibility, per-job reviews

**Run this migration in Supabase SQL Editor:**
```
035_per_job_reviews.sql  -- reviews.booking_id + project_id; drops the unique
                            (professional_id, client_id) constraint; partial unique
                            (client_id, booking_id) / (client_id, project_id)
```

### Availability time defaults (item 1)
- `AvailabilityEditor`: both **"Desde"** and **"hora puntual"** now initialise to the **next rounded full hour** (`nextFullHourCR(today)`) at mount (not the raw current time), and an effect bumps anything below the next full hour. They stay in sync (same `startMin`). "Desde" keeps `step=3600`.

### Booking cédula for social-login accounts (item 2)
- The booking modal **re-checks the DB** for a cédula on every open (`maybeSingle`, and the cached `profileCedula`/`profilePhone` are reset first) — so Google/Facebook accounts that never provided a cédula are correctly **prompted** (then padrón auto-fill/confirm shown in the complete step + stored). `needsCedula` already gates on `profileLoaded`. Applies to any client regardless of registration method.

### Project lifecycle visible in both panels + auto-update (item 3)
- The pro **proposals-tab** ("Mis propuestas") now shows the **project** lifecycle status for an accepted proposal (mirrors solicitudes): **Asignado · En curso → Trabajo realizado · esperando confirmación → Finalizado**, and **Cancelado por el cliente** (the WhatsApp/action buttons disappear — **no stale "Aceptada"**). "Marcar trabajo realizado" is the primary action for `in_progress`. The tab **refetches on window/tab focus**, so a client cancel/delete reflects automatically; the client is already notified (`notifyAssignedPro`), and DELETE cascades the proposal away. Client panel already shows the status badge + confirm/cancel. The full chain (open → in_progress → awaiting_confirmation → completed, 7-day auto-confirm, review unlock) was already in `/api/projects`/`/api/proposals` (persisted via service-role).

### Project lifecycle UNBLOCKED — pro reads project status via service-role (follow-up)
- **Root cause of the "stuck at Aceptada / En curso" dead-end:** the pro's `/api/proposals?mine=true` embedded the project (`projects:project_id(... status ...)`) under the pro's RLS. The projects RLS only exposes the OWNER's rows (or "open" projects), so once a project moved to **in_progress** the embed returned a null/stale status — which hid the pro's **"Marcar trabajo realizado"** button and froze the project. Now the proposals GET fetches each proposal's project (title, **status**, client) with the **service-role** client, so the pro always sees the true status.
- With that, the full lifecycle works exactly like solicitudes and the right control is present at each step on BOTH panels: pro **Marcar trabajo realizado** (in_progress → awaiting_confirmation, notifies client) → client **Confirmar finalización** (→ completed, notifies pro) → **7-day auto-confirm** → client **Reseña / Ver-Editar reseña** (per-job, filled star). Either party cancels before completion; a client cancel/delete flips the pro view off "Aceptada" (project status read via admin + focus-refetch + notification).

### Project delete + status reliability (follow-up)
- **Project DELETE** now authorizes against the row then deletes with the **service-role** client (the RLS-bound delete silently affected 0 rows — the same bug class as bookings/proposals) and removes dependent proposals first; the client UI surfaces errors instead of optimistically hiding a row that wasn't deleted.
- The client project **status badge** is robust (En curso · Asignado / Esperando tu confirmación / Finalizado / Cancelado / Abierto) and never mislabels a null status. Project actions (accept / cancel / confirm) now **re-fetch from the server** so the status reliably appears and updates (incl. lazy 7-day auto-confirm).

### Per-finished-job reviews + button state (items 4-5)
- Reviews are now **per finished item**, tied to a specific **booking** or **project** (`reviews.booking_id`/`project_id`); the old one-review-per-pro unique constraint is dropped (migration 035 adds partial uniques per item). A client who completed **multiple** jobs with the same pro reviews **each** separately. The professional's profile still **aggregates** (trigger `update_professional_rating` averages all rows; the reviews list shows all).
- `/api/reviews` POST gates on the **specific** completed booking/project and edits the item's review if it exists; GET supports `?bookingId`/`?projectId` (prefill) and `?mine=1` (all of the client's reviews). `LeaveReviewModal` takes `bookingId`/`projectId`.
- In the Historial / projects list, once a review exists for **that** item the button flips to **"Ver/Editar reseña"** with a **filled star** (the client dashboard loads `?mine=1` and maps `booking_id`/`project_id`). Editable (shows "editada"); still only on FINALIZADO items.

---

## Sprint 28 (2026-06-08) — 17-item batch (identity bug, duplicates, categories, addresses, call opt-in, scheduling, projects, reviews, booking DOB, phones, coverage, account close)

**Run this migration in Supabase SQL Editor:**
```
034_sprint28.sql  -- category_suggestions (tickets); professionals.allow_phone_call;
                     reviews.edited_at; profiles.is_disabled/disabled_reason/disabled_at
```

### CRITICAL — identity "¿No es tu información?" (items 1-2)
- Clicking **"¿No es tu información?"** in `IdentityField` now **discards the padrón match** (clears the auto-filled name, fires `onMismatch`) and the case is routed to the SAME manual-review path as "No tengo identificación costarricense": the registration sends **`cedula: null` + `noCrId: true`** (with a note "El usuario indicó que la información del padrón no es suya"), so `runIdentityVerification` is **skipped** (no cédula) → status stays **pending**, and **no verified email/badge** is ever issued. The verified grant only happens when the user CONFIRMS the padrón info (leaves the matched block as-is). Audited: verified fires only from `runIdentityVerification` when a stored cédula is found; mismatch/no-ID store no cédula.

### Registration / duplicate cédula (item 3)
- No raw DB constraint errors. `/api/register/client` maps `profiles_cedula_key` → **"Esta cédula ya está registrada."** (+ email dup); `/api/register/professional` returns **"Esta cédula ya está registrada. Iniciá sesión o recuperá tu cuenta."** (the registration error block shows the login link on "sesión"). Booking cédula save already maps `23505`.

### Categories suggestion (item 4)
- `CategorySearch` gains **"¿No ves tu categoría?"** → `POST /api/categories/suggest` → pending `category_suggestions` row (admin ticket; allowed pre-account). Admin **Categorías** tab (`/admin/categorias`, `/api/admin/categories`) approves/rejects. Not usable until an admin approves + adds it to the official list (`lib/data/categories.ts`).

### Addresses (item 5)
- `WorkplacesPicker` adds an optional **location label** ("ej. Clínica Bíblica"). Each workplace `name` is now the **readable label** or a general locality (cantón, provincia) — never the raw Plus Code; `address` keeps the exact geocoded string for the **map marker only**. `professional-card` `prettyPlace()` strips Plus Codes / noisy segments from legacy data (hides the chip if nothing readable; province/cantón tags remain).

### Contact by call (item 6)
- `professionals.allow_phone_call` (default **false**). "Contáctanos por llamada" only shows when the pro opts in via a new **Disponibilidad** toggle. Wired through search + detail (best-effort for the detail, pre-migration-safe).

### Scheduling (items 7-8)
- `nextFullHourCR()` — availability **"Desde"** starts at the next rounded full hour (9:55 → 10:00, `step=3600`); a puntual time still uses the 15-min lead. `professional-schedule` (the /buscar card) now hides today's slots within the 15-min lead (`isTooSoonCR`) so a non-bookable slot stops showing. Lead math verified (`isTooSoonCR`: hidden when `< now+15`).

### Projects (items 9-11)
- Proposal **edit + status** now persist via the service-role client (RLS was silently dropping them). Project cancel also persists via service-role (authorize-then-admin). Client project controls gain **"Cancelar proyecto"** on in_progress/awaiting (either party can cancel before completion) and **"Dejar reseña"** on completed (finds the accepted pro). Full lifecycle already existed in `/api/projects` (open → in_progress → awaiting_confirmation → completed, 7-day auto-confirm). Publish-success screen adds **"Ir a mi panel"** (item 10).

### Reviews (items 12-13)
- `/api/reviews` now **edits** an existing review (update + `edited_at`) instead of 409; `GET /api/reviews?professionalId=` returns the user's current review. `LeaveReviewModal` prefills it (editable), shows **"Actualizar reseña"**, and a **filled-star** success state. The profile review list shows **"· editada"** when edited (best-effort fetch). Reviews remain gated on FINALIZADO (completed booking/project).

### Booking DOB + phones (items 14-15)
- Booking DOB/age are wired through the **same cédula lookup** as the name (self + beneficiary) and render when a source provides the DOB. ⚠️ The TSE padrón still has **no birth date**, so DOB stays empty until a Registro Civil source (`api.digital.go.cr`) is configured. The beneficiary phone, client-dashboard phone, and completar-perfil phone now use the numeric **`PhoneInput`** (no letters).

### Coverage label (item 16)
- The /buscar card "Se desplaza…" label reflects the **real** travel coverage: **"Atiende en todo el país"** / **"Se desplaza en {provincia(s)}"** / **"Se desplaza en {cantón(es)}"** (from `coverage_country`/`coverage_provincias`/`coverage_areas`), falling back to "Se desplaza a tu ubicación".

### Account close (item 17)
- `CloseAccountSection` (client + pro profiles): **soft-disable** with a required reason (`profiles.is_disabled/disabled_reason/disabled_at`) → signs out + hides from search; **reactivatable**. `/api/account/disable` (POST disable/reactivate, GET state). Admin **Cuentas** tab (`/admin/cuentas`, `/api/admin/accounts`) lists disabled accounts + reasons. Search excludes disabled pros (best-effort embed filter).

---

## Sprint 27.2 (2026-06-08) — fixed-location pin gating + cantón disabled pattern

No migration.

- **One pin at a time until confirmed** (`WorkplacesPicker`): dropping a pin (search / map click / current location) sets a single **draft** pin and prefills provincia/cantón from reverse-geocoding (editable) — it is **no longer auto-added**. **"Agregar lugar" is disabled until the current location's provincia AND cantón are both set**, with an amber hint of what's missing ("Elegí la provincia y el cantón…" / "Elegí el cantón…"). Because there is only one draft and it must be saved (which requires provincia+cantón) before the selects reset, a **second pin cannot be added until the current one is confirmed**.
- **Cantón disabled-until-provincia, no instructional text** (item 2): every cantón select shows the field **disabled** until a provincia is chosen (the disabled state communicates the dependency) — removed all "Elegí provincia primero" / "Primero provincia" / "Seleccioná provincia" placeholder text. Applied to `WorkplacesPicker`, `CoverageAreaSelector`, and the `/buscar` `SearchFilters` cantón dropdown (placeholder now just the all-cantones label). The orphan `filters.selectProvince` / `cantonDisabled` message keys are no longer referenced.

---

## Sprint 27.1 (2026-06-08) — follow-up fixes (notifications, location, copy)

No migration. Bug-fix/UX pass on the sprint-27 batch.

- **Notifications "Ver todas"** (`NotificationBell`): the dropdown footer now opens the Notifications **section inside the user's own panel** (role-routed: `/dashboard/profesional?tab=notifications` or `/dashboard/cliente?tab=notifications`), not the separate `/notificaciones` page. Both panels behave the same.
- **Cantón depends on provincia** (item 2): the cantón select is always shown but **disabled until a provincia is chosen** (placeholder "Elegí provincia primero"), then populated with that provincia's cantones. Applies to fixed location (`WorkplacesPicker`) and travel zones (`CoverageAreaSelector`).
- **Fixed-location "Agregar lugar" fixed** (items 3-4): `WorkplacesPicker` reworked so dropping a pin (search / map click / "usar mi ubicación") **reverse-geocodes it and auto-adds a listed, removable location** — a pin now always becomes a saved location, so the false "Agregá al menos un lugar de trabajo en el mapa" error no longer fires after marking one. A **manual provincia+cantón → "Agregar lugar"** path (prominent button) adds a location without a precise pin (and completes a pin we couldn't geocode). Multiple locations supported + individually removable; the provincia/cantón remain editable/authoritative (typed value wins; pin reverse-geocode is a prefill convenience). Registration validation now passes once any location is added.
- **Removed user-facing "/buscar" jargon** (item 5): replaced everywhere users read it with plain language ("los resultados de búsqueda" / "cuando los clientes buscan profesionales"). Updated: pro profile editor (fixed + travel helper text), pro registration (fixed + travel helper text), `VerificationPanel` (4 spots), `availability-editor` (private-availability hint), `verification-notify` (verified email), `ayuda` FAQ, `admin-case` moderation note. Code/href/comment references to `/buscar` (the actual route) are unchanged.

---

## Sprint 27 (2026-06-08) — 28-item batch (location, insurance, scheduling, no-ID, casos, booking, auth, conversion, notifications, lifecycle, profile access)

**Run this migration in Supabase SQL Editor:**
```
033_sprint27.sql  -- professionals.coverage_provincias text[] (GIN) + coverage_country bool (hierarchical travel);
                     professionals.portfolio_items jsonb (casos de éxito tagged per profession);
                     insurers table (DB-backed approved list + suggestion tickets) + RLS;
                     bookings.work_done_at/completed_at/cancelled_by/cancel_reason (lifecycle); drop bookings_status_check
```

### Location (items 1-2)
- **Fixed location — typed FIRST, pin visual only.** `WorkplacesPicker` rewritten: the pro selects provincia → cantón (authoritative for /buscar), then optionally drops a pin as the exact visual marker. The pin no longer reverse-geocodes/derives the area; typed values win. Each `Workplace` carries user-selected `provinciaId`/`cantonId` + optional `lat`/`lng`.
- **Hierarchical travel coverage.** `CoverageAreaSelector` adds three levels (un cantón / toda una provincia / todo el país), mixable. `lib/location.ts` `computeSearchAreas` returns `{provincias, cantones, coverageProvincias, coverageCountry}`. `/buscar` matches via hierarchy: a searched cantón matches if covered directly (`search_cantones`), via its whole provincia (`coverage_provincias`), or via whole-country (`coverage_country`). Province search adds `coverage_country`. Pre-migration fallback retained.

### Insurance (item 3)
- `AseguradorasInput` (chip/autocomplete like languages) fed ONLY by the official list = static `lib/data/insurers.ts` + admin-approved rows from the `insurers` table. NO free-text "Otra". Discreet **"¿No ves tu aseguradora?"** opens a small form → `POST /api/insurers/suggest` → creates a **pending** `insurers` row (a tracked ticket; not shown on the profile, not a loose message). Admin **Aseguradoras** tab (`/admin/aseguradoras`, `/api/admin/insurers`) approves/rejects; approving sets `approved=true` → filterable for everyone. `/buscar` filter + profile editor merge static + approved DB insurers.

### Scheduling (item 4)
- **15-min lead time**, `lib/time-cr.ts`: `LEAD_MINUTES=15`, `isTooSoonCR`, `earliestValidTimeCR`, `crDatePretty` (dd/mm/aaaa). The availability editor's time pickers set `min={earliestValidTimeCR}` for today and prefill valid start/single times so the pro never hits an error in normal use; the "esa hora ya pasó/es muy pronto" message is the **repeatable** safety-net (fires every attempt). The booking calendar only OFFERS slots ≥ 15 min ahead (`isTooSoonCR`). Availability dates render dd/mm/aaaa.

### No-CR-identification providers (items 5-10)
- **Hidden from /buscar until approved.** `searchProfessionals` excludes `no_cr_id` pros unless `verification_status='verified'`, and **rejected** pros are never visible (`.neq verification_status 'rejected'`). Visibility is **solely** status-driven.
- **Manual block toggle removed** from admin-case (item 8); to hide a profile the admin uses **Rechazar**. Legacy `unban` kept only when already banned.
- Pro panel (`VerificationPanel`, `noCrId` prop): **"Pendiente de revisión"** state explaining they're not yet visible + WhatsApp follow-up. **Add-cédula-later** section → `POST /api/add-cedula` (stores cédula, clears `no_cr_id`, runs normal padrón verification automatically — no ticket). **Appeal** for no-ID goes STRAIGHT to a support ticket (`/api/appeals` `no_cr_id` branch — no padrón re-run); cédula-based cases still auto-reverify.
- Removed the public "no indicó un documento. Contactalo para verificar" wording (item 6); no-ID pros simply aren't listed.

### Casos de éxito per service (item 11)
- `PhotoGallery` rewritten: work photos attached **per profession/service**. Stored as `portfolio_items` `[{url, profession}]` (+ `portfolio_urls` flat for back-compat / 5-photo CHECK). Grouped upload (one section per profession + "Otros"). Public profile **Casos de éxito** tab groups galleries by profession (best-effort separate fetch so a missing column never breaks the profile). Registration tip reworded ("en cada uno de tus servicios").

### Booking (items 12-14)
- **Beneficiary cédula auto-fills** the confirmed person info (read-only padrón name block); the manual name field appears ONLY when the cédula isn't found. (Padrón still has no DOB → DOB optional.) Same self-cédula auto-fill display.
- **Registered clients never see the cédula input** — a new `profileLoaded` gate means `needsCedula` is only true once the profile is known to lack a cédula (fixes the ~1s flash).
- First submit renamed **"Confirmar solicitud"** (`booking.step4.submit`, es+en), WhatsApp icon removed from it (it registers, not WhatsApp); success keeps "Continuar por WhatsApp" + "Agregar a mi calendario" with the official icon.

### Auth / registration (items 15-18)
- **Social removed from registration** (`/registro/profesional` step 0) — social sign-in is on LOGIN only; from there users proceed to registration.
- **Post-registration loop fixed**: OAuth/converting pros land on `/dashboard/profesional`; `supabase.auth.updateUser({ role:'professional', onboarding_completed:true })` persists the role in auth metadata (middleware reads metadata) so navigating away never reverts to role selection (also item 20).
- Terms line: **"Al crear una cuenta, aceptás los Términos y la Política de Privacidad de ContrataCR"** (both linked: `/terminos`, `/privacidad`). "Confirmar contraseña" already in place.

### Client→professional conversion (items 19-20)
- Converting client with a cédula already on file: identity step is **skipped** (reuses the stored cédula; never re-asked — re-entering would error as "already registered"). `accountCedula` fetched on mount; cédula validation skipped when present. Role persistence via auth metadata (above).

### Notifications (item 21)
- `NotificationsList` now supports mark-single-read (✓), mark-all-read, delete-single (✕), **delete-all** ("Eliminar todas"). The client panel's inline notifications block was replaced with the shared `NotificationsList` (parity with the pro panel).

### Projects & solicitudes lifecycle + reporting + profile access (items 22-28)
- **Solicitudes (bookings) lifecycle** added to match projects: pro **"Marcar trabajo realizado"** → `awaiting_confirmation` (sets `work_done_at`, notifies client); client **"Confirmar finalización"** → `completed` (notifies pro + review prompt); **lazy auto-confirm after 7 days** (`autoConfirmStale` in GET); **either party cancels** before completion (with reason + `cancelled_by`, notifies the other). `BookingStatus` gained `awaiting_confirmation`. Both pro + client booking cards updated with the new labels/actions and who-can-act hints. PATCH retries without the new columns pre-migration.
- **Two-way WhatsApp** on accepted proposals already present both sides (pro proposals-tab + client proposals). **Reviews only on FINALIZADO** already enforced (`/api/reviews`).
- **Reporting**: client "Reportar" available on active (confirmed/in_progress/awaiting_confirmation), completed AND cancelled solicitudes → `/api/report-professional` → `reports` ticket (admin moderation; NOT the owner's personal WhatsApp; feeds the two-way reputation/flag system).
- **Pro name → public profile link** in client booking cards (upcoming + history) and project proposals. **Search-by-name** already works (`/buscar` `q` matches `profiles.full_name`).

---

## Sprint 26 (2026-06-07) — identity unification, aseguradoras, reviews, no-show, minors, booking-for-someone-else

**Run this migration in Supabase SQL Editor:**
```
032_insurance_beneficiary_noshow.sql  -- professionals.insurance_networks (GIN), no_cr_id, id_document_note,
                                         is_flagged/flag_count; bookings beneficiary_* + for_someone_else +
                                         beneficiary_is_minor + no_show_* 
```

### ⚠️ Data constraint — the TSE padrón has NO birth date
The loaded electoral roll (`padron`) contains only cédula + names. It has **no date of birth**, so DOB/age cannot be auto-filled from the padrón. We handle this two ways:
- **18+ gate = padrón presence.** The electoral roll only lists citizens **18 or older**, so a national cédula *found* in the padrón ⇒ adult. `IdentityLookupResult.isAdult` is true when found. A national cédula *not* found can't be age-confirmed → blocked (client) or pending review (pro).
- **DOB/age is shown only where entered manually** (a beneficiary without a cédula). `lib/age.ts` (`computeAge` y/m/d, `formatAge`, `isMinorFromDob`). The info block renders DOB/age conditionally — ready for a future data source that provides DOB.

### 1. Unified cédula→padrón auto-fill + confirm (`IdentityInfoBlock` + `IdentityField`)
- Shared `IdentityInfoBlock` (name + cédula + DOB/age when present + "¿No es tu información?"). `IdentityField` reports `onResult({found,isAdult,dob})`. `/api/cedula/[id]` returns `{found, fullName, dob, isAdult}` (dob null from padrón; integrity guard unchanged — not-found never resolves).
- **(a) Client registration**: cédula → name auto-fills (client doesn't type it) + 18+ gate. **(b) Guest booking**: cédula entered → live padrón name shown. **(c) Logged-in registered**: cédula NOT re-asked; stored identity line shown. **(d) Professional registration**: same confirm = the badge verification.

### 2. "No tengo identificación costarricense" → admin exceptions
- Pro registration toggle (email/pw + OAuth): skips cédula, collects manual name + optional document note; account created `verification_status=pending` with `no_cr_id` + `id_document_note` → lands in the admin exceptions queue (trackable, not WhatsApp-only). Admin case surfaces the document note.

### 3. Aseguradoras (insurance networks)
- `lib/data/insurers.ts`; `professionals.insurance_networks text[]` (GIN). Profile editor multi-select; shown on the public profile; `/buscar` **Aseguradora** filter (`?aseguradora=`, array-contains, pre-migration-safe conditional select).

### 4. Public reviews gated by confirmed completion (already enforced)
- `/api/reviews` requires a `completed` booking OR confirmed-finished project between the client and pro; one review per pair; self-review blocked. Reviews are public on the profile (Reseñas tab); the client leaves them from their dashboard after completion.

### 5. No-show / non-performance / non-payment — reputation only (no fines)
- ContrataCR processes **no payments** (off-platform), so there are **no monetary penalties**. Two-way reports: pro→client ("Reportar cliente", existing) and **client→pro** (`/api/report-professional`, dashboard "Reportar"). Each bumps the reported party's `flag_count`; **3 reports → `is_flagged`** → surfaces to pros (badge on booking card) + admin moderation. No-show / "servicio no realizado" / "no pagó" are report reasons feeding the same system.

### 6. Minors (under 18) blocked
- No account (client or pro) for under-18, enforced via padrón presence (a minor's cédula isn't in the electoral roll). Clients with an unverifiable national cédula are blocked at registration; pros fall to pending review.

### Booking for someone else (responsible adult vs beneficiary)
- Booking step **"¿Para quién es la cita?"** → Para mí (uses account holder, no re-entry) / Para otra persona. Then **"¿La persona tiene cédula?"**:
  - **Sí** → beneficiary cédula → padrón **name auto-fill** into an **editable name field** (so a not-found cédula still shows a "no encontramos esa cédula" hint and never blocks) + **optional DOB** (padrón has no birth date).
  - **No** → name + DOB (computes age) + optional phone.
- **Beneficiary cédula is ALWAYS optional** — identity assurance comes from the verified responsible adult. The beneficiary **name is required** (cédula is not) so the pro always knows who the service is for. If beneficiary age < 18 (from an entered DOB) → booking marked **"para un menor"** (`beneficiary_is_minor`).
- The professional sees BOTH parties: who booked it (responsible adult + real contact) and who it's for (beneficiary name/age/cédula-if-given/phone-if-given) with a **Menor de edad** badge. Data minimization: only the appointment-needed beneficiary fields are stored (`beneficiary_name/cedula/dob/phone/is_minor` on the booking); no account is created for the beneficiary; the responsible account holder remains accountable.

---

## Sprint 25 (2026-06-07) — 13-item batch (verification UX, forms, admin re-scope, location model, client ID at booking)

**Run these migrations in Supabase SQL Editor (in order):**
```
028_no_past_slots.sql       -- BEFORE INSERT trigger: reject availability_slots in the past (America/Costa_Rica)
029_moderation.sql          -- reports table; professionals.is_banned/banned_reason/banned_at
030_location_model.sql      -- professionals.coverage_areas jsonb; search_provincias/search_cantones text[] (GIN); per-pin admin fields live in workplaces jsonb
031_client_reputation.sql   -- reports.reported_client_id/reporter_professional_id; profiles.is_flagged/flag_count
```

### 1. Identity — cédula→padrón auto-fill + confirm (no name matching)
- The professional no longer types their name for verification. `IdentityField` (`src/components/ui/identity-field.tsx`): entering a cédula debounce-calls `/api/cedula/[id]`, which now queries the **local padrón** (source of truth) and returns the **official name** to confirm. Found → official name auto-filled + identity auto-verifies; not found → manual entry + **pendiente de revisión**.
- `IdentityVerifier.lookup(cedula)` added; `run-verification.ts` looks up by cédula, **overwrites the profile name with the official padrón name**, and verifies. Name-similarity matching removed from the grant path.
- **Integrity guard**: `/api/cedula/[id]` has NO permissive fallback — a cédula absent from the padrón returns `found:false` (verified: 3,758,113 rows; `9-9999-9999` → not found, never auto-verifies). Used in pro registration (email/password + OAuth paths).

### 2. Unsaved changes — designed dialog + auto-save
- `UnsavedChangesGuard` (`src/components/dashboard/unsaved-changes-guard.tsx`) replaces the browser default for in-app navigation: styled Spanish dialog (Guardar y salir / Salir sin guardar / Seguir editando). Profile editor **auto-saves 1.5s after the last edit**, so the dialog is just a safety net. Hard unloads keep the native prompt (browsers disallow custom UI there).

### 3. Email already registered
- Supabase anti-enumeration returns a user with an EMPTY `identities` array for an existing email (no error) → previously surfaced as "No se encontró el usuario". Now detected at signup (pro + client flows) → **"Este correo ya está registrado. Iniciá sesión."** with a login link. API fallback message + 409 corrected.

### 4-5. Contact + booking CTA
- `/buscar` cards show **"Contáctanos por llamada"** (`tel:`) alongside WhatsApp in the public-availability branch too (not just contact-only).
- Booking submit renamed **"Solicitar por WhatsApp"** (es) / "Request via WhatsApp" (en) with the official WhatsApp icon — it completes a service request.

### 6. Solicitudes persistence
- `PATCH /api/bookings` authorizes the actor against the row (owner pro or owner client) then **persists with the service-role client** — the RLS-bound update could silently affect 0 rows when no UPDATE policy covered the professional, which is why confirm/completar was lost on reload.

### 7. No past dates/times (Costa Rica)
- `src/lib/time-cr.ts` derives CR wall-clock via `Intl` (correct on any timezone). Availability editor rejects past dates + past times today; booking calendar hides today-slots that passed. **Migration 028** adds a server-side BEFORE INSERT trigger on `availability_slots`.

### 8. Casos de éxito
- Work photos are now **"Casos de éxito"** (trabajos anteriores). Profile has a dedicated **Casos de éxito** tab (deep-linkable `?tab=casos`); `/buscar` card shows **"Ver casos de éxito (N)"**; dashboard tab + gallery copy + registration tip reworded. Storage unchanged (Cloudinary `portfolio_urls`, max 5).

### 9. Client confirm-password
- `/registro/cliente` has a **Confirmar contraseña** field with matching validation + friendly error.

### 10. Admin re-scoped — exceptions + moderation + support
- No per-user approvals; clean auto-verified pros never appear. Shell nav tabs **Verificación / Reportes**. **Reportes** queue (`/admin/reportes`, `/api/admin/reports`) lists persisted reports (now saved from `/api/report` → `reports` table) with resolve/reopen. Case view gains **Moderación**: remove fake/inappropriate casos de éxito photos, **ban/unban** (`is_banned` removes from `/buscar`), revoke badge (existing) — all logged in `provider_verification_log`. `/api/admin/providers/[id]/moderate`. Search excludes banned pros (with pre-migration fallback). **Migration 029**.

### 11. Location model — pins as single source of truth
- Fixed pros: provincia/cantón/distrito **reverse-geocoded per map pin** (`WorkplacesPicker` derives via `matchProvinceCanton`); manual province/cantón selection removed from profile + registration.
- "Me desplazo" pros: `CoverageAreaSelector` (provincia+cantón pairs) — the ONLY manual area picker. Both modes combine.
- `lib/location.ts` computes denormalized `search_provincias`/`search_cantones` (pins + coverage) on save; `provincia_id`/`canton_id` keep the PRIMARY area for card display. **Migration 030** (+ GIN indexes).
- `/buscar` is location-aware: matches any covered provincia/cantón via array-contains `.cs`, legacy fallback so search never breaks pre-migration; map auto-fits matching pins. Per-location schedules now include coverage areas + videoconsulta.

### 12-13. Client identification at BOOKING (not signup)
- Cédula removed from client signup (`ClientRegistrationModal` name-only step). Requested at **booking** for both guest and registered clients (guest booking still allowed). Shared masked ID input.
- Validation at booking: **format** + **padrón EXISTENCE** for national cédulas only (DIMEX/NITE pass on format — not in the TSE roll). **Recoverable inline errors** preserve entered data; NO TSE name-confirmation for clients. Data minimization (store the cédula on the request, not padrón PII).
- **Two-way reputation / pro safeguards**: booking card shows the client's phone + a ⚠ flag badge, WhatsApp now reaches the **client**, and **"Reportar cliente"** (`/api/report-client`). 3 reports → `profiles.is_flagged` → surfaces to pros + admin moderation. **Migration 031**. Legal framing: the platform surfaces info and history; it does NOT warrant client identity (pro confirms in person, may ask for the physical cédula).

---

## Sprint 24 (2026-06-07) — fully automatic identity verification

**Run migration in Supabase SQL Editor:**
```
027_identity_verification.sql  -- padron + padron_staging + finalize_padron_swap();
                                  professionals.verification_method/provider/verified_at;
                                  status authorized → verified; support_tickets; notif type verification_pending
```
**Padrón loaded ✅ (2026-06-07):**
- Source: public TSE roll `padron_completo.zip` → `PADRON_COMPLETO.txt` (latin1, comma-delimited; fields per the bundled `Leame.txt`: `CEDULA,CODELEC,SEXO,FECHACADUC,JUNTA,NOMBRE,1.APELLIDO,2.APELLIDO`). The loader reads only fields 0/5/6/7 (cédula + 3 names) — data minimization. `distelec.txt` (district lookup) intentionally NOT loaded.
- Loaded via `node scripts/load-padron.mjs PADRON_COMPLETO.txt` → **3,758,113 rows live** (staging → `finalize_padron_swap()` atomic promote).
- **Cédula normalization alignment (verified):** the padrón stores cédula digits-only/seamless (e.g. `101053316`). The verifier queries with `cleanId(cedula)` (`.replace(/\D/g,"")`), which produces the identical seamless form (e.g. `2-0806-0421` → `208060421`). Confirmed empirically: `.eq("cedula","101053316")` returns the row. National cédulas only — DIMEX/NITE holders aren't in the TSE padrón, so they correctly fall to `pending`/manual.
- Recurring refresh: GitHub Action `.github/workflows/padron-refresh.yml` (monthly) — set repo secrets
  `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. The load goes into `padron_staging` then `finalize_padron_swap()`
  atomically promotes it (verification never down mid-update).
- Before the padrón was loaded, the verifier found nothing → new pros landed in "pendiente de revisión" (graceful, no crash).

### Shared ID input (already in place, sprint 21 — recap)
`CedulaInput` + `lib/cedula.ts`: label **"Número de identificación"**, `required` prop (red `*` / "(opcional)"; client flows kept required), live `X-XXXX-XXXX` masking, **hyphen-free storage** (display-only hyphens, zero-padded segments), **type auto-detection** (cédula 9 + first 1–9, NITE 10, DIMEX 11–12), **format/length validation only** (no local check digit — there is no published control digit; truth comes from the padrón), `inputMode="numeric"`, helper "CR: 9 dígitos · DIMEX: 11-12 · NITE: 10", reused everywhere.

### IdentityVerifier abstraction (`src/lib/verification/identity-verifier.ts`)
- `IdentityVerifier` interface (`verify(input) → { matched, found, score, provider }`) — the verification flow calls only this, so the provider is **swappable without touching callers** (self-hosted padrón now; ApifyCR/Verifik later via `getIdentityVerifier()`). **Internal use only** — no public endpoint, no external auth/rate-limit.
- `SelfHostedPadronVerifier` — looks up the cédula in `padron`, compares names, returns the match.
- **Biometric extension point**: optional `verifyBiometric?(...)` on the interface, reserved for a future liveness tier (and a future "Proveedor Autorizado" higher tier). Not implemented now.

### Padrón table + name matching
- `padron(cedula PK, nombre, papellido, sapellido)` — **matching data only** (data minimization); service-role only (no public RLS). `padron_staging` + `finalize_padron_swap()` for safe reloads.
- `normalizeName` (strip accents, uppercase, drop punctuation/stopwords, collapse spaces) + `nameSimilarity` (token-subset share, order-insensitive, partial-tolerant). `NAME_MATCH_THRESHOLD = 0.6`, tuned to minimize false negatives.

### Automatic grant logic (`run-verification.ts`)
- On registration the register API calls `runIdentityVerification(proId)` (best-effort): **match → `verified`** (method `automatic`, provider, `verified_at`, `is_verified=true`) + log `auto_verified` + notify; **not found / mismatch → `pending`** (never auto-reject) + log `auto_pending` + notify. Pros can re-run from the panel (`POST /api/verify-identity`).
- **Data minimization**: we store only the RESULT (`verification_status`, `verification_method`, `verification_provider`, `verified_at`) — never the padrón person data on the profile.

### "Identidad verificada" naming + legal wording
- Status `authorized` → **`verified`**; badge/labels everywhere now **"Identidad verificada"** (card, profile, dashboard, explainer, admin). Copy avoids "garantía"/"autorizado": it states only that the cédula is real and the name matches. Explainer page reworded to **"¿Qué es la verificación de identidad?"** with the intermediary disclaimer (verify identity, not job outcomes; identity-existence ≠ proof the registrant is that person).
- /buscar filter renamed **"Solo con identidad verificada"** (`?verificados=1`; `verifiedOnly`). Registration stays open — the badge is never a gate.

### Appeals — auto re-run, then ticket
- `POST /api/appeals` re-runs verification (`runIdentityVerification(proId, { appeal:true })`): **now passes → `verified` automatically**; **still fails → `under_appeal` + a `support_tickets` row** (the rare manual tail) + admin notification + a WhatsApp convenience (pre-filled case id). Never auto-approves a repeatedly-failing appeal; never drops to WhatsApp with no record.

### Admin panel — exception-only
- Login at **/admin** (guarded server + client; non-admins blocked). Queue defaults to **Pendientes** + **Apelaciones (tickets)**; clean auto-verified pros are tucked behind "Verificados". Case view shows **entered name vs padrón name side by side** (read-only/transient, not stored) and the ID-format assist. Actions are **Marcar verificado / Rechazar (reason required) / Revocar / Volver a pendiente** + **Contactar por WhatsApp**. The manual **"Verificar en TSE"** button (and its helper text) was **removed** — confirmation against the padrón is fully automatic, so there's no manual TSE consult step. **Work photos removed** from the verification flow entirely (not a criterion; profile-only). Audit trail logs both automatic grants (`auto_verified`/`auto_pending`) and manual decisions (who/when/action/reason).

### Notifications
- Email + in-app on every change: `verification_approved` (verified), `verification_pending`, `verification_rejected`, `verification_reverted`. Rejections include the reason + how to appeal.

### Accepted risk (documented)
- Identity-existence + name-match does **not** prove the registrant physically IS that person (someone could use another's real cédula). Accepted trade-off for zero-friction automation now; the **biometric/liveness extension point** is the future mitigation.

---

## Sprint 23 (2026-06-07) — 28-item batch

No new migrations. Behavioural/UX fixes + a few API/data-flow corrections.

### Forms & session
- **Unsaved-changes guard** (`useUnsavedWarning`): warns on hard unload AND in-app link navigation when the profile editor has unsaved edits (capture-phase link interception, since App Router has no route-abort API). Photo still auto-saves.
- **OTP modal** condensed to one block: "Verificá tu correo" + "Ingresá el código de 6 dígitos que enviamos a {email}." (logo + duplicate copy removed; the registration wrapper no longer repeats it).
- **"Nombre completo"** everywhere ("Nombre legal completo" removed in booking, completar-perfil, registration).
- **Input focus color unified** to brand blue `#009FD9` (design-system `Input` was green `#319278`) so cédula / teléfono / nombre match; neutral hover border.

### Onboarding / role / session bugs
- Client email signup now sets `onboarding_completed` in **auth metadata** → after verifying, middleware sends them to their panel instead of the role-selection screen (fix 5).
- Onboarding role select hardened: `updateUser` first, best-effort profile upsert, **hard navigation** → fixes the Google "Busco profesionales" choice not loading (fix 6).
- **Client → professional upgrade**: "Convertirme en profesional" card in the client panel (same account → pro onboarding). The register API already upserts `role='professional'` + creates the professional record (fix 7).
- **Favorites scoped per user**: localStorage key is namespaced with the user id (JWT `sub`), so two accounts on one browser never share Guardados (fix 8).
- **Booking persistence fix**: the client bookings GET embedded `categories(...)` on professionals, which has no FK → the query 500'd and dropped every booking. Replaced with `category_id`; booked appointments now appear in Solicitudes (fix 9).

### Admin / verification
- **Admin login moved to `/admin`** itself (non-admins see the form inline); `/admin/login` redirects there; `requireAdmin` + sign-out updated (fix 10).
- Explainer **"Solicitar mi verificación"** is session-aware (`VerificationCta`): existing professionals → verification tab, never registration (fix 11).
- **TSE verification is assisted/manual** (no scraping): "Verificar en TSE" opens the official consultation in a new tab and copies the cédula to the clipboard; the admin compares the name and marks verified (fix 12).

### Map / location
- `WorkplacesPicker`: **"Usar mi ubicación actual"** (geolocation + reverse geocode) and **re-inits the map on every mount** (the Script `onLoad` only fires once) — fixes the blank map after fixed→mobile→fixed (fixes 13–14).
- Profile **work mode allows BOTH** ("me desplazo" + "lugar fijo" are independent toggles); `service_type` stored as a comma list.

### Booking FOR ANOTHER PERSON (third-party) logic
- **No duplicate account-holder data.** When `forSomeoneElse`, the account holder's OWN cédula and WhatsApp are NO longer required (`needsCedula`/`needsPhone` gated on `!forSomeoneElse`). Only self-bookings link/require the holder's cédula. Beneficiary cédula stays **optional and never linked to the account** (unchanged).
- **Appointment contact = the beneficiary's number.** The beneficiary phone is now **required** for third-party bookings ("Teléfono de contacto para la cita") — it's the number the professional uses to coordinate. Validated (≥8 digits) in the details step.
- **Pro contacts the right person.** In `booking-requests`, the WhatsApp button uses the **beneficiary phone** when `for_someone_else` (labelled "WhatsApp a [nombre]"), else the client's; the card shows "Reservado por [responsable]" + "Coordina la cita al contacto de la persona." Status notifications still go to the responsible party (they booked it).

### Booking cédula/name fixes (booking-modal)
- **Name now follows the linked cédula.** Cause: applying the official name relied on the debounced `selfCedulaName` state, so a fast submit saved the cédula but kept the old name (and future bookings showed the mismatch since the account already had a cédula → never re-prompted). Fix: `validateClientCedula()` now fetches + returns the official name **synchronously** at submit, used for both the booking name and the account update; plus a **self-heal effect** on modal open — a logged-in account whose stored national cédula's official name differs is corrected (profiles + auth metadata + display) once per open. So name + cédula stay consistent.
- **"No encontramos esa cédula" flicker fixed.** Added `benCedulaLoading`/`selfCedulaLoading`; the "not found" line only renders AFTER the lookup resolves (shows "Buscando…" while in flight), never prematurely for valid cédulas.
- **Removed "Datos confirmados con el padrón"** from the booking modal (and confirmed it appears nowhere else) — we never claim padrón confirmation in UI copy.
- **Health DOB autofill:** the autofill path is correct (`/api/cedula` `dob` → `setBenDob`/`selfDob`), but the **TSE padrón has no birth date** (only cédula + 3 name fields), so it can't populate from the padrón — DOB stays a required manual field until a DOB-carrying source is added. (Honest limitation, not a code bug.)

### URGENT FIX — padrón identity verification ("not found" for valid cédulas)
- **Cause:** `padron` is RLS-enabled with **no policies** (server-only by design). The verifier read it with the service-role client, which **bypasses RLS but still needs a table-level `SELECT` privilege**. The RLS/security hardening's broad REVOKEs left the service role without that grant on `padron`, so every lookup returned nothing → all cédulas reported "not found" → everyone sent to manual review. (RLS being *on* wasn't new — it's been on since 027 — the missing **grant** was.)
- **Fix (keeps padrón private):** migration **050_padron_lookup_rpc.sql** adds a `SECURITY DEFINER` function `padron_lookup(p_cedula text)` that runs as the table **owner** (always can read the padrón, independent of service-role grants); `EXECUTE` is granted to **service_role only** (revoked from anon/authenticated) so the padrón is never exposed to the public/client. Also re-grants `SELECT` on `padron`/`padron_staging` to `service_role` (belt-and-suspenders; RLS stays ON). The verifier (`identity-verifier.ts` `lookup()` + `verify()`) now calls `admin.rpc("padron_lookup", { p_cedula })` instead of a direct table read.
- **⚠️ Must apply migration 050 in Supabase** for the fix to take effect (the RPC must exist). Lesson: a service-role read of an RLS table still needs the table GRANT; for server-only private tables prefer a SECURITY DEFINER RPC granted to service_role only. Found → auto-fills official name + auto-verifies; not found → manual review (unchanged).

### URGENT FIX #2 (2026-06-12) — padrón "not found" AGAIN: the route's auth gate blocked registration
- **Symptom (reported):** a real, **unregistered** cédula that EXISTS in the padrón showed "no encontrada" during professional registration.
- **Cause (confirmed on prod):** the *same* RLS-hardening pass that necessitated fix #1 also added an **authenticated-session gate** to `/api/cedula/[id]` (`safeGetUser` → 401 when no user; commit `3136393`). But **email/password pro registration runs the cédula→padrón lookup at step 0, BEFORE the account is created** (`signUp` is in `onStep3`), so the call is unauthenticated → **401** → `IdentityField` renders any non-200 as "not found". `curl https://contratacr.com/api/cedula/123456789` → `401 {"error":"No autorizado"}` proved it. The server-side RPC/verifier (fix #1) were **fine** — they never even ran because auth failed first. (NOT caused by the i18n design passes: the registration step structure is byte-identical at fix-#1 commit `76f1462`; the gate predates it and only ever passed via authenticated paths — OAuth/booking/dashboard — which is why fix #1 "looked" verified.)
- **Fix:** removed the auth gate from `/api/cedula/[id]` (commit `3de82a4`). The padrón stays private the *right* way — the **table** is read only server-side via the `padron_lookup` SECURITY DEFINER RPC (service-role); the route just exposes a **single-record, rate-limited name confirmation** (≤1 name per valid-format cédula, no enumerable bulk read — same datum TSE's public consulta returns). Integrity guard unchanged: absent → 404, never a name, never auto-verified. Verified on prod post-deploy: valid-format absent cédula now returns **404** (RPC runs), invalid format **400**, no more 401.
- **🚨 WARNING — DO NOT REGRESS THIS AGAIN:**
  1. **The padrón lookup must always stay SERVER-SIDE** via the `padron_lookup` SECURITY DEFINER RPC (service-role). Never read `padron` from the client; never grant the table to anon/authenticated; never return bulk/listable padrón data.
  2. **NEVER re-add a session/auth gate to `/api/cedula/[id]`.** Registration is pre-auth by design (account is created at the final step), so an auth gate silently breaks identity autofill for every email/password signup. If you need anti-abuse, tighten the **per-IP rate limit** — do not gate on a session.
  3. **Design/UI/i18n passes must NOT touch this flow** (`/api/cedula/[id]`, `identity-verifier.ts`, `run-verification.ts`, the `IdentityField` fetch/branching). Treat it as off-limits unless the task is explicitly about verification.

### Google Maps → NEW Places API migration (fixes ApiTargetBlockedMapError)
- **Why:** the legacy `google.maps.places.Autocomplete` and `google.maps.Marker` require the old "Places API", which our key doesn't enable — causing `ApiTargetBlockedMapError`. Migrated to the new components so the key needs only **Places API (New) + Maps JavaScript API + Geocoding API**.
- **What changed:**
  - New shared async loader `src/lib/maps/loader.ts` (`loadGoogleMaps(key)`) using **`loading=async`** + `callback` + `libraries=marker,places,geocoding` — removes the "loaded directly without loading=async" warning. Replaced the per-component `<Script src=.../js?...&libraries=places>` tags.
  - `places.Autocomplete` → **`places.PlaceAutocompleteElement`** (web component, `includedRegionCodes:["cr"]`, `gmp-select` event → `place.fetchFields(["location","formattedAddress","addressComponents"])`). In `location-picker.tsx` and `workplaces-picker.tsx` (registration, pro location/coverage, booking address). `extractAdmin`/`deriveAdmin` now read BOTH `long_name` (geocoder) and `longText` (new Place).
  - `maps.Marker` → **`marker.AdvancedMarkerElement`** everywhere (location-picker draggable pin via `gmpDraggable`; workplaces pins; the /buscar `google-map-panel` numbered pins + cluster bubbles use HTML content; removal via `marker.map = null`). Hover/click use DOM listeners on the marker's content element.
  - **Map ID required by AdvancedMarkers:** maps now set `mapId` = `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` (fallback `"DEMO_MAP_ID"`). **Trade-off:** a `mapId` makes Google ignore the JSON `BRAND_MAP_STYLE` (cloud-based styling replaces it). To restore brand colors, create a styled **Map ID** in Google Cloud console and set `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` in Vercel + `.env.local`. `lib/maps/map-style.ts` is now unused.
- **Needs live verification** at https://contratacr.com (autocomplete "Ate"→"Atenas, Alajuela", map + numbered markers render, no ApiTargetBlocked errors) — can't be tested without the live key.

### Smaller fixes — save clarity, optional email, ver-horario-completo
- **Save feedback:** profile-editor already autosaves + shows explicit status; services-editor now has a **persistent save status line** (Guardando… / Guardado / "Los cambios se guardan automáticamente.") so deletes/edits never leave a "did it save?" ambiguity.
- **Optional public contact email:** new nullable `professionals.contact_email` (**migration 049_pro_contact_email.sql — must be applied in Supabase**). Opt-in field in profile-editor (validated); the profile shows an **"Escribir por correo"** (mailto) option only when set, with self-block on the owner's view. Read best-effort in the detail query (like call_phone), mapped to `contactEmail`.
- **"Ver horario completo"** on /buscar cards now opens the **Solicitar servicio** flow (`openBooking()`) instead of linking to the profile.

### Servicios clarity + casos de éxito by service instance
- **Servicios** reorganized into a clear two-step flow (numbered badges: 1 Tus profesiones, 2 Tus servicios), lighter containers.
- **Casos de éxito now attach to a SERVICE INSTANCE (`serviceId`), not profession** — fixes duplicate names (e.g. three "Otro servicio") sharing photos. `PortfolioItem` gained `serviceId` (`profession` kept for legacy). New `lib/services.ts` `serviceLabelMap()` builds unique labels (description snippet or ordinal for repeats), used in `PhotoGallery` (editor) and the profile casos tab. Photos with no current service fall into an "Otros trabajos" bucket. PhotoGallery now takes `services`; uploads tag `{ serviceId, profession }`.

### Profile improvements (price/label/brand/completion/self-report)
- **Unified price → Servicios only.** Removed the duplicate profile-level "Precios" tiers from Mi perfil (profile-editor no longer writes `pricing`/`hourly_rate`; existing DB values left intact as fallback). The card/profile "Desde" now derives from services via `deriveDisplayPricing()` in `lib/pricing.ts` (used in `queries/professionals.ts`; the buscar select now includes `services`).
- **Label:** `a_convenir` displays as **"Precio a consultar"** (was "Precio a convenir"); internal id unchanged.
- **Brand vs name:** when `business_name` exists it leads as the title; the personal name becomes a muted subtitle — on the /buscar card (`brandPrimary`/`brandSecondary`) and the profile header.
- **Profile completion %:** new `ProfileCompletion` card on the Mi perfil tab (`computeCompletion(pro)`), context-aware (aseguradoras only for health; Spanish-only / "none" never penalized), benefit-framed prompts that deep-link to the right tab.
- **No self-report:** the "Reportar perfil" item is hidden on one's own profile (shows a muted "Este es tu perfil" row instead).

### Account linking — email/password vs Google/Facebook (same email)
- **Single account per email** is governed by **Supabase Auth config**, not app code: keep **"Confirm email" ON** and Supabase's default **automatic identity linking by verified email** enabled. With that, a user who signed up with email/password and later uses Google with the same (verified) email lands on the SAME account (identities linked), and vice-versa — no duplicate, no lockout. Manual-linking-only mode would create duplicates, so do not switch to it. Action item: verify in the Supabase dashboard (Authentication → Sign In/Providers / email confirmations) that email confirmation is required and linking is automatic.
- **App-side safeguards added (no duplicates / no dead-ends):** every email/password signup already detects an existing email via Supabase's anti-enumeration signal (a returned user with an EMPTY `identities` array, plus the "already registered" error) — messages now guide the user to the right method: *"Ya existe una cuenta con este correo. Inicia sesión con tu contraseña, o con Google o Facebook si así te registraste."* (registro/cliente, registro/profesional, client-registration-modal, landing-navbar quick-auth via the new `auth.quickAuth.emailAlreadyExists` key). The **login** failure message now hints that the account may use Google/Facebook and points to password reset — avoiding the "wrong password" dead-end for OAuth-only accounts. A Google/Facebook user who wants a password can set one via **olvidé-contraseña** (reset link) → they're never locked out.

### URGENT FIX — service requests (bookings) not received
- **Root cause:** migration 047 revoked blanket `SELECT` on `profiles` and granted back only `(id, full_name, avatar_url, role, is_disabled, created_at, updated_at)`. The professional bookings GET (`/api/bookings?role=professional`) embedded `profiles:client_id(full_name, avatar_url, is_flagged)` with the **RLS/anon client** — `is_flagged` is NOT in the grant, so PostgREST returned a column-permission error; the handler didn't capture it and returned `{ bookings: [] }`, so **"Solicitudes recibidas" was always empty**.
- **Fix (`/api/bookings`):** the professional GET now reads via the **service-role admin client** (still scoped to `pro.id`, authorized by the session), which bypasses the column grant and restores `is_flagged`; added error capture/logging. For resilience the **client GET** and the **booking INSERT** were also moved to the admin client, each scoped to the authorized id — so any RLS row-policy regression on `bookings` can't silently drop the client's own sent requests or block the save. Full round-trip (send → pro sees it → client sees it → accept/cancel) restored. Lesson: don't embed owner/admin-only profile columns (e.g. `is_flagged`, `cedula`, `email`, `phone`) through the anon/authenticated client — read them via admin after authorizing, and always capture the query `error`.

### Self-service (own profile) — show buttons, block the action
- A pro viewing their OWN /buscar card or public profile now sees **all the normal client buttons** (Solicitar servicio / Solicitar por WhatsApp, top-row WhatsApp + call icons, Llamar) — identical to a client's view, so the profile never looks broken. Triggering a self-action does NOT perform it; it opens a friendly responsive modal `SelfActionModal` ("Este es tu perfil" + a per-action message from `SELF_MSG`: request / whatsapp / call / proposal). Replaced the old approach that hid the actions / showed a bare "Este es tu perfil" link.
- Files: `self-action-modal.tsx` (modal + `SELF_MSG`), `top-contact-icons.tsx` (client wrapper for the card's server-rendered icons), and self-blocking wired into `booking-button.tsx`, `professional-schedule.tsx` (pick/openBooking/WhatsApp), `profesionales/[slug]/page.tsx` (WhatsApp/Llamar as buttons). Server guards (bookings/proposals APIs) and the propose-feed exclusion of own projects are unchanged.

### Availability structure
- One top-level decision **"¿Cómo recibís clientes?"** (Solo WhatsApp / Citas en la app / Ambas). Visibility is no longer a separate question: when scheduling is enabled a **"Disponibilidad privada" toggle** appears (ON ⇒ hidden in /buscar + published slots cleared) (fix 15).
- **WhatsApp + call are independent of the "Disponibilidad privada" toggle.** Privada only controls the **published schedule + videoconsulta**; it must NOT hide contact options. WhatsApp shows in BOTH states (any pro with a number); **"Llamar"** shows in BOTH states whenever **`allow_phone_call`** is on (number = `callPhone ?? whatsapp`); **booking** ("Solicitar servicio") is the only action gated by `availability_public`. Fixed a bug where the profile used `availabilityPublic ? <Booking/> : <Llamar/>`, which hid the call option whenever the schedule was public — booking and Llamar are now separate conditionals on their own gates (`professional-card.tsx` + `profesionales/[slug]/page.tsx`).
- **/buscar card top-row contact icons made consistent.** The small WhatsApp + call icons next to the name were gated by `!contactOnly`, so the WhatsApp icon vanished on private / `solo_whatsapp` cards (the call icon was already independent → inconsistent). Now `showTopWhatsApp = !isOwn && whatsapp` and `showTopCall = !isOwn && allow_phone_call && (callPhone || whatsapp)` — both show on EVERY card when their own condition is met, in both privada states. The full-width primary button ("Solicitar por WhatsApp" / "Solicitar servicio") is separate; a contact-only card may show the WhatsApp top icon AND the WhatsApp button (intended).
- **Removed the redundant "Coordina por WhatsApp" / "Solo WhatsApp" badge** (orange lock-icon chip by the service tags, shown when `contactOnly`). It was investigated and found redundant with the prominent "Solicitar por WhatsApp" primary button — which already signals the pro has no in-app agenda — and the lock icon was unclear and off-tone. `contactOnly` and the `Lock` import were dropped from `professional-card.tsx`.
- Schedules are **per-location only** — the "general/all locations" option was removed; guidance shown when the pro has no workplace and no videoconsulta (fix 16).

### Photos / booking
- Photos hint is a single "Máximo 5 fotos." (no more conflicting "Máx. 10") (fix 17).
- Registration step 2: optional tip that posting work photos speeds the Authorized badge (fix 18).
- Booking: selecting a day **auto-scrolls to the time slots** (fix 19); success WhatsApp button → **"Continuar por WhatsApp"** (fix 20).

### Notifications
- Client panel tab badge → clean corner badge with ring (no longer covers the bell) (fix 21).
- Shared `NotificationsList`; the **professional panel has a Notificaciones tab** (parity with client) (fix 22).

### Projects & proposals
- Removed icons from "Lugares de trabajo" (fix 23).
- Client proposals: **WhatsApp on any proposal** + **"Cambiar decisión"** to revert an accept/decline (reopens the project, clears the accepted pro) (fix 24).
- Professional "Mis propuestas": **Editar** (price/message) + **Cancelar** a *pending* proposal — new proposals `PATCH` (field edit) + `DELETE` (owner + pending only) (fix 25).
- Cancelling/deleting a project **notifies the assigned professional** (fix 26).
- **Self-interaction guards** (server-side): a professional can't book or review their own profile (fix 27).
- **Reviews unlock on a confirmed-finished project** too, not only completed bookings (the pro-marks → client-confirms → finalizado lifecycle with 7-day auto-confirm shipped in sprint 22) (fix 28).

---

## Sprint 22 (2026-06-07) — 43-item batch

**Run these migrations in Supabase SQL Editor (in order):**
```
023_provider_verification.sql  -- admin role; professionals.verification_status (+reason,+updated_at);
                                  provider_verification_log (audit); provider_appeals; notification types
024_project_completion.sql     -- projects status lifecycle + work_done_at/completed_at/accepted_professional_id;
                                  project notification types
025_portfolio_limit.sql        -- CHECK: professionals.portfolio_urls length <= 5 (server-side 5-photo limit)
026_location_schedules.sql     -- availability_slots.location_id; professionals.videoconsulta
```

**Supabase Dashboard config (item 21 — Google consent shows raw supabase.co URL):**
- This is a hosting/config change, not code. To brand the OAuth consent + redirect with contratacr.com:
  1. Supabase → Project Settings → **Custom Domains**: add `auth.contratacr.com` (CNAME) — requires the paid add-on. This makes the GoTrue endpoint `https://auth.contratacr.com` instead of `https://<ref>.supabase.co`.
  2. Update `NEXT_PUBLIC_SUPABASE_URL` to the custom domain once active.
  3. Google Cloud Console → OAuth client → Authorized redirect URIs: add `https://auth.contratacr.com/auth/v1/callback`; OAuth consent screen → set the app name/domain to ContrataCR.
  - Until the custom domain is enabled the consent screen will keep showing the supabase.co host (provider limitation).

### Admin role + "Proveedor Autorizado" verification (items 34-43)
- **Admin role**: `profiles.role` extended to allow `admin`. Dedicated login at **/admin/login** (signs in, confirms role=admin server-side, else signs out). Panel routes (**/admin**, **/admin/proveedores/[id]**) are guarded **server-side** via `requireAdmin()` (`src/lib/auth/admin.ts`, reads role with the service-role client so an RLS gap can't grant access). **Every** admin API endpoint re-checks `getApiAdmin()` and returns 403 otherwise — the UI is never the only gate.
- **Verification lifecycle** (`src/lib/verification.ts`): `pending → authorized → rejected → under_appeal`; an admin can move ANY provider to ANY state at any time (nothing locked). `is_verified` is mirrored (authorized ⇒ true) for back-compat. Registration stays open — the badge is earned, never a gate.
- **Admin panel**: review queue filterable by status with counts (`/api/admin/providers`), case file (`/api/admin/providers/[id]`) showing profile, documents/portfolio images, workplaces, appeals, and an **automatic ID-format assist** (cédula/DIMEX/NITE format validity) plus an on-demand **TSE padrón name-match** lookup (reuses `/api/cedula/[id]`, flags mismatches; human review still required for the badge). Approve / Reject (**reason required on reject**) / revert / revoke via `/api/admin/providers/[id]/decision`. **"Contactar por WhatsApp"** button pre-filled with the case id (official WhatsApp icon).
- **Audit trail**: `provider_verification_log` records who (admin id+name), when, action, from/to status, reason — every decision, permanent, shown per provider.
- **Notifications**: `src/lib/verification-notify.ts` sends in-app + email on every status change (approved/rejected/reverted) and on appeal-received (to all admins + support). Rejections include the reason + how to appeal. Copy is **intermediary-safe** (no "garantía"; "respaldo", "verificación de identidad y documentos", "código de conducta").
- **Appeals** (provider): in-app form (`/api/appeals`, primary/trackable → moves to `under_appeal`, surfaces in admin queue, logged) **and** a WhatsApp button pre-filled with the case id. Provider sees status + reason + appeal in the dashboard **Verificación** tab (`verification-panel.tsx`).
- **Badge + filter**: earned **"Proveedor Autorizado"** badge on `/buscar` cards + public profile (only when `authorized`). `/buscar` gets a **"Solo Proveedores Autorizados"** toggle (`?autorizados=1`). Explainer page at **/proveedores-autorizados** (intermediary-safe wording + disclaimer).

### Forms & registration (items 1-6)
- Single **"Nombre completo"** field everywhere (replaced nombre/primer apellido/segundo apellido and the "Nombre legal completo" label); verification-context helper text "tal como aparece en tu documento" (the word "legal" removed).
- **PhoneInput** flag + dial code + input aligned to a consistent h-11; properly sized flag.
- **OTP screen** now states a 6-digit code was sent and shows the destination email.
- Custom Spanish validation: registration forms use `noValidate` (react-hook-form + zod messages) so the browser's "Please fill out this field" never appears.
- **Languages**: optional chip autocomplete over the full language list (`LanguagesInput`, `lib/data/languages.ts` expanded). Profile only — not asked at registration.

### Profile & availability (items 7-10)
- **Contact preference** ("¿Cómo querés que te contacten?") moved into **Disponibilidad** as the first decision. `solo_whatsapp` hides all scheduling (WhatsApp-only); `ambas`/`solo_citas` show scheduling. Saved immediately.
- **Multi-location + videoconsulta schedules** (item 8): schedules belong to a **(professional, location)** pair via `availability_slots.location_id` (a workplace id, the literal `videoconsulta`, or NULL=general). `professionals.videoconsulta` boolean. The availability editor has a videoconsulta toggle + per-schedule location selector; `/buscar` cards show **location chips** that switch which location's schedule is displayed. (Booking carries date/time; location is reflected via the chip selection — wiring the chosen location into the booking record is a small follow-up.)
- **Work mode** toggle in the profile (me desplazo / lugar fijo). "Me desplazo" hides the workplaces section and shows a "Se desplaza a tu ubicación" pill on the `/buscar` card; switchable both ways. `service_type` stored as `mobile`/`fixed`.
- **Unsaved-changes guard**: profile editor tracks `dirty`, warns on `beforeunload`, shows a "Cambios sin guardar" hint; photo upload auto-saves.

### Search /buscar (items 11-15)
- Category-filter dropdown group headers restyled (sticky, separators, no overlap on wheel scroll).
- **Compact cards** (smaller avatar/padding/gaps → more per screen).
- **Unified WhatsApp button** ("Contactar por WhatsApp" + official icon) across public/private schedule branches.
- Mobile: card header gets `pr-10` so the favorites button no longer overlaps the price.
- **No reviews → "Sin reseñas todavía"** (never a fake rating number).

### Home search bar (items 16-18)
- Service field: free-text with category suggestions; selecting **fills the text** (does not search).
- Location field: free-text **province + cantón autocomplete** (replaced the province dropdown); unmatched text falls back to a smart text query.
- Search runs only on Enter / "Buscar". On submit a cantón (e.g. Atenas) **auto-fills its province** (Alajuela) + cantón filters; the `/buscar` map `fitBounds` to those pins positions on the cantón.

### Nav, session & errors (items 19-21)
- `SmartRegisterLink`: footer "Registrá tu perfil" routes logged-in users to their panel (header already hid the CTA when logged in).
- `[locale]/error.tsx` ("Algo salió mal" + retry) and `global-error.tsx` ("fuera de servicio") boundaries replace abrupt failures (e.g. post-logout flash). 404 `not-found.tsx` already present.
- Item 21 (custom auth domain) documented above — config, not code.

### Notifications (items 22-23)
- Unread badge repositioned to the corner with a white ring (no longer covers the bell).
- Bell dropdown gains a **"Ver todas"** link → new **/notificaciones** center (full history, mark-all-read, dismiss), reachable from both client & pro panels (both already receive booking/project/verification notifications).

### Photos & gallery (items 24-25)
- **Cloudinary is the single source** (audited — no Supabase Storage anywhere; only the URL is stored in `portfolio_urls`/`avatar_url`).
- Upload route: `type=avatar` → 400² face crop; `type=portfolio` (default) → ONE optimized original (max 1600, `f_auto`/`q_auto`). `src/lib/cloudinary.ts` (`cldThumb`/`cldLarge`) derives thumbnail/gallery sizes via URL transforms — no extra stored copies.
- **5-photo limit** enforced client-side AND server-side (DB CHECK, migration 025).
- Public profile **"Galería de trabajos"**: optimized thumbnail grid + keyboard lightbox/carousel (`profile-gallery.tsx`).

### Pricing (items 26-27)
- Shared numeric-only **`PriceInput`** (digits only; blocks e/+/-/.,) used in proposals, services editor, profile pricing tiers, and project budget. "Precio a convenir" wording kept.

### Projects (items 28-33)
- Clean **Briefcase** iconography (removed emoji category icons) in both project lists.
- Duplicate proposal already blocked (unique constraint + 409) → label "Ya hiciste una propuesta".
- **Profession-scoped visibility** already enforced server-side in `/api/projects` (matches ANY of the pro's `professions`; uncategorized stay visible) — supports multiple professions.
- "Mis propuestas" already shows the client's photo + full name.
- **Delete** project (DELETE `/api/projects?id=`) + **two-sided completion lifecycle**: open → in_progress (proposal accepted) → awaiting_confirmation (pro "Marcar trabajo realizado") → completed (client "Confirmar finalización", or **lazy auto-confirm after 7 days** on read). Notifications both sides at accept / work-done / confirm. (Reviews remain gated on completed work; the existing review entry points are booking-based — extending review unlock to confirmed projects is a documented follow-up.)

---

## Team

| Role | Responsibilities |
|------|-----------------|
| Software Lead | Architecture, code review, final technical calls |
| Backend Dev | API routes, Supabase schema, auth, integrations |
| Frontend Dev | UI/UX, design system, component library |
| QA Engineer | Test cases, edge cases, acceptance criteria |
| Marketing Lead | Copy, onboarding flow, positioning |

---

## Standing Code Rules
- **All code identifiers (variables, functions, types) in English.**
- **All UI copy in Spanish (default locale).** English translation managed via next-intl.
- Category names, nav labels, form copy, error messages — all go through `messages/{locale}.json`.

---

## Stack

| Layer | Choice | Justification |
|-------|--------|---------------|
| Framework | Next.js 16 (App Router) | SSR/SSG for SEO, full-stack, Vercel-native, TypeScript first |
| i18n | next-intl | First-class App Router + RSC support, locale routing |
| Database + Auth | Supabase | PostgreSQL, built-in auth, RLS, real-time, generous free tier |
| Storage | Cloudinary | Profile photos, portfolio images, 25 GB free |
| Deployment | Vercel | Free tier, edge network, zero-config CI/CD |
| Styling | Tailwind CSS v4 (CSS-first) + Radix UI primitives | Fast, consistent, mobile-first |
| Maps | Google Maps JS API | Service area polygons, place autocomplete |
| Email | Resend | Transactional email, 3k/month free |

---

## i18n Architecture (next-intl)

- **Locales:** `es` (default, no URL prefix via `localePrefix: 'always'` → `/es/...`), `en` → `/en/...`
- **Route structure:** `src/app/[locale]/` — all pages live here; root `/` redirects to `/es`
- **Message files:** `messages/es.json` and `messages/en.json`
- **Persistence:** `NEXT_LOCALE` cookie (next-intl sets automatically) + localStorage sync on client
- **Toggle:** Navbar ES | EN button using locale-aware `useRouter` from `@/i18n/navigation`

| Component type | Hook |
|----------------|------|
| Server (async RSC) | `getTranslations('ns')` from `next-intl/server` |
| Client | `useTranslations('ns')` from `next-intl` |

Category display names live in `messages/{locale}.json` under `categories.{id}` — never hardcoded in components.

---

## Architecture

```
contratacr/
├── src/
│   ├── app/
│   │   ├── [locale]/               # All user-facing pages
│   │   │   ├── layout.tsx          # NextIntlClientProvider + fonts + metadata
│   │   │   ├── page.tsx            # Landing page
│   │   │   ├── buscar/page.tsx     # Search (Supabase / mock fallback)
│   │   │   ├── profesionales/[slug]/page.tsx
│   │   │   ├── registro/{page→redirect, profesional}/page.tsx  # cliente→redirect, no standalone client reg
│   │   │   ├── onboarding/page.tsx   # OAuth role selection (Busco profesionales / Soy profesional)
│   │   │   └── login/page.tsx
│   │   ├── api/cedula/[id]/route.ts  # Cédula: Layer1=Ministerio Digital, Layer2=TSE scrape, Layer3=manual
│   │   ├── api/professionals/[slug]/route.ts  # Client-side proxy for professional detail
│   │   ├── layout.tsx              # Minimal root layout
│   │   └── page.tsx                # Redirect → /es
│   ├── i18n/
│   │   ├── routing.ts              # defineRouting
│   │   ├── request.ts              # getRequestConfig (message loader)
│   │   └── navigation.ts           # Locale-aware Link, useRouter, usePathname
│   ├── lib/
│   │   ├── supabase/client.ts      # Browser client
│   │   ├── supabase/server.ts      # Server client (cookies)
│   │   ├── queries/professionals.ts # Query functions + mock fallback
│   │   ├── data/cr-geography.ts    # Province, Canton types + arrays (English identifiers)
│   │   ├── data/mock-professionals.ts
│   │   └── utils.ts
│   ├── components/
│   │   ├── ui/                     # Button, Input, Badge, Card, Avatar, Select, StarRating
│   │   ├── layout/                 # Navbar (session-aware: avatar+dashboard when logged in)
│   │   ├── auth/                   # OtpVerification, ClientRegistrationModal (inline 5-step)
│   │   ├── booking/                # BookingButton (auth-gated→ClientRegistrationModal), BookingModal
│   │   ├── search/                 # HeroSearch, SearchFilters
│   │   └── professionals/          # ProfessionalCard, ReviewSection, SaveableCard
│   └── types/index.ts
├── messages/
│   ├── es.json
│   └── en.json
├── middleware.ts                   # next-intl i18n + Supabase session guard for /dashboard/*
└── supabase/migrations/001_initial_schema.sql
```

---

## Supabase Setup

1. Create project at supabase.com → copy URL + anon key
2. Copy `.env.example` → `.env.local` and fill values
3. Run `supabase/migrations/001_initial_schema.sql` in SQL editor
4. (Optional) Set `SUPABASE_SERVICE_ROLE_KEY` for server-side admin operations

**Required env vars:**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CR_DIGITAL_API_CLIENT_ID=       # api.digital.go.cr
CR_DIGITAL_API_CLIENT_SECRET=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
RESEND_API_KEY=
```

---

## API Integrations Status

| Integration | Status | Notes |
|-------------|--------|-------|
| Cédula / Registro Civil | Wired | Endpoint: api.digital.go.cr/v1/en/registry/{id}. Set CR_DIGITAL_API_CLIENT_ID + CR_DIGITAL_API_CLIENT_SECRET in .env.local |
| Supabase Auth | Active | signUp, signInWithPassword, OAuth (Google, Facebook) |
| Supabase DB | Active | profiles, professionals, reviews, bookings, notifications, saved_professionals, projects, proposals, blocked_dates |
| Google Maps | Pending | NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env — map UI not yet implemented |
| Cloudinary | Pending | Keys in .env — upload UI not yet implemented |
| Resend Email | Pending | RESEND_API_KEY in .env — contact form is console.log placeholder |

---

## Pages Built

| Route | Navbar | Footer | Notes |
|-------|--------|--------|-------|
| / | LandingNavbar | LandingFooter | Full landing page |
| /buscar | Navbar | Footer | Search + filters + pagination |
| /profesionales/[slug] | Navbar | LandingFooter | Profile — HuliHealth layout (sticky card + tabs) |
| /registro | Navbar | LandingFooter | Client/Pro selector |
| /registro/cliente | Navbar | LandingFooter | Full client registration: name, email, password, phone, province, canton. OAuth pre-fill. |
| /registro/profesional | Navbar | LandingFooter | 3-step pro wizard, WhatsApp smart field |
| /login | Navbar | LandingFooter | Email + OAuth |
| /olvide-contrasena | Navbar | LandingFooter | Password reset |
| /dashboard/cliente | Navbar | — | 5 tabs: Solicitudes (upcoming/past), Proyectos (with proposals), Guardados, Notificaciones, Mi perfil |
| /dashboard/profesional | Navbar | — | 6 tabs: Mi perfil, Servicios, Fotos, Disponibilidad+fechas bloqueadas, Solicitudes, Proyectos (proposals) |
| /publicar-proyecto | Navbar | — | Client project publishing form → creates project in DB |
| /como-funciona | LandingNavbar | LandingFooter | How it works |
| /categorias | LandingNavbar | LandingFooter | All service categories (grouped) |
| /ayuda | LandingNavbar | LandingFooter | Help center |
| /contacto | LandingNavbar | LandingFooter | Contact form |
| /not-found | Navbar | LandingFooter | 404 page |

---

## Complete Services Categories (12 groups, 90+ categories)

### Hogar y construcción
plomeria, electricidad, construccion, pintura, carpinteria, remodelacion, techos, pisos, impermeabilizacion, fumigacion, cerrajeria, aire_acondicionado, calentadores, ventanas_puertas, soldadura, gypsum

### Jardín y exterior
jardineria, poda_arboles, paisajismo, limpieza_piscinas, riego_automatizado, control_plagas

### Limpieza
limpieza, limpieza_oficinas, desinfeccion, lavado_alfombras, limpieza_post_construccion, lavado_vehiculos

### Tecnología
reparacion_computadoras, redes_internet, camaras_seguridad, domotica, desarrollo_web, diseno_grafico, diseno_apps, soporte_tecnico, impresion_3d, audio_video

### Servicios profesionales
contabilidad, legal, ingenieria_civil, arquitectura, topografia, consultoria, traduccion, recursos_humanos, marketing_digital, fotografia, produccion_video, bienes_raices

### Salud y bienestar
entrenamiento_personal, nutricion, masajes, psicologia, fisioterapia, enfermeria, cuidado_adultos, cuidado_infantil, veterinaria, peluqueria_canina

### Belleza y estética
peluqueria, maquillaje, unhas, pestanas, depilacion, estetica_facial, bronceado

### Educación
tutorias, idiomas, musica, matematicas, preparacion_universitaria, clases_manejo, clases_cocina

### Mudanzas y transporte
mudanzas, fletes, mensajeria, transporte_mascotas

### Eventos
fotografia_eventos, videografia, dj_sonido, catering, decoracion, animacion_infantil, bartending

### Seguridad
guardas_seguridad, alarmas, cctv, control_acceso

### Automotriz
mecanica, hojalateria, electricidad_automotriz, tapiceria, detailing, cambio_llantas

---

## Design Decisions

- Brand color: #009FD9 (was #2563EB until Sprint 3)
- Font: Inter (all weights 400-900)
- Logo: Text-only wordmark "ContrataCR" — TODO: AI design team
- No informal emojis — Lucide icons only
- Landing navbar: fixed + IntersectionObserver compact mode
- Inner pages navbar: sticky, same visual design as landing
- Both navbars: lg: breakpoint (1024px)
- Footer: LandingFooter on all pages (including login, registro, olvide-contrasena, not-found)
- Marquee: between hero and categories (repositioned Sprint 3)
- Password fields: live PasswordChecklist + show/hide toggle (Eye/EyeOff)
- WhatsApp field: +506 prefix badge + 8-digit validation + formatted preview
- Profile page: HuliHealth layout — sticky left card + right tabbed content

---

## Sprint 5 Changes (2026-06-02)

### Registration overhaul (`/registro/profesional`)
- Step 0: Manual name fields (Nombre, Primer apellido, Segundo apellido, Cédula) — no API lookup
  Cédula API code preserved as comments, ready to activate when api.digital.go.cr credentials arrive
- Step 1: 12 grouped service categories (SelectGroup/SelectLabel), mobile/fixed service type
  checkboxes, address field for fixed-location services, province + canton
- Step 2: Optional profile photo upload (Cloudinary), bio, years experience, hourly rate
- No role selection screen — email/password users always register as professionals here

### API routes
- `/api/register/professional` now **upserts** the profile (resilient if DB trigger fails),
  checks cedula duplicates, handles existing professional records, stores serviceType + address
- `/api/upload/photo` new route: validates file type/size, uploads to Cloudinary, returns URL

### Dashboard
- `ProfileEditor` expanded: name, photo, category, province/canton, address, bio, whatsapp, rates
  Updates both professionals + profiles tables. Photo upload via Cloudinary.
- `AvailabilityEditor` replaced with weekly schedule: 7-day toggle + time range pickers (HH:MM → HH:MM),
  multiple ranges per day ("+ Agregar horario"), migrates old morning/afternoon/evening format
- "Ver mi perfil público" button now opens `/es/profesionales/[slug]` (locale-prefixed)

### DB (migration 007 — run in Supabase SQL Editor)
```sql
-- File: supabase/migrations/007_unique_constraints_and_new_columns.sql
-- profiles.avatar_url (text)
-- professionals.service_type (text, default 'mobile')
-- professionals.address (text)
-- UNIQUE index on profiles.email (partial)
-- UNIQUE index on profiles.cedula (partial)
-- RLS UPDATE policy on profiles
```

### Duplicate error messages
- Email already registered → "Este correo ya está registrado. ¿Querés iniciar sesión?"
- Cédula already registered → "Esta cédula ya está registrada en ContrataCR."

## Sprint 5 Hotfixes (2026-06-03)

### Cloudinary
- PhotoGallery was POSTing to `/api/upload` (404) — fixed to `/api/upload/photo`
- Upload route now returns explicit 503 if `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` are not set

### RLS (migration 008 — run in Supabase SQL Editor)
```
supabase/migrations/008_professionals_rls_update.sql
```
Adds `FOR UPDATE` policy on `professionals` so client-side saves
(availability, profile edits, portfolio photos) are no longer silently discarded.

### Registration API
- API route now validates the caller via session cookies (`auth.getUser()`) before upserting profile.
  Falls back to `admin.getUserById(userId)` for new signups that have no session yet (pre-OTP).

### Profile page (`/profesionales/[slug]`)
- `notFound()` inside `useEffect` (client component) replaced with state-driven 404 UI
- Query uses LEFT joins instead of `!inner` — a missing `categories` table row no longer
  causes the entire query to fail silently and fall back to mock data
- `category_id` is now read as a plain text column; no `categories` table join needed
- Guard around `tCat(categoryId)` prevents broken translation key when id is null/empty

### Dashboard
- Removed `categories(*)` join — was rendering `[object Object]` / strange format under name
- Now uses `tCat(pro.category_id)` directly (i18n translation for the category ID)

## Sprint 5 Hotfix 2 (2026-06-03)

### Auth / Session
- Login page: `window.location.href` hard redirect after `signInWithPassword` — eliminates navbar flash of logged-out state on navigation
- `useAuth` hook now fetches `profiles.avatar_url` after every auth state change (covers Cloudinary-uploaded photos; OAuth users fall back to `user_metadata.avatar_url`)
- ProfileEditor: after photo upload, calls `supabase.auth.updateUser({ data: { avatar_url } })` so `onAuthStateChange` fires and the header avatar updates live without refresh
- **OAuth identity linking**: enable "Allow automatic identity linking" in Supabase Dashboard → Authentication → Settings — this allows users who created an email/password account to sign in with Google/Facebook using the same email

### LandingNavbar (home page header)
- Now auth-aware via `useAuth()` — shows avatar dropdown + "Mi panel" when logged in
- Mobile drawer also switches to "Mi panel" + "Cerrar sesión" when logged in
- No more logged-out flash when clicking the ContrataCR logo

### Identity verification form (ClientRegistrationModal)
- Removed "Información obtenida del Registro Civil de Costa Rica" banner
- Removed separate "verify" step (Registro Civil card branding)
- Flow is now 4 steps: email → name + cédula (manual) → password → OTP
- Cédula API lookup code preserved as comments for future activation

### Review modal
- Removed 20-character minimum on comment — only requires non-empty text

### Category search
- `searchProfessionals` removed `categories!inner` join — was silently dropping all professionals when the categories table has no row for a given `category_id`
- Now uses `category_id` text column directly; LEFT joins for profiles/provincias/cantones

## Sprint 6 Changes (2026-06-03)

### Professional Services feature
- New `services` JSONB column on `professionals` table (migration 009 — run in Supabase SQL Editor)
- Each service: `{ id, name, description?, price? }`
- New `ServicesEditor` dashboard component: add/edit/delete services inline
- New "Servicios" tab in pro dashboard sidebar
- Profile page now shows **actual services from DB** instead of hardcoded mock data
- Profile page `searchProfessionals` also searches inside `services::text` for smart matching

### Booking modal redesign
- Removed all cédula verification steps and "Información del Registro Civil" references entirely
- For **logged-in users**: skip directly to "what do you need?" form — name pre-filled from profile
- For **guests**: show service description first, then ask name + email on next step
- Removed "who is it for?" step (always assumed for the requester)
- Professional avatar in modal panel has no border/ring

### Dashboard auto-refresh
- Pro data re-fetched from Supabase whenever `activeTab` changes or `refreshKey` increments
- `ProfileEditor`, `PhotoGallery`, `AvailabilityEditor`, `ServicesEditor` all accept `onSaved` callback
- Switching between tabs always shows latest saved data — no manual page refresh needed

### Profile page
- Profile photo appears exactly once (left card only, no ring, clean `h-24 w-24`)
- WhatsApp button now uses proper WhatsApp SVG icon
- Location row hidden when both canton and province are empty (no trailing comma)
- Dropdown "Más opciones" closes on outside click (via `useRef` + `useEffect`)
- Services tab shows real data from DB; shows "no services yet" message if empty
- `disponibilidad` tab simplified to "contact via WhatsApp to confirm availability"

### Professional card (search results)
- Removed green online indicator dot
- Avatar enlarged to `h-20 w-20`, no ring, brand-colored fallback

### Header avatar (Navbar UserMenu)
- Slightly larger circular avatar (`h-8 w-8`), no chevron arrow
- Hover shows subtle brand-color ring
- Dropdown shows user's display name above email
- Dropdown is `rounded-2xl` with shadow-xl

### OAuth registration flow
- On registration page, authenticated (OAuth) users now see a "Identidad confirmada por Google / Facebook" banner showing their name and photo
- Profile photo preview pre-loaded from OAuth provider's avatar_url/picture
- Step 0 (identity/password) already skipped for OAuth users (unchanged)

### Duplicate email error
- When email already exists on signup, modal switches to login view and shows amber banner: "Ya existe una cuenta con este correo — ingresá tu contraseña"
- `duplicateEmailDetected` state tracks this distinct from generic errors

### DB (migration 009 — run in Supabase SQL Editor)
```sql
-- File: supabase/migrations/009_professional_services.sql
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::jsonb;
```

## Sprint 7 Changes (2026-06-03)

### Client Registration (`/registro/cliente`)
- Complete registration form: full name, email, password, phone (optional), province/canton (optional)
- OAuth pre-fill: authenticated users see identity confirmed banner with their name/photo
- Saves to profiles table via `/api/register/client` (upsert with role='client')
- Redirects to `/dashboard/cliente` on success

### Client Dashboard (complete overhaul — 5 tabs)
- **Solicitudes**: Upcoming (pending/confirmed/in_progress) + History (completed/cancelled/rescheduled)
  - WhatsApp button to contact professional directly
  - Cancel button for pending bookings
  - Leave review button for completed bookings
- **Proyectos**: Client's published projects with proposal management
  - Expand project → see all proposals with price, message, professional info
  - Accept/Decline proposals inline
  - WhatsApp contact button for accepted proposals
  - "Publicar proyecto" button links to /publicar-proyecto
- **Guardados**: Existing saved professionals (unchanged)
- **Notificaciones**: Full notification list with mark-all-read
  - Unread badge on tab icon
- **Mi perfil**: Edit full_name and phone, saved directly to profiles table

### Project Publishing (`/publicar-proyecto`)
- Form: category (optional), title, description, province/canton (optional), budget range (optional), timeline chips
- Creates record in `projects` table via POST `/api/projects`
- Success screen redirects to dashboard projects tab

### Professional Dashboard — new "Proyectos" tab
- Browse open projects from clients (filtered by professional's category)
- "Proyectos disponibles" sub-view: see project details, budget, location, timeline, proposal count
  - Expand to show inline proposal form (price + message)
  - Submit proposal via POST `/api/proposals`
- "Mis propuestas" sub-view: see status of all sent proposals (pending/accepted/declined)

### Booking Modal — Calendar step added
- New first step: interactive month calendar shows professional's available weekdays
  - Days where `availability[dayKey].enabled = true` are clickable (blue on hover)
  - Past days and blocked dates are grayed out/disabled
  - Month navigation (prev/next, bounded to today → +3 months)
  - Time slots appear below calendar when date selected (60-min slots from availability ranges)
- Remaining flow unchanged: details → contact (guests) → success
- Fetches `professionals.availability` and `blocked_dates` from Supabase on modal open
- Booking now sends `scheduled_date` + `scheduled_time` in addition to `preferredDateText`

### Availability Editor — Blocked Dates section added
- New `BlockedDatesEditor` component shown below weekly schedule in the Disponibilidad tab
- Add date picker → insert into `blocked_dates` table
- List of blocked dates with delete button per entry
- Public read access so booking calendar can query them

### Booking states expanded
- Added: `in_progress`, `rescheduled` to `bookings.status` enum
- Professional dashboard: "En progreso" button after confirming, then "Completar"
- Client dashboard shows all 6 states with appropriate icons and colors

### Notifications
- New types added to constraint: `booking_cancelled`, `booking_rescheduled`, `proposal_received`, `proposal_accepted`
- Triggers: booking confirmed → notify client; proposal created → notify project owner; proposal accepted → notify professional
- Client notifications tab shows real-time notification list from DB

### DB (migration 010 — run in Supabase SQL Editor)
```sql
-- File: supabase/migrations/010_client_experience.sql
-- 1. bookings: + scheduled_date, scheduled_time, client_phone, notes, cancellation_reason
--             status expanded to include 'in_progress', 'rescheduled'
-- 2. projects table: client_id, category_id, title, description, location, budget, timeline, status
-- 3. proposals table: project_id, professional_id, price, message, status (pending/accepted/declined)
-- 4. blocked_dates table: professional_id, blocked_date (unique per pro)
-- 5. notifications CHECK constraint expanded with new types
-- 6. Triggers: on_booking_confirmed, on_proposal_created, on_proposal_accepted
```

### API Routes added
- `POST /api/register/client` — upsert client profile
- `GET/POST /api/projects` — browse/create projects
- `GET/POST/PATCH /api/proposals` — manage proposals (mine=true for pro's own)
- `PATCH /api/bookings` — updated to support new statuses

### i18n
- `es.json` + `en.json`: new keys for `dashboard.client.*`, `dashboard.pro.proposals.*`, `projects.*`, `notifications.types.*`, updated `registration.client.*`, updated `dashboard.pro.bookings.status.*`

## Sprint 12 Fixes 5-6 (2026-06-04)

### Quick login/register modal — cédula now persisted (`ClientRegistrationModal`)
- Inline flow already collects nombre completo + cédula (step "cedula") and runs the
  same cédula-uniqueness check before signup as the full registration page.
- **Bug fixed**: `POST /api/register/client` destructured `cedula` from the body but
  never wrote it to the `profiles` upsert, so the value was silently dropped. The
  upsert now includes `cedula` (digits-only) when present.

### Professional registration "This page couldn't load" crash
- Root cause was **not** in the registration flow itself (already wrapped in try/catch
  with friendly error messages). It was the **redirect target**: the pro dashboard
  (`/dashboard/profesional`) declared a `useEffect` *after* an early `return` for the
  loading state. When `loading` flipped false the hook count changed between renders,
  triggering React's "Rendered more hooks than during the previous render" → the
  generic "This page couldn't load" screen right after `router.push("/dashboard/profesional")`.
- Fix: moved the "no professional record → redirect to /registro/profesional" effect
  above all early returns (now guarded by `!authLoading && !loading && !pro && user`)
  so hook order is stable.

## Sprint 13 Changes (2026-06-05)

### Availability — date-based scheduling + public/private (migration 014)
- New `availability_slots` table: explicit `(professional_id, slot_date, slot_time)` rows.
  Replaces the weekly toggle as the primary model. RLS: public read, owner write.
- New `professionals.availability_public` boolean (default true).
- `AvailabilityEditor` rewritten into a real scheduling tool:
  - Public/private toggle (pointer cursor) — saves `availability_public`.
  - Slot generator: pick a date + time range + interval (30 min / 1 h / 2 h / custom
    minutes) → bulk-creates slots; plus a single-time adder. Slots listed per day with
    per-slot and per-day removal.
- `BookingModal` reads explicit slots first (falls back to the legacy weekly
  `availability` JSON for pros who haven't migrated), hides already-booked slots, and
  only enables calendar days that have open slots.
- Profile page respects `availability_public`:
  - Public → "Solicitar servicio" booking button + bookable slots.
  - Private → "La disponibilidad de este profesional no es pública" with WhatsApp +
    Llamar (`tel:`) buttons (HuliHealth-style). The left-card CTA also switches to Llamar.

### Booking — slot consumption + notifications
- Booked `(date, time)` slots are removed from the calendar for other clients via a
  public taken-slots endpoint: `GET /api/bookings?takenFor=<professionalId>` (returns
  date+time only, no PII, normalized to HH:MM).
- New `src/lib/notifications.ts` → `notifyNewBooking()`: on a new booking, sends an
  in-app notification (type `booking_received`) + email (Resend) to the professional,
  and an optional WhatsApp message if `WHATSAPP_CLOUD_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`
  are configured (no-op otherwise). Best-effort — never breaks the booking.

### Reviews — verified clients only
- `POST /api/reviews` now requires a `completed` booking between the client and the
  professional, and blocks duplicate reviews (409).
- The open "Dejar una reseña" button was removed from public profiles — the only entry
  point is the client dashboard's completed-booking card.
- Completing a booking (`PATCH /api/bookings` → `completed`) inserts a `review_request`
  notification prompting the client to review.

### Report profile → support email
- `POST /api/report`: sends a confidential report to **soporte@contratacr.com** via
  Resend (not WhatsApp). New `ReportProfileModal` with reason picker + optional detail
  and a confirmation screen. Wired into the profile "Reportar perfil" menu item.

### Search map — pins + clustering
- `GoogleMapPanel` rebuilt: one pin per matching professional, clustered into numbered
  brand-blue bubbles (official `@googlemaps/markerclusterer` loaded via CDN). Clicking a
  pin opens a popup card (photo, name, category, rating, "Ver perfil").
- Fixed-location pros pin at their exact `lat`/`lng`; mobile pros pin at their province
  centroid with deterministic jitter. Split layout: list left, full-height sticky map
  right (lg+). Uses `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.

### Other fixes
- **Homepage header** (`LandingNavbar`): logged-in users now see the avatar dropdown
  (Mi panel / Cerrar sesión) instead of a plain "Salir" link — consistent with inner pages.
- **Booking modal** restyled to brand colors (navy→blue panel, was off-brand green);
  today's date is a subtle dot (was a distracting ring); "Continuar" enables on date select.
- **Client dashboard projects**: `GET /api/projects?role=client` now uses the admin
  client (scoped to the client's id) so newly created projects appear immediately.
- **OAuth fast sign-up** confirmed cédula-free: pro registration skips the identity step
  for Google/Facebook users and the onboarding flow has no cédula field.

### DB (migration 014 — run in Supabase SQL Editor)
```sql
-- File: supabase/migrations/014_availability_slots.sql
-- professionals.availability_public (boolean, default true)
-- availability_slots table (professional_id, slot_date, slot_time) + RLS + index
```

### i18n note
New UI strings follow the app's Spanish-first convention (default locale, same as the
surrounding booking/dashboard/profile components, which are hardcoded ES). The
search/profile pages that already use next-intl keys are unchanged. Wiring the new
Spanish strings through `messages/{es,en}.json` is a follow-up consistent with the rest
of the app's partial i18n.

## Sprint 14-16 (2026-06-06) — 20-fix batch

**Run these migrations in Supabase SQL Editor (in order):**
```
015_booking_notification_deliveries.sql   -- notification_deliveries table (delivery log)
016_professional_professions.sql          -- professionals.professions text[] (multi-category) + GIN index
017_professional_pricing.sql              -- professionals.pricing jsonb (pricing tiers)
018_notifications_delete_policy.sql        -- RLS DELETE policy so users can dismiss notifications
```

**Auth / registration**
- OAuth ("quick login") professional registration now collects **legal name + cédula** (required) in the service step — clients are NEVER asked for cédula at signup (collected later in the booking flow). `auth/callback` + onboarding no longer force clients to a cédula screen.
- Real-time duplicate detection: `GET /api/check-availability?email=|cédula=` + `useAvailabilityCheck` hook. Email/cédula show an inline error the moment they're typed — in pro registration AND the booking guest email field.
- `/registro` is now a real **role-selection** page (cliente / profesional). The login modal's "Registrate gratis" routes there.
- Sign-out everywhere does a hard `window.location.assign("/es")` (fixes the post-logout crash).

**Multi-category + pricing**
- `professionals.professions text[]` — a pro can have multiple categories. Primary = `professions[0]` = `category_id`. Editable in registration (extra categories) + ProfileEditor (chips). `/buscar` matches if ANY profession matches (`category_id.eq OR professions.cs`). Cards + profile show ALL category badges.
- `professionals.pricing jsonb` — tiers `{ id, type, amount?, label? }`, type ∈ por_hora|por_consulta|por_proyecto|por_dia|paquete|a_convenir. Editor in ProfileEditor; helpers in `src/lib/pricing.ts`. Displayed on cards (`primaryPricingLabel`) + profile (full list). Legacy `hourly_rate` kept in sync with a por_hora tier.

**/buscar (HuliHealth layout)**
- `SearchResultsLayout`: 55% results / 45% sticky map on desktop; mobile List/Map toggle.
- Cards (`professional-card.tsx`) are a **two-column HuliHealth replica**: left = avatar + name + verified check + multiple category badges + price-by-type (top-right) + star rating + province/cantón pills + bio. Right (≤280px, divided by a border; stacks below on mobile) = the **availability panel** (`professional-schedule.tsx`):
  - **Public**: a 3-day column carousel (`‹ Jue 18 Jun | Vie 19 Jun | Sáb 20 Jun ›`) with prev/next arrows paging ±3 days over a 21-day window; each column shows that day's time chips (open booking pre-selected) or "No disponible"; "Ver horario completo" button → full profile.
  - **Private**: red lock + "La disponibilidad de este profesional no es pública…" + green **"Contáctanos por Whatsapp"** + outline **"Contáctanos por llamada"** (`tel:`).
- Map **re-renders markers on every filter/category change** (clusterer `clearMarkers`/`addMarkers`) — no full reload; greedy wheel-zoom + fullscreen control.

**Availability**
- New pros start **private** (no schedules). Adding a schedule auto-sets `availability_public=true`. Turning private shows a confirm modal ("¿Estás seguro? Tus horarios serán eliminados.") → deletes all `availability_slots`, sets private, reloads.

**Notifications**
- Creating a project notifies every professional whose `professions` include the project category (`type=new_project`, links to the proposals tab). Bell shows unread badge; each notification has an individual **dismiss (X)** button (needs migration 018).

**Misc**
- `.ics` calendar export after booking ("Agregar a mi calendario") — `buildBookingIcs` in utils; includes pro name, service, date/time, WhatsApp link.
- Global emoji blocking on all inputs (`EmojiBlocker` mounted in `[locale]/layout`, beforeinput + paste).
- Footer on EVERY page (added to client dashboard + publicar-proyecto). Brands strip → text marquee of CR brands ("Impulsando proyectos en toda Costa Rica."). Footer socials = Facebook/Instagram/TikTok only + "Soporte ContrataCR" WhatsApp (+506 8745-4360, in `lib/constants.ts`, also on /soporte + /ayuda).
- OTP window shows only the logo + code input. Homepage province/cantón pills link to `/buscar?provincia=<id>[&canton=<id>]` and auto-populate filters. All WhatsApp actions use the official WhatsApp SVG (`components/icons/whatsapp-icon.tsx`).

**Known partial:** map pin → card highlight sync (task 8) not implemented; pin click opens the InfoWindow popup instead.

## Sprint 21 (2026-06-06) — shared identification (cédula) input

No migration needed (storage format unchanged: clean digits).

- New shared field **`CedulaInput`** (`src/components/ui/cedula-input.tsx`) + pure helpers (`src/lib/cedula.ts`: `cleanId`, `formatId`, `detectIdType`, `idTypeLabel`, `normalizeId`, `isValidId`). Reused in **professional registration** (email/pw + OAuth steps), the **client quick-register modal**, the **booking "completar perfil" step**, and **/completar-perfil**.
- **Live masking:** national cédula formats progressively as `X-XXXX-XXXX` (province · 4-digit tomo · 4-digit asiento); from 10 digits on (NITE/DIMEX) the digits show seamlessly. Digits-only — non-numerics are stripped. `inputMode="numeric"` + `pattern` for the mobile numeric keypad.
- **Storage:** always the **clean value (digits only, no hyphens)** e.g. `101230456` — required by TSE/Hacienda/SINPE. The mask produces fixed-width segments, so the clean digits are already the normalised (zero-padded) form; hyphens are display-only.
- **Auto-detection** by length/first digit (no manual selector): 9 digits + first 1–9 → cédula nacional; 10 → NITE; 11–12 → DIMEX. Detected type shows as a subtle badge in the label once enough digits are entered.
- **Validation = format/length only.** No local check digit — the CR cédula has **no published control digit**; real validation is a live TSE/Registro Civil padrón lookup (not wired here). Locally we only check length + allowed first digit (`isValidId`). Registration keeps its existing zod `validateCedulaFormat` (same rules) and real-time duplicate check.
- **Label** renamed "Número de cédula" → **"Número de identificación"** (covers cédula, DIMEX, NITE). The `required` prop drives the suffix: `true` → red `*`; `false` → "(opcional)".
- **Required-state choices:** professional registration = **required** (mandatory). Client side (quick-register modal, booking completar-perfil, /completar-perfil) is also kept **required** — those flows already collected and depend on the ID to confirm the account/booking, so loosening it would break downstream logic; the `required` prop is in place to switch any client usage to "(opcional)" later with no code change.

## Sprint 20 (2026-06-06) — unified workplaces, phone selector fix, location flow order

**Run this migration in Supabase SQL Editor:**
```
022_professional_workplaces.sql  -- professionals.workplaces jsonb [{id,name,address,lat,lng}] (supersedes affiliations)
```

- **Unified workplaces:** the separate "Instituciones o lugares donde trabajás" text list AND the single fixed-location map pin are merged into one **`workplaces jsonb`** list. New `WorkplacesPicker` (Google Places autocomplete + map): searching/selecting a place — or clicking the map — **adds** a workplace `{id,name,address,lat,lng}`; multiple allowed; each is removable. Used in registration (when fixed-location is chosen) and the profile editor. Each workplace is a **pin on /buscar** (map data flat-maps one pin per workplace) and a **workplace entry on the profile** ("Lugares de trabajo"). Searchable via `workplaces::text.ilike`. `lat/lng` synced to `workplaces[0]`.
- **PhoneInput fixed (task B):** flags now render as **images** (flagcdn) instead of emoji (which don't show in `<select>` on Windows); selecting a country now **sticks** (internal `code` state instead of deriving solely from the value — picking a country with an empty number no longer snaps back to CR); number input is empty by default (no placeholder digits); the country drives the **exact** national digit length (input capped + live "N/len" hint) and registration **blocks submit** unless `isPhoneComplete(value)` (national length === country length). Stored value is the full number with country code.
- **Registration location flow reordered (task C):** **province → cantón** (both **required**, manual dropdowns, no auto-fill) come **first**, then "¿Cómo ofrecés tus servicios?" (travel / fixed), then — only for fixed — the **optional** workplaces map for precise pins. Province/cantón drive search filtering; the pin is only for showing precise location. Removed the old pin→province/canton auto-fill (`matchProvinceCanton` no longer wired in; `LocationPicker` retired in favor of `WorkplacesPicker`).

## Sprint 19 (2026-06-06) — flexible professional identity

**Run this migration in Supabase SQL Editor:**
```
021_professional_affiliations.sql  -- professionals.affiliations text[] (business_name already from 019; account_type now unused)
```

- Replaced the binary **persona física / empresa** choice with a **flexible identity model**. Beyond the required personal name (`profiles.full_name`), everything is optional and editable later from profile settings:
  - `business_name` — a brand/business name they operate under.
  - `affiliations text[]` — one or more institutions/workplaces they're affiliated with (chips: type + Enter / "Agregar").
- **Registration** (`/registro/profesional`): account-type toggle removed; the service step now has an optional "Identidad" card (brand name + affiliations). Personal name still required (step-0 for email/pw, OAuth name field otherwise).
- **Profile editor**: account-type toggle removed; name field is always the personal name; added optional brand name + affiliations. Save retries without the optional columns if the DB isn't migrated yet.
- **Register API**: accepts `businessName` + `affiliations` (dropped `accountType`); `full_name` is always the personal name; graceful retry covers `affiliations` too.
- **Searchable + visible** in `/buscar`: query selects + returns `business_name`/`affiliations`; text search includes `business_name.ilike` and `affiliations.cs.{q}` (exact-tag). Cards show the brand under the name + affiliation tags; the public profile shows the brand under the name and an "Instituciones y lugares de trabajo" section.

## Sprint 18 (2026-06-06) — registration hardening batch

**Run these migrations in Supabase SQL Editor (if not already):**
```
019_pro_contact_languages_account.sql   -- (from sprint 17) account_type, business_name, languages, contact_preference
020_professionals_optional_location.sql -- provincia_id/canton_id/bio DROP NOT NULL (fixes account-creation failures)
```

- **Task 1 (account creation error):** likely root causes were (a) `provincia_id/canton_id` `NOT NULL` after province/canton became optional, and (b) `account_type/business_name` columns missing when migration 019 hadn't been applied. Fixes: migration 020 drops the NOT NULLs; the register API now **retries the professional insert/update without the 019 columns** if they don't exist, and returns **friendly Spanish error messages** (raw errors go to `console.error`).
- **Task 2:** the landing navbar **compact (scrolled) state** now says "Registrarse como profesional" (matched the full state).
- **Task 3:** reverse-geocode canton is more reliable — `extractAdmin` falls back through `administrative_area_level_2 → _3 → locality → postal_town`; `matchProvinceCanton` infers province from canton when needed; if canton can't be matched the field is left empty but enabled.
- **Task 4:** `PhoneInput` now has a full **country selector** (🇨🇷🇺🇸🇲🇽🇨🇴🇪🇸🇨🇳🇧🇷🇦🇷🇵🇦🇳🇮🇬🇹🇭🇳🇸🇻🇵🇪🇨🇱🇪🇨🇺🇾🇵🇾🇧🇴🇮🇹🇫🇷🇩🇪🇬🇧) with per-country digit limits; flag + dial code prefix is non-editable; CR formats `XXXX-XXXX`. **Stores the full number with country code** (CR → `506XXXXXXXX`; `formatWhatsApp` handles both new and legacy 8-digit values).
- **Task 5:** all three registration forms now have `defaultValues` (kills "Invalid input: expected string, received undefined"), validate **on blur**, **scroll to the first error** on failed submit, and required fields show a **red asterisk**. Field messages are human-readable ("El nombre es requerido", "El número de cédula es requerido", "El número de WhatsApp es requerido", …).
- **Task 6:** removed the single "Tarifa por hora (₡)" and global "Años de experiencia" from the registration profile step and the profile editor. **Experience is now per-service**: each service in `ServicesEditor` has its own "Años de experiencia en este servicio" (`ProService.years`), shown in the service list.

## Sprint 17 (2026-06-06) — 20-fix batch #2

**Run this migration in Supabase SQL Editor:**
```
019_pro_contact_languages_account.sql  -- professionals.contact_preference, languages text[], account_type, business_name
```

**Supabase Dashboard config (not code) — required for task 16 (Google OAuth shows Supabase URL):**
- Authentication → URL Configuration → **Site URL** = `https://contratacr.com`; add `https://contratacr.com/auth/callback` (and `https://contratacr.com/**`) to **Redirect URLs**.
- Google Cloud Console → OAuth client → **Authorized redirect URIs** keep the Supabase `…/auth/v1/callback` (Supabase needs it) but the app's Site URL above makes the final redirect land on contratacr.com instead of the Supabase domain.
- Task 1 also depends on **"Confirm email" being ENABLED** in Authentication → Providers → Email (otherwise signUp returns a session immediately and the OTP step is skipped).

**Auth / registration**
- **Client registration page now forces email OTP** (`/registro/cliente` → `OtpVerification` before success). OAuth users skip it (already verified). The quick-login modal already had OTP.
- New **`PhoneInput`** (`components/ui/phone-input.tsx`): 🇨🇷 +506 prefix + `XXXX-XXXX` formatting, country selector for international. Used in pro/client registration, profile editor, and booking. `formatWhatsApp` now leaves >8-digit (international) numbers untouched. Removed all "Ej: 8888-8888 / sin +506" hints.
- **Province & cantón optional** in pro registration (canton still enables only after province; both labelled "(opcional)"). Register API no longer requires bio/province/canton.
- **Service description (bio) requirement removed** from pro registration (bio field deleted; services are category + name + price).
- **Account type** toggle (Persona física / Empresa) in registration + profile editor; `business_name` stored and used as the display name for businesses.
- **Dropping a map pin reverse-geocodes** to auto-fill province + canton (`matchProvinceCanton` in cr-geography; editable). Province/cantón selects made controlled.

**Booking**
- **Phone captured during booking** (task 18): guests get a required WhatsApp field in the contact step; logged-in clients without a phone get a phone-only "complete" step ("Para coordinar tu cita…"), saved to their profile (never asked again). Removed the "Serás redirigido a WhatsApp…" note.

**Search cards**
- Location pills hidden entirely when there's no province/cantón (no empty pin).
- Cards respect **`contact_preference`**: `solo_whatsapp` → contact block only; `solo_citas` → booking only; `ambas` → booking + WhatsApp.
- Favorites button pinned **top-right, always visible** (doesn't overlap the date arrows). Max **3 time slots** per day. Always-visible **"Solicitar servicio"** CTA.
- Category badges filtered to the **active search category**.

**Professional profile / dashboard**
- **Languages** ("Idiomas que hablás") multi-select in the editor; shown as tags on the public profile.
- **Contact preference** setting ("¿Cómo querés que te contacten?").
- **Per-service pricing** (task 15): each service has a price type (por hora/proyecto/consulta/día/paquete/a convenir) + amount → displayed "₡15,000/hora".
- Profile photo (registration + dashboard) uses **explicit buttons** (Agregar / Cambiar / Eliminar) — no hover-to-change; format hint removed from the page.

**Service completion + reviews (task 7)**
- "Marcar como completado" appears for the pro once the booking date has passed (and for in_progress). Completing → `completed` → client `review_request` notification. Reviews remain gated on a completed booking (existing rule).

**Misc**
- Client project/booking cards: WhatsApp SVG + **"Contactar"** (was "WA"); "Aceptada" badge restyled.
- Footer: removed the support WhatsApp button and the `soporte@contratacr.com` email (socials only).

## Next Priorities

1. **Run migration 007** in Supabase SQL Editor (avatar_url + email/cedula unique indices)
2. **Run migration 008** in Supabase SQL Editor (professionals UPDATE RLS policy)
3. **Run migration 009** in Supabase SQL Editor (professionals.services JSONB column)
4. **Run migration 010** in Supabase SQL Editor (client experience — projects, proposals, blocked_dates, booking upgrades)
5. Set `CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET` in Vercel env vars
6. Enable "Allow automatic identity linking" in Supabase Auth settings (OAuth + email/password same email)
7. Add "Publicar proyecto" link to navbar for logged-in clients
8. Email notifications via Resend (booking confirmed, proposal received)
9. Google Maps integration on /buscar
10. Payment/subscription system (freemium model)

---

## Sprints 128–133 (search rework, header session access, i18n persistence, polish)

- **128** — Home category carousel: auto-scroll is desktop-only (`matchMedia` min-width:640px); mobile = single flat manual-swipe row (zigzag flattened). Empty search confirmed to browse all (`/buscar` with no params; filters are conditional). `src/components/landing/category-carousel.tsx`.
- **129** — Soporte "Nuevo ticket" button stacks full-width on mobile / inline desktop (`support-tickets.tsx`). Flattened Servicios add-services nesting: per-profession is a plain divided section (no box), services are a divided list (no surrounding border); only the add/edit form keeps an accent box (`services-editor.tsx`).
- **130** — Collapsed/scrolled header keeps session access for logged-in users (logo + bell + account menu). Extracted reusable `AccountMenu` (own open state + tap-away; `onOpen` refreshes unread count) used in BOTH the default and compact rows. Logged-out keeps collapse-to-search. `landing-navbar.tsx`.
- **131** — Search rework. New `src/lib/data/location-search.ts` (`searchLocations`/`resolveLocation` over provinces + cantones). Hero + navbar compact search: service & location are typeable autocompletes, **selecting fills the field**, search runs only on Buscar/Enter, keyboard nav + click-outside. Location now present on mobile (hero stacks). **Bugfix:** province filter was passing the province NAME where `/buscar` expects the ID — now passes `provincia=<id>` / `canton=<id>`. **Name-change auto-refresh:** profile-editor + cliente dashboard now mirror `full_name` into auth `user_metadata` (`auth.updateUser`) so the header/menu update immediately (useAuth subscribes to `onAuthStateChange`), no reload.
- **132** — `BackToTop` moved into the `[locale]` layout → app-wide; only appears after 400px scroll (long pages only). Removed the redundant home instance.
- **133** — i18n persistence: toggle writes `NEXT_LOCALE` cookie; middleware honors it for unprefixed URLs only (default stays ES; Accept-Language ignored). Toggle highlights active locale. Legal pages (`/terminos`, `/privacidad`) remain static Spanish — never auto-translated.

**i18n status:** infra + persistence + toggle COMPLETE. String extraction is partial (~18/128 files use `useTranslations`; message namespaces in `messages/{es,en}.json`). Remaining components (navbar mega-menu/drawer, most dashboard editors, support) still have hardcoded Spanish — extract incrementally, area-by-area, adding matching EN keys.

**Pending Supabase SQL to run:** migrations `043`, `044`, `045`, `046`.

---

## Admin: consolidated user profile + search (sections unchanged)

The section-based admin views (Verificación, Reportes, Aseguradoras, Categorías, Cuentas, Soporte) are UNCHANGED — they remain the daily operational tool (all pending tickets/verifications across users, with per-status filters/badges). ADDED a person-centric layer on top:

- **New "Usuarios" tab** (`/admin/usuarios`) — central search by **name / cédula / correo** (`AdminUserSearch`, debounced, dropdown → profile). Cédula shown masked.
- **Consolidated profile view** (`/admin/usuarios/[id]`, `AdminUserProfile`) — everything about one person: account (name, masked cédula, role client/pro, email/phone, registro date, status), verification status + quick links (open verification case `/admin/proveedores/[proId]`, public profile), support tickets, verification history + appeals, reports received, projects published (as client), requests/bookings sent. The `[id]` accepts a profile/user id OR a professional id (resolved to its owner), so it's reachable from anywhere a user appears.
- **API** `GET /api/admin/users` — `?q=` search (profiles by name/email/cédula, with isPro/verification/banned flags); `?id=` consolidated detail. Admin-only (`getApiAdmin`); cédula masked in responses (`maskId`).
- **Cross-links added:** Soporte (thread header "Ver perfil completo del usuario" via ticket.user_id + a user-search box atop the list), Reportes ("Ver perfil del usuario" via professional_id). Verificación already had a name/email/cédula filter (kept).
- AdminShell tab bar is now horizontally scrollable on mobile (7 tabs).

---

## Cuenta y seguridad — OAuth-aware email/password guidance

`AccountSecuritySection` (account-security.tsx) detects OAuth accounts (Google/Facebook) via `user.app_metadata.provider` / non-email `identities`. For those users, BOTH the email and password areas show a clean **ordered info block** (`OAuthGuide`) instead of fields that wouldn't work:
- **Email:** "Tu correo lo administra {provider}" + ordered steps (1: change the primary email in the provider, 2: log back in to ContrataCR) + link to manage the provider account.
- **Password:** "Tu acceso lo administra {provider}" — no ContrataCR password; manage sign-in security in the provider, with a link to the provider's security page.
- Provider is detected and named correctly (Google / Facebook); links in `PROVIDER_LINKS`.
Email/password (non-OAuth) accounts keep the full working flows (change email with confirmation; change password requiring current password + "¿Olvidaste tu contraseña?" reset link). Info-style (sky), responsive down to ~360px (`break-words`, wrapping steps).

---

## Stale-session crash fix (normal browser showed "Algo salió mal", incognito worked)

ROOT CAUSE: a saved-but-stale/invalid Supabase refresh token. `supabase.auth.getUser()` called unguarded during SSR (e.g. the public `/buscar` page, `getAdminUser`, middleware) would THROW an `AuthApiError` during the silent refresh instead of returning a null user; in a Server Component that thrown error bubbled to the `[locale]/error.tsx` boundary → generic error screen. Incognito has no token, so the refresh never happened.

GRACEFUL FIX:
- `src/lib/supabase/get-user.ts` → `safeGetUser(supabase)`: getUser that never throws (returns null on any auth error). Used in `/buscar` page SSR and `getAdminUser` (so `getApiAdmin`/`requireAdmin` are covered too).
- Middleware: now validates/refreshes the session for any request carrying an `sb-*-auth-token` cookie (incognito/anon skip it — fast path). getUser wrapped in try/catch; on a stale/invalid token it CLEARS the auth cookies (`maxAge:0`) so the browser becomes cleanly logged out and stops re-triggering on every visit, and redirects keep those cookie changes. Anonymous users on protected routes still redirect to login.
- `useAuth` (client): `getSession()` wrapped with `.catch` → on a corrupt/stale local session it `signOut()`s and treats the user as logged out instead of surfacing a broken UI.
- The generic error boundary stays for truly unexpected errors only.

---

## Custom branded error pages

Replaced the generic error screens with on-brand pages built on a shared `src/components/error/error-screen.tsx` (`ErrorScreen` + `errorPrimaryBtn`/`errorSecondaryBtn`). Self-contained (no navbar import) — brand logo (navy #1a2744 + blue #009FD9), restrained icon tile, calm friendly Spanish (no voseo), clear recovery actions; centered + responsive to ~360px.
- **Generic error** (`[locale]/error.tsx`): "Algo salió mal" with Reintentar + Ir al inicio; also detects offline (`navigator.onLine === false`) → "Sin conexión a internet" variant.
- **404** (`[locale]/not-found.tsx`): branded "Página no encontrada" (Error 404) with Volver al inicio + Buscar profesionales; i18n via `notFound` namespace (added `search`, `code` keys, es/en).
- **Root/500** (`app/global-error.tsx`): on-brand via inline styles (CSS may not have loaded), logo + Reintentar + Ir al inicio. Root `app/not-found.tsx` still redirects locale-less paths to `/es`.

---

## Security audit & hardening (migration 047 + app layer)

Findings and fixes from the security pass. **SQL was run as migration 047** (must be applied in Supabase).

### 1. RLS / sensitive data — CRITICAL fix
- **FOUND:** `profiles` had a `USING (true)` SELECT policy → the *public anon key* could read EVERY column of EVERY profile, including **cédula, email, phone** and moderation fields. Anyone could dump all cédulas.
- **FIXED (migration 047):** column-level privileges — `REVOKE SELECT ON profiles FROM anon, authenticated` then `GRANT SELECT (id, full_name, avatar_url, role, is_disabled, created_at, updated_at)`. Public professional cards + reviewer names (which embed `profiles(full_name, avatar_url)`) still work; cédula/email/phone are now readable only by the **owner** (via the new `get_my_profile()` SECURITY DEFINER RPC, returns only `auth.uid()`'s row) and the **service-role** (admin). Owner code migrated to `rpc("get_my_profile")` / safe-column embeds (pro dashboard, cliente dashboard, completar-perfil, registro pro, booking modal).
- **Verified OK:** support_tickets/support_ticket_messages/reports/notification_deliveries/padron are RLS-locked to the service-role; `/api/support` scopes every read to `user_id`; notifications/projects/proposals/saved_professionals/reviews/bookings are owner-scoped; the proposals route only returns a client's phone for an **accepted** proposal (service-role gated). Reference tables (categories/provincias/cantones) are intentionally public.
- **KNOWN FOLLOW-UP (documented, not fixed to avoid breaking the public listing):** `professionals` is `USING(true)` public-read and still exposes internal moderation columns (`banned_reason`, `verification_reason`, `id_document_note`). The public queries don't select them, but a crafted query could. Safe remediation = move these to a service-role-only `professional_moderation` table (the owner dashboard does `select("*")`, so a column-grant would need the owner select rewritten first).

### 2. Auth & access control — OK
- Admin is enforced server-side: every `/api/admin/*` route calls `getApiAdmin()` and admin pages call `requireAdmin()` (role confirmed via the service-role against `profiles.role`, never trusting the client). Protected `/dashboard/*` gated in middleware + page-level auth checks.

### 3. Input validation / injection
- No `dangerouslySetInnerHTML` anywhere — React auto-escapes UGC (names, bios, messages, reviews). Queries go through supabase-js/PostgREST (parameterized; no raw SQL concatenation).
- **FIXED:** `searchProfessionals` interpolated the raw search `q` into a PostgREST `.or()` filter → filter-injection / LIKE-wildcard abuse. Now sanitized (strip `, ( ) : * % _ \ " '`, cap 80 chars) before interpolation.

### 4. Sensitive data exposure
- **FIXED:** `/api/cedula/[id]` (returns a person's official padrón name) was unauthenticated → an open name-by-cédula enumeration API. Hardened with a per-IP **rate limit**. ⚠️ **NOTE (reversed 2026-06-12):** the original hardening here *also* added an authenticated-session gate, but that broke pre-auth professional registration (cédula lookup runs before the account exists) — see "URGENT FIX #2" above. The session gate was removed; anti-abuse for this endpoint is the rate limit ONLY. The padrón table itself stays private via the `padron_lookup` SECURITY DEFINER RPC. Do not re-add an auth gate.
- Admin user profile API masks cédula (`maskId`); full cédula only in the verification case file (admin/service-role). No secrets in the repo (`.env*` gitignored; only the public anon key is client-side; service-role key is server-only via `createAdminClient`).

### 5. Rate limiting
- Added an in-memory per-IP limiter (`src/lib/rate-limit.ts`) on abuse-prone endpoints: `/api/cedula` (20/min), `/api/contact` (5/min), `/api/support` reply (10/min), `/api/report-*` (10/min). NOTE: per-instance memory — best-effort on serverless; a shared store (Upstash/Redis) is the follow-up for global limits.

### 6. General hardening
- **Security headers** added in `next.config.ts` for all routes: HSTS (2y, preload), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors 'self'` (anti-clickjacking), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/payment/usb off, geolocation self).
- Auth cookies are managed by `@supabase/ssr` (httpOnly/secure/sameSite). HTTPS enforced by host + HSTS.
- **Dependencies:** bumped `nodemailer` 6→8 (fixes the high advisory). Remaining: 2 moderate, build-time only (postcss CSS-stringify XSS; a next advisory whose "fix" is an impossible downgrade) — low real-world risk, tracked.

### Manual actions required
- **Run migration `047_profiles_column_security.sql`** in Supabase (plus the still-pending `043`–`046`).
- Consider a shared-store rate limiter (Upstash) and the `professional_moderation` table split for defense-in-depth.

---

## RLS re-audit (focused: padron / profiles / professionals / admin / write policies) — migration 048

Second focused pass confirming the items below; new fixes in migration **048** (run it in Supabase).

1. **PADRON (cédulas+names) — SAFE.** `padron`/`padron_staging` have RLS ON with NO policies (deny-all to anon/authenticated). The ONLY code touching them is `src/lib/verification/identity-verifier.ts` and `/api/admin/providers/[id]` — both via `createAdminClient()` (service-role, server-only). The admin UI (`admin-case.tsx`) only renders the comparison object returned by the admin-guarded API; it never queries padron. No client-side padron access exists.

2. **PROFILES — fixed in 047 (must be applied).** Sensitive columns (`cedula`, `email`, `phone`, moderation flags) are no longer readable by anon/authenticated — column-level grants expose only `id, full_name, avatar_url, role, is_disabled, created_at, updated_at`; the owner reads their own sensitive fields via `get_my_profile()`. **PROFESSIONALS (new, 048):** internal moderation columns `banned_reason`/`verification_reason`/`id_document_note` are now revoked from the anon role (catalog-computed grant of all other columns); public cards/profiles are unaffected (they never select those). Public contact fields (`whatsapp`, `call_phone`) remain intentionally public. Residual: a logged-in (authenticated) user could still read those 3 via a crafted query (no UI exposes them) — full lockdown needs the owner dashboard's `select('*')` rewritten or a separate `professional_moderation` table (documented follow-up).

3. **ADMIN tables — SAFE.** `reports`, `support_tickets`, `support_ticket_messages`, `notification_deliveries` have RLS ON with no user policy → service-role only. Admin reads them through admin-guarded API routes (`getApiAdmin`). Users read their OWN tickets only via `/api/support` (every query scoped to `user_id`); they cannot read others' tickets/messages/reports.

4. **Over-permissive write policy — FIXED (048).** Legacy `support_messages` (migration 012, unused) had `"Anyone can insert support messages" WITH CHECK (true)` = world-writable (anon spam/storage abuse). Dropped it (RLS stays on → service-role only; owner-scoped SELECT kept). All other write policies are owner-scoped (`auth.uid() = client_id/id/profile_id/suggested_by`). Public-read tables (categories/provincias/cantones/insurers/blocked_dates/availability_slots/reviews) expose only non-sensitive data.

5. **Service-role key — SAFE.** `createAdminClient()` uses `SUPABASE_SERVICE_ROLE_KEY` (NOT `NEXT_PUBLIC_*`); no client component imports it; only `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` reach the browser (anon key is public by design).

**Manual action:** apply migrations **047 and 048** in Supabase (plus pending `043`–`046`). Until 047 runs, the profiles cédula exposure is still live.

---

## i18n completion — category/DB taxonomy + home sections + language switcher

The EN gaps were mostly DB-sourced taxonomy + un-wired home sections. Fixed:

- **Category taxonomy (the big one):** `getCategoryLabel(id, locale)` + `getCategoryGroupLabel(groupId, locale)` are now locale-aware via `CATEGORY_LABELS_EN` (all ~95 categories) + `CATEGORY_GROUP_LABELS_EN` (12 groups) in `src/lib/data/categories.ts`. Spanish (in `CATEGORY_GROUPS`) stays the source of truth; EN is an added map. Threaded `locale` (useLocale/getLocale) through EVERY category render: home carousel, navbar megamenu (desktop + mobile drawer) + navbar search suggestions + CategoryAutocomplete, professional profile (`/profesionales/[slug]`), the category picker (`category-search.tsx`), pro dashboards (services/profile/availability/booking/photo editors), pro registration, and the public `/api/search/suggestions` (hero autocomplete reads `?locale=`). `/buscar` + professional cards already used the complete `categories` next-intl namespace.
- **Home sections (were hardcoded ES):** carousel title/subtitle/CTA → `landing.carousel`; "Así funciona ContrataCR" → `landing.howItWorks` (eyebrow, heading, 4 points, pro pitch); "Encuentra profesionales en tu zona" → `landing.zones` (incl. ICU-plural coverage counts, geolocation, disclaimer); global **footer** → `footer` namespace (made it a client component so it works in both server + client pages).
- **Legal content** (`/terminos`, `/privacidad`) intentionally NOT machine-translated — static Spanish, flagged for human review.
- **Language switcher** redesigned for recognizability — see design guide §14.

**Pattern for taxonomy:** any fixed DB/taxonomy list (categories, groups; future: service names) must expose per-language labels via an `_EN` map + a locale-aware getter, NOT a hardcoded label, so it translates everywhere it renders.

**Still ES-only (remaining, larger follow-up):** general form chrome/labels/buttons inside the pro dashboards, registration flows, booking modal, and some standalone pages (ayuda/como-funciona/etc.) — these have many strings beyond the taxonomy and are a separate incremental sweep. The taxonomy + all home/nav/footer surfaces (the reported gaps) are done.

---

## Realtime subscription ordering fix (app-wide crash)

SYMPTOM: "Error: cannot add `postgres_changes` callbacks for realtime:notifications after `subscribe()`" → error boundary "Algo salió mal", breaking login/registration/page loads.

ROOT CAUSE: `NotificationBell` (`src/components/notifications/notification-bell.tsx`) used a STATIC channel topic `supabase.channel("notifications")`. The navbar mounts the bell in BOTH header rows (default + compact), and dashboards mount one too — so multiple instances requested the same topic. Supabase returns the CACHED channel by topic name, so the 2nd instance's `.on('postgres_changes', …)` ran on an already-subscribed channel and threw. (The `.on()`→`.subscribe()` order within a single instance was already correct.)

FIX: each instance now uses a UNIQUE channel name `notifications-${user.id}-${instanceId}` (instanceId = a per-mount `useRef` random). Handlers are registered before `.subscribe()` (once), and `removeChannel` cleans up on unmount/user-change. This is the ONLY Realtime channel in the app (verified). RULE: never share a static Realtime channel topic across components that may mount more than once — make the topic unique per instance, and always register all `.on(...)` before `.subscribe()`.

---

## Certifications copy — removed unverified-authenticity line

The public profile Certificaciones tab description previously read "Cursos, títulos y certificados que indica el profesional. ContrataCR aún no verifica su autenticidad." The 2nd sentence was removed (reduced trust / could be misread as the pro opting out of verification). Now just: "Cursos, títulos y certificados que indica el profesional." (`profesionales/[slug]` page; string is hardcoded — no separate EN key existed).

---

## Extended EN coverage — standalone pages (this pass)

Translated these previously Spanish-hardcoded pages to full ES/EN (new message namespaces, complete EN, mobile layout verified — English strings fit; titles use a `<br className="hidden sm:block">` so they wrap cleanly on mobile):
- **/categorias** — `categoriesPage` namespace: hero eyebrow/title/subtitle, CTA block + buttons, and `CategorySearchBox` (placeholder, no-results, suggestion labels now locale-aware via getCategoryLabel/getCategoryGroupLabel).
- **/como-funciona** — `comoFunciona`: hero, two paths + steps, pros section, "how projects work", FAQ (5), final CTA.
- **/ayuda** — `ayuda`: hero, 6 help cards, 8-item FAQ, contact block.
- **/atraer-clientes** — `atraerClientes`: hero, 8 tips (title/body/highlight), dos/donts lists (t.raw arrays), market-reality (4 blocks), CTA.
- **/soporte** — `soporte`: header, success states (user + guest, with email var), form labels/placeholders/subjects, attachments, validation errors, WhatsApp line.
- **Status filter tabs** (`StatusFilterTabs`) — now translate via `statusTabs` namespace (`id` doubles as the i18n key); reused in BOTH dashboards' Solicitudes/Proyectos filters.

**STILL Spanish (remaining major sweep, NOT done this pass):** the CLIENT and PROFESSIONAL dashboards and all their sections (Mi perfil, Servicios, Casos de éxito, Disponibilidad, Solicitudes, Proyectos, Verificación, Notificaciones, Soporte, Cuenta y seguridad, Contratar servicios, the "ver cómo me ven los clientes" preview) are 0% i18n (~2×400-line pages + ~15 child components, hundreds of strings) — a large dedicated effort. `/buscar` is mostly translated but a few hardcoded strings remain in `search-filters.tsx` ("Limpiar búsqueda", "Cercanía"), `professional-card.tsx` ("Atiende en todo el país"), and `buscar/page.tsx` ("Disponibilidad inmediata"). Legal pages (`/terminos`, `/privacidad`) intentionally untranslated (flagged for human review).

---

## Full app i18n sweep — dashboards + auth/flow pages now bilingual (COMPLETES the above)

The "STILL Spanish" sweep noted above is now DONE. Everything below was translated to full ES/EN (paired namespaces in `messages/es.json` + `en.json`, each component wired with `useTranslations`/`getTranslations`; `tsc` + `next build` green per commit; pushed to main).

- **Professional dashboard** (`dashboard/profesional` + children): shell/header, `profile-completion`, `profile-editor`, `services-editor`, `availability-editor`, `photo-gallery`, `booking-requests`, `proposals-tab`, `verification-panel`, `unsaved-guard`. Namespaces: `proPanel`, `profileEditor`, `servicesEditor`, `availabilityEditor`, `photoGallery`, `bookingRequests`, `proposalsTab`, `verificationPanel`, `unsavedGuard`.
- **Client dashboard** (`dashboard/cliente` + `client-activity`): `clientPage`, `clientActivity`, `savedPros` (saved-professionals-tab).
- **Account / support**: `account-security` (`accountSecurity`), `close-account-section` (`closeAccount`), `support-tickets` (`supportTickets`), `notifications-list` (extended `notifications` with seeAll/markRead/delete/deleteAll/deleteAllConfirm/noneList).
- **Auth/flow pages**: `registro` (role choice — `registerChoice`), `registro/cliente` (`registerClient`), `onboarding` (`onboarding`, reuses `registerChoice` cards), `completar-perfil` (`completeProfile`), `olvide-contrasena` (`forgotPassword`), `reset-password` (`resetPassword`), `publicar-proyecto` (`publicarProyecto`), `notificaciones` (`notifications`), `proveedores-autorizados` (`proveedoresPage` — converted to server component with `generateMetadata` + `getTranslations`, `t.rich` for bold), `contacto` (`contacto` — hero, react-hook-form validation messages, ticket-success user/guest states, support/hours/location cards).

PATTERNS used throughout: module-level constant label maps (STATUS_LABEL, TIMELINES, FILTERS) moved INSIDE components and converted to `t()` helpers (they need locale context); list-loop variables renamed off `t` to avoid shadowing the translation fn (e.g. `tk` in support-tickets); locale-aware dates via `locale === "en" ? "en-US" : "es-CR"`; taxonomy via `getCategoryLabel(id, locale)`.

**Minor items still Spanish (intentional / low-value, NOT blocking):** a few zod schema validation messages defined at module scope (no locale context); `notificationContextLabel` tags ("Como profesional/cliente"); the `/buscar` strings noted above. Legal pages (`/terminos`, `/privacidad`) and the entire `admin/*` panel remain Spanish by design.

---

## Routing: middleware → `src/proxy.ts` (Next 16) + universal locale redirect + legacy-route cleanup

**Next 16 renamed the `middleware` file convention to `proxy`** (deprecated `middleware`; see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). For a **`src/` project the file must be `src/proxy.ts`** (same level as `src/app`), exporting a function named `proxy` (or default). **The old `middleware.ts` at the repo ROOT silently STOPPED running when the app moved to Next 16** — the entire edge layer was dead: no auth gate, no onboarding redirect, no locale handling. Symptom that proved it: an unauthenticated `GET /es/dashboard/profesional` returned **200** (rendered) instead of redirecting to `/login`. (How it was hidden: the homepage still worked via `src/app/page.tsx`'s `redirect("/es")`, and the 6 legacy routes still worked via their own redirect stubs — so nothing looked obviously broken.)

**Fix (commit bc442c2):**
- Moved the proxy to **`src/proxy.ts`** (function `middleware` → `proxy`, import `./i18n/routing`). The production build now prints **`ƒ Proxy (Middleware)`** — confirmation it's active. **If the build does NOT list `Proxy (Middleware)`, the proxy isn't wired** (wrong filename/location) — that's the canary.
- The proxy now makes **EVERY unprefixed path 307-redirect to its locale-prefixed canonical URL** (`NEXT_LOCALE` cookie → `/en`, else `/es`; params preserved). Previously next-intl's `handleI18n` was NOT redirecting unprefixed paths here, so only the 6 routes that had hand-written redirect stubs worked and **every other non-localized URL 404'd** (`/como-funciona`, `/ayuda`, `/contacto`, `/soporte`, …). 307 (temporary) is deliberate — the target locale depends on the cookie; SEO canonicalization is via page metadata, not the redirect status.
- **Removed the 6 now-redundant legacy redirect-stub pages** (`src/app/buscar`, `/login`, `/registro`, `/registro/cliente`, `/registro/profesional`, `/profesionales/[slug]`). They were NOT duplicate designs (a prior pass had already reduced them to 2-line `redirect()` stubs) — the proxy supersedes them. **Kept** root `src/app/page.tsx` (homepage `/`→`/es` belt-and-suspenders), root `src/app/layout.tsx` (required for root `not-found`/`global-error`), and `src/app/auth/callback` (excluded from the proxy matcher so the OAuth PKCE code survives).
- **The `[locale]` routes are the single source of truth.** Never re-add non-localized page files at the app root — the proxy redirects everything. Internal navigation already uses `@/i18n/navigation` `Link` (auto-prefixed), so only external/bookmarked links rely on the proxy redirect.

**Verified** (dev server, all green): every unprefixed path → 307 `/es/<same path>` (or `/en/…` with the EN cookie); localized targets render 200 (es + en); auth gate restored (`/es/dashboard/*` → `/es/login` when logged out); no redirect loops on already-prefixed paths. `tsc` + `next build` pass.

**Gotcha for future routing work:** Next 16 + Turbopack dev does **not** hot-reload proxy edits, and clearing `.next` is not always enough — fully **restart `next dev`** after touching `src/proxy.ts`, and confirm behavior with `curl -s -o /dev/null -w "%{http_code} %{redirect_url}"` against unprefixed + prefixed paths.

---

## App-wide design-quality initiative — Pass 1: foundation (review outcome)

A multi-pass design-quality sweep is underway (foundation → public pages → auth/registration → pro dashboard → client dashboard → admin). **Pass 1 (foundation)** verified the shared layer rather than rebuilding it:
- **Finding: the unified design system + shared components were already in place** from prior passes. `contratacr-design-guide.md` (now anchored at the top as the authoritative standard) fully documents tokens, primitives, and patterns; the shared primitives (`Button`, `Input`/`Select`, `Badge`, `Card`, `Avatar`), the single app-wide `LandingNavbar` + `LandingFooter`, the mobile drawer, language toggle, account menu, modals (`LoginModal`/`SelfActionModal`), and `NotificationBell` already conform. **No toast library exists by design** — feedback is inline (error/success blocks + the autosave status line).
- **Home (`/`) review (protect-only):** strong and conformant — Hero (rotating headline + search) · `ProsSection` carousel · `WhyContratacr` · `FindByZone` · footer. No redesign; left intact.
- **Changes made:** added the authoritative "unified design system" anchor to the top of the design guide (home = quality bar; canonical kit; inline feedback); fixed a stale `middleware`→`src/proxy.ts` comment in `landing-navbar`.
- **Conclusion driving the next passes:** the real inconsistency is at the **page level** (public pages, auth, dashboards, admin), not the shared kit. Each subsequent pass aligns those screens to the already-established standard — reuse the primitives, kill nested bordered boxes, keep one primary action per screen.

**Pass 3 (public pages) — in progress.** Like the shared kit, the public pages are structurally conformant; the recurring real defect is **EN Spanish-leaks** (hardcoded strings the i18n sweep missed), not layout. Done so far:
- **`/buscar`** (the priority screen) — confirmed structurally on-spec (full-width `max-w-[1920px]` 3-column shell, numbered cards ↔ map pins, empty state, pagination). **Now fully EN-clean across the whole cluster:**
  - Page: pagination (`search.pagination.*`, `pageOf` via `t.rich`); voseo fix (`search.noResults.desc` "expandí"→"amplía").
  - `SearchFilters`: placeholder, "Cercanía", "Aseguradora", "Cualquiera", near-me button + geo errors, "Solo identidad verificada", clear-search/remove-insurer aria-labels → `search.filters.*` / `search.sort.cercania`.
  - `SearchResultsLayout` (shell had NO translator): "Filtros"/"Lista"/"Mapa"/"Cerrar"/"Ver resultados" → `search.list/map/viewResults/close` (Filtros reuses `filters.title`).
  - `ProfessionalCard` coverage labels → `card.coverageCountry/coverageYourLocation/coverageAreas` (helper takes the `card` translator).
  - `ProfessionalSchedule` (had NO translator): day labels, "Próximos horarios", empty state, day-nav aria-labels, "Ver horario completo" ×2, "Solicitar servicio", location aria-label + Videoconsulta/A domicilio/Ubicación labels → new `schedule.*` namespace; **day-column dates now locale-aware via `Intl` (es-CR/en-US)** instead of the Spanish `DAY_SHORT`/`MONTH_SHORT` arrays. "General" stays an internal sentinel.
  - `SelfActionModal`: `SELF_MSG` values became i18n **keys** (resolved inside the modal via `selfAction.messages.<key>`) so all 5 call sites are untouched; title + OK button translated. `save-button` aria-labels → `card.save/unsave`.
- **`ProfessionalSchedule` is reused on the public profile too**, so this also benefits `/profesionales/[slug]`.
- **STILL TODO in Pass 3:** `/profesionales/[slug]` page itself (large — tabs Servicios/Disponibilidad/Casos de éxito/Certificaciones/Reseñas/Sobre mí, review-category labels Precio/Puntualidad/Calidad/Comunicación, "Ver cómo me ven los clientes"/"Volver a mi panel", etc. — still heavily hardcoded Spanish); and the info pages `/categorias`, `/como-funciona`, `/ayuda`, `/atraer-clientes`, `/soporte`, plus legal-page styling. (`/contacto` + `/proveedores-autorizados` were already translated in the earlier i18n sweep.)
- **Method that works:** `grep -noE '"[A-ZÁÉÍÓÚÑ]...' ` the component tree for bare Spanish literals + voseo before assuming a "translated" page is done — leaks hide in aria-labels, select placeholders, geo/error strings, and module-level helper functions/const maps. **Caveat:** that grep misses (a) **lowercase** quoted strings (e.g. `timeAgo` → "hace N días") and (b) JSX text containing `{interpolation}` (the `{` breaks the `[^<>{}]*` class) — check relative-time/format helpers and interpolated headings manually.

**Pass 3 (public pages) — COMPLETE.** Beyond `/buscar`:
- **`/profesionales/[slug]`** fully translated (~50 strings: not-found, WhatsApp prefill, tabs, preview bar, verification badges, all 6 tab bodies, sub-ratings, Sobre-mí cards) + voseo fix ("Contáctalo") + a hardcoded `/es/` link swapped for the i18n `Link`. Child components done: **ReviewSection** (Intl.RelativeTimeFormat for timestamps), **ProfileGallery** (`gallery` ns), **ReportProfileModal** (`report` ns — reason sent to admin stays canonical Spanish while UI shows the translated label).
- **CategorySearch** (`ui/category-search`, reused in /buscar + registration + profile editor) → new `categorySearch` ns (placeholders, no-results, "Otro servicio", the whole suggestion flow).
- **Info pages** (`/categorias`, `/como-funciona`, `/ayuda`, `/atraer-clientes`, `/soporte`, `/contacto`, `/proveedores-autorizados`) were already fully translated (verified clean). **Legal pages** (`/terminos`, `/privacidad`) already match the guide's legal-document spec (draft banner, TOC, scroll-mt sections) — Spanish-only by rule, no change.
- **Deferred to Pass 4 (auth):** `client-registration-modal` (612 lines, a mini registration form triggered from profile/buscar) — translate it with the registration flow.

New i18n namespaces added this pass: `search.pagination`, extended `search.filters`/`search.sort`/`search.list/map/...`, `card.coverage*`/`card.save/unsave`, `schedule`, `selfAction`, `categorySearch`, `gallery`, `report`, and a large extension of `profile`.

**Pass 4 (auth + registration) — IN PROGRESS.** Done so far:
- **`/login`**: zod messages moved into the component (useMemo) so they localize; OAuth-lockout error + OAuth button labels → `auth.login.*`; post-login redirect uses the active locale (was hardcoded `/es/`).
- **`/reset-password`**: same zod-into-component pattern, reusing the existing `resetPassword.rule*` labels + new `passwordsDontMatch`.
- **`/registro/cliente`**: wired the already-existing `registerClient.errAlreadyRegistered` (was hardcoded). **`/completar-perfil`**: avatar alt → key.
- **Identity step** (shared across registration + booking + profile editor): new `identity` namespace wires `CedulaInput`, `IdentityInfoBlock`, `IdentityField` (label/hint/optional, "Identidad confirmada", Cédula/Nacimiento, "¿No es tu información?", "Buscando en el padrón…", the two manual-name notices via t.rich, full-name field).
- **PATTERN for zod + i18n:** module-level `z.object(...)` with hardcoded messages → move the schema **inside** the component in a `useMemo([t])` and use `t(...)` for each message; type the form as a plain `type FormData = {...}` (drop `z.infer`).
- **STILL TODO in Pass 4:**
  - **`/registro/profesional`** (now ~1096 lines) — the centerpiece. **DONE so far:** removed the dead duplicate `CATEGORY_GROUPS_STUB` (~90 lines; categories.ts is now the only taxonomy); localized all 3 step zod schemas (moved inside the component via `useMemo`, reusing `resetPassword.*` for password rules + new `registration.pro.val*` keys) and the `PasswordChecklist`. **STILL TODO on this page:** ~80 hardcoded UI strings — the submit-handler error messages (lines ~400-630: "Este correo ya está registrado", "Esta cédula ya está registrada", "Selecciona al menos un tipo de servicio", "Agrega al menos un lugar de trabajo", etc.), the step headings/labels, the "No tengo identificación costarricense" exception block, the work-mode options ("Me desplazo donde el cliente" / "Trabajo desde un lugar fijo"), the multi-profession picker ("Agregar profesión", "Busca tu profesión", "Quitar", "Agregar otra profesión"), the photo-upload strings, and the "Identidad ya registrada" / OAuth-confirmed blocks. The `registration.pro` namespace already has ~48 label keys — check which the JSX still hardcodes vs which just need wiring.
  - ~~`client-registration-modal`~~ **DONE** — new `clientRegModal` namespace (login + register views, OTP step, all field labels/titles/subtitles, buttons, toggle; password rules reuse `resetPassword.*`).
  - **`languages-input`** ("Quitar", language placeholder, "Agregar otro…") and **`aseguradoras-input`** ("¿No ves tu aseguradora?", "No trabajo con seguros" [stray English "I don't work with insurers"], "Quitar", suggestion flow) — these are profile-EDITOR inputs (dashboard), so fold them into Pass 5. `phone-input`'s ~23 literals are mostly **country names** (data, not UI) — verify before translating. `price-input` is clean.

**Pass 4 (auth + registration) — COMPLETE.** `registro/profesional` (the centerpiece) fully translated incl. the dead-taxonomy removal + validation-into-component refactor; `login`, `reset-password`, `registro/cliente`, `completar-perfil`, the shared identity-step components, and `client-registration-modal` all bilingual. New namespaces: `registration.pro.val*`/error/UI keys, `identity`, `clientRegModal`. **Zod-i18n pattern locked in:** build the schema inside the component via `useMemo([t])`, reuse `resetPassword.rule*`/`passwordsDontMatch`, type the form as a plain `type` (no `z.infer`).

**Pass 6 (client dashboard + publicar-proyecto + notificaciones) — COMPLETE.** Already redesigned/translated in earlier sweeps; closed the last leaks: `dashboard/cliente` (photo-upload error alerts, the "Cliente" display-name fallback, header avatar alt → `clientPage.photoError/clientFallback/photoAlt`) and `notification-bell` (dismiss aria/title → `notifications.delete`). `publicar-proyecto`'s TIMELINES correctly separate the canonical Spanish backend `value` from the translated `label` — left as-is. `/notificaciones` + `saved-professionals-tab` verified clean.

**Pass 5 (professional dashboard) — COMPLETE.** Design was already done in earlier sessions (ProfileCompletion at top + context-aware math, de-nested Disponibilidad/Servicios, unified sidebar). This pass closed the remaining i18n leaks: shared editor inputs `LanguagesInput`/`AseguradorasInput` (new `inputs` namespace — placeholders, remove, the insurer-suggestion flow, "No trabajo con seguros"); `blocked-dates-editor` (had no translator → `availabilityEditor.blocked*`, locale-aware dates); `profile-editor` (avatar alt, remove-profession aria); `services-editor` (remove-profession aria + edit/delete titles → `servicesEditor.removeProfession/edit/delete`). Verified the rest of the dashboard tree (verification-panel, photo-gallery, booking-requests, proposals-tab, status-filter-tabs, unsaved-guard, client-activity, profile-completion) — remaining hits are comments or internal Error fallbacks, not UI. **Known low-priority data-translation gap:** `languageLabel()` / insurer labels render their Spanish names in EN (taxonomy data, like categories had — would need `_EN` maps); deferred.

**Pass 7 (admin panel) — COMPLETE.** Spanish-only by rule, so this was a pure design-consistency pass (no i18n). The panel was already well-built; the audit found three cross-section inconsistencies and fixed them: **(1) loading spinners** were split between a hand-rolled `border-2 … border-t-transparent` div (some navy `#0f172a`, one brand-blue) and lucide's `Loader2` — unified ALL on `<Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" />`. **(2) segment/filter tabs** used brand-blue `#009FD9` in Verificación/Reportes but navy `#0f172a` in Soporte/Categorías/Aseguradoras — unified on the bordered brand-blue pattern (`active: bg/border-[#009FD9] text-white`; `inactive: bg-white border-[#e5e7eb] hover:border-[#009FD9]`), incl. the in-tab count badge in Soporte (`bg-white text-[#009FD9]` when active). **(3) section headers** — Verificación/Reportes/Usuarios had an icon + `text-xl font-bold` title but Soporte/Categorías/Aseguradoras/Cuentas didn't; added the same header (icon `text-[#009FD9]`, `mb-5`) to all four so every view has a uniform top-of-page anchor; Cuentas now renders its header (with live count) in every state, not only when populated. **Resulting admin color system (documented in design-guide §11):** brand-blue `#009FD9` = tabs/spinners/links/focus rings/section-icon accents; navy `#0f172a` = chrome (header) + neutral-primary action buttons (Responder, Abrir caso) + admin chat bubbles; green `#16a34a` = approve/verify; red `#dc2626` = reject/danger; verification pills via the shared `verificationPillClasses`, status pills on the amber/blue/emerald/gray scale. All functionality, permissions, audit trail, and the horizontally-scrolling mobile tab bar left intact.

**ALL 7 design-quality passes COMPLETE.** The user-facing app is fully ES/EN bilingual end-to-end; the admin panel is internally consistent (Spanish-only).

**Post-pass cleanup — bilingual data labels.** Closed the last data-translation gap: **languages** now carry a `labelEn` on every `LANGUAGES` entry and resolve via `languageLabel(id, locale)` (mirrors `getCategoryLabel`), so spoken-language chips read "English, French" in EN; the profile-editor `LanguagesInput` autocomplete also matches the English name and renders in the active locale. **Insurers are intentionally NOT translated** — they're brand/proper nouns (INS, MAPFRE, Sagicor, Davivienda Seguros, Oceánica…) that don't localize. So the categories/groups/languages taxonomy is now fully bilingual and no `_EN` work remains.

**Sprint 105 — six targeted UX fixes (registration, disponibilidad, contacto, ubicaciones, panels).** All committed to main, build green (`✓ Compiled successfully` + `ƒ Proxy (Middleware)`), ES/EN both updated.
- **Disponibilidad — cross-location time conflict guard** (`availability-editor.tsx` `insertSlots`). A pro can't be in two places at once: when generating/adding slots, any time already scheduled THAT date at a DIFFERENT `location_id` (any profession) is detected, skipped, and surfaced inline via new `availabilityEditor.errLocationConflict` ("No puedes agregar la misma hora en dos ubicaciones. Ya tienes las {time} en {location} ese día."). Non-conflicting times still insert; the conflict check sits right after the lead-time filter.
- **Registro profesional — two UI fixes** (`registro/profesional/page.tsx`). (1) The "No tengo identificación costarricense" option is now a **subtle disclosure link** (`NoCrIdToggle` rewritten as a text button) anchored DIRECTLY under the identification field in BOTH the email step and the OAuth step — removed the floating checkbox at the end of the form. New keys `registration.pro.noCrIdLink`/`hasCrIdLink`. (2) "Agregar otra profesión" is now an explicit **"+ Agregar otra profesión"** action (`showExtraProf` state) that reveals the picker on click — no more vague second dropdown. Added `autoFocus` prop to `CategorySearch` (opens the picker on mount when revealed).
- **Contacto — progressive call-number disclosure** (`profile-editor.tsx`). WhatsApp field → "Permitir contacto por llamada" toggle → the "Número para llamadas" field is revealed ONLY when the toggle is ON (empty = WhatsApp used for calls). Removed `whatsappHelp`, `allowCallDesc`, and the `secContactDesc` ("Cómo te contactan los clientes") subtitle + the `emailHelp` text. Also removed `availabilityEditor.addSub` ("Elige el rango y el intervalo…").
- **Helper-text cleanup** — removed `profileEditor.certsHelp` ("Agrega tus certificaciones por profesión…") and `workplacesPicker.lead` ("Elige la provincia y el cantón…"); reworded `profileEditor.travelsDesc` → "Atiendes en las zonas que agregaste." (neutral, cantón-or-provincia).
- **WorkplacesPicker — search-in-map + unambiguous add** (`workplaces-picker.tsx`). Removed the standalone "Nombre del lugar (opcional)… Clínica Bíblica" field (dropped the `label` state); the address SEARCH now lives inside the map option (`markOnMap` reworded to "Buscar la dirección y marcar el punto en el mapa"). The add button is now **"Agregar esta ubicación"** (`addThisPlace`, commits the current selection); after a commit the draft form collapses (`adding` state) behind a separate **"+ Agregar otra ubicación"** (`addAnotherPlace`) action. `adding` inits from `value.length===0` (synchronous seed in profile-editor + empty in registration, so correct at mount).
- **Panels — two fixes.** (1) Client panel photo control now matches the pro panel: Change + **Quitar foto** buttons (Agregar foto when none) via `photoInputRef` + `handlePhotoRemove`; new `clientPage.addPhoto/removePhoto`. (2) "Finalizada"/completed bookings switched from the prominent brand-blue `default` Badge to the neutral **`muted`** variant (client-activity.tsx + booking-requests.tsx) so the terminal status reads consistent with the other statuses (no standout box).

**Sprint 106 — notifications/support clarity, de-boxing, panel unification.** All on main, build green, ES/EN both updated.
- **Notifications — role tag removed.** Dropped the client-vs-professional role icon/badge from BOTH `notifications-list.tsx` (the `contextMeta` icon tile) and `notification-bell.tsx` (the role pill) — the title/message already convey context and clicking still routes via `notificationHref`. Kept a quiet unread dot with a reserved-width leading column so read/unread rows stay aligned. Removed the now-unused `notificationContext`/`notificationContextLabel` imports + `Briefcase/ShoppingBag/LifeBuoy` icons. (`notification-link.ts` still exports them; harmless.)
- **Support label.** "Abrir ticket"/"Open ticket" → **"Contactar soporte"/"Contact support"** (jargon-free), applied to `support.newTicket`, `support.openTicket`, the contacto-page `openTicket` ("Contactar soporte →") and the FAQ `contactCta`; tweaked `support.emptySub` wording to drop "abre un ticket".
- **Two small removals.** (1) Removed the verified `CheckCircle2` next to the pro's name in the booking ("Solicitar servicio") card left panel (`booking-modal.tsx`). (2) Removed the "Coincide con tus servicios" badge in Proyectos recibidos (`proposals-tab.tsx`) — matched projects still sort first silently (`matchesServices` drives the sort; the `isMatch` var + badge are gone; `matchesServices` i18n key now unused).
- **Public profile de-boxed** (`profesionales/[slug]/page.tsx`). (a) Preview banner "Estás viendo tu perfil como lo ven los clientes" lost its tinted box → plain `text-[#6b7280]` + the "Volver a mi panel" button. (b) Card profession chips → plain muted text joined by " · " (dropped the `Badge` import); "Identidad verificada" → plain green text + `ShieldCheck` icon, no pill. (c) "Sobre mí" made uniform: the bordered quick-facts container became borderless `flex-col gap-2.5` label/value rows; language + insurer chips became plain " · " text. Every block now has the same clean, box-free treatment.
- **Client panel unified to the pro layout** (`dashboard/cliente/page.tsx`). The list/activity tabs (Solicitudes, Proyectos, Guardados, Notificaciones, Soporte) now render inside the SAME `Card` + titled `CardHeader` shell as the professional panel (was bare content + a lone `h2`). Since both panels already render the SAME `ClientActivity` for `section="bookings"/"projects"`, Solicitudes/Proyectos are now visually identical across panels. Added `clientPage.bookingsHeading/projectsHeading` + `bookingsSubtitle/projectsSubtitle`; title/subtitle resolved via `SECTION_TITLE`/`SECTION_SUBTITLE` maps. Profile tab keeps its own multi-card settings layout.

**Sprint 108 — contact/email toggles, "Sobre mí" + client-panel structure, tiquete wording, ONE save pattern, /buscar cards.** All on main, build green, ES/EN updated.
- **Contacto + Disponibilidad** (`profile-editor.tsx`, `availability-editor.tsx`): Contacto subsection regained its subtitle (`secContactDesc`); "Correo de contacto" became an opt-in toggle (`showContactEmail`, off unless one is saved; turning off clears it) mirroring the call-number pattern; removed the "Cómo te contactan los clientes" heading from Disponibilidad (the saving spinner moved next to the privacy toggle).
- **"Sobre mí" redesign** (`profesionales/[slug]/page.tsx`): bio is the lead paragraph; every fact (Experiencia, Verificación, Ubicación, Precios, Lugares de trabajo, Idiomas, Aseguradoras) shares ONE uniform `<dl>` of label/value rows with hairline dividers — no per-item boxes, no mismatched headings; multi-value rows stack right-aligned.
- **Client panel restructure** (`dashboard/cliente/page.tsx`): "Mi perfil" is now one titled `Card` with divider-separated subsections (foto, datos, "Ofrecer mis servicios"); **"Cuenta y seguridad" is its own nav tab** (Settings icon, `tabAccount`) holding AccountSecuritySection(showHeading=false)+CloseAccountSection — mirrors the pro panel.
- **i18n text fixes**: em-dashes→commas in `passwordProviderIntro` (ES+EN); Spanish support UI "tickets"→**"tiquetes"** (values only — keys + English keep "ticket"); `support.yourConversations` → "Tus tiquetes de soporte." / "Your support tickets.".
- **ONE app-wide SAVE pattern = AUTOSAVE everywhere** (see design-guide §21). New shared `<SaveStatus>` (`components/dashboard/save-status.tsx`, `saveStatus` namespace: Guardando…/Guardado/Sin guardar) shown top-right of every editable section. Removed the "Guardar cambios" buttons from Pro Mi perfil and Client profile (both now debounce-autosave 1.5s + keep the `UnsavedChangesGuard`); Servicios/Disponibilidad/Photos already persist per action and now show the same indicator (Disponibilidad/Photos pulse "Guardado"). Rationale: the app was already autosave-dominant and Disponibilidad/Photos are action-based (can't sit behind a deferred button), so autosave is the only truly consistent option.
- **/buscar cards** (`professional-card.tsx`, `professional-schedule.tsx`, `search-filters.tsx`) — reorganized WITHIN the existing `md:min-h-[190px]` floor (no size increase): contact + primary actions grouped in the action zone in **3 layouts** — TYPE 1 (public+call) `[WhatsApp · Llamar]` row then Solicitar servicio; TYPE 2 (public+no call) `[WhatsApp]` then Solicitar; TYPE 3 (private) only WhatsApp (+Llamar if enabled), no schedule. WhatsApp/Llamar are side-by-side on ONE line so adding Llamar never adds height. Price moved to the top row beside the name as just "₡X/hora" (no Desde/Tarifa; hidden when non-numeric to avoid an EN leak); "Identidad verificada"→compact "Verificado" (icon+short text, `verifiedShort`) next to the name; removed the top-row `TopContactIcons` (now unused), the "Próximos horarios" label, and the redundant "Ver horario completo" link. Schedule columns always show the full date ("15 mar"/"Mar 15"), never "lun 15". Kept casos/cert counts. Aseguradora filter defensively drops any "ninguna/sin seguros" option; default = no insurer (placeholder "Cualquiera").

**Sprint 107 — optional map pin is a clean opt-in disclosure** (`workplaces-picker.tsx`). The exact-pin refinement (Places address search + map) is **hidden by default** and revealed by a lightweight expandable LINK ("Buscar la dirección y marcar el punto en el mapa") — `MapPin` + label + `ChevronDown`, brand-blue, `aria-expanded` — replacing the previous heavy bordered disclosure row (de-boxed per design §19). `showMap` still defaults to `false`, and the map only mounts when toggled on (the `[showMap]` effect inits/【resets `mapInstanceRef`】), so the section is just provincia/cantón until opt-in (compact on mobile). A `Check` shows on the collapsed toggle when a pin is already set. The SAME `WorkplacesPicker` drives BOTH registration (`registro/profesional`) and the panel (`profile-editor`, `mapHeight={168}`), so the control is identical in both — no per-flow variance. **Location logic unchanged:** provincia/cantón remain authoritative for `/buscar` (`computeSearchAreas` → `search_provincias`/`search_cantones`); the pin only stores `lat`/`lng`; Places search (new `PlaceAutocompleteElement` → legacy `Autocomplete` fallback) intact, so a pro saved with OR without a pin still filters correctly. (`LocationPicker` is a separate component used elsewhere, e.g. publicar-proyecto — untouched.)
