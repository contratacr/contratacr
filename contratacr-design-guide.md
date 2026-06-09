# ContrataCR — Design & UX Guide

> **READ THIS FIRST.** Every task that touches UI, layout, copy, or visual design **must read this file before writing any code** and conform to it. If a change would contradict this guide, follow the guide (or, if the guide is genuinely wrong for the case, note it and update this file in the same change). The goal is a single, cohesive, dead-simple product — not many locally-clever screens.

ContrataCR is a Costa Rican services marketplace (clients find and book professionals). Our users value apps that are **very easy and intuitive**. The reference for structure and UX patterns is a clean service-directory experience in the spirit of **Hulihealth** (well-organized search with a results list + map, compact information-dense cards, clear availability). We replicate the **structure and patterns**, never their code, assets, or brand — everything uses ContrataCR's own brand, colors, content, and features.

---

## 1. Core principle — simplicity first

**Function means nothing if it's cluttered or confusing.** Every screen must be immediately understandable by a non-technical Costa Rican user on a phone.

Apply, in order:
1. **One primary action per screen.** Make the most common next step obvious (one filled primary button). Everything else is secondary/quiet.
2. **Show only what's needed now.** Hide advanced or rare options behind collapsible sections, "+N" overflows, popovers, or drawers. Never dump every field/option on screen at once.
3. **No redundancy.** One piece of information appears in exactly one place. One validation error shows once. Never two messages saying the same thing.
4. **Group related things; separate unrelated things.** Use clear visual grouping (cards/sections), consistent spacing, and a clear hierarchy (size, weight, color) so the eye lands on the right thing first.
5. **Compact but legible.** Dense like a good directory — no wasted vertical space — but never cramped or tiny to the point of being hard to read (see §5).
6. **Consistency beats cleverness.** Reuse the tokens, components, and patterns below. A familiar pattern used everywhere is easier than a new bespoke one per screen.

When in doubt, remove. If a block doesn't help the user complete their task, cut it.

---

## 2. Design tokens

These are the **canonical** values. Use them via the existing primitives (`Button`, `Input`, `Badge`, `Card`, `Select`) wherever possible instead of re-deriving styles. Tailwind arbitrary values (`bg-[#009FD9]`) are how the codebase expresses these today — match the surrounding code.

### Color palette

**Brand (blue) — primary identity & primary actions**
| Token | Hex | Use |
|---|---|---|
| Brand | `#009FD9` | Primary buttons, links, focus ring, active states, verified badge |
| Brand hover | `#0089bb` | Primary button hover |
| Brand tint | `#EBF5FB` | Light brand background (chips, hovers, highlights) |
| Brand tint border | `#bfdbfe` | Border on brand-tint chips/badges |

**Accent (orange) — sparingly, for featured/secondary emphasis only.** Not the default CTA color.
| Token | Hex |
|---|---|
| Accent | `#ff7c0a` · hover `#f05f00` · text-on-tint `#c74600` · tint `#fff8ed` / border `#ffdba5` |

**WhatsApp** (the contact channel): `#25d366` · hover `#1da851`. Use only for the WhatsApp action.

**Neutrals (gray scale)**
| Hex | Use |
|---|---|
| `#111827` | Primary text / headings (foreground) |
| `#374151` | Body text, form labels |
| `#6b7280` | Muted text, hints, secondary captions |
| `#9ca3af` | Placeholders, disabled-ish icons, faint labels |
| `#cbd5e1` | Input border on hover |
| `#e5e7eb` | Default borders, dividers |
| `#d1d5db` | Disabled control fill (solid, see §2 buttons) |
| `#f3f4f6` | Muted background (ghost hover, disabled input) |
| `#fafafa` | Page background |
| `#ffffff` | Surface (cards) |

**Semantic**
| Meaning | Tokens |
|---|---|
| Success | `emerald-50` bg / `emerald-700` text / `emerald-200` border |
| Warning / caution | `amber-50` bg / `amber-700` text / `amber-200` border (deep text `#92400e`, fill `#fde68a`) |
| Error | `red-500` text, `red-400` input border, `red-50`/`red-700`/`red-200` badge |

