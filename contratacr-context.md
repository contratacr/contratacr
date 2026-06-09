# ContrataCR.com — Project Context

_Last updated: 2026-06-08 (sprint 41 — app-wide cleanup following the design guide: rewrote ALL "vos" conjugations to standard CR Spanish (~420 fixes/~70 files — "Describe/Agrega/Elige", "puedes/quieres/tienes", "Inicia sesión", "cerca de ti"); required-field asterisks ("¿Para quién es la cita? *"); category input now typeable+selectable with "¿No ves tu categoría?" in BOTH Publicar proyecto and the /buscar filter (shared CategorySearch); published projects show their category chip (client + pro views); /buscar — full "Busca un servicio…" placeholder, "Buscar profesionales cerca de mí", private-availability notice moved to a compact inline chip (no extra card height); pro panel header shows account status (Identidad verificada / Pendiente de revisión) instead of the profession + "Ver cómo me ven los clientes"; reviews trust label reworded + duplicate casos-de-éxito images removed (shown once); booking "Sin comisiones" chips replaced with a client-useful "Qué sigue" list. No migration. See "Sprint 41" below. Earlier sprint 40 — created **contratacr-design-guide.md**, the mandatory single source of UI/UX direction (read it before ANY UI work) + a deeper presentation-only **Disponibilidad redesign** following it: privada + videoconsulta toggles merged into one settings card (less top noise), "Agregar horarios" made an obvious 2-step flow (profesión+ubicación grid, then presets above the Fecha·Desde→Hasta·Intervalo row, **Generar on its own row**), the duplicate end-after-start warning removed (ONE inline error on "Hasta", Generar clearly disabled), no-"vos" copy — NO scheduling/validation/save changes. No migration. See "Sprint 40" below. Earlier sprint 39 — professional "Disponibilidad" presentation-only polish: rewrote the contradictory "Disponibilidad privada" copy, made "Generar" read clearly disabled (solid gray + explicit "ajustá la hora de fin" reason) when the range is invalid, grouped "Tus horarios próximos" chips by Mañana/Tarde/Noche for easy scanning, tighter spacing — NO scheduling/validation/save changes. No migration. See "Sprint 39" below. Earlier sprint 38 — professional "Mi perfil" presentation-only polish: grouped the long form into collapsible sections (Datos básicos · Profesión · Ubicación y cobertura · Contacto y precios · Idiomas y aseguradoras), unified the work-location copy into ONE add-flow, added a "Todo el país makes narrower zones redundant" note, compacted the workplaces map (220→168 via optional mapHeight prop, registration unchanged), tighter spacing/clearer CR copy — NO logic/validation/save changes. No migration. See "Sprint 38" below. Earlier sprint 37 — client dashboard presentation-only polish: "Buscar profesionales" primary action surfaced in the header, tighter spacing (py-6, smaller tab nav, p-4 cards), friendlier CR empty states, Profile tab cleaned up (photo+name+phone merged into one card, consistent spacing), "Dejar reseña" copy consistency — NO logic/data/permission/functionality changes. No migration. See "Sprint 37" below. Earlier sprint 36 — /buscar moved to a 3-column layout: sticky filters SIDEBAR (xl+) · results list · sticky map, so the tall top filter block no longer pushes results down (more pros in the first viewport); below xl the filters collapse into a "Filtros" slide-over drawer, below lg a List/Map toggle; SearchFilters restyled as a vertical sidebar; private-availability shown as a flush top band on the card (compact WhatsApp/llamar actions, no floating paragraph); subtler "+N" indicator + narrower availability column + balanced map width; all functionality preserved. No migration. See "Sprint 36" below. Earlier sprint 35 — /buscar professional result cards redesigned for a clean, dense, uniform directory feel: bounded left column (48px avatar, name+price header, verified pill inlined with capped profession chips +N overflow), ONE consolidated location/coverage line replacing the ragged province/cantón/workplaces/coverage/bio stack (bio dropped), compact casos link, tighter availability panel with WhatsApp+Llamar side-by-side; all info + functionality preserved (number↔pin, pin hover, one-click slot booking, verified filter, sorting), responsive with no favorite/price overlap; TimeSelect shows AM/PM not a.m./p.m. No migration. See "Sprint 35" below. Earlier sprint 34 — redesigned Desde/Hasta time picker (shared TimeSelect: 12h labels with intrinsic a.m./p.m. that flips across noon) + explicit validation (end-after-start inline message, no silent "Generar" no-op, CR future/15-min lead surfaced); "Tus horarios próximos" groups + labels each block by profesión + ubicación (resolves coverage/videoconsulta labels); /buscar keeps ONE professional card with location chips/tabs (defaults to first place + "Horarios de <servicio> · <lugar>" caption) and the picked slot's (service + location) flows into the booking — recorded on bookings.category_id/slot_location_id/slot_location_label, shown to the pro, added to the WhatsApp message. Run migration 038. See "Sprint 34" below. Earlier sprint 33 — app-wide required/optional field convention: required fields show red "*", optional show "(opcional)", no empty submits (friendly Spanish inline errors), correct per-field validation; the account holder's PHONE is now REQUIRED across client + professional registration, completar-perfil, the booking complete-profile step and the pro profile editor (only the third-party/beneficiary phone stays optional); specific fixes — client correo/contraseña/confirmar "*", cantón "(opcional)", pro "Confirmar contraseña *", plus a sweep of booking/proyecto/proposals/profile-editor/close-account. No migration. See "Sprint 33" below. Earlier sprint 32 — schedules now belong to a (profession/service + location) pair (migration 037 availability_slots.category_id; profession selector in the generator; /buscar card shows only the searched profession's hours); traveling "me desplazo" coverage schedulable at every level (cantón/provincia/país) — fixes the can't-add-hours bug; "Profesiones → servicios" naming (registration "Profesión *", profile editor "Profesiones"); required "*" on "¿Cómo ofrecés tus servicios?"; default /buscar sort best-rated→reviews→recent; post-registration no flash-back (redirecting loader + dashboard retries); admin keeps appealing pending cases visible ("Pendientes" includes under_appeal, relabeled "Pendiente — en apelación"); "Reportar suplantación de identidad" → high-priority moderation ticket + documented biometric-is-the-real-fix limitation; /buscar numbered cards mirrored on numbered map pins + pin-hover mini preview that highlights the card; non-blocking geolocation "Usar mi ubicación / Cerca de mí" (proximity sort + nearest-provincia autofill, graceful text-search fallback). Run migration 037. See "Sprint 32" below. Earlier sprint 31 — booking modal reliably auto-scrolls to time slots on day-select + one-click day+time from the /buscar card opens it pre-selected/scrolled (larger modal); CRITICAL cédula-field-vanishing fix for social-login accounts (gate on stable hasStoredCedula, not the live input value — field stays, validates, stores); unified status-filter tabs + naming (shared StatusFilterTabs) across solicitudes + proyectos in BOTH client and professional panels (removed Próximas/Historial + duplicate "Mis proyectos" header, single consistent filtered list). No migration. See "Sprint 31" below. Earlier sprint 30 — pro action wording "Marcar como completado" (not "finalizado"; client confirms → Finalizado) on projects+solicitudes; proposals kept after finalización (accepted→"Finalizada" locked, others collapsed); reviews show the job title ("Reseña de '<title>'"); "editada" hidden on the public profile; status filter pill-tabs in solicitudes + proyectos; client phone shown to the pro on accepted proposals; es_salud category flag gates DOB (requested/shown/stored only for health categories) across /buscar booking, the pro's solicitud view, and the panel — bookings.client_dob stored health-only (Ley 8968). Run migration 036. See "Sprint 30" below. Earlier sprint 29 — availability "Desde" + "hora puntual" both default to the next rounded full hour (reliable init); booking re-checks the DB for a cédula each open so social-login accounts with none are prompted; project lifecycle status now visible in the PRO panel for accepted proposals (Asignado/Trabajo realizado/Finalizado/Cancelado) with focus-refetch so a client cancel/delete clears the stale "Aceptada"; PER-FINISHED-JOB reviews (each booking/project reviewable + editable, tied to the item, aggregated on the profile) + button flips to "Ver/Editar reseña" with a filled star once reviewed. Run migration 035. See "Sprint 29" below. Earlier sprint 28 — 17-item batch: CRITICAL identity fix ("¿No es tu información?" discards the padrón match → manual review, no verified email/badge); friendly duplicate-cédula messages; "¿No ves tu categoría?" → admin ticket; readable listing addresses (pro-labeled, Plus Codes hidden) + exact pin on map; "Contáctanos por llamada" opt-in in Disponibilidad; availability "Desde" rounds to next full hour + /buscar hides slots within the 15-min lead; proposal-edit + project-status persistence (service-role) + either-party project cancel + review-on-finalizado; publish "Ir a mi panel"; editable reviews (filled-star + "editada"); booking DOB wired through cédula lookup (padrón has none); numeric PhoneInput on beneficiary/client/completar-perfil; /buscar real coverage label (cantón/provincia/país); account soft-disable with reason → admin Cuentas tab. Run migration 034. See "Sprint 28" below. Earlier sprint 27.2 — fixed-location adds one pin at a time: "Agregar lugar" blocked until the current pin's provincia+cantón are confirmed (then the next pin can be added); cantón shown disabled-until-provincia everywhere with NO "elegí provincia primero" instructional text (workplaces, travel zones, search filters). Earlier sprint 27.1 follow-up — notifications "Ver todas" opens the in-panel notifications tab (role-routed, both panels); cantón select disabled until provincia chosen (fixed + travel); fixed-location "Agregar lugar" fixed — dropping a pin reverse-geocodes + auto-adds a listed removable location (no more false "no location" error) + manual provincia/cantón add, multiple locations; removed user-facing "/buscar" jargon app-wide (→ "los resultados de búsqueda"). See "Sprint 27.1" below. Earlier sprint 27 — 28-item batch: fixed-location typed provincia/cantón FIRST (authoritative for /buscar) then pin (visual only, no reverse-geocode); hierarchical travel coverage (cantón/provincia/país) + hierarchy-aware /buscar; aseguradoras official-list chip/autocomplete (no free-text) + "¿No ves tu aseguradora?" → admin ticket (approve-before-filterable) + admin Aseguradoras tab; 15-min booking lead time — pickers OFFER only valid times (error as repeatable safety-net) + availability dates dd/mm/aaaa; no-CR-ID pros hidden from /buscar until admin-approved + "pendiente de revisión" panel + add-cédula-later (auto padrón verify) + appeal-straight-to-support; removed manual block toggle (visibility = verification status; rejected never visible); casos de éxito per profession/service (portfolio_items tagged); booking beneficiary cédula auto-fills confirmed info (manual name only if not found) + cédula never flashes for registered clients + submit "Confirmar solicitud"; auth — social on LOGIN only, post-registration lands on panel (role persisted to auth metadata), ContrataCR Términos+Privacidad line, "Confirmar contraseña"; client→pro conversion reuses on-file cédula + role persists; notifications full panel management (mark/delete single+all); solicitudes lifecycle (pro "trabajo realizado" → client confirma → finalizada, 7-day auto-confirm, either-party cancel + reason, notify both) + report on active/finished/cancelled → admin ticket; pro name links to public profile everywhere + search-by-name. Run migration 033. See "Sprint 27" below._

_Earlier: 2026-06-07 (sprint 26 — unified cédula→padrón auto-fill + confirm info block (name + cédula + DOB/age WHEN AVAILABLE + "¿No es tu información?") across client registration, guest booking, logged-in booking, professional registration; 18+ gate via padrón presence (electoral roll = adults; padrón has NO birth date); "No tengo identificación costarricense" → admin exceptions queue (no_cr_id + document note, pending); aseguradoras (insurance networks on profile + /buscar filter); public reviews gated by confirmed completion (already enforced); two-way no-show / non-performance / non-payment reporting (report pro + report client → flag_count → admin moderation; NO in-app monetary penalties — payments off-platform); minors blocked from accounts via padrón; booking-for-someone-else (responsible adult vs beneficiary, ¿tiene cédula? branch, beneficiary cédula always optional, under-18 beneficiary marked "para un menor"). Run migration 032. See "Sprint 26" below._

_Earlier: 2026-06-07 (sprint 25 — cédula→padrón auto-fill+confirm for pros (no name matching) + integrity guard; designed unsaved-changes dialog + profile auto-save; "Este correo ya está registrado" detection; call-contact option in /buscar; booking CTA "Solicitar por WhatsApp"; pro solicitudes confirm/complete persistence fix (service-role update); no past dates/times in Costa Rica time (client + DB trigger); "Casos de éxito" restructure + /buscar preview link; client confirm-password; admin re-scoped to exceptions + moderation + support (reports queue, ban/unban, remove fake photos); location model — pins as single source of truth (per-pin reverse-geocoded provincia/cantón/distrito) + coverage-area selector for "me desplazo" + location-aware /buscar via denormalized search arrays; client cédula at BOOKING not signup (guest booking, format + padrón-existence, recoverable UX) + two-way reputation (report clients, flag, admin moderation). Run migrations 028-031. See "Sprint 25" below._

_Earlier: 2026-06-07 (sprint 24 — fully automatic identity verification: self-hosted TSE padrón + IdentityVerifier abstraction (swappable, biometric extension point), auto-grant "Identidad verificada" on registration (match → verified, else pending; never auto-reject), name normalization + similarity threshold, appeals re-run-then-ticket, admin panel exception-only + side-by-side padrón compare + assisted TSE button, work photos removed as criterion, badge renamed Proveedor Autorizado → Identidad verificada, /buscar "Solo con identidad verificada" (?verificados=1), data minimization (store result only); run migration 027 + load padrón + set GitHub Action secrets). Earlier: sprint 23 — 28-item batch: route-change unsaved guard, condensed OTP, unified input focus color, post-verify lands on panel, robust Google client onboarding, client→professional upgrade, per-user favorites scoping, booking-persistence fix, admin login at /admin, smart verification CTA, TSE-assisted manual check, geolocation + both work modes + map re-init, availability single contact-mode decision + privada toggle + per-location-only schedules, 5-photo text + registration work-photos tip, booking slot auto-scroll + "Continuar por WhatsApp", notifications corner badge + pro notifications tab, proposal WA/revert/edit/cancel, project cancel-delete notify, self-interaction guards, project-confirmed reviews). Earlier: sprint 22 — 43-item batch: admin role + "Proveedor Autorizado" verification system (lifecycle/audit/appeals/badge/explainer), single Nombre completo, phone-input alignment, OTP email context, languages chip, contact-mode in Disponibilidad + per-location & videoconsulta schedules, work-mode toggle, unsaved-changes guard, compact /buscar cards + unified WhatsApp + no-reviews state, home-search autocomplete + canton→province, panel-aware register links + error/out-of-service pages, notifications badge + /notificaciones, Cloudinary transforms + 5-photo limit + profile gallery, numeric-only PriceInput, project completion lifecycle + delete; run migrations 023-026). Earlier: sprint 21 — shared CedulaInput: live X-XXXX-XXXX masking, clean-digit storage, auto type detection (cédula/DIMEX/NITE), format-only validation, label "Número de identificación" with required/optional prop. Earlier sprint 20 — unified workplaces (map autocomplete, multiple pins, supersedes affiliations + single fixed pin), PhoneInput flag/selection/length fixes, registration location flow reordered (province/canton required first, optional pin after); run migration 022. Earlier sprint 19 — flexible professional identity: replaced persona física/empresa binary with optional brand name + affiliations (institutions/workplaces), searchable + visible in /buscar; run migration 021. Earlier sprint 18 — registration hardening: account-creation error fix + retry/friendly errors, navbar scrolled label, reliable canton geocode, full country phone selector, form validation (defaults/onBlur/scroll/red asterisks), per-service experience; run migrations 019 + 020. Earlier sprint 17 — see "Sprint 17" section: client OTP, standardized PhoneInput, booking phone capture, contact_preference, languages, account_type/business_name, per-service pricing, reverse-geocode province/canton, completion CTA, footer cleanup; run migration 019. Earlier sprint 14/15/16 — see "Sprint 14-16" section below: multi-profession + multi-category, pricing tiers, HuliHealth /buscar split + inline schedules, real-time email/cédula checks, availability auto public/private, project→pro notifications, .ics export, emoji blocking, brands marquee, footer/social/support, OAuth pro cédula+name, sign-out fix). Earlier: sprint 13 — date-based availability + public/private toggle, search map clustered pins, verified-only reviews, booking notifications; sprint 12 — OAuth pro registration, category FK migration 013)_

