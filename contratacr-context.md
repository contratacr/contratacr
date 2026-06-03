# ContrataCR.com — Project Context

_Last updated: 2026-06-03 (sprint 6 — services feature, booking redesign, dashboard auto-refresh, UI polish)_

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
| Supabase DB | Active | profiles, professionals, reviews, bookings, notifications, saved_professionals |
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
| /registro/cliente | Navbar | LandingFooter | Client signup with cédula, password checklist |
| /registro/profesional | Navbar | LandingFooter | 3-step pro wizard, WhatsApp smart field |
| /login | Navbar | LandingFooter | Email + OAuth |
| /olvide-contrasena | Navbar | LandingFooter | Password reset |
| /dashboard/cliente | Navbar | — | Bookings + saved pros |
| /dashboard/profesional | Navbar | — | Profile editor + bookings |
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

## Next Priorities

1. **Run migration 007** in Supabase SQL Editor (avatar_url + email/cedula unique indices)
2. **Run migration 008** in Supabase SQL Editor (professionals UPDATE RLS policy)
3. **Run migration 009** in Supabase SQL Editor (professionals.services JSONB column)
4. Set `CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET` in Vercel env vars
5. Enable "Allow automatic identity linking" in Supabase Auth settings (OAuth + email/password same email)
6. Google Maps integration on /buscar (split view list + map)
7. OTP email verification — configure Supabase SMTP via Resend
8. Payment/subscription system (freemium model)