> Note: `globals.css` also defines a legacy green `--color-primary-*` palette. The **live brand is the blue `#009FD9`** used by `Button`/`Badge`/`Input` — use the blue, not the green tokens.

### Typography

Font: **Inter** / system-ui sans (set globally). Scale (Tailwind):
| Role | Class | Notes |
|---|---|---|
| Page title | `text-2xl`/`text-3xl` `font-bold` `text-[#111827]` | One per page |
| Section heading | `text-lg`/`text-xl` `font-semibold` | |
| Card title / strong label | `text-sm`/`text-base` `font-semibold` | |
| Body | `text-sm` `text-[#374151]` | Default |
| Label (form) | `text-sm font-medium text-[#374151]` | |
| Hint / caption / meta | `text-xs` `text-[#6b7280]` | |
| Micro-label (eyebrow) | `text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]` | e.g. Mañana/Tarde/Noche |

Don't go below `text-xs` for anything the user must read (the `10px` eyebrow is for ALL-CAPS labels only). Numbers/prices: `font-semibold`, `whitespace-nowrap`.

### Spacing scale

Use the standard 4px Tailwind steps. Defaults for this app:
- **Page padding:** `py-6` (`px-4` mobile → container).
- **Between cards / major blocks:** `gap-4` / `space-y-4`.
- **Inside a card:** padding `p-4` (compact) — not `p-5`/`p-6`. Internal stacks `gap-3` / `space-y-3`.
- **Tight clusters** (label+control, chip rows): `gap-1.5` / `gap-2`.
- Prefer removing vertical space over adding it. If two blocks relate, keep them close.

### Radius & elevation
- Radius: cards/inputs/buttons `rounded-xl` (12px); chips/badges/pills `rounded-full`; small buttons `rounded-lg`. Big hero CTAs only `rounded-2xl`.
- Borders over shadows for structure (`border border-[#e5e7eb]`). Use soft shadow (`shadow-sm`) for raised primary buttons and floating popovers/drawers only. Don't stack heavy shadows.

### Components & standards

**Buttons** (`Button` component). Clear hierarchy, **compact sizing by default**:
- **Primary** — `variant="default"` (filled brand `#009FD9`). Exactly one per context. The main action ("Solicitar servicio", "Generar", "Guardar").
- **Secondary** — `variant="secondary"` (white, brand border/text) or `variant="outline"` (neutral). Supporting actions.
- **Ghost** — `variant="ghost"` for low-emphasis/tertiary (icon buttons, "Cancelar").
- **WhatsApp** — `variant="whatsapp"` only for the WhatsApp contact action.
- **Size:** default to **`size="sm"`** (`h-8 px-3 text-xs`) for in-card / dense contexts and **`size="md"`** (`h-10`) for form submits. Reserve `lg`/`xl` for the landing/hero. Compact is the rule.
- **Disabled state must READ as disabled, not just dimmed.** The default `disabled:opacity-50` makes a primary button look like a faded-but-clickable button. When a control is blocked by validation, render a **solid gray** state (`bg-[#d1d5db] text-white shadow-none hover:bg-[#d1d5db]`) + `aria-disabled`, so it's unmistakably inert. Pair it with **one** clear reason (inline), never a second duplicate message.

**Inputs** (`Input`/`Select`): `rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm`, focus `ring-2 ring-[#009FD9]`, error `border-red-400`. Label above (`text-sm font-medium text-[#374151]`); hint/error below (`text-xs`). Always pair a label with its control; never rely on placeholder as the label.

**Chips / tags / pills**: `rounded-full px-2.5 py-0.5 text-xs font-medium`. Selectable chips (location/profession tabs): brand-tint when active (`bg-[#EBF5FB] text-[#009FD9] border border-[#bfdbfe]`), neutral when not (`bg-[#f3f4f6] text-[#6b7280] border border-[#e5e7eb]`). Overflow → a muted **"+N"** chip rather than wrapping endlessly.

