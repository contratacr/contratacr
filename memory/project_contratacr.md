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
- Mock data in `src/lib/data/mock-professionals.ts`

**Why:** Still pre-Supabase integration; all data is mocked. Next step is connecting to real Supabase project.

**How to apply:** When resuming, read `contratacr-context.md` first. Phase 2 is connecting Supabase, adding real auth, and wiring up real DB queries.
