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
- **Identity zone (`flex-1`, left):** 52px avatar (initials on `#EBF5FB`, or photo) · **name + verified mark on ONE row** (see "Verified mark & tag hierarchy" below) · **business name** line · a row of **soft profession tags** · a **rating row** (one `#ff9b32` star + value + "· N reseñas", or "Sin reseñas todavía") · **location** line (`MapPin`) + **coverage** line (`Truck`), each truncating · **"Ver casos de éxito (N)"** pinned to the bottom (`mt-auto`). No bio.
- **Action zone (`md:w-[232px]`, left border):** a **price header** ("Desde ₡14 000/hora" — `Desde` eyebrow + value, `pr-9 md:pr-10` clears the favorite), then the availability panel (below) with the **"Solicitar servicio"** CTA pinned to the bottom — **identical on every card** (same size/style); the WhatsApp/llamar secondary icons sit to its right (see Availability "Action row").

**Verified mark & tag hierarchy (trust ≠ category — don't make them look alike):**
- **Verified mark goes to the RIGHT of the NAME** (where the eye looks for a trust mark), as a **subtle icon + label, NOT a bordered pill**: verified → `ShieldCheck` `h-4` + "Verificado" in green `#16a34a`; unverified → `ShieldAlert` + "Sin verificar" in amber `#b45309`. `shrink-0` so the name truncates first.
- **Profession tags** are **soft, muted, few**: `rounded-full bg-[#f3f4f6] text-[#6b7280] px-2 py-0.5 text-[11px]` (NO heavy brand border), **capped at 2** + a muted `+N`. They read as categories, clearly distinct from the green trust mark — avoid a wall of identical heavy-bordered pills. Contact-only ("Coordina por WhatsApp"/"Solo WhatsApp", `Lock`) and `featured` are soft no-border tinted chips in the same row.
- Numbered cards **1..N** mirrored on numbered map pins; pin hover adds `ring-2 ring-[#009FD9]` + scrolls the card (map reaches it via `#pro-card-<id>`). Number badge top-left (`top-2.5 left-2.5`); a **small, subtle favorite** (`w-7 h-7`, white/subtle border, `Bookmark`) top-right (`top-2.5 right-2.5`) — consistent on every card. The name (`pr-9 md:pr-0`) and the price row (`pr-9 md:pr-10`) clear the favorite so it **never overlaps**, on desktop or mobile.
- Overflow always **truncates/collapses ("+N")**.
- **Icons:** keep them **small, few, and from ONE set** (lucide `h-3`–`h-4`, muted, mostly brand/`#9ca3af`) so they aid scanning without looking busy — the **only** exception is the official `WhatsAppIcon` for the WhatsApp action. Don't mix icon families or oversize them.

### Availability display (Hulihealth-style)
- **Packed day columns** (3 at a time): show only upcoming days that **actually have bookable slots** (no "—" filler), with **uppercase** labels (`Hoy`/`Mañana`/`Jue 11`, brand-colored when soon ≤ tomorrow), ~2 time chips per day (brand-tint pills) + a **dashed `+N` chip**; chevrons page further out. Empty → one compact line ("Sin horarios próximos. Solicita el servicio para coordinar."). Slots are one-click → opens booking pre-selected.
- **Location selector** above the strip when the pro publishes hours at more than one place — a brand-tint `select` (dropdown), defaulting to the first; single-location shows a `MapPin` + label line, else "Próximos horarios". Dedupe by label.
- Grouped lists (e.g. the pro's own "Tus horarios próximos") group times by **Mañana (<12h) / Tarde (12–18h) / Noche (≥18h)** so dense lists are scannable; each part renders only when it has slots.
- **Action button** (bottom of the availability panel): **"Solicitar servicio"** is a **single FULL-WIDTH primary** (`w-full`), identical on every card. The **direct-contact icons do NOT sit beside it** (that would vary card width / tempt a second row). Instead the **WhatsApp + call icon-buttons live in the card's TOP row, next to the name** (`h-7 w-7`, official `WhatsAppIcon` green-outline + `Phone` neutral, pushed right with `ml-auto`) — reusing existing horizontal space so **the card never grows taller**. They show only when enabled (WhatsApp when bookable + not appointments-only; call when `allowPhoneCall`); their presence/absence must not change card height or the button size. Contact-only (private / WhatsApp-only) cards show a **full-width "Solicitar por WhatsApp"** primary instead (the call icon, if any, is in the top row).
- **Verified wording:** the trust mark reads **"Identidad verificada"** (green `ShieldCheck`) on cards and profiles (unverified → amber `ShieldAlert` "Sin verificar"). Keep it a small icon+label, visually distinct from profession chips.
- **Category labels must never leak raw i18n keys:** if `tCat(id)` returns a `"categories.xxx"` path (missing message), fall back to `getCategoryLabel(id)` from the taxonomy (e.g. `otro` → "Otro servicio"). The `otro` key is now in `messages/{es,en}.json`.
- **Private / contact-only:** shown as a compact **inline chip** in the card's chips row ("🔒 Coordina por WhatsApp" / "Solo WhatsApp") — NOT a full-width band — so it never adds card height; the availability column then renders just the compact WhatsApp/llamar actions (pinned to the bottom).

### Overlays must never be clipped by parents
Dropdowns, autocompletes, popovers and menus **must render in a portal to `document.body`** (or otherwise escape the layout) so a parent with `overflow:hidden/auto` (cards, **accordion `Section`s** whose open animation clips), or a low stacking context, can't crop them. Pattern (see `CategorySearch`): position the panel **`fixed`** from the trigger's `getBoundingClientRect()`, recompute on `scroll` (capture) + `resize`, **flip up** when there's more room above than below, cap `max-height` to the available space (its own list scrolls), high `z-index`, and treat the portaled panel as "inside" for outside-click detection. Never rely on `absolute` positioning inside a clipping container for an overlay.

### Long forms — collapsible sections
Break long forms (pro profile, etc.) into **accordion sections** with a header + chevron. **First section open by default, the rest collapsed.** Group logically (e.g. Datos básicos · Profesión · Ubicación y cobertura · Contacto y precios · …). Keep the save bar always visible. This kills the endless single-column scroll.

### Home / landing page (Thumbtack-style — the single reference)
The home models **Thumbtack/Bark** (structure/patterns only, ContrataCR brand/content). Keep it focused — **less is more**. In order: **(1) Hero** — a **rotating-word headline** ("`<servicio>`, sin complicaciones." where the leading service word fades/slides through a short list) + the **primary search (service + location)** front and center + "Popular:" quick links; subtitle "Describe tu proyecto y te conectamos con el profesional perfecto."; then a **single fixed hero image** in a half-circle/dome (`borderRadius: 50% 50% 0 0 / 100% 100% 0 0`). **(2) Categorías** (Profesionales para cada proyecto — two-row carousel). **(3) Así funciona ContrataCR** (`why-contratacr.tsx` — the merged how-it-works + trust + **professional pitch** sticky-phone story). **(4) Zonas** (Encuentra profesionales en tu zona — interactive CR map). Then footer. (The home now consolidates to these; the standalone "Haz crecer tu negocio" section is folded in as the final sticky-phone point.) Each section opens with the same **eyebrow chip** (brand-tint pill + dot + UPPERCASE label, e.g. `ASÍ DE FÁCIL` / `CONFIANZA` / `COBERTURA LOCAL` / `PARA PROFESIONALES`) above the bold `#1a2744` heading + one-line gray subtitle.
  - **The four home content sections must each have a DISTINCT treatment** (don't repeat one card-row pattern). Current distinct designs:
    - **Así funciona ContrataCR (`why-contratacr.tsx`) — ONE-phone app showcase** merging ALL THREE old sections (Contrata en tres pasos + Contrata con tranquilidad + Haz crecer tu negocio): `bg-white`, centered header, two columns. One side = **a single phone that FLOATS on the section background** (`PhoneFrame` + `ResultsScreen`, the most representative app screen) — **no container/box behind it**, just a subtle blurred **ground shadow** for depth. Other side = **all the info organized as a clean list** of 4 points (Describe tu proyecto · Profesionales verificados · Coordina por WhatsApp · Con soporte) with **light brand-tint icon tiles** (`bg-[#EBF5FB] text-[#009FD9] ring-1 ring-[#dcebf6]` — soft/refined, NOT heavy dark/black circles), plus a **professional pitch box** ("¿Ofreces servicios?" → `SmartRegisterLink` "Registrarse como profesional" + "Cómo funciona" link). On mobile the phone shows first (`order-1`), info second. Server component (no scroll logic). Phone screen is **easy to swap for a short screen-recording video / real screenshot** later. The standalone tres-pasos / trust-benefits / grow-business components + the cutout-handshake image are retired by this merge.
  - **Cutout-image pattern (transparent PNG of a person, no rectangular bg):** source a **commercially-usable** photo (Unsplash license) of an on-brand person, ingest to **Cloudinary**, and remove the background with the **`e_background_removal` transform** (AI add-on is enabled on cloud `dxxrjx2go`); re-ingest the result as a stable flat PNG (`contratacr/home/<name>.png`). Place it `object-contain object-bottom` over a **soft brand shape/glow** (never a hard rectangle) so it reads as a clean cutout with depth. Swappable via one `PRO_IMAGE`/`PHONE_SCREEN`-style constant. Avoid foreign-/US-looking stock; prefer warm, approachable, plausibly-Costa-Rican subjects. **To make a cutout:** upload the source URL to Cloudinary, deliver `…/e_background_removal/f_png/…`, **view it (the Read tool renders images) to verify subject + clean edges**, then re-upload that URL as the final asset.
    - **Find-by-zone (Encuentra profesionales en tu zona) — interactive Costa Rica MAP:** a real SVG map of CR (7 provinces as clickable `<path>`s from `src/lib/data/cr-map-paths.ts`, generated from free amCharts geodata, equirectangular projection, Cocos Island dropped). Click/hover/keyboard-select a province → it highlights (active `#009FD9`, hover `#93cde9`, has-coverage `#bfe3f5`, none `#dbe4ee`) and the right panel shows that province's **real cantón coverage** + count + "Ver profesionales" + cantón chips, plus "Usar mi ubicación" geolocation and the honest disclaimer. Touch-friendly province **pills** under the map mirror the selection. Province colour encodes real coverage (provinces with pros are tinted brand, empty ones grey) — honest, never fabricated.
    - **Grow-business (Haz crecer tu negocio) — dark PRODUCT SHOWCASE with a phone mockup:** full dark `bg-[#111a2e]` section (layered brand radial glows), pitch + perk rows + session-aware CTAs on the left, a **fixed phone mockup of the real app** on the right (see phone-mockup pattern). Honest: free, no commissions.
  - **Phone-mockup pattern (`PhoneFrame` in `phone-screens.tsx`):** a **premium, realistic** device frame — a **titanium-style metal rail** (light→dark→light gradient) around a thin **black bezel**, a crisp white screen (`rounded-[41px]`), a **dynamic island**, subtle **side buttons**, a real status bar (signal bars + battery), and **layered shadows** for depth. It **floats** on the section (no box/container behind — just a soft blurred ground shadow). Inside it renders an on-brand recreation of a **REAL ContrataCR screen** (`phone-screens.tsx` exports Search/Results/Chat/Support/Pro). The in-phone app bar uses the **NEW ContrataCR logo** — the CR **mark** (`/logo-mark.png`) + "ContrataCR" wordmark in **Poppins**, "Contrata" navy + "CR" brand blue `#008ce0`. **Never fake a generic/unrelated screen** — illustrative sample data only, no platform-wide stat claims. Each screen is **easy to swap for a real screenshot or a short screen-recording video** later.
  - **DEPTH/CONTRAST STANDARD (avoid flat white boxes):** every home content section carries intentional depth — a **layered/gradient (or dark) section background**, **elevated cards** (`rounded-3xl`, `shadow-[0_10px_40px_rgba(16,39,68,0.06)]` → deeper on hover), **an accent color with presence** (gradient icon tiles, accent bars, soft radial glows), clear **type hierarchy** (eyebrow chip → bold `#1a2744` heading → gray subtitle), and **subtle staggered reveal-on-scroll + smooth hover lift/scale**. Keep it elegant and fast (transform/opacity only).
  - **CTA profesional (Haz crecer tu negocio):** a single **dark `#1a2744` rounded panel** (radial brand glow accent) — pitch + two CTAs on the left (**`SmartRegisterLink` "Registrarse como profesional"** session-aware: logged-out → registration, logged-in → panel; + white "Cómo funciona" → /como-funciona), 3 perk rows on the right (100% gratis · Destácate con tu verificación · Clientes que te contactan directo). Honest only — **free, no commissions** (never imply pay-when-you-win or guaranteed leads).
  - **Rotating-headline word list** = highest-demand CR services only: **Limpieza · Plomería · Electricidad · Jardinería · Pintura · Niñera · Mudanzas · Fumigación** (drop niche ones like Soldadura).
  - **Rotating-word animation = PER-LETTER staggered VERTICAL SLIDE-UP** (`RotatingLine` in `landing-hero.tsx`): each **letter** rises from below into place **one after another, left → right** (staggered, not the whole word at once), the word **holds** fully visible (~1.4s), then each letter slides **up and out** in the same staggered order as the next word's letters roll in. Implementation: a **clipping mask** (`flex justify-center; overflow-hidden`, height `1.18em` ≈ one line, room for accents like í/J) of per-letter `inline-block` spans (keyed `${index}-${i}` so each word's letters are fresh nodes). State machine per word: reset letters below (`translateY(110%)`, no transition) → `requestAnimationFrame`×2 → enter (`translateY(0)`, springy `cubic-bezier(0.16,1,0.3,1)`, `LETTER_MS=520` + `transitionDelay i·STAGGER_MS(46)`) → hold → exit (`translateY(-110%)`, same stagger) → next index. **NO typewriter, NO caret/pipe.** The line is `justify-center` so the word stays **horizontally CENTERED** above the static `sin complicaciones.` line (no layout shift as length changes). **Respects `prefers-reduced-motion`** → a static word, no animation. Pacing comfortable/elegant.
  - **Swappable hero image:** the hero image is **ONE asset behind a single named constant** (`HERO_IMAGE = { src, alt }` at the top of `landing-hero.tsx`) so it can be replaced by editing one line — never per-category. A local **service professional at work** (never a foreign-looking house/mansion). *Per-category hero images that swap with the rotating word are a **future enhancement**, not now.* Final art will be a high-quality Costa Rican photo (self-host on Cloudinary when provided).
  - **Trust-benefits section:** ONE clean section of **3–4 client-facing benefit pillars** (icon in a brand-tint square + short title + one line) — communicate **benefits, not technical features**. Use: identidad verificada, reseñas reales (only clients who got the service review), coordina por WhatsApp, soporte. **Never** list internal mechanics (map, panels, project states, third-party booking) and **never invent numbers/ratings**.
  - **Zonas / find-by-zone (Encuentra profesionales en tu zona):** a two-pane `rounded-3xl` panel — a **dark left rail** ("¿Dónde lo necesitas?" + **"Usar mi ubicación"** button → geolocation → `/buscar?sortBy=cercania&lat&lng`, with the honest disclaimer "No prometemos cobertura en todo el país…") and a **white right pane** with the **7 province tabs** (select feeds the search) → the active province's **cantón chips** → `/buscar?provincia=<id>&canton=<id>`, plus "Ver profesionales".
    - **REAL-COVERAGE RULE (veracity — no fake counts):** the "N cantones con cobertura" count and the cantón chips must reflect **only zones that genuinely have ≥1 listed professional**. Compute this server-side with **`getZoneCoverage()`** (in `src/lib/queries/professionals.ts`) — it mirrors /buscar search semantics (fixed `canton_id`/`provincia_id` + denormalized `search_cantones`/`search_provincias` + whole-province `coverage_provincias` + whole-country `coverage_country`) and returns `{ byProvince, countryWide }`. **Never hardcode a count.** A province with zero coverage shows an **honest empty state** ("Aún no hay profesionales en {provincia}…") with a "Ver todos los profesionales" escape, and the count is hidden. Only `countryWide` pros expand a province to all its cantones. Keep "do NOT claim coverage everywhere".
  - **Home category cards:** ONE **self-hosted Cloudinary** image per category (folder `contratacr/categorias/<categoryId>`, delivered `f_auto,q_auto,c_fill,g_auto`). **Never hotlink external stock** (Unsplash/Pexels URLs break) — download/ingest license-safe stock into Cloudinary and reference only `res.cloudinary.com` URLs. Each image must clearly **match** its category (jardinería→garden, plomería→pipes…); no generic/duplicated images. Category **ids + labels come from the single taxonomy** (`src/lib/data/categories.ts`, `getCategoryLabel`) — only show categories you actually have matching imagery for, plus a "Ver todas las categorías" → /categorias.
  - **Category carousel — ONE staggered (zigzag) track** (`category-carousel.tsx`, client; `pros-section.tsx` is the heading wrapper): it is a **single horizontal carousel**, NOT two rows. All cards live in **one track** that moves together as one unit; the alternating up/down vertical offset (`translateY(±18px)` on even/odd cards) is **purely visual zigzag** — horizontally it's one continuous strip. **Spec (keep all of it):**
    1. **One track, moves as a unit** — never two independent rows / never opposite directions. A single JS-driven scroller (`scrollLeft`).
    2. **Auto + manual (motion is TRANSFORM-based, not native scroll; TIME-based for mobile smoothness)** — auto-scrolls via rAF advancing a **float `translateX` accumulator** on the track by **elapsed time** (`pos -= AUTO_SPEED(0.019 px/ms) * dt`, `dt` capped at 50ms) so the speed is **identical on 60/90/120 Hz** and **dropped frames don't slow it** (≈19px/s everywhere). Earlier per-frame px stepping made it slower/janky on phones. **Do NOT drive auto-scroll by incrementing `scrollLeft`** — browsers round `scrollLeft` to integers, so a sub-pixel/frame step never accumulates and the carousel sits dead-still (this was the "it doesn't move" bug). The user can **also drive it**: mouse/touch **drag** (pointer events update the same `pos`), or the **left/right arrow buttons** (an eased rAF tween of `pos`, `hidden md:flex` — swipe on mobile). Auto **pauses on hover and during any interaction (drag/tween)**, then resumes. A real drag suppresses the trailing click so it doesn't navigate. `touch-action: pan-y` so vertical page scroll still works while horizontal drags arrive as pointer events. Respects **`prefers-reduced-motion`** (auto off; manual still works).
    3. **Seamless loop, no on-screen duplicates** — the track renders the full set **twice**; `pos` is wrapped into `[-half, 0]` (`half = scrollWidth/2`, re-measured via `ResizeObserver` as images paint) so the wrap is invisible. Spacing is a per-card **right-margin (`mr-4 sm:mr-6`), NOT flex `gap`**, so one set width is exact. Because it's ONE track with all categories, a single set is far wider than any viewport — the duplicate set is always off-screen, so a category is never visible twice.
    4. **Uniform RECTANGULAR cards (Bark-like landscape)** — every card is the **EXACT same fixed size**, a **landscape rectangle wider than tall** (`w-[248px] h-[168px] sm:w-[300px] sm:h-[200px]`, ~3:2 — NOT square) regardless of label length; long labels **clamp to 2 lines** (`line-clamp-2`), never widening the card. Cloudinary delivery is landscape-cropped (`w_640,h_440`). **Subtle corner rounding only** — `rounded-lg` (near-square corners, not the old `rounded-2xl`). Soft constant shadow, dark bottom gradient + white label. **Hover = the whole card SCALES UP** (`transition-transform … hover:scale-[1.04] hover:z-10`) — a gentle smooth zoom of the entire card, **not** a shadow/translateY change and **not** an inner-image-only zoom. ONE self-hosted Cloudinary image per id; **no "Disponible en línea"/"available online" badge anywhere**. Zigzag = `translateY(±20px)` on even/odd cards (the hover-scale composes with this fine because it's a child transform).
    5. **Reduced-motion** — `prefers-reduced-motion: reduce` → **no auto-scroll** (manual drag/swipe/arrows still work). Soft **edge `mask-image`** fade at the rails; scrollbar hidden. Vertical padding on the track so the zigzag offset + hover lift never clip. Each card → `/buscar?categoria=<id>`.
    6. **MOBILE PERFORMANCE (non-negotiable):** **`will-change`/3d ONLY on the moving track**, NEVER per-card — promoting all ~38 cards to their own GPU layers choked mobile; cards paint into the single track layer (hover scale still auto-promotes on desktop). Images: `next/image` + `f_auto,q_auto`, modest base (`w_600,h_400`), `loading="lazy"`, **mobile-aware `sizes`** (`(max-width:640px) 250px, 300px`); lighter shadow on small screens. Animate **only `transform` (translate3d)** — never layout props.
- **SERIOUS / RESTRAINED ICON TONE (user preference):** ContrataCR is a serious app — **prefer NOT decorating with icons; when an icon is used, keep it monochrome (grey/black, e.g. `text-[#1a2744]`/`#374151` on a neutral `#f3f4f6` tile), not colorful.** Avoid playful multi-color gradient icon tiles in content sections. (Functional/brand marks are exempt where meaning depends on color: the green verification `ShieldCheck`, the rating star, the official WhatsApp green, the primary brand-blue CTA buttons.) Newer home work should lean on **typography, real photography (cutouts), spacing and depth** rather than colored iconography.
- **HONEST COPY (legal/veracity rule):** for a newly-launched platform, **never overstate coverage, volume, ratings, or guarantees.** Banned: "cubrimos cada provincia y cantón", "en toda Costa Rica" as a coverage promise, invented review counts/stars, "garantizamos". Say "en tu zona / en distintas zonas", "te conectamos" (not "garantizamos"). ContrataCR is an **intermediary** — connects, doesn't guarantee outcomes.
- **Do NOT** add phone mockups, a "coming soon" app-store section, or a brand-logo strip (unaffiliated brand names imply a false partnership — a veracity/legal risk). **No US-style stock photos** (e.g. American suburban houses).
- Subtle scroll reveals only (`FadeInUp`); the page must feel fast.

### Informational / explainer pages (¿Cómo funciona?, Sobre nosotros, etc.)
Hero with a subtle brand glow (`radial-gradient … #EBF5FB`) — a badge eyebrow + bold headline + one-line subtitle. Body = a few focused sections alternating `bg-white` / `bg-[#f9fafb]` / `bg-[#EBF5FB]`. Reusable blocks: **numbered Step cards** (a `#009FD9` number chip on the card's top-left, an icon in a brand-tint square, title + desc) for processes; when a page serves **two audiences**, split into clearly-labeled **"Para clientes" / "Para profesionales"** sections, each with its own steps; **trust cards** (icon + title + honest copy); an **FAQ accordion** inside one bordered card (`divide-y`, chevron rotates, one open at a time) — for a full **Help Center**, add a search box that filters questions accent-insensitively (flat results while querying, **grouped by audience** — Para clientes / Para profesionales / Cuenta — otherwise) and a "Contactar soporte" + WhatsApp footer; and a **dark final CTA** band (`bg-[#1a2744]`) with the primary actions. Professional CTAs use `SmartRegisterLink` (logged-out → registration, logged-in → panel). Subtle `FadeInUp` reveals only. For a **browse/index page** (Categorías) add a live client-side search that filters items **accent-insensitively** (`normalizeText`) — flat results while querying, the grouped grid otherwise — plus a suggest-to-admin entry (`POST /api/categories/suggest`). The **professional recruitment landing** is `/para-profesionales` (hero value prop + session-aware CTA + benefits grid + 3-step recap + identity-verified trust band + dark final CTA); keep claims honest — ContrataCR is **free with no commissions** (never imply "pay-when-you-win" or guaranteed outcomes).

### Transactional / auth emails (Supabase)
Branded HTML templates live in **`supabase/email-templates/`** (paste into Supabase → Authentication → Email Templates). Spec: **table-based layout + inline CSS only** (Gmail/Outlook safe, no external CSS/JS/SVG); white card (`#ffffff`, `border-radius:16px`) on `#f4f7fa`; **logo PNG from a public URL** (`…/contratacr/brand/email-logo.png` — the navy+blue mark, good on white) + "ContrataCR" wordmark in an **Arial/Helvetica** stack (Poppins isn't email-safe); **heading/text `#162543`, button/links/accents `#008ce0`**; bulletproof `<a>` button in a `bgcolor` table cell; a copy-paste fallback link; an "ignora este correo" safety note; honest footer "ContrataCR — Encuentra y contrata profesionales en Costa Rica". Spanish, no "vos". **Never edit the `{{ .Variable }}` tokens** (`.ConfirmationURL`, `.Token`, `.Email`, `.NewEmail`) — they generate the real links.

### Brand assets & logo usage
- **Source files** live in `/marca` (favicon package, `logo.svg`, OG image); the integrated/served copies live in **`/public`**. The brand **mark** is a square two-tone "CR" monogram (light blue `#009FD9` + navy `#1a2744`); the **wordmark** is "Contrata" (navy) + "CR" (blue).
- **Use the small `logo-mark.png` (+`@2x`) for on-page logos** (header/footer/compact), NOT the raw `logo.svg` — the SVG is ~1.1 MB (embedded raster) and too heavy to load per page; keep it in `/public/logo.svg` only for large/print/crisp needs.
- **`ContrataCRLogo`** (in `landing-navbar.tsx`) = **mark + wordmark**; pass **`chip`** on dark backgrounds (footer) to seat the mark in a small white rounded square for contrast. Optional **`size`** — `md` (default: mark `h-7`, wordmark `text-[17px]`) for footer/legacy, or **`size="lg"` for the main header** (mark `h-8 → sm:h-9`, wordmark `text-[19px] → sm:text-[22px]`, `gap-2.5`) so the brand has presence balanced against the nav menus within the `h-16` header. **`ContrataCRMark`** = the icon alone (used in the **compact/scrolled header** at `h-9 w-9`, pinned left so the search stays centered). Crispness comes from the `@2x` (512px) mark, so it stays sharp at the larger header size. Both the app-wide `LandingNavbar` and the legacy `layout/navbar` render `ContrataCRLogo`, so login / 404 / dashboards inherit it.
- **Favicons & PWA:** the full package is wired via `metadata` in `[locale]/layout.tsx` — `favicon.ico` + `favicon-96x96.png` + `apple-touch-icon.png` (180) + `manifest: /site.webmanifest` (192/512 maskable). `src/app/favicon.ico` is also the brand icon.
- **Open Graph / social:** `metadataBase = https://contratacr.com`; `og:image = /og-image.png` (1200×630), `og:title`/`twitter` = "ContrataCR" + honest description "Encuentra y contrata profesionales en Costa Rica", `twitter:card = summary_large_image`. Keep titles/descriptions honest — no coverage/volume claims.

### Header, footer & utility pages
**Header** (`LandingNavbar`, Thumbtack-style): **the ONE header for the whole app** — marketing pages AND /buscar use the same `LandingNavbar` so the header is identical everywhere (it's `fixed`, so a non-marketing page like /buscar reserves its height with an `h-16` spacer). A clean **single-row, full-width** bar (no centered `max-w` container — content padded `px-4 sm:px-6 lg:px-8` so the **logo sits flush far-left**). Order: **logo (far left) → nav menus immediately after** (Interior ▾ · Exterior ▾ · Más servicios ▾ · Recursos ▾, hover mega-menus) → spacer → **far-right actions in this order: "Registrarse como profesional" (prominent pill) · "Iniciar sesión" · ES/EN toggle**. The **logged-in** state replaces the right actions with Mi panel + NotificationBell + avatar menu (+ idioma). **Scroll behavior:** an IntersectionObserver on `#hero-search-sentinel` (fallback `scrollY > 300`) collapses the header once the hero scrolls past so that **ONLY a single centered compact search bar** remains sticky at top (logo, nav menus and right-side buttons all hide — match Thumbtack); back at the top, the full header returns. The compact bar must be a **visual twin of the hero search bar** (same `rounded-[6px]` white bar, Search-icon + service input + divider + provincia select + "Buscar", same placeholder, same `max-w-5xl` centering) so it reads as the **same element "sticking" to the header** during the transition.

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