**Cards** (`Card`): white surface, `border border-[#e5e7eb]`, `rounded-xl`, `p-4`. In a list, cards must be **uniform height** — bound variable content (cap lists, consolidate optional rows, use `min-h-[…]`) so a sparse card matches a rich one. See §3/§4.

**Badges** (`Badge`): status/labels. `default` brand-tint, `success`, `warning`, `error`, `muted`, `verified` (solid brand), `featured` (solid accent). Use `verified` for "Identidad verificada".

**Verification status — always show one of two unmistakable states (legal/veracity rule).** A professional is **never** shown without a verification indicator (ambiguity is the risk). Two states, visually distinct, on the /buscar card, the public profile, and the booking modal:
- **Verified** → green "Identidad verificada" (`bg-[#dcfce7] text-[#15803d]`, `ShieldCheck`).
- **Not verified** → amber "Identidad sin verificar" (`bg-[#fef3c7] border-[#fde68a] text-[#92400e]`, `ShieldAlert`). Never leave it blank.
Unverified professionals **are listed and bookable** (not hidden) but, when contacting/booking one, show an honest notice: "Este profesional aún no ha verificado su identidad. Coordina con cuidado." Wording **informs, never endorses** — ContrataCR only *displays* status and does not vouch for or guarantee any professional. The pro's panel mirrors this ("Identidad sin verificar · visible para clientes") with the path to verify (add cédula → padrón check; appeals unchanged). Only **rejected** profiles are hidden from search.

**Toggles**: a switch with a short, **state-aware** label/description — the text describes what's true now and what the toggle does, and never contradicts itself across states. (e.g. private on → "tus horarios están ocultos…"; private off → "Activa para ocultar tus horarios…").

---

## 3. Layout patterns

### /buscar — full-width three-column directory (THE standard search layout)
This is the signature screen and is **full-width** — NOT a narrow `max-w-7xl` centered container (that wastes horizontal space next to a map). Wrap it in `mx-auto max-w-[1920px] px-4 sm:px-6 lg:px-8` so it fills the screen on laptops/desktops. Three columns, Hulihealth-style, responsive:
- **xl+ (≥1280):** `filters sidebar (w-64, sticky)` · `results list (flex-1)` · `map (xl:w-[38%], sticky, full viewport height)`.
- **lg–xl (1024–1279):** `results` · `map (lg:w-[40%])`; filters move behind a **"Filtros" slide-over drawer**.
- **<lg:** single column; **"Filtros"** button opens the drawer + a **List/Map toggle** swaps results/map.
- `SearchResultsLayout` owns the three slots + drawer (takes a `filters` prop). `SearchFilters` is a **vertical sidebar** (stacked search, category [typeable+browsable], province/cantón, sort, aseguradora, geolocation, verified, clear). **Filters live ONLY in the sidebar — never inside the cards.**
- **Sort ("Ordenar por") — the standard set:** Mejor calificados (`rating`, default) · Precio (de menor a mayor) (`priceAsc`) · Disponibilidad inmediata (`availability` — soonest upcoming slot first) · Cercanía (`cercania` — requests geolocation when picked).
- **Default ranking — verified first.** Across every sort, **verified professionals rank above unverified** (a stable secondary pass after the chosen sort; featured within each group), so clients are steered to verified pros automatically and pros have a built-in incentive to verify. Unverified still appear, just lower. Keep the single **"Solo identidad verificada"** toggle for clients who want only verified — do **not** add any other verification filter.

