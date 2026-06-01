# ContrataCR.com — Project Context

_Last updated: 2026-05-31_

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
│   │   │   ├── registro/{page, profesional, cliente}/page.tsx
│   │   │   └── login/page.tsx
│   │   ├── api/cedula/[id]/route.ts  # Cédula lookup proxy
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
│   │   ├── layout/                 # Navbar (+ language toggle), Footer
│   │   ├── search/                 # HeroSearch, SearchFilters
│   │   └── professionals/          # ProfessionalCard
│   └── types/index.ts
├── messages/
│   ├── es.json
│   └── en.json
├── middleware.ts                   # next-intl locale routing
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

## Cédula Lookup

**Endpoint:** `GET https://apis.digital.go.cr/sl/personas/{cedula}`
**Auth:** `client_id` + `client_secret` headers (register at api.digital.go.cr — free for nonprofits/startups)
**Our route:** `/api/cedula/[id]` — server-side proxy; falls back to mock if env vars not set
**Status:** Route created; activate by setting `CR_DIGITAL_API_CLIENT_ID` + `CR_DIGITAL_API_CLIENT_SECRET`

---

## Feature Roadmap

### Phase 1a — MVP ✅
- [x] Next.js scaffold + design system (Button, Input, Badge, Card, Avatar, Select, StarRating)
- [x] Landing page + search + professional profiles + registration + login
- [x] CR geography data (7 provincias, 82 cantones)
- [x] Supabase schema + migrations + RLS

### Phase 1b — Current Sprint ✅
- [x] next-intl i18n (ES default / EN toggle)
- [x] Language toggle in navbar (cookie + localStorage)
- [x] All UI copy in messages/es.json + messages/en.json
- [x] Supabase client/server wired; /buscar + profiles use real data (mock fallback)
- [x] Cédula API route (proxies api.digital.go.cr)
- [x] English identifiers throughout codebase

### Phase 2
- [ ] Professional dashboard (stats, availability calendar)
- [ ] Boosted listings / featured slots (monetization)
- [ ] Email notifications (Resend)
- [ ] Google Maps service coverage
- [ ] Native mobile (iOS + Android)

---

## Key Constraints
- No in-app chat or payments — WhatsApp contact, SINPE Móvil externally
- Cédula required on registration (both roles) → name auto-filled from Registro Civil
- Search filtered by provincia + cantón (not generic location)
- UX: ≤3 onboarding steps, thumb-friendly, mobile-first
- Monetization: free launch, freemium — no hard paywalls until PMF

---

## Monetization
1. **Free:** Basic profile, searchable
2. **Pro ₡9,900/month:** Highlighted profile, portfolio, priority ranking
3. **Featured slots:** Top-of-results paid placement
4. **Future:** Volume subscription tiers