---

## ⚠️ Design guide is mandatory — read `contratacr-design-guide.md` first for ANY UI work

`contratacr-design-guide.md` (repo root, created sprint 40) is the **single source of truth** for visual/UX direction. **Every task that touches UI, layout, components, or user-facing copy must read it before writing code and conform to it.** It defines: the simplicity-first principle; the canonical color/typography/spacing tokens + component standards (compact buttons with a clear primary/secondary hierarchy and a real disabled state, inputs, chips, cards, toggles, badges); the layout patterns (/buscar 3-column filters·results·map, uniform compact cards, Hulihealth-style availability strip + location chips, collapsible long forms with the first section open); density/sizing rules; the **app-wide copy standard — normal Costa Rican Spanish WITHOUT "vos" imperatives** ("Describe lo que necesitas", "Agrega", "Elige" — never "Describí", "Agregá", "Elegí"); and the required-field convention (red `*` / `(opcional)`). If existing UI violates it while you're in the area, align it (within scope).

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

### Availability structure
- One top-level decision **"¿Cómo recibís clientes?"** (Solo WhatsApp / Citas en la app / Ambas). Visibility is no longer a separate question: when scheduling is enabled a **"Disponibilidad privada" toggle** appears (ON ⇒ hidden in /buscar + published slots cleared) (fix 15).
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