### Result cards — content-driven height, compact, dense (two-zone)
A professional is always **ONE card** (`rounded-2xl bg-white border`, never split per location). Height is **content-driven with a floor** — `md:min-h-[190px]` (NOT a hard fixed height): a sparse card stays compact, a rich one (multi-location + multi-profession + many slots) grows. Content is padded `pl-10` so it clears the number badge. On mobile it stacks (`flex-col`). Two zones:
- **Identity zone (`flex-1`, left):** 52px avatar (initials on `#EBF5FB`, or photo) · **name** (bold, truncate, hover→brand) · a row with the **verification pill** (green "Verificado" / amber "Sin verificar") + **business name** · a row of **profession pills** (`rounded-full bg-[#EBF5FB] text-[#0089bb] border-[#bfdbfe]`) with `+N` overflow + contact-only/featured chips · a **rating row** (one `#ff9b32` star + value + "· N reseñas", or "Sin reseñas todavía") · **location** line (`MapPin`) + **coverage** line (`Truck`), each truncating · **"Ver casos de éxito (N)"** pinned to the bottom (`mt-auto`). No bio.
- **Action zone (`md:w-[232px]`, left border):** a **price header** ("Desde ₡14 000/hora" — `Desde` eyebrow + value, `md:pr-8` clears the favorite), then the availability panel (below) with the **"Solicitar servicio"** CTA pinned to the bottom.
- Numbered cards **1..N** mirrored on numbered map pins; pin hover adds `ring-2 ring-[#009FD9]` + scrolls the card (map reaches it via `#pro-card-<id>`). Number badge top-left (`top-2.5 left-2.5`), favorite top-right — both overlay the corners; name uses `pr-9 md:pr-0` so they never collide on mobile.
- Overflow always **truncates/collapses ("+N")**.

