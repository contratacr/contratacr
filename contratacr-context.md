# ContrataCR.com — Project Context

_Last updated: 2026-06-06 (sprint 19 — flexible professional identity: replaced persona física/empresa binary with optional brand name + affiliations (institutions/workplaces), searchable + visible in /buscar; run migration 021. Earlier sprint 18 — registration hardening: account-creation error fix + retry/friendly errors, navbar scrolled label, reliable canton geocode, full country phone selector, form validation (defaults/onBlur/scroll/red asterisks), per-service experience; run migrations 019 + 020. Earlier sprint 17 — see "Sprint 17" section: client OTP, standardized PhoneInput, booking phone capture, contact_preference, languages, account_type/business_name, per-service pricing, reverse-geocode province/canton, completion CTA, footer cleanup; run migration 019. Earlier sprint 14/15/16 — see "Sprint 14-16" section below: multi-profession + multi-category, pricing tiers, HuliHealth /buscar split + inline schedules, real-time email/cédula checks, availability auto public/private, project→pro notifications, .ics export, emoji blocking, brands marquee, footer/social/support, OAuth pro cédula+name, sign-out fix). Earlier: sprint 13 — date-based availability + public/private toggle, search map clustered pins, verified-only reviews, booking notifications; sprint 12 — OAuth pro registration, category FK migration 013)_

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
