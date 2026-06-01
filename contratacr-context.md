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

## Stack Decision

| Layer | Choice | Justification |
|-------|--------|---------------|
| Framework | Next.js 14 (App Router) | SSR for SEO (marketplace discovery), full-stack, Vercel-native, TypeScript first |
| Database + Auth | Supabase | PostgreSQL, built-in auth, RLS, real-time, generous free tier, US-East (low CR latency) |
| Storage | Cloudinary | Profile photos, portfolio images, free tier 25 GB |
| Deployment | Vercel | Free tier, edge network, zero config CI/CD |
| Styling | Tailwind CSS + shadcn/ui | Fast, consistent, accessible, mobile-first |
| Maps | Google Maps JS API | Service area polygons, place autocomplete |
| Email | Resend | Transactional email, free tier 3k/month |

---

## Architecture Overview

```
contratacr/
├── src/
│   ├── app/
│   │   ├── (marketing)/        # Landing, about, pricing
│   │   ├── (auth)/             # Login, register flows
│   │   ├── (app)/              # Authenticated area
│   │   │   ├── search/         # Search results
│   │   │   ├── profesionales/  # Professional profiles
│   │   │   └── dashboard/      # Professional dashboard
│   │   └── api/                # API routes
│   ├── components/
│   │   ├── ui/                 # shadcn primitives
│   │   ├── search/             # Search bar, filters
│   │   ├── profile/            # Profile cards, detail
│   │   └── forms/              # Registration, review forms
│   ├── lib/
│   │   ├── supabase/           # Client, server, middleware
│   │   ├── validations/        # Zod schemas
│   │   └── utils/              # Helpers
│   └── types/                  # TypeScript types
├── public/                     # Static assets
└── supabase/
    └── migrations/             # DB schema
```

---

## Supabase Schema (Phase 1)

**Tables:**
- `profiles` — users (both roles), cedula, full_name from Registro Civil
- `professionals` — extends profiles, service categories, bio, WhatsApp, coverage area
- `categories` — service categories (plomería, electricidad, etc.)
- `reviews` — client → professional, 1-5 stars, comment
- `bookings` — appointment requests (no payment, informational only)
- `provincias` / `cantones` — CR geography reference tables

---

## Feature Priorities

### Phase 1 — MVP (Current)
- [x] Project scaffold + design system
- [ ] Landing page with hero search
- [ ] Provincia + cantón search filter
- [ ] Search results page with cards
- [ ] Professional profile page
- [ ] Client registration (cédula → auto-fill name)
- [ ] Professional registration (≤3 steps)
- [ ] Review + rating system
- [ ] Google Maps service area display

### Phase 2 — Growth
- [ ] Professional dashboard (analytics, availability)
- [ ] Featured/boosted listings (monetization)
- [ ] Email notifications (Resend)
- [ ] Mobile apps (iOS + Android, React Native)

---

## Key Constraints
- **No in-app chat or payments** — WhatsApp for contact, SINPE Móvil / bank transfer externally
- **Cédula verification** on registration → auto-fill from Registro Civil CR API
- **Geography:** provincia + cantón (not generic city/location)
- **UX:** Non-tech users, onboarding ≤3 steps, thumb-friendly, mobile-first
- **Monetization:** Free launch, freemium model, no hard paywalls until PMF

---

## Costa Rica Data
- 7 Provincias: San José, Alajuela, Cartago, Heredia, Guanacaste, Puntarenas, Limón
- ~82 Cantones total
- Registro Civil API for cédula validation

---

## Monetization Plan
1. **Free:** Basic profile, appear in search
2. **Pro (₡9,900/month):** Profile highlight, portfolio photos, priority ranking
3. **Featured slots:** Paid placement at top of category results
4. **Future:** Subscription tiers for high-volume professionals
