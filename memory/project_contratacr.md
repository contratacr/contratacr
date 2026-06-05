---
name: project-contratacr
description: ContrataCR.com project state, stack, architecture decisions, and progress
metadata:
  type: project
---

Professional services marketplace for Costa Rica. See `contratacr-context.md` for full spec.

**Stack:** Next.js 16 (App Router) + Tailwind v4 + Supabase + Cloudinary + Vercel

**Phase 1 MVP built (2026-05-31):**
- Landing page with hero search, category grid, featured professionals, how-it-works, CTA sections
- Search page (`/buscar`) with provincia/cantón/category/sort filters
- Professional profile page (`/profesionales/[slug]`) with reviews, stats, WhatsApp CTA
- Registration flows: client (1-step) and professional (3-step) with mock cédula lookup
- Login page
- Design system: Button, Input, Badge, Card, Avatar, Select, StarRating
- CR geography data (7 provincias, 82 cantones)
- Supabase schema + migrations in `/supabase/migrations/`

**Listings are real-data only:** all seed/fake professionals were removed (2026-06-05). `searchProfessionals`/`getProfessionalBySlug` return `[]`/`null` when Supabase is unavailable — never mock. `mock-professionals.ts` now only exports the `ProfessionalCardData` type. Default list sort: `is_featured` (within filtered set only) → `rating_avg` desc → `review_count` desc tiebreaker; sort dropdown overrides the rating default.

**Sprint 14 (2026-06-05) — key facts:**
- Booking modal (`booking-modal.tsx`) requires both date AND time; WhatsApp prefill is plain text (no broken emoji). OAuth clients with no cédula hit a "complete profile" step (name/phone/cédula) before booking; booking POST now sends `clientCedula`/`clientPhone`.
- Homepage search (`landing-hero.tsx`) has debounced autocomplete via `/api/search/suggestions` (categories + real pro specialties), keyboard nav, redirects to `/buscar`.
- Maps share one brand style (`src/lib/maps/map-style.ts`) used by both map instances. `GoogleMapPanel` uses `gestureHandling: "cooperative"` + a ResizeObserver (relayouts when toggled visible). Search page wraps results in `search-results-layout.tsx`: md+ split, mobile List/Map toggle (default List), safe-area-aware height. Root `viewport` exports `viewportFit:"cover"`.
- **Projects tab fix:** projects↔categories/provincias/cantones have NO FK (dropped in migration 013 / plain-text cols), so PostgREST embeds 500'd. `GET /api/projects` now resolves those names in `enrichProjects()` (categories table lookup + static geography) instead of embedded joins.
- Notifications carry `data.link`; UI is click-through via `src/lib/notification-link.ts` + `formatRelativeTime`. New-booking msg format: "[Client] solicitó '[Service]' para el [weekday], [day] de [month] a las [time]."
- Booking confirm/cancel by a pro → `notifyBookingStatusChange()` messages the client from ContrataCR's own WhatsApp (Cloud API), email fallback; delivery logged in `notification_deliveries` (migration 015).

**How to apply:** When resuming, read `contratacr-context.md` first. Supabase is the single source of truth for professionals.