### Availability display (Hulihealth-style)
- **Packed day columns** (3 at a time): show only upcoming days that **actually have bookable slots** (no "—" filler), with **uppercase** labels (`Hoy`/`Mañana`/`Jue 11`, brand-colored when soon ≤ tomorrow), ~2 time chips per day (brand-tint pills) + a **dashed `+N` chip**; chevrons page further out. Empty → one compact line ("Sin horarios próximos. Solicita el servicio para coordinar."). Slots are one-click → opens booking pre-selected.
- **Location selector** above the strip when the pro publishes hours at more than one place — a brand-tint `select` (dropdown), defaulting to the first; single-location shows a `MapPin` + label line, else "Próximos horarios". Dedupe by label.
- Grouped lists (e.g. the pro's own "Tus horarios próximos") group times by **Mañana (<12h) / Tarde (12–18h) / Noche (≥18h)** so dense lists are scannable; each part renders only when it has slots.
- **Private / contact-only:** shown as a compact **inline chip** in the card's chips row ("🔒 Coordina por WhatsApp" / "Solo WhatsApp") — NOT a full-width band — so it never adds card height; the availability column then renders just the compact WhatsApp/llamar actions (pinned to the bottom).

### Long forms — collapsible sections
Break long forms (pro profile, etc.) into **accordion sections** with a header + chevron. **First section open by default, the rest collapsed.** Group logically (e.g. Datos básicos · Profesión · Ubicación y cobertura · Contacto y precios · …). Keep the save bar always visible. This kills the endless single-column scroll.

### Home / landing page (Thumbtack-style — the single reference)
The home models **Thumbtack** (structure/patterns only, ContrataCR brand/content). Keep it focused — **less is more**. In order: **(1) Hero** — a **rotating-word headline** ("`<servicio>`, sin complicaciones." where the leading service word fades/slides through a short list) + the **primary search (service + location)** front and center + "Popular:" quick links; subtitle "Describe tu proyecto y te conectamos con el profesional perfecto."; then a **single fixed hero image** in a half-circle/dome (`borderRadius: 50% 50% 0 0 / 100% 100% 0 0`). **(2) Categorías** (Profesionales para cada proyecto — icon tabs + image cards). **(3) Trust benefits.** **(4) Zonas** (province chips). Then footer.
  - **Rotating-headline word list** = highest-demand CR services only: **Limpieza · Plomería · Electricidad · Jardinería · Pintura · Niñera · Mudanzas · Fumigación** (drop niche ones like Soldadura). Animation is a smooth fade/slide, ~2.5 s per word — elegant, not too fast.
  - **Swappable hero image:** the hero image is **ONE asset behind a single named constant** (`HERO_IMAGE = { src, alt }` at the top of `landing-hero.tsx`) so it can be replaced by editing one line — never per-category. A local **service professional at work** (never a foreign-looking house/mansion). *Per-category hero images that swap with the rotating word are a **future enhancement**, not now.* Final art will be a high-quality Costa Rican photo (self-host on Cloudinary when provided).
  - **Trust-benefits section:** ONE clean section of **3–4 client-facing benefit pillars** (icon in a brand-tint square + short title + one line) — communicate **benefits, not technical features**. Use: identidad verificada, reseñas reales (only clients who got the service review), coordina por WhatsApp, soporte. **Never** list internal mechanics (map, panels, project states, third-party booking) and **never invent numbers/ratings**.
  - **Zonas (zones ≠ categories):** the 7 provinces are quick-access chips → `/buscar?provincia=<id>` (feed the search). Heading "Encuentra profesionales en tu zona" — **do NOT claim coverage everywhere**.
  - **Home category cards:** ONE **self-hosted Cloudinary** image per category (folder `contratacr/categorias/<categoryId>`, delivered `f_auto,q_auto,c_fill,g_auto`). **Never hotlink external stock** (Unsplash/Pexels URLs break) — download/ingest license-safe stock into Cloudinary and reference only `res.cloudinary.com` URLs. Each image must clearly **match** its category (jardinería→garden, plomería→pipes…); no generic/duplicated images. Category **ids + labels come from the single taxonomy** (`src/lib/data/categories.ts`, `getCategoryLabel`) — only show categories you actually have matching imagery for, plus a "Ver todas las categorías" → /categorias.
- **HONEST COPY (legal/veracity rule):** for a newly-launched platform, **never overstate coverage, volume, ratings, or guarantees.** Banned: "cubrimos cada provincia y cantón", "en toda Costa Rica" as a coverage promise, invented review counts/stars, "garantizamos". Say "en tu zona / en distintas zonas", "te conectamos" (not "garantizamos"). ContrataCR is an **intermediary** — connects, doesn't guarantee outcomes.
- **Do NOT** add phone mockups, a "coming soon" app-store section, or a brand-logo strip (unaffiliated brand names imply a false partnership — a veracity/legal risk). **No US-style stock photos** (e.g. American suburban houses).
- Subtle scroll reveals only (`FadeInUp`); the page must feel fast.

### Informational / explainer pages (¿Cómo funciona?, Sobre nosotros, etc.)
Hero with a subtle brand glow (`radial-gradient … #EBF5FB`) — a badge eyebrow + bold headline + one-line subtitle. Body = a few focused sections alternating `bg-white` / `bg-[#f9fafb]` / `bg-[#EBF5FB]`. Reusable blocks: **numbered Step cards** (a `#009FD9` number chip on the card's top-left, an icon in a brand-tint square, title + desc) for processes; when a page serves **two audiences**, split into clearly-labeled **"Para clientes" / "Para profesionales"** sections, each with its own steps; **trust cards** (icon + title + honest copy); an **FAQ accordion** inside one bordered card (`divide-y`, chevron rotates, one open at a time) — for a full **Help Center**, add a search box that filters questions accent-insensitively (flat results while querying, **grouped by audience** — Para clientes / Para profesionales / Cuenta — otherwise) and a "Contactar soporte" + WhatsApp footer; and a **dark final CTA** band (`bg-[#1a2744]`) with the primary actions. Professional CTAs use `SmartRegisterLink` (logged-out → registration, logged-in → panel). Subtle `FadeInUp` reveals only. For a **browse/index page** (Categorías) add a live client-side search that filters items **accent-insensitively** (`normalizeText`) — flat results while querying, the grouped grid otherwise — plus a suggest-to-admin entry (`POST /api/categories/suggest`). The **professional recruitment landing** is `/para-profesionales` (hero value prop + session-aware CTA + benefits grid + 3-step recap + identity-verified trust band + dark final CTA); keep claims honest — ContrataCR is **free with no commissions** (never imply "pay-when-you-win" or guaranteed outcomes).

### Header, footer & utility pages
**Header** (`LandingNavbar`, Thumbtack-style): a clean **single-row, full-width** bar (no centered `max-w` container — content padded `px-4 sm:px-6 lg:px-8` so the **logo sits flush far-left**). Order: **logo (far left) → nav menus immediately after** (Interior ▾ · Exterior ▾ · Más servicios ▾ · Recursos ▾, hover mega-menus) → spacer → **far-right actions in this order: "Registrarse como profesional" (prominent pill) · "Iniciar sesión" · ES/EN toggle**. The **logged-in** state replaces the right actions with Mi panel + NotificationBell + avatar menu (+ idioma). **Scroll behavior:** an IntersectionObserver on `#hero-search-sentinel` (fallback `scrollY > 300`) collapses the header once the hero scrolls past so that **ONLY a single centered compact search bar** remains sticky at top (logo, nav menus and right-side buttons all hide — match Thumbtack); back at the top, the full header returns. The compact bar must be a **visual twin of the hero search bar** (same `rounded-[6px]` white bar, Search-icon + service input + divider + provincia select + "Buscar", same placeholder, same `max-w-5xl` centering) so it reads as the **same element "sticking" to the header** during the transition.

**Footer** (`bg-[#111827]`): brand blurb + socials, then link columns — Para clientes · Para profesionales · Soporte · **ContrataCR** (Sobre nosotros · Para profesionales · Términos · Privacidad) — and a bottom bar (© · Términos · Privacidad · "Hecho en Costa Rica"). **Header/footer "Registra tu perfil" must be session-aware** (→ panel when logged in; `SmartRegisterLink` or the same role check). **Legal pages** (`/terminos`, `/privacidad`) use a **clean legal-document layout** in a `max-w-3xl` column: (1) a visible **draft banner** (amber `border-amber-200 bg-amber-50 text-[#92400e]` with an `AlertTriangle`) stating the document is a **borrador pendiente de revisión por un abogado costarricense** and not legal advice — keep this until a lawyer signs off; (2) an `h1` + "Última actualización" line; (3) a **"Contenido" table of contents** (bordered `#f9fafb` card) of anchor links to each section; (4) **numbered sections** as `<section id>` with `scroll-mt-24`, an `h2` (`text-xl font-bold`) and `text-[#374151] leading-relaxed` paragraphs; (5) a support-contact box at the end. Legal copy is **ContrataCR-specific**, a **base draft only** (never present invented clauses as final/authoritative), keeps the **intermediary framing** (connects, doesn't guarantee outcomes/quality; identity verification confirms identity only; no commissions; payments off-platform; two-way reviews/reports) and references **Ley 8968** with data minimization. About pages (`/sobre-nosotros`) use a brand-glow title + prose sections. **404 / error** pages are friendly and on-brand with a clear path to home/search (never a raw failure screen). **Contact/support** (`/soporte`): a ticket form (name optional, email/subject/message required, attachments) that **prefills the logged-in user** and welcomes guests; it creates an **admin ticket** (`support_tickets`, visible in **Admin → Soporte**) and emails support, plus a **WhatsApp** option for urgent issues — set the expectation (reply by email < 24 h).

### Modals & drawers
Centered modal for focused tasks (booking); slide-over drawer for filters/secondary panels on small screens. Dismiss on click-outside / Escape. Keep them as compact as the content allows.

---

## 4. Density & sizing rules

Reference Hulihealth density: **a lot of useful information per screen, cleanly.**
- **No wasted vertical space.** Cards `p-4`, lists `gap-3/4`, page `py-6`. Don't pad for the sake of it.
- **Cap and overflow** instead of growing: long chip rows → `+N`; long slot lists → "+N más"; long text → `truncate` / `line-clamp-2`.
- **Uniform heights** in any list/grid (see cards). A short card must rise to match (`min-h`), a tall card must be bounded (caps), so the list reads as a tidy grid.
- **Compact controls:** `size="sm"` buttons in cards; tight selects; small pills for filters.
- **Legibility floor:** body stays `text-sm`; never shrink essential text below `text-xs`. Maintain contrast (text on white ≥ `#374151`; don't put `#9ca3af` on white for anything that must be read).
- **Mobile first:** everything must work one-handed on a phone. Stack to one column, keep tap targets ≥ ~32px, avoid horizontal scroll except intentional chip/slot strips.

---

## 5. Copy & voice

**Language: clear, normal Costa Rican Spanish — WITHOUT the imperative "vos" conjugation.** Use **standard imperatives** (the "tú"/standard form). This is the app-wide standard for ALL copy.

| ✅ Use (standard imperative) | ❌ Not (vos imperative) |
|---|---|
| Describe lo que necesitas | Describí lo que necesitás |
| Describe el servicio | Describí el servicio |
| Agrega | Agregá |
| Elige | Elegí |
| Marca | Marcá |
| Busca | Buscá |
| Activa / Desactiva | Activá / Desactivá |
| Guarda | Guardá |
| Selecciona | Seleccioná |
| Ingresa / Escribe | Ingresá / Escribí |
| Revisa | Revisá |
| Toca / Presiona | Tocá / Presioná |
| Confirma | Confirmá |
| Crea | Creá |
| Sube (una foto) | Subí |
| Continúa | Continuá |

Rules:
- **Imperatives → standard form** (drop the accented final syllable: `-á/-í/-é` → `-a/-e`). Verb roots that change (Elegí→Elige, Seguí→Sigue) use the normal form.
- This applies to **second-person verb forms aimed at the user** (buttons, instructions, hints, placeholders, empty states, errors). Don't "fix" unrelated words that merely end in an accent.
- Keep it **warm, plain, and short.** No jargon, no internal terms (never expose "/buscar" — say "los resultados de búsqueda"). Prefer concrete verbs ("Solicitar servicio") over vague ones.
- Sentence case, not Title Case, for sentences and most buttons. Costa Rican vocabulary is fine; just avoid the `vos` imperative.
- One idea per message. Errors say what's wrong **and** how to fix it, once.

When writing or editing ANY user-facing string, scan it against this list first.

---

## 6. Required-field convention (app-wide)

- **Every required field** shows a red **`*`** after its label.
- **Every optional field** shows **`(opcional)`** after its label (parenthesized — never bare "opcional", never "(requerido)").
- The only optional phone is a **third-party/beneficiary** contact; the account holder's own phone is required.
- No required field may submit empty — block with a **friendly Spanish inline error** (never a raw browser/DB error), and validate per field (email format, password rules, numeric phone, cédula format).
- Use the shared primitives that already render the `*`/`(opcional)` (`Input` label, `CedulaInput`/`IdentityField`, etc.) so it's consistent everywhere.

Reusable label pattern:
```tsx
<label className="text-sm font-medium text-[#374151]">
  Nombre completo <span className="text-red-500">*</span>
</label>
// optional:
Cantón <span className="text-[#6b7280] font-normal">(opcional)</span>
```

---

## 7. Process rule — this guide is mandatory

1. **Any** task that creates or changes UI, layout, components, or user-facing copy must **read `contratacr-design-guide.md` first** and conform to it.
2. Reuse the tokens and the shared primitives/patterns above before inventing new ones. New bespoke styles need a reason.
3. If you find existing UI that violates this guide while you're in the area, align it (within your task's scope) rather than copying the violation.
4. If the guide is missing or wrong for a real case, **update this file** in the same change (and note it in `contratacr-context.md`) so the standard stays single-source-of-truth.

The point is cohesion: a client should feel they're using **one** simple, well-made app on every screen.
