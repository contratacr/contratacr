# ContrataCR — Design & UX Guide

> **READ THIS FIRST.** Every task that touches UI, layout, copy, or visual design **must read this file before writing any code** and conform to it. If a change would contradict this guide, follow the guide (or, if the guide is genuinely wrong for the case, note it and update this file in the same change). The goal is a single, cohesive, dead-simple product — not many locally-clever screens.

ContrataCR is a Costa Rican services marketplace (clients find and book professionals). Our users value apps that are **very easy and intuitive**. The reference for structure and UX patterns is a clean service-directory experience in the spirit of **Hulihealth** (well-organized search with a results list + map, compact information-dense cards, clear availability). We replicate the **structure and patterns**, never their code, assets, or brand — everything uses ContrataCR's own brand, colors, content, and features.

> **The unified design system (authoritative).** Two values rank above all: **(1) EASE OF USE** — every screen must be effortless for any Costa Rican, tech-savvy or not; **(2) CONSISTENCY** — the same patterns everywhere, so it always feels like ONE app. **The home page (`/`) is the quality bar** — the screen we're happiest with; new/edited screens should feel like they belong next to it (brand: navy `#1a2744`/`#162543`, blue `#009FD9`/`#008ce0`, Poppins-style bold wordmark). The canonical kit every screen composes from: **tokens in §2** (color, type scale, spacing, radius) + the **shared primitives** `Button` · `Input`/`Select` · `Badge` · `Card` · `Avatar` (already conform — reuse, don't re-derive), the **one app-wide `LandingNavbar` + `LandingFooter`** (§"Header, footer"), and the **shared patterns** in §3 (cards, lists, modals, empty/feedback states). **Feedback is inline, not toasts** (there is no toast library by design): inline error/success blocks + the always-visible autosave status line (§"Save feedback"). When a screen looks "off", it's almost always a §2.Radius violation (nested bordered boxes) or a bespoke control that should have been a primitive — fix it toward this standard.

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

## 1.5 Usability hard rules (R1–R10) — non-negotiable

These are **enforceable acceptance criteria**, not suggestions. Every screen must pass all ten; a violation is a bug to fix, not a style preference. Audit any screen you touch against this list.

- **R1 — No nested bordered containers.** Max ONE level of bordered card per content block. A bordered card inside a bordered card (inside a bordered card) is forbidden. For inner structure use spacing, dividers (`border-t border-[#f3f4f6]`), or typography — not another box. (Tinted callouts like the amber notice count as a border level.)
- **R2 — No truncation/overflow at 360px.** Names, labels, placeholders, buttons, and chips must show fully at ~360px: wrap, shrink, or reflow. Never `…`/cut-off on critical info (a person's name, a price, a primary button label). `truncate` is allowed only on genuinely secondary, repeated metadata — never on the one thing the user needs.
- **R3 — One obvious primary action.** Every screen answers "what do I do here" with exactly ONE visually dominant primary (filled brand) button, reachable in ≤2 clicks from its section. Everything else is secondary/quiet.
- **R4 — No dead ends.** Every screen/state has an obvious way back/forward (back to panel, continue, cancel). Every empty state = a message + a next action (button/link), never a blank area.
- **R5 — No unexplained controls.** Every toggle/checkbox/icon-button has a visible label or immediate explanation. No mystery icons (a lone check/x/lock without text or an `aria-label` + tooltip).
- **R6 — Forms.** Required fields marked (`*`); correct mobile keyboards (`inputMode`/`type`/`autoComplete`); errors shown inline next to the field in friendly Costa Rican Spanish (no voseo); submit button always visible/reachable on mobile (never off-screen or behind overflow).
- **R7 — Consistency.** The same element looks and behaves the same everywhere — one button set, one chip style, one card pattern, one filter-tab pattern. Same-purpose sections across the two dashboards share the same layout pattern.
- **R8 — Feedback.** Every action gives immediate feedback (saving/saved, sent, error). No silent saves, no ambiguity about success. Use inline blocks + the autosave status line — never leave the user guessing.
- **R9 — Dismissal & selection.** Click-outside closes dropdowns/popovers/autocompletes; ESC closes modals; tapping a suggestion fills the field (it never auto-executes a search or submit).
- **R10 — English parity.** Anything you touch must be fully bilingual: no Spanish leaking into EN, no layout breaking with longer English strings. (Admin panel is the sole Spanish-only exception.)

**Off-limits to UI/usability passes:** the cédula/padrón verification flow (`/api/cedula/[id]`, `identity-verifier.ts`, `run-verification.ts`, the `IdentityField` fetch/branching), auth, booking, and payment logic. If a usability fix would require touching those, **flag it — do not change it.**

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
- **No nested bordered containers (standing rule).** Never wrap a bordered card inside another bordered card inside a bordered section ("boxes within boxes") — it reads cluttered and dated. **At most ONE border level deep** in any region. Separate content with **spacing, a light divider (`border-t border-[#f3f4f6]`), or typographic hierarchy (heading + muted subtext)** — not another box. Concretely: a dashboard section heading sits **directly on the page** (`#fafafa`), not inside its own card; the section's body brings only the light containers it genuinely needs (e.g. individual list/feed items, each a single bordered card). Sub-blocks of a form (e.g. "Tus profesiones" / "Tus servicios") must be styled **consistently** — either both plain (divider-separated) or both a single subtle surface — never one boxed and the other not. Prefer a soft tint surface (`bg-[#f9fafb]`, no border) over a hard border when you need to group. Apply this to BOTH dashboards and the public profile.

### Components & standards

**Success-confirmation icon** — use the shared **`<SuccessIcon size={…} />`** (`components/ui/success-icon.tsx`) on EVERY "creado / enviado / completado" confirmation screen (support modal + public /soporte, /reset-password, booking success, /registro/cliente, leave-review + report-profile modals, …). It's the on-brand "check on a light tint of the same blue" badge: a pale brand-blue circle (`#EBF5FB`) + a subtle inset brand ring (`ring-[#009FD9]/20`) + a soft brand-blue glow + a bold `#009FD9` `Check`. **Do NOT** hand-roll a grey circle or a bare green check — always reuse `SuccessIcon` so all confirmations look identical (Sprint 158).

**"Check your spam" reminder** — on EVERY screen that tells the user to look in their email (OTP/verification, sign-up confirmation, password-recovery "email sent", email-change confirmation, support ticket created, the navbar login-modal "¡Revisa tu correo!"), drop the shared **`<SpamNotice className?/>`** (`components/ui/spam-notice.tsx`) directly UNDER the "check your email" line. It's subtle grey `text-xs text-[#9ca3af]` with ONE shared wording (`common.spamNotice`, es+en). Some providers (Outlook) spam our mail, so this prevents "it never arrived" confusion. **Do NOT** hand-write per-screen spam sentences (they drift) — always reuse `SpamNotice` (Sprint 201).

**"Revisa tu correo" screens get a RESEND option (Sprint 254).** Any "we sent you an email" screen (password-reset sent, email-change pending) shows, under the `SpamNotice`, a muted **"¿No te llegó el correo?"** + a **"Reenviar correo"** button backed by the shared **`useResendCooldown(seconds=30)`** hook: a live countdown disables it for a brief wait after each send (`"Reenviar en {n} s"`), then re-enables it; a successful resend shows **"Correo reenviado"**. Strings live in the **`common`** namespace (`resend`/`resendIn`/`resending`/`resent`/`resendPrompt`) so every screen is identical — don't re-roll a per-screen resend.

**Forgot-password is NEUTRAL — never reveal whether an email is registered (anti-enumeration).** The reset "sent" screen shows the SAME message for ANY email — **"Si hay una cuenta asociada a ese correo, te enviaremos un enlace…"** (NOT "Correo enviado", which would confirm existence). Supabase `resetPasswordForEmail` already returns success regardless of existence, so the email only actually sends when the account exists — but the UI copy must stay conditional. (Contrast: the LOGIN screen MAY be method-specific — "Esta cuenta usa Google" — because the user is proving they know the password; forgot-password has no such proof, so it must stay neutral.)

**Buttons** (`Button` component). Clear hierarchy, **compact sizing by default**:
- **Primary** — `variant="default"` (filled brand `#009FD9`). Exactly one per context. The main action ("Solicitar servicio", "Generar", "Guardar").
- **Secondary** — `variant="secondary"` (white, brand border/text) or `variant="outline"` (neutral). Supporting actions.
- **Ghost** — `variant="ghost"` for low-emphasis/tertiary (icon buttons, "Cancelar").
- **WhatsApp** — `variant="whatsapp"` only for the WhatsApp contact action.
- **Size:** default to **`size="sm"`** (`h-8 px-3 text-xs`) for in-card / dense contexts and **`size="md"`** (`h-10`) for form submits. Reserve `lg`/`xl` for the landing/hero. Compact is the rule.
- **Disabled state must READ as disabled, not just dimmed.** The default `disabled:opacity-50` makes a primary button look like a faded-but-clickable button. When a control is blocked by validation, render a **solid gray** state (`bg-[#d1d5db] text-white shadow-none hover:bg-[#d1d5db]`) + `aria-disabled`, so it's unmistakably inert. Pair it with **one** clear reason (inline), never a second duplicate message.

**Inputs** (`Input`/`Select`): `rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm`, focus `ring-2 ring-[#009FD9]`, error `border-red-400`. Label above (`text-sm font-medium text-[#374151]`); hint/error below (`text-xs`). Always pair a label with its control; never rely on placeholder as the label. **Choice dropdowns use the shared popover, not a native `<select>` (sprint 283).** The canonical pattern is **`TimeSelect`** (Disponibilidad hours) and the generic **`SelectMenu`** (`components/ui/select-menu.tsx`): a button trigger (selected label, else muted placeholder) + a rotating `ChevronDown`, opening a listbox where the selected option is highlighted `bg-[#EBF5FB] text-[#0089bb]` with a `Check`; closes on outside-click/Escape, scrolls the selection into view. Use `SelectMenu` for provincia/cantón and any `{value,label}` choice (it backs `WorkplacesPicker` + `CoverageAreaSelector` + the **publicar-proyecto** modal as of sprint 311 — the last native-`<select>` holdout for provincia/cantón, now migrated) so every dropdown opens + reads the same — don't hand-roll a native select with an overlaid chevron. **For an OPTIONAL filter** (publicar proyecto's provincia/cantón), include a **first reset item** `{ value: "", label: "Todas/Todos" }` so the empty/default state is selectable (the placeholder isn't needed when a "Todas" option exists). **Trigger border (sprint 311):** states are mutually exclusive — **open** → `ring-2 ring-[#009FD9]` + `border-transparent`; **error** → `border-red-400`; otherwise neutral `border-[#e5e7eb]` that **darkens to `#cbd5e1` on hover** (the Input hover spec) so it reads as interactive. (Previously the neutral border overrode the open transparent border — fixed.)

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
- **<lg (mobile): a clean VERTICAL flow (Yelp-style), NOT a bottom-sheet/List-Map toggle.** One single column, in order: **(1)** the **search bar** (`MobileServiceSearch`) → **(2)** the **filters as a single horizontally-scrollable chip row** (`<SearchFilters variant="chips"/>` — Categoría/Provincia/Cantón/Ordenar/Aseguradora dropdown chips + "cerca de mí"/"Solo verificados" toggle chips; `overflow-x-auto`, `shrink-0`, never wraps) → **(3)** the **map at a FIXED height** (`h-[42vh]`, rounded+bordered) → **(4)** the **count** → **(5)** the stacked **card list**. The whole page scrolls normally; cards NEVER overlap the map. The SAME single `GoogleMapPanel` is repositioned via `lg:order-*` (mobile flow vs desktop column) — never a 2nd instance.
- `SearchResultsLayout` owns the three slots + drawer (takes a `filters` prop). `SearchFilters` is a **vertical sidebar** (stacked search, category [typeable+browsable], province/cantón, sort, aseguradora, geolocation, verified, clear). **Filters live ONLY in the sidebar — never inside the cards.**
- **Sort ("Ordenar por") — the standard set:** Mejor calificados (`rating`, default) · Precio (de menor a mayor) (`priceAsc`) · Disponibilidad inmediata (`availability` — soonest upcoming slot first) · Cercanía (`cercania` — requests geolocation when picked).
- **Default ranking — verified first.** Across every sort, **verified professionals rank above unverified** (a stable secondary pass after the chosen sort; featured within each group), so clients are steered to verified pros automatically and pros have a built-in incentive to verify. Unverified still appear, just lower. Keep the single **"Solo identidad verificada"** toggle for clients who want only verified — do **not** add any other verification filter.

### Result cards — content-driven height, compact, dense (two-zone)
A professional is always **ONE card** (`rounded-2xl bg-white border`, never split per location). Height is **content-driven with a floor** — `md:min-h-[190px]` (NOT a hard fixed height): a sparse card stays compact, a rich one (multi-location + multi-profession + many slots) grows. Content is padded `pl-10` so it clears the number badge. On mobile it stacks (`flex-col`). Two zones:
- **Identity zone (`flex-1`, left):** 52px avatar (initials on `#EBF5FB`, or photo) · **name row — the NAME has horizontal priority**: top line is name (`flex-1`) + the compact right-aligned WhatsApp/call icons only. The **verified mark** sits **inline beside the name on desktop** but **drops to a small line BELOW the name on mobile** (`hidden md:inline-flex` inline + `md:hidden` under the name) so the name never loses space to the badge. The name uses **`line-clamp-2 md:line-clamp-1`** — on mobile it **wraps to 2 lines rather than truncating with "…"** (prefer the full name); single line on desktop. Don't put the badge on the name's line on mobile. (See "Verified mark & tag hierarchy".) · **business name** line · a row of **soft profession tags** · a **rating row** (one `#ff9b32` star + value + "· N reseñas", or "Sin reseñas todavía") · **location** line (`MapPin`) + **coverage** line (`Truck`), each truncating · **"Ver casos de éxito (N)"** pinned to the bottom (`mt-auto`). No bio.
- **Action zone (`md:w-[232px]`, left border):** a **price header** ("Desde ₡14 000/hora" — `Desde` eyebrow + value, `pr-9 md:pr-10` clears the favorite), then the availability panel (below) with the **"Solicitar servicio"** CTA pinned to the bottom — **identical on every card** (same size/style); the WhatsApp/llamar secondary icons sit to its right (see Availability "Action row").

**Verified mark & tag hierarchy (trust ≠ category — don't make them look alike):**
- **Verified mark goes to the RIGHT of the NAME** (where the eye looks for a trust mark), as a **subtle icon + label, NOT a bordered pill**: verified → `ShieldCheck` `h-4` + "Verificado" in green `#16a34a`; unverified → `ShieldAlert` + "Sin verificar" in amber `#b45309`. `shrink-0` so the name truncates first.
- **Profession tags** are **soft, muted, few**: `rounded-full bg-[#f3f4f6] text-[#6b7280] px-2 py-0.5 text-[11px]` (NO heavy brand border), **capped at 2** + a `+N` overflow. They read as categories, clearly distinct from the green trust mark — avoid a wall of identical heavy-bordered pills. The **`+N` is a `<Link>` to the pro's profile** (where every profession is listed) — same pill shape, `relative z-10` (above the whole-card overlay), `hover:bg-[#EBF5FB] hover:text-[#009FD9]` + pointer so it reads as interactive, consistent with the card's other profile links (`card.moreProfessions` title/aria-label). Contact-only ("Coordina por WhatsApp"/"Solo WhatsApp", `Lock`) and `featured` are soft no-border tinted chips in the same row.
- Numbered cards **1..N** mirrored on numbered map pins; pin hover adds `ring-2 ring-[#009FD9]` + scrolls the card (map reaches it via `#pro-card-<id>`). Number badge top-left (`top-2.5 left-2.5`); a **small, subtle favorite** (`w-7 h-7`, white/subtle border, `Bookmark`) top-right (`top-2.5 right-2.5`) — consistent on every card. The name (`pr-9 md:pr-0`) and the price row (`pr-9 md:pr-10`) clear the favorite so it **never overlaps**, on desktop or mobile.
- Overflow always **truncates/collapses ("+N")**.
- **Icons:** keep them **small, few, and from ONE set** (lucide `h-3`–`h-4`, muted, mostly brand/`#9ca3af`) so they aid scanning without looking busy — the **only** exception is the official `WhatsAppIcon` for the WhatsApp action. Don't mix icon families or oversize them.

### Availability display (Hulihealth-style)
- **Packed day columns** (3 at a time): show only upcoming days that **actually have bookable slots** (no "—" filler), with **uppercase** labels (`Hoy`/`Mañana`/`Jue 11`, brand-colored when soon ≤ tomorrow), ~2 time chips per day (brand-tint pills) + a **dashed `+N` chip**; chevrons page further out. Empty → one compact line ("Sin horarios próximos. Solicita el servicio para coordinar."). Slots are one-click → opens booking pre-selected.
- **Location selector** above the strip when the pro publishes hours at more than one place — **horizontal scrollable TABS** (`MapPin` + name; selected = brand-blue + underline), with the selected location's address shown directly below, defaulting to the first; single-location shows a `MapPin` + name (+ address) line. See §50 for the full rule (options from workplaces∪slots, strict per-id filter). Dedupe by id.
- Grouped lists (e.g. the pro's own "Tus horarios próximos") group times by **Mañana (<12h) / Tarde (12–18h) / Noche (≥18h)** so dense lists are scannable; each part renders only when it has slots.
- **Action button** (bottom of the availability panel): **"Solicitar servicio"** is a **single FULL-WIDTH primary** (`w-full`), identical on every card. The **direct-contact icons do NOT sit beside it** (that would vary card width / tempt a second row). Instead the **WhatsApp + call icon-buttons live in the card's TOP row, next to the name** (pushed right with `ml-auto`) — reusing existing horizontal space so **the card never grows taller**. They are **borderless** (no box/container): bare icons in a `h-7 w-7` tap target, `rounded-full`, with a **hover-only subtle circular highlight** (WhatsApp `text-[#1ebe5d] hover:bg-[#25D366]/10`; call `text-[#6b7280] hover:bg-[#EBF5FB] hover:text-[#009FD9]`). Official `WhatsAppIcon` + `Phone`, ~18px. They show only when enabled (WhatsApp when bookable + not appointments-only; call when `allowPhoneCall`); their presence/absence must not change card height or the button size. Contact-only (private / WhatsApp-only) cards show a **full-width "Solicitar por WhatsApp"** primary instead (the call icon, if any, is in the top row).
- **Verified wording:** the trust mark reads **"Identidad verificada"** (green `ShieldCheck`) on cards and profiles (unverified → amber `ShieldAlert` "Sin verificar"). Keep it a small icon+label, visually distinct from profession chips.
- **Category labels must never leak raw i18n keys:** if `tCat(id)` returns a `"categories.xxx"` path (missing message), fall back to `getCategoryLabel(id)` from the taxonomy (e.g. `otro` → "Otro servicio"). The `otro` key is now in `messages/{es,en}.json`.
- **The app is now fully bilingual (ES/EN).** Every user-facing surface — landing/standalone pages, search, BOTH dashboards and all their sections, account/support, and all auth/flow pages (registro, onboarding, completar-perfil, reset/forgot password, publicar-proyecto, notificaciones, proveedores-autorizados, contacto) — uses `useTranslations`/`getTranslations` with paired `messages/{es,en}.json` namespaces. When adding ANY new copy, add both ES + EN keys; never hardcode Spanish (or English) strings in a component. Locale-aware dates use `locale === "en" ? "en-US" : "es-CR"`; taxonomy labels use `getCategoryLabel(id, locale)`. Intentionally untranslated (Spanish only, by design): `/terminos`, `/privacidad` (binding legal — human review), and the entire `admin/*` panel.
- **Private / contact-only:** shown as a compact **inline chip** in the card's chips row ("🔒 Coordina por WhatsApp" / "Solo WhatsApp") — NOT a full-width band — so it never adds card height; the availability column then renders just the compact WhatsApp/llamar actions (pinned to the bottom).
- **Insurance (aseguradora) filter:** **no "Todas" option.** Default is **NONE selected** (placeholder "Cualquiera", no filtering → normal results). Picking an insurer filters to pros who accept it. **Clearing is an in-dropdown "Cualquier aseguradora" reset item** (shown only when one is picked, mapped from a `__any__` sentinel since Radix forbids an empty value) — **NOT** an external X button beside the select. The old X-beside pattern shrank this one control ~40px narrower than the other sidebar filters; keeping the clear inside the dropdown means **every /buscar filter field is the exact same full-width `h-10` size** (uniform-filter-size rule, sprint 305). Same pattern for any "optional single-select filter that defaults to off".
- **All /buscar sidebar/drawer filter fields are ONE uniform size AND the SAME shape (sprint 314).** Every filter — the unified **Servicio** search/category field + Provincia + Cantón + Ordenar por + Aseguradora — is now structurally identical: a **`fieldLabel`** (`mb-1 text-[11px] font-semibold text-[#6b7280]`) above an **`h-10 w-full rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm`** box, ALL inside the one `flex flex-col gap-3` group. Matching `h-10 w-full` alone was NOT enough — the service field still LOOKED different because it (a) had **no label** while the four dropdowns had labels, (b) used **`pl-9 pr-9`** padding for a left search icon (so its text started ~36px in vs the dropdowns' 16px `px-4`), and (c) lived in a separate `flex` wrapper above the group. Fix: gave it a **"Servicio"** label, **dropped the left search icon** so it uses **`pl-4`** (text starts at the same x as the dropdowns), moved it INTO the group as the first field, and gave it a **right-side glyph that mirrors the dropdown chevron EXACTLY** — `absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7280]`: a `Search` icon at rest, the clear-X while typing — with `pr-9` ALWAYS so the right padding matches the dropdowns' reserved chevron space (sprint 315). So now all five share the same box AND the same right affordance, perfectly aligned — match this when adding any filter. No field may carry an inline side control (e.g. a clear X) that changes its width. (The mobile `chips` variant is a separate horizontally-scrollable pill row, currently unused on /buscar.)

### Client identity at booking (cédula) + masked display
- **Client SIGNUP asks for NO cédula** (sprint 179) — only full name + email/password (+ phone). The cédula field was removed from `registro/cliente` to cut friction; it's collected later, at booking / `completar-perfil` (a client may never need one if they only browse). Do NOT re-add a cédula field to client registration. (Pros still provide a cédula at signup for verification.)
- **Cédula is collected at booking, not signup.** A national cédula is confirmed against the **padrón**; the **official name prevails**. **For myself**: if the cédula's official name **differs** from the account name, show a **responsive amber warning** ("La cédula ingresada pertenece a **[Nombre oficial]**. Al confirmar, tu cuenta usará este nombre oficial. Usa únicamente tu propia cédula.") — contained box, `ShieldAlert`, `text-xs`, `break-words`, fits ~360px → desktop; on confirm the cédula links to the account, the name becomes official, and it **persists + prefills** future bookings. If the name **matches**, link silently. **For another person**: the beneficiary cédula is used **only on that booking** — **never** linked to the account, never changes the holder's name. **Early feedback (sprint 280):** an invalid/non-existent national cédula surfaces **"No encontramos esa cédula. Revisa el número e intenta de nuevo."** as soon as the field is COMPLETE (the debounced live padrón lookup), not only at submit — so the client isn't made to fill the whole form first; it never overrides the higher-priority "ya está registrada en otra cuenta" message, and DIMEX/NITE never trigger "not found" (not in the padrón by design). **No redundant sub-hint** under the field (the old "Solo para tu solicitud — no es una verificación de identidad." line was removed). **No-cédula + DIMEX (sprint 282):** the cédula is **not strictly required** — a **"No tengo cédula"** disclosure link lets the client proceed WITHOUT one (types their name manually); a **DIMEX/NITE** is accepted but flagged with an amber "no se verifica contra el padrón" note. A **national cédula** (padrón-confirmed) = **verified**; **DIMEX / no cédula** = **unverified** with a manually-typed name. The **professional's received request** shows this explicitly: green `ShieldCheck` **"Identidad verificada"** beside a national cédula, vs amber `ShieldAlert` **"Sin verificar: {id}"** (DIMEX) / **"Sin cédula · identidad sin verificar"** (none) — so the pro decides whether to contact. Status is derived from the stored `client_cedula` type (`detectIdType`), no extra column. **Identification-FIRST, name auto-fills below (sprint 299):** in solicitar servicio (self AND the other person) the **identification field comes FIRST** and the **"Nombre completo" sits BELOW it** — a national cédula auto-fills the official name **read-only** (green box), while no-cédula / DIMEX shows a **manual** name input; never put the name above the ID. The **"for another person"** flow does NOT ask "¿La persona tiene cédula?" — it opens with a **"Datos de la otra persona"** section title and **simple labels below it** (**"Número de identificación"**, **"Nombre completo"**, **"Teléfono"**) — NOT "… de la otra persona" repeated on every field (sprint 310). It leads with the identification (the name auto-fills below) and offers a **"No tengo su cédula"** escape (manual name, flagged unverified to the pro), mirroring the self **"No tengo cédula"** path (both links brand-blue `#009FD9`). The escape no longer shows a verbose "Enviarás la solicitud sin cédula verificada de la persona…" notice (sprint 310) — it's form clutter, since the pro already sees the unverified status on the received request; only the toggle-back link ("Tengo su cédula"/"No tengo su cédula") remains. (NOTE: this beneficiary sub-block is currently hardcoded Spanish — a pre-existing EN-parity gap to fix when the booking flow's strings are migrated to i18n.) DIMEX is recognized + unverified for both. The **pro's received request shows the beneficiary's status too** (green "Identidad verificada" vs amber "Identidad sin verificar"); the booking only stores a beneficiary cédula when padrón-confirmed or DIMEX, so the badge is accurate.
- **Name lock follows a NATIONAL cédula — identically for clients AND professionals (sprint 316).** Whenever a **national** cédula (padrón-confirmed) is on file, the **Nombre completo is read-only** (lock icon + the `nameLockedHelp` message; corrections → soporte). **No cédula / DIMEX-NITE → name freely editable.** Both panels do this the SAME way: the **client** locks on `cedulaVerified` (`detectIdType(profiles.cedula) === "cedula"`); the **professional** locks on **`verification_status === "verified"` OR a national cédula** (the pro editor fetches the cédula via the owner-only `get_my_profile` RPC, since `cedula` isn't directly selectable — a pro who entered a national cédula at signup gets the locked name even before admin review finishes). The **`nameLockedHelp`** wording is parallel but context-accurate about WHERE the cédula was entered: client = "…la cédula que ingresaste en tu última solicitud de servicio…"; pro = "…la cédula que ingresaste **al crear la cuenta**…" (both end "¿Un error o cambio legal? Solicítalo a soporte."). The green **"Verificado"** badge in the pro's name label shows only when `verification_status === "verified"` (a national-cédula-but-pending pro is locked but doesn't claim the badge yet).
- **Masked cédula display:** anywhere a saved cédula is shown back, mask it with `maskId()` → **last 4 digits only** (`X-XXXX-1234`; NITE/DIMEX `XXXXXX1234`). The client panel's **Identidad** card shows the masked cédula + a status chip (verified green / "Pendiente de revisión" amber for DIMEX/NITE).
- **Health (es_salud) bookings require the patient's DOB** — for **myself** (manual input; the padrón has no birth date) and for **another person** (beneficiary DOB, not optional). Block the step's Continue/Submit until it's provided. Non-health bookings never ask DOB (data minimization). **The DOB control is the shared `DateOfBirthPicker`** (`components/ui/date-of-birth-picker.tsx`, sprint 318) — **three `SelectMenu` dropdowns in `Día · Mes · Año` order (dd/mm/yyyy, the CR convention)**, NOT a native `<input type="date">`: the YEAR is a plain scrollable dropdown (maxYear→1915) so picking a birth year is one scroll, never paging a calendar month-by-month; the day list clamps to the chosen month (31→Feb = 28/29). It emits/accepts an ISO `YYYY-MM-DD` so storage is unchanged. Any saved/locked DOB is shown via **`formatDobDMY(iso)` → `dd/mm/yyyy`** (never the raw ISO). Month names + placeholders are locale-aware (es/en). Reuse this picker for any date-of-birth field; keep native `<input type="date">` only for near-term calendar dates (e.g. the pro's blocked-dates).
- **Age-bracket marking is MINOR *and* ADULTO MAYOR, professional-only, derived from the DOB (Sprint 309).** Since health bookings already collect the patient's DOB, the pro's received request shows a small **age-bracket badge** — **"Menor de edad"** (under 18, amber `text-[#b45309] bg-[#fef3c7]` — signals guardian/consent) or **"Adulto mayor"** (65+, "adulto mayor" per CR Ley 7935; neutral grey `text-[#6b7280] bg-[#f3f4f6]` — informational/geriatric) — for **both** the self patient (from `client_dob`) and the beneficiary (from `beneficiary_dob`). A typical adult (18–64) shows nothing. It is genuinely useful clinical context for a medical professional, so we mark BOTH brackets consistently (the old "minor only" was incomplete). The bracket is **derived at display time** via `ageCategoryFromDob()` (`lib/age.ts`) — **no new column**; the legacy `beneficiary_is_minor` flag is kept only as a fallback for bookings stored before a DOB was retained. **Shown ONLY to the professional** (the `BookingRequests` panel), never as client-facing clutter (the client's own DOB note was removed in sprint 302). Keys `bookingRequests.minor` / `bookingRequests.olderAdult` (es+en).
- **No double-booking:** the booking API rejects (409) a slot already held by an active booking; the modal surfaces it inline ("Ese horario acaba de ser reservado…"). Cancelling/completing frees the slot again.

### Status filter tabs — no "Todas/Todos"
- The shared `SOLICITUD_TABS` / `PROYECTO_TABS` (in `status-filter-tabs.tsx`) have **no all-bucket** — the status tabs already cover every lifecycle state, so "Todas/Todos" only added noise. **Both use the SAME three-bucket scheme** so the two panels read identically. **Default to the ACTIVE tab**: solicitudes → **"Activas"**; proyectos → **"Activos"**.
- Canonical labels (must match the real lifecycle): **solicitudes** = Activas (`pending/confirmed/in_progress/awaiting_confirmation`) · Finalizadas (`completed`) · Canceladas (`cancelled/rescheduled`). **proyectos** = Activos (`open/in_progress/awaiting_confirmation`) · Finalizados (`completed`) · Cancelados (`cancelled`). The finer open-vs-assigned distinction stays visible on each card's status **badge** ("Abierto" vs "En curso · Asignado") rather than as a separate confusing tab.
- **Soporte (tickets) follows the same rule:** `SupportTickets` shows only the three status tabs **Pendiente / En proceso / Resuelto** (`open` / `in_progress` / `resolved`) — **no "Todas"** — and **defaults to "Pendiente"** (`open`). A filtered-but-empty status shows the `noneInView` line.

### Request/list cards with actions (e.g. "Solicitudes recibidas")
- **Vertical hierarchy, not a left/right split:** header (status badge + date) → details → a **footer separated by `border-top`** holding the actions. Never put the action buttons in a `shrink-0` right column — it cramps them on mobile.
- **Actions are full-width STACKED on mobile, inline-wrap on desktop:** wrapper `flex flex-col sm:flex-row sm:flex-wrap gap-2`, each button `className="w-full sm:w-auto"`. Keep the **same footer shape across every status** so cards stay uniform. Subtle/destructive links (e.g. "Reportar cliente") go last, `self-start`.
- **Requester vs patient, and the TWO dates, must be unambiguous (sprint 320).** On a `BookingRequests` card: the header's date is the **REQUEST date**, labeled **"Solicitada {date}"** (never a bare date — it was confusable with the appointment); the scheduled date lower in the card is labeled **"Cita: {date · time}"** (brand `CalendarDays`, bold value). When the booking is **for another person**, a **"RESERVADO POR"** eyebrow (`text-[10px] font-bold uppercase tracking-wide text-[#9ca3af]`) sits above the requester's row and the beneficiary box leads with a **"LA CITA ES PARA"** eyebrow (brand `#0089bb`) + the patient's name — so "who booked" vs "who it's for" is instant (a self booking shows neither eyebrow, just the one person). The redundant "Reservado por {name} (responsable)" footer line was dropped. **Age markers are ONE consistent pill** for both brackets — `rounded-full bg-[#fef3c7] px-2 py-0.5 text-[10px] font-semibold text-[#92400e]` ("Menor de edad" / "Adulto mayor") — same style, only the label differs (was amber-vs-grey). All DOB displays use **`formatDobDMY` (dd/mm/yyyy)**, never raw ISO.

### Mobile menu (left drawer) — grouped sections, both auth states
- **Always grouped under uppercase section headers** (`text-[10px] font-bold text-gray-400 uppercase tracking-widest`), never a flat list. Keep the left slide-in drawer + swipe-to-close + scrim.
- **Logged-in order:** search → **MI CUENTA** (avatar + name/email header, then Mi panel [bold + brand icon], Mis solicitudes, Mis proyectos, Mis favoritos, Ofrecer mis servicios [client-only], Cuenta y seguridad — all **role-aware**, with icons) → CATEGORÍAS → RECURSOS → Idioma ES/EN → **Cerrar sesión** (red, bottom). Surface the account area **right after the search** so the panel is one tap away.
- **Logged-out order:** search → **CATEGORÍAS** (+ "Ver todas") → **CUENTA** (Ingresar [outline] + Registrarse como profesional [brand pill]) → RECURSOS → Idioma ES/EN. Rationale: clients **register at booking time, not upfront**, so there is **no "register as client"** option — a new client only needs to **search/browse**, then requesting a service creates their account. The two account actions are surfaced **right after browse** (clearly visible, but not first since clients won't register upfront); Recursos + Idioma are utility, last. No "Mi cuenta" area when logged out.
- **Notifications are reachable from the menu, not just the bell:** include a role-aware **"Notificaciones"** item (with the unread badge) in the desktop account dropdown AND the mobile MI CUENTA section (`tab=notifications`, role-aware href). The expanded desktop header also keeps the standalone bell.
- **Notification row actions use distinct icons so they're never read as accept/reject:** **✓ (green) = "Marcar como leída"**, **trash (red) = "Eliminar"** — never an `X` (which reads as decline). Same in the bell dropdown and the in-panel list. The **bell unread badge auto-refreshes** without a reload: a realtime `UPDATE` handler plus a same-tab `"notificationsChanged"` `CustomEvent` that every read/delete dispatches keep the count in sync across surfaces. A notification click **never dead-ends** — `notificationHref` only honors a stored `data.link` when it `startsWith("/")`, otherwise it routes to the live dashboard tab for that type.
- **Counts read singular/plural** — "1 reseña" / "N reseñas" (and the same for "propuesta(s)"). Never a bare "1 reseñas".
- **Post-login lands on the panel HOME** (Mi perfil), never a deep sub-section like "Mis solicitudes enviadas". Both dashboards default `tab` to `profile`.
- **Verified mark reads "Identidad verificada"** (not "Verificado") next to the locked Nombre completo; keep the label row `flex-wrap` with the chip `whitespace-nowrap shrink-0` so it wraps (never truncates to "Identidad veri…") on mobile.
- **Auth label is "Ingresar"** (not "Iniciar sesión" — friendlier, and not "Mis citas"/medical wording since not all services are appointments). Use it consistently on the **mobile drawer AND the desktop nav trigger**.
- **ONE login surface = the `/login` page (Sprint 246).** "Ingresar" (desktop + mobile) **navigates to `/login?redirect=<current path>`** — it does NOT open an in-navbar login modal (that modal, and its rogue role-less `signUp`, were deleted). `/login` is the single canonical login: forgot-password ("¿Olvidaste tu contraseña?"), Google/Facebook, social-only detection, role-aware post-login redirect + `waitForAuthCookie`, `?redirect=` deep-links. **Every login surface must include forgot-password** — incl. the in-booking `ClientRegistrationModal` login view (links to `/olvide-contrasena`; that modal stays inline because booking must not navigate away, and login there closes + continues via `onSuccess`). Do NOT reintroduce a second login UI or an email/password signup outside the proper `/registro` flows.
- **Login error is SMART + SHORT (Sprint 255).** On a failed `/login`, the page calls **`detectSocialOnly(email)`** and branches: a **social-only** account (the email belongs to Google/Facebook, no app password) shows **`socialOnly`** — "Esta cuenta usa {provider}. Inicia sesión con {provider}." (and highlights that provider button via `socialHint`); a real manual account with a wrong password shows just **`loginError`** — **"Correo o contraseña incorrectos."** (nothing more — the OAuth buttons + "¿Olvidaste tu contraseña?" are already on screen, so the error must NOT repeat them). Login MAY be method-specific because the user is proving intent; **forgot-password must stay neutral** (see the anti-enumeration note above). Keep both error strings SHORT. The mirror message — a Google sign-in refused because the email already has a password account (`?autherror=use_password`, sprint 247 guard) — uses **`blockedUsePassword`**: "Esta cuenta usa correo y contraseña. Inicia sesión con tu contraseña." (parallels `socialOnly`'s "Esta cuenta usa…"; keep it one short sentence).

### Dashboards use ONE nav pattern (vertical left sidebar)
- **Both** the professional and client dashboards use a **vertical left sidebar** (`flex flex-col lg:flex-row gap-6`, `max-w-5xl`, nav in a bordered `lg:sticky lg:top-20` rail; active item `bg-[#EBF5FB] text-[#009FD9]`, others `hover:bg-[#f3f4f6]`; content in `flex-1 min-w-0`). The client panel's old horizontal tab strip was replaced for consistency. New nav items go in the rail, not a top row.

### Never strand the user — "Volver a mi panel"
- Any **full-view preview or deep flow** a logged-in user can enter must offer a **clear way back to their dashboard**. The professional "Ver cómo me ven los clientes" preview opens **same-tab with `?preview=1`**, and the public profile shows a prominent **"Volver a mi panel"** bar (→ `/dashboard/profesional`) in that mode instead of the generic "back to search". Standalone pages that keep the global `Navbar` (logo→home + account menu) already satisfy this; full-bleed views do not — add an explicit back action.

### Auth pages — one shared card container
- **Login + BOTH registrations use the IDENTICAL card.** `/login`, client signup ("Crear cuenta de cliente"), and professional signup all render inside the same clean white card — `bg-white rounded-3xl shadow-sm border border-[#e5e7eb] p-8` on a `bg-[#fafafa]` page, vertically centered (`flex items-center justify-center px-4 py-12`, `w-full max-w-md`). The multi-step pro form (and OTP screens) live INSIDE that one card (Typeform-style single card with step indicator). Keep the whole auth flow visually consistent — never render an auth page's content bare on the page. NB: any "o"/divider chip inside the card uses `bg-white` (it sits on the card, not the `#fafafa` page).

### Support icon — `Headset` everywhere
- **The support/help icon is lucide `Headset`** (clear "customer support", chosen over the generic `LifeBuoy` ring). Use it in EVERY support/tickets surface — the `/soporte` header + "Ver mis tiquetes", both dashboards' "Soporte" tab, `SupportTickets` states, every admin support spot, the `/ayuda` "Contactar soporte" entry points, and support marketing tiles. Footer/navbar "Soporte" links stay **text-only** (consistent with their sibling links — no icon). FAQ-category icons are `HelpCircle` (FAQ ≠ support). Don't reintroduce `LifeBuoy`/`MessageSquare` for support.

### Professional registration — essentials only
- **Cédula field uses SMART validation, NOT a fixed helper.** The shared `CedulaInput` shows NO permanent "CR: 9 dígitos · DIMEX: 11-12 · NITE: 10" helper text (it read as technical clutter). Instead it validates on **blur**: a number matching no valid CR id length (cédula 9 · NITE 10 · DIMEX 11-12) → one friendly message (`identity.idIncomplete`); valid/empty → nothing; an explicit parent error always wins. Never re-add a permanent format-breakdown hint under the field — let the validation speak only when something's wrong.
- Registration collects ONLY what's needed to create a searchable pro: **identity (cédula→nombre, or the "no CR ID" exception), email + password (email signup), profession(s), work zone(s) (provincia/cantón + optional pin), WhatsApp, and an optional photo.** (Travel/"me desplazo" is NOT asked at signup — it's a panel toggle.) Everything else (brand/business name, services + prices, years, certifications, languages, aseguradoras, casos de éxito, schedule) is completed later in the panel via the **profile-completion flow** — never crammed into signup. Do not re-add moved fields to registration.
- **The "No tengo identificación costarricense" exception is NOT under the cédula field, and NOT a checkbox.** It is a **progressive-disclosure link** — a subtle text link ("¿No tienes identificación costarricense?") placed **directly below the identity block** that, on click, reveals the foreigner fields (passport/DIMEX manual name + document note) and offers a way back ("Tengo identificación costarricense"). The primary cédula→nombre path always reads clean and uninterrupted; the edge path stays out of sight until chosen. **General rule: edge/exception paths use a disclosure link, never a prominent control in the main flow.** (Presentation only — never alter the `no_cr_id` state wiring or the cédula/padrón verification logic; that flow is off-limits to UI passes, see context.md WARNING.)
- **Photo step:** "Cambiar foto" and "Eliminar" are BOTH proper outlined buttons (Eliminar in red), visually matched. No paragraphs here about "later you add services / casos de éxito" — that guidance lives in the panel's completion flow, not signup.

### Location & coverage — work zones first, travel as a toggle (registration AND profile editor)
Simplified for non-technical pros (Uber/Airbnb pattern: **structured field first, map as optional refinement**). There is **no "¿cómo ofreces?" mode choice** and **no zone-by-zone coverage list** anymore.
- **Work zones** (`WorkplacesPicker`): the pro picks **provincia → cantón FIRST** (the authoritative areas that drive `/buscar`; cantón disabled until provincia is set) + an optional place name. THEN an **optional, collapsed-by-default** "Marcar el punto exacto en el mapa (opcional)" reveals the search / map-click / "usar mi ubicación" pin. **The pin stores lat/lng only — it NEVER re-asks or overwrites the chosen provincia/cantón** (no duplicate questions, no reverse-geocode confirmation). "Agregar lugar" is enabled once provincia+cantón are set. **Multiple zones supported**; each lists its cantón, provincia (· "con punto en el mapa" when pinned) and is removable.
- **Travel** = a single **toggle "Me desplazo a donde está el cliente"**, in the **panel only** (registration just collects the zone[s]; travel is enabled later). It sets `service_type` to include `mobile` and **adds NO separate coverage zones** — a pro's reach IS the zone(s) they listed; exact travel is coordinated with the client directly. Keep it a clean separate row (`rounded-xl bg-[#f9fafb]`), never mixed with the map.
- **Search semantics unchanged:** each zone's provincia/cantón feeds `computeSearchAreas(workplaces, [])` → `search_provincias` / `search_cantones`, which `/buscar` matches with array-contains. The new flow writes `coverage_areas` / `coverage_provincias` / `coverage_country` **empty**. The panel **seeds zones** from an existing pro's `workplaces`, else legacy canton-level `coverage_areas` / primary `provincia_id`+`canton_id`, so re-saving never drops search presence. (`CoverageAreaSelector` is retired from these flows.)

### OAuth guidance blocks (account & security)
- Notes shown to Google/Facebook users (email/password are provider-managed) use a **neutral info style** (`bg-[#f9fafb]`, **no border** — they already sit inside a card, so no box-in-box), an `Info` icon, optional numbered steps, and a single link out to the provider. **Dark readable text** (`text-[#111827]` title, `text-[#6b7280]`/`text-[#374151]` body, grey `#e5e7eb` step badges) — **NOT blue text on a blue tint** (that low-contrast monochrome-blue look was removed). The **only** color accent is the brand-blue link (`text-[#009FD9]`), because it's an action. Never a heavy/clunky bordered box.

### Image uploads (avatars + casos de éxito)
- **Accept any image, including iPhone HEIC/HEIF** (Cloudinary converts). Don't whitelist only jpeg/png/webp — mobile photos are often HEIC and some browsers send an **empty MIME type**, so allow `type === "" || type.startsWith("image/")` and use `image/*` on the `<input accept>`. Size cap **10 MB** (phone photos exceed 5 MB; images are downscaled server-side anyway).
- **Always surface the SERVER's specific error** (size/format/Cloudinary-not-configured) to the user — never collapse it into a generic "no se pudo subir". Revert any optimistic preview on failure.
- **The 5-photo limit is ONLY for "casos de éxito"** (`MAX_PORTFOLIO_PHOTOS`, on `portfolio_urls`/`portfolio_items`). The **profile photo (avatar) is a single, independent image** (`profiles.avatar_url`, `type=avatar`) and must NEVER be subject to that limit.
- **Casos de éxito are organized BY PROFESSION** (category), NOT by individual service (Sprint 168 — like Certificaciones). `portfolio_items` = `[{ url, profession, serviceId? }]`. The editor (`photo-gallery.tsx`) shows one section per profession; an upload tags the photo with that profession. The public profile's "Casos" tab groups galleries by profession (`getCategoryLabel`) with an **"Otros trabajos"** bucket. **Migration is lossless + at read-time** via shared **`casoProfession(item, services, primary)`** = `item.profession ?? service(serviceId).category ?? primary` — legacy serviceId-tagged photos map to their service's profession automatically (and the derived value is persisted on the next save); nothing is ever lost. Do NOT reintroduce per-service grouping.

### Formación (professional, text-only, PER-PROFESSION)
- **Label = "Formación" / EN "Education" (Sprint 253).** Renamed from "Certificaciones" because the section covers **courses, títulos/degrees AND certificates** — narrow "Certificaciones" missed the first two. Subtext stays **"Cursos, títulos o certificados"** (the encompassing clarifier); the add button is **"Agregar formación" / "Add education"** (per-profession: "Agregar formación a {profesión}"); item-level controls are GENERIC ("Guardar"/"Quitar") since an entry can be a course/título/cert and "formación" is a collective noun. The DATA stays `certifications` (field/table) and the public tab SLUG stays `certificaciones` — **only the labels changed**, not functionality.
- **TEXT entries only — image upload is simply not offered** (avoids exposing IDs/personal data on certificates). **Don't mention images at all** in the copy (no "no subas imágenes / texto sin imágenes" notes). Each entry = **nombre + institución + año, ALL required** + a **profession** tag.
- **Add via an explicit form, not inline editing:** saved entries render as **read-only rows** (Award + name + "institución · año" + remove); **"Agregar formación"** opens a small form whose **"Guardar"** button validates all three fields (`certAllRequired`) before committing — so it's never ambiguous whether the button saves the current one or adds another. Multiple per profession (heading per profession when >1; legacy untagged certs default to the principal profession).
- **Per profession:** certifications belong to a specific profession (category id), not the whole account — a multi-profession pro adds/displays them under each profession separately (heading per profession when >1; legacy untagged certs default to the principal profession).
- **Save independently:** persist certifications in their **own `update({ certifications })`** call, NOT bundled with other optional columns — otherwise one not-yet-migrated column makes a shared retry silently drop them (this was the "certs not saving" bug).
- **Public profile:** a **"Formación" tab** (slug still `certificaciones`) appears only when the pro has any (mirrors the "Casos de éxito" tab pattern), grouped by profession, each row = `Award` icon + name + "institución · año". Keep the description neutral ("Cursos, títulos y certificados que indica el profesional.") — do NOT add an "authenticity not verified" disclaimer (it reduces trust and reads as the pro opting out of verification).
- **/buscar card:** **never list certificates on the card** (would grow it). Show a compact **"Ver formación (N)"** link (Award icon) ONLY when there are any, **sharing the same bottom `flex-wrap` row as "Ver casos de éxito"** so the card height stays uniform. It deep-links to `?tab=certificaciones`. Same rule for any future "extra detail" surfaced from a card: a compact link in the shared bottom row, not inline content.

### No self-service (a pro can't hire themselves)
- A professional must **never** be able to request a service from their **own** profile, nor send a proposal to their **own** project. Detect ownership by comparing the viewer's auth id to the pro's owner (`ProfessionalCardData.profileId` = `professionals.profile_id`) / the project's `client_id`.
- **Show the normal buttons, BLOCK the action (don't hide):** on a pro's own /buscar card and public profile, render **every** client action exactly as a client sees it (Solicitar servicio / Solicitar por WhatsApp, the top-row WhatsApp + call icons, Llamar) — so the pro sees their profile as clients do and it never looks broken. When they trigger a self-action, **don't perform it**; open a friendly, responsive modal (`SelfActionModal`, `max-w-sm` inside `p-4`, tap-away + Escape) titled **"Este es tu perfil"** with a per-action message from `SELF_MSG` (`request` / `whatsapp` / `call` / `email` / `proposal` / `favorite`). Detect ownership with `isOwn` (viewer id === `professional.profileId`). This includes the **favorite/bookmark**: saving your OWN card opens `SELF_MSG.favorite` instead of saving yourself (wired through `SaveableCard` → `SaveButton` with `isOwn`).
  - Wiring: server-rendered icons go through the client wrapper `TopContactIcons`; `BookingButton` + `ProfessionalSchedule` intercept `pick`/`openBooking`/the WhatsApp `<a>` when `isOwn`; the profile page's WhatsApp/Llamar render as `<button>`s that open the modal when `isOwn`.
  - **Do NOT** revert to hiding the actions or showing a bare "Este es tu perfil" link in place of the buttons — that made the profile look broken to its owner.
- The pro's own projects are still **excluded from the "propose" feed** (a project simply not being listed doesn't look broken, unlike missing profile buttons). Always keep the **server guard** too (booking + proposals APIs reject self-actions) — UI blocking is not enough.

### Professions + "¿Cómo ofreces tus servicios?" setup (simple, multi-profession)
- **Professions are multi-profession but read as one clean field.** Show the **principal profession** as the primary search field; additional professions are **chips** plus a single on-demand action — **"+ Agregar otra profesión"** (label `"¿Tienes más de una profesión? Agrégala"` when none added yet) that reveals a search, then collapses. **Never** a second always-visible "Agrega otra profesión (opcional)" dropdown — it read as a duplicate and confused people. Make it obvious you can have one or several professions, **each with its own services** (managed in the Servicios tab). Same pattern in registration and in the panel's profile editor.
- **"¿Cómo ofreces tus servicios?" stays visually connected to its location.** The two work-mode options (**Me desplazo** / **Trabajo desde un lugar fijo**, both selectable) are followed immediately by their matching location block(s) — workplaces map for fixed, coverage-area selector for mobile — wrapped together in **one soft grouped panel (`bg-[#f9fafb]`, no extra hard border)**, each with a clear icon + sub-heading. The location appears right under the choice so the user never wonders "where do I set this now?".

### Price — ONE place (Servicios), clearer label
- **Price lives ONLY in the Servicios tab** (per-service: amount + type). "Mi perfil" no longer asks for price — it shows a short note pointing to Servicios. The /buscar card + profile "Desde" price is **derived from the services** via `deriveDisplayPricing(services, legacyPricing, hourlyRate)` (cheapest priced service; "a consultar" if services exist but none priced; legacy `pricing`/`hourly_rate` as fallback so no existing pro loses a displayed price). Do not re-add a profile-level price input.
- **Label:** the `a_convenir` type now displays as **"Precio a consultar"** everywhere (clearer than "a convenir" for all CR users). Keep the internal type id `a_convenir` — only the display string changed.

### Google Maps — use the NEW Places API components only
- Always load Maps via the shared async loader `lib/maps/loader.ts` (`loadGoogleMaps(key)`); never add a raw `<script src=.../maps/api/js>` or `&libraries=places` tag (those trip the loading warning and pull legacy libs).
- **Address autocomplete — for a field that must MATCH our inputs, render our OWN `<input>` + the `AutocompleteSuggestion` DATA API, NOT the `gmp-place-autocomplete` web component (Sprint 235).** The web component (`places.PlaceAutocompleteElement`) draws its OWN input border inside a **shadow DOM we can't reach** — adding our border on top stacks a **DOUBLE border**, and `::part(input)`/descendant resets don't pierce it. So where consistency matters (workplaces-picker "Marcar en el mapa", the homepage hero), use the pattern: a normal `<input>` with the standard token (`h-11 w-full rounded-xl border border-[#e5e7eb] … focus:ring-2 focus:ring-[#009FD9] focus:border-transparent`) → debounced **`maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input, includedRegionCodes:["cr"], sessionToken })`** → render results in the shared **`<AnchoredDropdown>`** → on select **`new maps.places.Place({ id }).fetchFields(["location","formattedAddress"])`**. This gives ONE clean, standard border + our focus ring + our dropdown. The bare web component (`location-picker`) keeps Google's single NATIVE border — do NOT add a border to `.cr-pac gmp-place-autocomplete` (only `color-scheme:light` to keep it light in OS dark mode). Do NOT use the legacy `places.Autocomplete` (old Places API → `ApiTargetBlockedMapError`).
- **Markers:** use `marker.AdvancedMarkerElement` with HTML `content` (remove via `marker.map = null`). Do NOT use `maps.Marker`. AdvancedMarkers require the map to have a `mapId` (`MAP_ID` from the loader) — and a `mapId` disables JSON map styles, so brand styling must come from a **cloud Map ID** (`NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`).
- The key only needs **Places API (New) + Maps JavaScript API + Geocoding API**.

### /buscar map — light cloud-styled tiles + navy numbered AdvancedMarker pins (`google-map-panel.tsx`)
- **Map:** `mapId: MAP_ID` (so the **light "Voyager/Light"** tile style is configured on the **cloud Map ID** — a `mapId` ignores inline `styles`, so the light grey-beige basemap lives on `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` in the Google Cloud console, NOT in code). Default center = **GAM** at **zoom 11** (single result → 13; multiple → `fitBounds` capped at 13), but the map **pans/zooms FREELY** (Sprint 164): there is **NO `restriction` bounds** (the old `restriction.latLngBounds: CR_BOUNDS` clamped the center inside CR even with `strictBounds:false`, so you couldn't reach the coasts), and **`minZoom: 4`** (was 8) so you can zoom out to the region + beyond. It still OPENS centered on Costa Rica; markers + "Buscar en esta área" are unaffected (the latter falls back to `nearestProvinceId` if the center drifts off-country). **Controls in the TOP-RIGHT corner column** (Sprint 150/152): the **maximize/fullscreen button at `ControlPosition.TOP_RIGHT`** (the very corner) and the **zoom +/- at `ControlPosition.RIGHT_TOP`** so it stacks **directly BELOW** fullscreen in the same right-aligned column (no streetview/maptype/rotate/scale). Placed top-right so they clear the **top-center "Buscar en esta área" pill** AND the **bottom card sheet** (the default bottom-right zoom was hidden behind the mobile sheet). **`gestureHandling: "greedy"`** (Sprint 147) so the **mouse wheel zooms DIRECTLY** when the cursor is over the map — no "usa Ctrl + scroll" overlay — and mobile keeps one-finger pan + pinch-zoom. (Was `"cooperative"`; the Yelp mobile shell uses a fixed-viewport non-scrolling page, so greedy can't trap page scroll.) (Replaced the older raster + inline-`styles` + legacy-`Marker` basemap.)
- **Pins = `AdvancedMarkerElement` with HTML content** (NOT a `PinElement`/default red glyph): a **30×40 navy `#162543` teardrop** SVG (anchored at the base) with the result **number in white bold** centered in the head, mirroring the card's rank badge 1:1 (`numbering[proId]`). **Active/hover** (hovering the card OR the pin): the pin turns **brand blue `#008ce0`**, **scales 1.15×** and raises z-index (CSS `.ccr-pin.is-active`).
- **Card ↔ pin shared highlight** keyed by **`proId`** (`#pro-card-<proId>`): pin hover rings + scrolls the card; card hover highlights the pin — done with a **delegated document `mouseover`/`mouseout`** listener in the (client) map so it works against the server-rendered cards (no buscar-page change). One `setActive(proId,on)` toggles both.
- **PIN interaction — clean Airbnb/Google-Maps model** (rewritten Sprint 165; the canonical spec — don't patch around it):
  - **Desktop HOVER** → a stable mini-card preview floated above the pin (a white `rounded-[14px]` ~240px card: initials avatar `#EBF5FB`/`#009FD9`, name + the **"Verificado" pill** when verified, profession labels, ★ rating (N), `₡… /unit` price in `#008ce0`). 150ms close-debounce so pin→card doesn't flicker.
  - **Desktop CLICK** → `router.push` straight to `/{locale}/profesionales/{slug}` (reliable navigation — NOT just opening the popup).
  - **Mobile TAP** → shows the same stable mini-card; the card is an `<a>` → tap it to open the profile.
  - **The popup "Verificado" matches the /buscar CARD badge EXACTLY**: `Badge variant="verified"` / `.ccr-ver` — solid brand-blue `#009FD9` rounded-full pill, white, `10px`/`600`, padding `2px 8px`. Never green text + `✓`. **This is the ONE verified mark everywhere a pro is shown** — incl. the **solicitar-servicio (booking) modal's left panel** (sprint 316), which previously used a green `✓ Verificado`. The booking modal's left panel is a **light brand-blue tint** (`bg-gradient-to-br from-[#EBF5FB] via-[#e3f3fb] to-[#cce7f7]`, dark `#111827` text, `#009FD9` avatar/step/pill accents, a `#bfe0f3` divider from the white form) precisely SO the solid-blue pill reads with the same crisp contrast it has on the white /buscar card — don't put the blue pill on a dark/blue fill.
  - **NO hover vibration — the DEFINITIVE fix = DECOUPLE close from the pin boundary** (Sprint 171, after 148/155/160/165 all tried to stop the "steal" and failed). Mechanism: the popup was OPENED on the pin's `mouseenter` and CLOSED on the pin's `mouseleave` (debounced). The popup's wrapper / the `1.15×` is-active scale momentarily sits under the cursor and steals the pin's hover → the pin fires `mouseleave` → close → the cursor is back on the pin → `mouseenter` → reopen → an open/close LOOP = the vibration. The flicker isn't the steal itself — it's that a steal triggers a CLOSE. **FIX: never close on a pin's own `mouseleave` (handler removed).** `mouseenter` switches the highlight/popup to that pin (clearing the previous via `activePinRef`); same pin re-enter = no-op (deduped). The popup closes ONLY on: hovering a DIFFERENT pin/cluster, a MAP CLICK (`map.addListener("click", hidePopup)`), or the cursor leaving the WHOLE map (the wrapper's `onMouseLeave={hidePopup}`). So a steal can NEVER produce a loop — there's nothing left to toggle it. Removed the debounce (`closeTimerRef`/`cancelClose`/`scheduleClose`) + the card/cluster keep-open handlers; `neutralizePopup` (pointer-events:none on the popup marker) stays as belt-and-suspenders. Position computed once on open; deduped by key. Same model for clusters. **Treat pin + popup as ONE hover region; close only on map-leave/click/switch — do NOT reintroduce a pin `mouseleave` close.**
- **CLUSTER (2+ pros at one spot)** (Sprint 165): **desktop HOVER** → a stable combined mini-card "**X profesionales aquí**" listing the grouped pros (avatar + name + Verificado + ★rating + price, each row → that profile; capped at 6 + "+N más") — pick one directly from a 2-3 cluster. **CLICK/TAP (desktop + mobile)** → **`zoomToCluster`** fits the map to the members' positions to SEPARATE them into individual pins (Airbnb-style; +2 step if all at one point, clamp ≤18), after which the individual pins behave normally. The lib's default click-to-zoom is disabled (`onClusterClick:()=>{}`); OUR `el` click does it. The cluster popup is stable via the same `neutralizePopup`.
- **ONE shared marker definition** (`teardropEl(num)`) builds BOTH result pins AND cluster bubbles, so every marker is visually identical (same teardrop shape/size/color/font) — only the number inside differs (result number vs cluster count). Never add a second marker style.
- **Clusters are INTERACTIVE, never dead**: hover (desktop) / tap (mobile) on a cluster opens a **members-preview popup** — a **scrollable list** of the grouped pros (each row = avatar + name + Verificado pill + ★rating + price, linking to that profile → *see & pick*), capped at 6 with a "+N más" line. **To separate the pins the user simply zooms in** (wheel / pinch) — there is **NO zoom-to-separate button** (removed Sprint 148; it was redundant + cluttered the popup). Deduped by the cluster's position key (no re-hover rebuild). The MarkerClusterer's default **click-to-zoom is disabled** (`onClusterClick: () => {}`) so it can't fight the popup. Each individual marker carries `_pro` so the renderer can list its cluster's members (deduped by `proId`).
- **"Buscar en esta área" (search-this-area, Airbnb/Uber-style):** after a USER pan/zoom (suppressed during the programmatic `fitToMarkers`), a floating white pill button shows **top-center over the map**. **Sprint 149 — it now SYNCS the location filters to the area** (instead of pushing raw bounds): clicking it **reverse-geocodes the map CENTER** (`new google.maps.Geocoder().geocode({location})`) to its province + cantón names, maps them to our IDs (`matchProvinceCanton`), and `router.push`es `/buscar?...&provincia=…&canton=…` (page reset; raw `n/s/e/w` dropped). The **cantón is set only when zoomed in** (`map.getZoom() >= 11`, viewport ≈ a cantón); otherwise province only. Best-effort: a geocoder failure falls back to **`nearestProvinceId(center)`**. Other filters (category/sort/verified/aseguradora/q) are preserved. So the filters, the count label and the results all reflect the searched area. The button hides again once results load (`renderMarkers` resets it). Works desktop + mobile. (The legacy `searchProfessionals({ bounds })` N/S/E/W post-filter still works for direct-URL bounds, but the button no longer emits them.)
- **Area-aware count label** (Sprint 149, `page.tsx`): the "X profesionales en <área>" subtitle resolves the place name as **cantón (most specific) → province → searched map AREA (bounds centroid → `nearestProvinceId` name) → generic "en Costa Rica"** — so the count and the place name always match what's actually searched/filtered (e.g. selecting cantón Atenas → "X profesionales en Atenas"). Used by BOTH the desktop header and the mobile sheet count.

### Save feedback — autosave + status
- Editors **autosave** (profile-editor debounces 1.5s; services/availability persist on each action). Show the shared **`SaveStatus`** line so the user never wonders "did it save?": `Guardando…` (spinner) / `Guardado` (check) / `Cambios sin guardar` (amber). Keep a manual "Guardar cambios" affordance where a debounce window exists (profile-editor), backed by the `UnsavedChangesGuard`.
- **`SaveStatus` COLLAPSES when fully idle** (renders nothing — no reserved empty row). It used to always reserve a 20px row at the TOP of every editor, which left an **excessive gap between a section's title and its content** (the title→content distance must stay tidy, ~`CardHeader pb-3 + CardContent pt-1`). The status now appears only during/after a save (or when dirty), so the idle view is tidy and consistent across "Mi perfil", "Casos de éxito", "Disponibilidad" (and the client panel). For the persistent "saved automatically" reassurance, use an inline muted line **inside** the content (e.g. the Servicios editor's centered "Los cambios se guardan automáticamente." at the bottom) — NOT a reserved top row that pushes content away from the title.

### Optional public contact email
- Pros can opt in to a **public contact email** (`professionals.contact_email`, migration 049 — nullable). Validate the email in the editor; only render the **"Escribir por correo"** option on the profile when it's non-empty. It joins WhatsApp/Llamar as a contact channel and follows the same self-block (own profile → `SELF_MSG.email` modal).

### "Ver horario completo" opens Solicitar
- On /buscar cards the **"Ver horario completo"** control opens the **Solicitar servicio** booking flow (`openBooking()`), not the profile page — the client lands directly in booking (and it self-blocks on the pro's own card).
- **Profile contact card reuses ProfessionalSchedule in `stacked` mode (Sprint 179).** The
  /profesionales/[slug] right contact card renders `<ProfessionalSchedule stacked showSolicitar … />`
  so it MIRRORS the /buscar card exactly: location tabs (switch the address) → that location's 3-day
  strip → mutually-exclusive buttons. `stacked` = single vertical column (no two-column grid, no `info`
  slot). In stacked mode the contact buttons ALWAYS show, plus a filled "Ver horario completo" when
  bookable — i.e. bookable → **Ver horario completo (filled blue) + WhatsApp (filled green) + Llamar
  (white/neutral-outlined)**; not bookable → WhatsApp + Llamar (coral note above). **On the profile
  these buttons use the SHORT labels "WhatsApp" and "Llamar"** (`schedule.whatsappShort`/`callShort`,
  gated on `stacked`) and **Llamar is a neutral white-outlined button** (`border-[#e5e7eb]
  text-[#374151]`), per the reference. The /buscar card (non-stacked) is **unchanged** — it keeps the
  full "Contáctanos por WhatsApp"/"Contáctanos por llamada" labels and the blue-filled Llamar. **NO
  "Solicitar servicio" on the profile** (the WhatsApp/Llamar buttons replace it; Sprint 181). The
  profile fetches `availability_slots` itself (`profileSlots`). Verificación (Sobre mí) + the header
  use the canonical blue `Badge variant="verified"` pill — never green text.
- **No standalone "Disponibilidad" TAB on the public profile.** The contact card already shows the
  schedule (location tabs + 3-day strip + booking/contact), so a separate Disponibilidad section would
  only duplicate it — the profile content tabs are **Servicios · Casos de éxito? · Formación? ·
  Reseñas · Sobre mí** (no Disponibilidad). Do not re-add it.
- **Booking modal = two panels (`booking-modal.tsx`, Sprint 177).** LEFT = navy gradient `from-[#1a2744] via-[#13294a] to-[#009FD9]`, ~320px, **centered**: avatar → name → green "✓ Verificado" (`#34d399`, verified pros) → specialty → ★rating(count) → location → "Desde ₡…" → a "QUÉ SIGUE" 3-step list pinned to the bottom. RIGHT = white: header ("Reservar cita" `t("title")` + step-progress + ×), then the calendar step as **two sub-columns** (calendar | that day's slots, `md:grid-cols-2`). Calendar: every AVAILABLE day shows a **blue dot**, today is **"HOY"**, selected = filled brand-blue. Slots are **grouped by franja** Mañana(`Sun`)/Tarde(`Sunset`)/Noche(`Moon`) — grey icons (serious-app rule) — as equal-width `grid-cols-3` pills; no day selected → an empty-state (`CalendarCheck` + "Elige un día disponible…"). Sticky footer: selected "fecha · hora" left + "Continuar" right (disabled until a time is picked). Brand `#009FD9` + Inter (NOT the screenshot's `#008ce0`/typeface).

### Profesiones — one card per profession (profession → services)
- **The section/tab is "Profesiones"** (professions are the group; services nest under each). Professions are managed ONLY here — there is **no separate Profesiones block in "Mi perfil"** (consolidated, never edit in two places). Profession cards have **no icon**; the first profession shows a **"Principal"** tag and others show a **"Hacer principal"** action (`makePrincipal` → index 0).
- **Services ↔ projects = surfacing, not auto-routing.** A pro's services power a **relevance cue** in "Buscar proyectos": projects whose title/description match the pro's service keywords (≥4-char tokens) get a **"Coincide con tus servicios"** badge and sort first. Open projects stay category-filtered server-side. Do NOT auto-notify/route projects to pros (spam + false matches at this scale).
- **"Otro" is NEVER a match key (Sprint 223).** `OTHER_CATEGORY.id = "otro"` is a freeform catch-all — two different "Otro" entries (e.g. "yavines" vs "payasitos") are unrelated, so it must never drive the project→pro **matching/notification** in `api/projects/route.ts`. The new-project notify (POST) skips entirely when the project is "Otro" (`categoryId !== OTHER_CATEGORY.id`); the pro browse feed (GET) filters "otro" out of the pro's professions before the category match (`matchable = professions.filter(p => p !== "otro")`) — real professions + uncategorized (null) projects still surface; an "Otro"-only pro sees only null-category projects, never the "Otro" bucket. The fix lives in the QUERY so it covers EXISTING "Otro" pros/projects, not just new signups.
- **Master–detail layout — RESPONSIVE at `lg` (1024px) (Sprint 231).** The professions are the MASTER (selectable, drive `selectedProfession`); the selected profession's services are the DETAIL. **Desktop (≥lg):** a fixed **`hidden lg:flex lg:w-[230px] shrink-0`** vertical sidebar of profession cards (name + quiet **blue "Principal" TEXT** on the main one + service count + chevron; dashed **"+ Agregar profesión"** at the bottom) beside the detail **`flex-1 min-w-0`** (wrapper is `flex gap-4`, NOT a grid). **Mobile (<lg):** the sidebar is hidden and the professions become a **horizontal scrolling TAB ROW** — `flex gap-2 overflow-x-auto hide-scrollbar`, each tab **`shrink-0 w-[160px]`** (name truncate + count, blue "Principal"), ending in a dashed **"+ Agregar"** tab; the detail is FULL-WIDTH below. The DETAIL header is just the **profession name `text-lg` bold** + "N servicios publicados" + a **"Principal" pill** (main) / **"Hacer principal"** link + remove trash (>1) — **no "SERVICIOS DE"/"TUS PROFESIONES" eyebrows, no `intro` explainer box, no tab subtitle** (all removed Sprint 231 for a cleaner UI). Services list = bordered cards (name, description, price, edit/delete) + a dashed **"+ Agregar servicio"**; the **EMPTY state is a dashed "+" card that IS the add affordance** (`addFirstInProfession` + `addFirstHelp`). Add/edit service is a **focused `Modal`** (full-width bottom-sheet on mobile, centered on desktop; name, short description, **price = ₡ amount + unit `<select>` + "Precio a consultar" checkbox**). Autosave (`persist`) on every add/edit/remove/make-principal is unchanged; status shows in the tab header overlay (no in-flow text). The dashboard heading stays **"Profesiones y servicios"**; sidebar nav stays **"Profesiones"**.
- **Custom profession = "¿No ves tu profesión?" SUGGESTION, never an "otro" category (Sprint 225; replaced the Sprint-213/224 "Otro" category-add).** The "Agregar profesión" picker mirrors publicar-proyecto's category picker EXACTLY: when the catalog lacks it, the pro doesn't add an "otro" profession — they **suggest** it. A **"¿No ves tu profesión?"** (`notListed`) link reveals an input (`suggestNamePlaceholder`) + **Enviar**/**Cancelar**; on send it POSTs `{name}` to **`/api/categories/suggest`** (a tracked **admin-moderation** ticket in `category_suggestions`, NOT a usable/filterable category) and shows **`suggestThanks`** ("Gracias. Enviamos tu sugerencia al equipo para revisión."). NO category is added to the account and there is **NO auto-matching** — this is why the **`addOtro` flow was removed**: an "otro" profession used to drive the project→pro `new_project` notification (an "otro" project matched every "otro" pro — the yavines↔payasitos false match). The no-match message (`pickerNoResults` + `pickerNoResultsHint` "Sugiérela abajo y nuestro equipo la revisa.") points to the suggestion box. **The query-level removal of "otro" from project↔pro matching (Sprint 223, `api/projects/route.ts`) stays** and covers EXISTING "otro" pros/projects; legacy "otro" professions still display/edit (back-compat) but never match. Responsive at ~360px (input `min-w-0 flex-1`, buttons `shrink-0`).
- **The suggestion box is ONE shared component, used in BOTH pickers (Sprint 226).** `components/ui/category-suggestion.tsx` `<CategorySuggestionBox>` is the single implementation of the "¿No ves tu categoría?/profesión?" escape hatch — rendered identically by the client picker (`CategorySearch`, publicar proyecto) and the pro picker (`services-editor`, agregar profesión). Same markup/flow: collapsed link → input + **Enviar**/**Cancelar** → POST `/api/categories/suggest` → green `Check` + `suggestThanks`. The differing noun (categoría vs profesión) and i18n keys are passed as **props**; internal state is self-contained and resets on re-mount. **Sprint 226 also DELETED the last selectable "Otro" anywhere** — `CategorySearch` no longer shows the "Otro servicio — describirlo en mi perfil" row (and dropped the `OTHER_CATEGORY` import + `otherGroup`/`otherOption` i18n). So NOTHING creates new `category_id="otro"` rows: an unlisted service in registration/publicar-proyecto becomes a **suggestion the admin reviews**, not a dead "Otro" bucket. `OTHER_CATEGORY`/`getCategoryLabel("otro")` are kept ONLY to render legacy "otro" data. When adding a NEW category-using picker, reuse `<CategorySuggestionBox>` — never re-introduce a selectable "Otro". **(Sprint 276)** the **navbar Categorías mega-menu search** also renders `<CategorySuggestionBox>` on a no-match (unified wording `categorySearch.noResults` "No encontramos esa categoría" + `noResultsHint` "Sugiérela abajo y nuestro equipo la revisa."), and **/categorias** uses the SAME wording (its dropdown scrolls to the contained `#sugerir-categoria` card). For portaled dropdowns the box exposes **`onActiveChange(active)`** so the host stays open while the suggest input is focused (the search input blurs to it). **(Sprint 292)** The **navbar Categorías mega-menu** does NOT use a portaled suggestions dropdown (that stacked a second box over the curated columns); its `CategoriesMegaPanel` **filters the category list IN PLACE** — empty shows the curated 3-column grid, typing replaces it with matching categories inline (same container), and no-match shows the suggest flow inline. Rule: inside an already-open panel/menu, filter results IN PLACE — never open a second floating/portaled container on top of it. **(Sprint 305)** The category-not-found block is now just the **"No encontramos esa categoría" message + the "Sugerir categoría" suggest action** — the **"Ver todos los profesionales" link was REMOVED** everywhere it appeared (navbar mega-menu, navbar mobile autocomplete, /categorias search box). Rationale: a user who searched a specific category wants THAT category (or to suggest it), not a dump of every professional; "Ver todas las categorías" (→ /categorias, kept at the mega-menu footer) already covers browsing. Do NOT re-add a "Ver todos los profesionales" link to the no-match block. Search placeholders stay SHORT ("Busca un servicio…", no "… ejemplo: …" lists) so they never truncate at ~360px (R2).
- **Approved suggestions become REAL categories via a runtime overlay (Sprint 227).** The catalog is the static `lib/data/categories.ts` (mirrored in the `categories` DB table), so a suggestion can't be added by editing source at runtime. Instead, when an admin **approves** a `category_suggestions` row it's loaded into a **runtime registry** (`setCustomCategories`/`getCustomCategories`/`getAllCategories` in `categories.ts`) and merged into `searchCategories` + `getCategoryLabel` — so it's instantly **selectable + searchable** with no deploy. Client load is one-time per page via `useCustomCategories()` (`lib/data/use-custom-categories.ts`, fetches `GET /api/categories/approved`) and a global `<CustomCategoriesLoader/>` in the locale layout; pickers that iterate the list use `getAllCategories()`, and `CategorySearch` shows customs under an **"Otras categorías"** browse group. Custom ids are `sg_<slug>`; `getCategoryLabel`'s fallback strips the `sg_` prefix so they never render raw. **Admin review** (`/admin/categorias`, `admin-categories.tsx`, Spanish-only): pending rows are **inline-editable** (fix wording before approving), **Aprobar** is one click (also upserts into the `categories` table), **Rechazar** discards, a `findSimilarCategory` check `confirm`s near-duplicates, and the **Categorías** sidebar badge shows the pending count (`pending-counts` → `categorias`). Unlike "otro", an approved custom category is a real category and **does** drive project↔pro matching — that's intended.
- **Enter = resolve-to-best-match (Sprint 170).** In every profession/service search (the `/buscar`
  `MobileServiceSearch` + sidebar text input, and the home hero service field), pressing **Enter on a
  PARTIAL term auto-resolves to the highlighted OR first/best taxonomy suggestion and searches THAT**
  (e.g. "electrici" → "electricista" via `categoria`), never the literal partial string. No match →
  graceful literal `q` search. Clicking a specific suggestion still works. Don't regress Enter back to
  a raw text search.
- **Clarity (Sprint 166): the profession→service hierarchy is made EXPLICIT** so "Agregar profesión" vs "Agregar servicio" can't be confused. A top **explainer** (`intro`, bolded terms) states a profession = an area you work in, services = specific priced items within it. The LEFT column is headed **"Tus profesiones"** (`step1Title`); the RIGHT panel carries a **"Servicios de · <profession>"** eyebrow (`servicesOf`) tying it to the left selection. Both dashed add-buttons share one polished style (`#0089bb`, `gap-2`, font-semibold, hover border) but live in their own labelled contexts (profession-add under the list, service-add inside the profession's panel). The explainer SPELLS OUT examples — **"por ejemplo," not "p. ej."** (Sprint 173; the app avoids abbreviations like "Ej."/"p. ej." everywhere).
- **Service rows never overlap name↔price** (Sprint 172, editor + public profile). Two-column flex: name + description **`flex-1 min-w-0 break-words`** (a long unbroken name WRAPS within its column), price **`shrink-0 max-w-[10rem] break-words text-right`** (realistic price one line; huge one wraps within a cap — never clips/overflows), `gap-3` between. Don't drop the `break-words` — without it a long no-space name spills onto the price.
- **Casos de éxito attach to a SERVICE INSTANCE by `serviceId`, never by name or profession.** Several services with the same name (e.g. three "Otro servicio") must NOT share photos. `PortfolioItem = { url, serviceId?, profession? }` (`profession` kept for legacy back-compat). Photos not tied to a current service fall into an **"Otros trabajos"** bucket (never lost).
- **Disambiguate duplicate names** with `serviceLabelMap(services)` (`lib/services.ts`): when a name repeats it appends the description snippet, else an ordinal "(2)", "(3)". Use this label both in the editor (PhotoGallery) and the public profile casos tab so repeated services are always tellable apart.

### Company / brand vs personal name hierarchy
- When a pro has a **business/brand name** (`business_name`), it **leads** as the prominent title (clients recognize the brand) and the **personal name becomes a muted subtitle** (`text-[#6b7280]`) directly below — on both the /buscar card and the profile header. No business name → the personal name is the prominent title and there's no subtitle. Keeps cards uniform height. Helper vars on the card: `brandPrimary` / `brandSecondary`.

### Profile completion (professional)
- **Pattern:** modeled on **Airbnb's "complete your listing" checklist + LinkedIn's profile-strength meter** — a single bordered card; everything inside is flat, divider-separated rows (R1: no nested boxes).
- **Placement:** the `ProfileCompletion` card sits at the **TOP of the dashboard**, full-width **above** the sidebar+content columns (a prominent banner), **not nested inside the "Mi perfil" section**. It renders whenever incomplete OR there's a not-yet-dismissed optional verification invite; it returns `null` once the profile is 100% AND (identity verified **or** the optional verification invite was dismissed) — `if (complete && !showVerify) return null`, `showVerify = !verified && !dismissedVerify`.
- **Design:** a **linear strength meter** (brand-blue gradient `#009FD9→#33b4e0`, flips green `#16a34a` at 100%) with a **big live percent** and a motivating **"Te faltan N pasos"** line (ICU plural). Below it, ONLY the remaining steps as **flat tappable rows** (≥56px tap target, hover tint, a hollow bullet that turns blue): label + one-line benefit + a **"Completar"** action/chevron that deep-links to the exact tab. **Only PENDING items are listed** — no done-items checklist (cleaner). The **bio counts only at ≥40 chars** so a junk "test" description never completes. Compact/responsive from ~360px; recomputes live on every save.
- **Verification = OPTIONAL, never "missing" (Sprint 173).** At 100% the headline subtitle is positive and verification-free ("Tu perfil ya está listo para recibir clientes.") — NEVER "100% + te falta Verificado" (that contradiction is banned). Identity verification is mentioned exactly ONCE, as a **separate, dismissible OPTIONAL opportunity** row tagged **"Opcional"** (brand-blue tint), with a **"Verificar"** action and an **"×" ("Ahora no")** that hides it and PERSISTS in `localStorage` (`contratacr_verify_dismissed_<proId>`) so it never nags again; the pro can still verify anytime from the **Verificación** section. Verification is NEVER in the % (see calc bullet).
- **Calculation — completing the list ALWAYS reaches 100%.** Computed by `computeCompletion(pro)`, **context-aware**, counting only fields the pro fully controls: photo, bio (≥30 chars), ≥1 service, location/coverage, WhatsApp (+ aseguradoras **only** for health pros via `anyHealthCategory`). **Identity verification is NOT in the percentage** — it's approval-gated and impossible to auto-pass for non-padrón IDs (DIMEX/NITE), so counting it left pros permanently **stuck at 83%**; it's surfaced as a recommended action instead. Location is "done" on ANY location signal (workplaces / coverage_areas / coverage_provincias / coverage_country / provincia_id / canton_id) — never tied to how `service_type` is stored. Spanish-only languages and "I have none" are never penalized. Frame each prompt by its benefit, never as nagging.

### No self-report
- A professional must **not** be able to **Reportar** their own profile. On their own profile the "Reportar perfil" item is replaced by a muted **"Este es tu perfil"** row (with a lock), consistent with the show-but-block self-service pattern.

### Phone: one number vs two (WhatsApp + calls)
- **One number → both; two → split.** The pro's **"Número de WhatsApp"** (`professionals.whatsapp`, required) is used for WhatsApp **and** for calls — UNLESS they add an **optional separate "Número para llamadas"** (`professionals.call_phone`). This is stated explicitly under the WhatsApp field (`whatsappHelp`) and the call field (`callHelp`). The **WhatsApp** button always uses `whatsapp`; the **"Llamar"/call** action uses `callPhone ?? whatsapp`. Validate both as phone numbers (`PhoneInput`).
- **Booking PREFILLS the phone** from the user's profile, never asked from scratch: from `profiles.phone`, and if empty, falls back to the booker's `professionals.whatsapp` (a pro's number lives there). When a number is on file the contact step's phone prompt is skipped (`needsPhone = isLoggedIn && !profilePhone`); editing happens in the profile.

### Disponibilidad editor — recurring weekly schedule (Calendly/Cal.com model)
- **Schedules are PER-LOCATION ONLY — professions are NOT tied to when/where (standing model).** The three axes are kept separate and simple: **Professions/services = "what I do"** (profile info, managed in Servicios), **Locations = "where I work"** (workplaces + optional "A domicilio"), **Schedules = "when, per location"**. A pro just sets, *per location*, when they're available; the **specific service is coordinated at contact/booking**, never by cross-tying the calendar to a profession. Do **not** re-introduce a profession dimension into the availability editor or the materialized slots — it was combinatorial (locations × professions), the public profile never filtered by it, and the `UNIQUE(pro,date,time)` constraint already prevents a pro being in two services/places at once. `availability_slots.category_id` (and the same column on `availability_weekly`/`availability_exceptions`) is **left nullable for back-compat but always written `null`**; booking context (which service) is derived from the **searched/primary profession**, not from the slot.
- **The editor edits a recurring WEEKLY template + date EXCEPTIONS, MATERIALIZED into `availability_slots`.** The pro sets **"Mis horarios de siempre"** (a weekly schedule that repeats automatically) and, optionally, **"¿Un día distinto?"** overrides for specific dates. On every edit AND on editor mount these are **materialized** — generated into concrete `availability_slots` for a rolling **70-day** window. Everything downstream (the /buscar card, booking modal, public profile) keeps reading `availability_slots` **unchanged** — no downstream code touched. Bookings reference `scheduled_date`/`scheduled_time` (**NOT** `availability_slots.id`), so regenerating slots **never breaks an existing booking** (verify this invariant before any change to the materializer). Source-of-truth tables: `availability_weekly` + `availability_exceptions` (migration 057), both keyed by **location** (category_id left null).
- **Privada is OFF by default.** A new pro is registered with `availability_public = true` (+ `contact_preference = "ambas"`). The **"Disponibilidad privada"** toggle HIDES the published agenda (deletes the materialized slots) but **KEEPS the weekly template + exceptions**, so turning público again **restores everything** — it is NOT the old destructive "tus horarios serán eliminados". The subtitle is **state-aware** (público → "Los clientes pueden reservar citas en tus horarios."; privado → "Tu agenda está oculta. Los clientes te contactan por WhatsApp."). Keep `contact_preference` in sync (público→`ambas`, privado→`solo_whatsapp`).
- **Four stacked low-border cards, NO step badges, NO profession selector:** (1) "Disponibilidad privada" toggle + subtitle; (2) **"HORARIO PARA"** — location **tabs** (workplaces + **"A domicilio"** when the pro travels; **"+ Agregar lugar"** → `?tab=profile`) — the schedule is scoped to the *selected location only* (no profession picker); (3) **"Mis horarios de siempre"** — a **"Cada cita dura"** duration selector (30/45/60/90/120 min) + **7 Monday-first weekday rows**, each a toggle + one-or-more time **franjas** (`TimeSelect` Desde–Hasta + remove — the time range and its **remove "×" stay on ONE line, "×" pinned to the RIGHT**; the two selects shrink on mobile [`flex-1 min-w-0 sm:w-32`] so the "×" never wraps below the time at ~360px) + **"Agregar franja"** + **"Copiar a todos los días"** (copies that day's franjas to all 7); (4) **"¿Un día distinto?"** — date exceptions via the **"Cambiar un día"** modal (a month **calendar** + three modes: **"Agregar horas extra"** / **"Horario distinto ese día"** / **"Cerrar ese día"**). Each saved exception lists as a **date-pill row** (month + day) with Editar/Eliminar — the **month abbreviation ("JUN") is the brand blue `#009FD9`** (Sprint 222; was coral `#dc5b4b`), the day number stays dark `#111827`, on the `bg-[#f9fafb]` badge. Consistent with the small brand-blue "Hoy" label in the booking calendar. (The mini-calendar's exception-marker DOT stays coral `#dc5b4b` — it's a separate "this date has a custom schedule" marker, not a month label.)
- **A pro can't be in two places at once:** the materializer keys by **location** and dedupes by **(date, time)** across ALL locations (`availability_slots` is UNIQUE per `professional+date+time`; first writer wins). Past/too-soon times are filtered (CR, 15-min lead); a configured franja always yields **≥1** bookable time. Legacy pros with manually-created slots and **no** template keep those slots until they adopt the weekly editor (the mount-regenerate is **skipped when there is no template**, so nothing is wiped pre-adoption). Legacy **profession-tagged** weekly/exception/slot rows are matched by location (any category) and **migrate to `category_id = null`** as the pro edits — no data loss.
- **Cross-location OVERLAP guard = block real overlaps, ALLOW consecutive (Sprint 212; refined 216; bug-fixed 218).** A save is validated (`findOverlapConflict`) before writing: a proposed franja must not overlap any OTHER location on the same day. Overlap is **half-open** (`rangesOverlap` = `aS < bE && bS < aE`), so **touching/back-to-back AND gap-filling ranges are ALLOWED** — Loc A 08:00–14:00 + a one-off 16:00–17:00, then Loc B **14:00–16:00** (fills the gap, touches both ends) is fine; out-of-range times (before 08:00 / after the last block) are fine too; only a TRUE intersection blocks. **No minimum gap / travel time** is enforced. **ONE source of truth for "what a location occupies on a date" = `rangesForLocOnDate`** (applies closed/custom/extra precedence). **Sprint-218 bug + fix:** `otherOccupiedForWeekday` (drives the guidance AND `suggestFreeFranja`) used to read ONLY the recurring weekly rows, ignoring exceptions — so the smart default overshot a one-off (suggested 14:00–17:00 into a 16:00–17:00 extra) and the exception-aware validator then BLOCKED it, making the gap un-fillable. Now `otherOccupiedForWeekday` is the **UNION of `rangesForLocOnDate` across every future date of that weekday**, so guidance + smart default + validation ALL agree (a weekly franja recurs on all those dates, so it must clear every one). **Server-side backstop (migration 061):** BEFORE-INSERT/UPDATE triggers on `availability_weekly` (same weekday) + `availability_exceptions` (same date) reject DIFFERENT-location half-open overlaps, so the rule can't be bypassed by a direct write (weekly↔exception precedence stays client-side). **Messages** (Sprint 217 + 219) communicate **OCCUPIED/taken** (never "disponible") and use a **location-as-LABEL prefix** — `{place}: …` — so they read naturally for a physical place AND the **"A domicilio"** modality (no awkward "en A domicilio"), with **no quotes**: `conflictCross` ES "{place}: ya está ocupado de {start} a {end}. No puedes estar en dos lugares al mismo tiempo. Puedes agregar a partir de las {end}; un horario seguido sí se permite." / EN "{place}: already taken from {start} to {end}…"; `occupiedElsewhere` ES "{place}: ocupado {ranges}" / EN "{place}: taken {ranges}" (muted lock-icon line on each weekday row + the "Cambiar un día" modal). **Exception-mode precedence (verified Sprint 244):** in the "¿Un día distinto?" modal the three modes interact with the weekly template exactly as the materializer (`computeDesiredSlots`) + `rangesForLocOnDate` do — **"Horario distinto" (custom) and "Cerrar" (closed) REPLACE** the weekly hours for that date (custom → its franjas become the base; closed → no slots); **"Agregar horas extra" (extra) ADDS** on top (`franjas = [...weeklyBase, ...extra]`), so `saveException` validates the extra franjas against THAT date's weekly hours (`ownBase`, same half-open rule, consecutive allowed) and blocks an overlap with the dedicated **`conflictExtraWeekly`** message ("Esas horas extra se cruzan con tu horario de siempre de ese día…" / "Those extra hours overlap your usual hours for that day…") — NOT the generic `conflictSelf` (that stays for two proposed franjas overlapping each other). Modes are mutually exclusive per (location,date) — saving one wipes the others for that date. **Toggling a day ON starts with EMPTY time fields (Sprint 220)** — no pre-filled default (the old `suggestFreeFranja` auto-fill was removed). The pro picks any free time from scratch; an empty field shows `--:--`. **Only COMPLETE franjas (both ends set, end>start) are validated, persisted and materialized** (`isCompleteFranja`); INCOMPLETE drafts live in LOCAL state only, so a half-typed range never trips the overlap guard (the old per-keystroke validation blocked picking an earlier start while a later default end was still set) and an incomplete slot can't be saved. The start field has no `min`; the end's `min` (start+30) applies only once a start is picked; the start→end auto-bump fires only when the end is already set. `computeDesiredSlots` + `rangesForLocOnDate` skip incomplete drafts. (The "Cambiar un día" modal is unaffected — it validates only on its explicit Guardar, never per-keystroke.) Responsive: guidance is `text-[11px]`, wraps cleanly at ~360px.
- **Availability is a UNIFIED per-day view (Sprint 238 — supersedes the "HORARIO PARA tabs" in the card list above).** The weekly editor is **day-first, not location-first**: there are NO location tabs and NO "ocupado en otra ubicación" hint. Each Monday-first weekday row lists **ALL its time blocks across ALL locations together**, and each block (`Block = {id, locationId, start, end}`) carries its own **location dropdown** — so a pro configures "Mon: 8–2 Loc A, 3–5 Loc B" in one place. **The dropdown only renders when the pro has 2+ locations** (`isMultiLocation`); a single-location pro just sees times. A one-tap **"Lun–Vie, 8 a. m.–5 p. m." preset** (`presetWeekdays8to5`) and **"Copiar a todos los días"** (`copyToAll` — copies the day's full set, with locations, to **all 7 days incl. weekend**; the weekday-only case is served by the separate "Aplicar Lunes a viernes" preset) are the quick wins; appointment **duration is ONE global value**. **Backend is unchanged** — each block still writes its own `availability_weekly` row (`location_id`, category null) and the materializer/`(pro,date,time)` UNIQUE are untouched. The cross-location **overlap rule is preserved**, just re-expressed: `validateDayBlocks(weekday, blocks)` checks that on every future date of the weekday NO two effective open ranges (any location, exception-aware via `rangesForLocOnDate`) overlap (half-open; consecutive allowed); `persistDay(weekday, blocks)` rewrites the **whole weekday atomically** (all locations) so changing a block's location is one validated write. The smart **8–5/empty** default on enable is kept (`smartDefaultBlock`). **Exceptions ("¿Un día distinto?") stay per-location** via a small location selector in that card's header (multi-location only) — `genLocation` now scopes only the exceptions. Existing per-location data needs NO migration: rows load and simply show together. **Visual treatment (Sprint 239, refined 240–242):** the **preset** is a polished on-brand shortcut pill — a leading **`CalendarClock` glyph in a filled `#008ce0` blue circle** + a **navy `#162543` semibold** label that **starts with an action verb** so it reads as a button, not a static label: "**Aplicar** Lunes a viernes, 8:00AM – 5:00PM" / "**Apply** Monday to Friday, 8:00AM – 5:00PM" (days spelled out — NO "Lun–Vie" abbreviation), `bg-[#EBF5FB]`/`border-[#bfdbfe]`/`shadow-sm`. Each **multi-location franja** is **location-FIRST**: the **location `<select>`** (`h-9 w-full`, `MapPin` prefix) sits **ABOVE** the time range (Desde–Hasta + remove ×), reading top-to-bottom "where → when" and stacking cleanly on mobile — **no background or border** (Sprint 240 removed the earlier gray `#f9fafb` tint; spacing + the bordered select carry the grouping, cleaner and R1-compliant); the block is `w-full` on mobile and `sm:w-fit` on desktop (aligns the select to the time-row width). **Single-location pros keep the plain time row** — no location UI. **Time format (Sprint 241, uppercased 242):** availability times render in the compact **UPPERCASE attached** style **"8:00AM – 5:00PM"** (no "a. m." periods/spaces) — this is the `to12h` helper in `time-select.tsx`, used ONLY by the availability editor (the `TimeSelect` button + options, the conflict/occupied messages, the exception summaries). **This is the app's ONLY 12-hour meridiem display** — the booking picker and the /buscar + profile schedule strips render **24-hour `HH:MM`** (e.g. "15:00"), so there is no am/pm to keep in sync; the **AM/PM is always UPPERCASE** (never lowercase "am/pm" anywhere). **Arrow spacing (Sprint 242):** the `TimeSelect` button **dropped its leading `Clock` icon** (`pl-3.5 pr-10`) so the time text clears the right-side `ChevronDown` with breathing room — also makes it consistent with the duration/location selects (no leading icon). **Do NOT bring back location tabs** — adding a location to a day is a per-block dropdown.
- **"A domicilio" + multi-location** are unchanged downstream: materialized slots carry `location_id` (and `category_id = null`), and `cov_domicilio` renders as the **"A domicilio"** tab on /buscar (no street address). `A_DOMICILIO_LOC = "cov_domicilio"` (starts with `cov_` so it flows through the coverage-zone path). The editor's empty-state `needLocation` copy points pros to add a workplace or enable "Me desplazo donde el cliente". On /buscar, the schedule shows **all** of a pro's slots regardless of the searched profession (the old `activeCategory` slot filter is retired; `activeCategory` now only sets booking context).
- **NO "Videoconsulta" option** (removed earlier; most services are in-person). **"Permitir contacto por llamada" is NOT here** — it lives in **Mi perfil → Contacto** (`allow_phone_call`). **Dropped in this redesign:** the old date+range+interval slot generator and the "Tus horarios próximos" list (the recurring template replaces both).

### Contact visibility is INDEPENDENT of "Disponibilidad privada"
- **WhatsApp and call are NOT gated by the privada toggle.** The privada toggle controls only the **published schedule** (privada ON ⇒ no booking slots; privada OFF ⇒ schedule shown). Both states keep WhatsApp + call.
  - **WhatsApp** shows whenever the pro has a WhatsApp number — in BOTH states. On the /buscar card the small **top-row WhatsApp + call icons** (next to the name) render consistently on EVERY card when their own condition is met (`showTopWhatsApp = !isOwn && whatsapp`; `showTopCall = !isOwn && allow_phone_call && (callPhone || whatsapp)`) — they are NOT gated by the privada toggle or by `contactOnly`. On the profile it's always the green "Contactar por WhatsApp" CTA.
  - **"Llamar"** shows whenever **`allow_phone_call`** is enabled (and a reachable number exists: `callPhone ?? whatsapp`) — in BOTH states, never tied to privada being ON.
  - **"Solicitar servicio" / booking** is the only action gated by `availability_public` (privada OFF). The full-width primary button is separate from the top-row icons — a contact-only card may show both the WhatsApp top icon AND the "Solicitar por WhatsApp" button; that's intended (consistent contact affordance), not a duplication bug.
- **Bug to never reintroduce:** do NOT write `availabilityPublic ? <Booking/> : <Llamar/>` — that hid the call option whenever the schedule was public. Booking and Llamar are independent conditionals, each on its own gate. Likewise do NOT re-add a `!contactOnly` gate to the top WhatsApp icon.
- **Removed:** the orange **"Coordina por WhatsApp" / "Solo WhatsApp"** lock-icon badge (it sat with the service chips on contact-only cards). It was redundant with the prominent "Solicitar por WhatsApp" primary button (which already signals no in-app agenda) and the lock icon was unclear + clashed with the serious-icon tone. Do not reintroduce it.

### Dismiss standard — tap-away + Escape (always)
- **Every** dropdown, menu, autocomplete, popover, modal, and date/time picker MUST close on **click/tap outside** AND on **Escape**, and return focus sensibly. Prefer **Radix** primitives (Dialog/Select/Popover) — they handle this for free. For a CUSTOM outside-click handler, **listen to `mousedown` AND `touchstart`** (mousedown alone can miss touch taps) and add a `keydown`/Escape handler. The content node should `stopPropagation` (or be ref-excluded) so taps inside don't self-close.
- A modal scrim (`absolute inset-0` / overlay) gets `onClick={onClose}`; the dialog body stops propagation. Never trap the user in an overlay with no tap-away exit.

### Responsive baseline (standing rule)
- Everything must fit and stay clean from **~360px** up to desktop: **no horizontal scroll**, no off-screen or overlapping elements, no truncated names/labels/placeholders that hide meaning (wrap or shorten on small screens — e.g. `line-clamp-2 md:line-clamp-1`, shorter mobile placeholders).
- **Actions stack full-width on mobile, inline on desktop** (`flex-col sm:flex-row`, buttons `w-full sm:w-auto`); filter/tab rows use `flex-wrap`. Comfortable tap targets (≥ ~36px), not cramped or too close. Inputs must not hide behind the keyboard.

### Autocomplete/dropdowns must OVERLAY content (stacking)
- An autocomplete/suggestion dropdown must render **on top of everything below it**, never behind. `absolute z-50` **only stacks within its own stacking context** — if a LATER, opaque sibling section (e.g. an `bg-…` grid below the hero) is `z-auto`, it paints over the dropdown that overflows the hero. **Fix the ancestor**, not just the dropdown: give the section/container that holds the search a **`relative z-30`** (above the following sections, below the fixed navbar `z-50`), or portal the panel to `body` with `fixed` positioning (see `CategorySearch`). Verify no ancestor clips it with `overflow-hidden`. (Concrete case: `/categorias` hero → `relative z-30`.)

### Overlays must never be clipped by parents
Dropdowns, autocompletes, popovers and menus **must render in a portal to `document.body`** (or otherwise escape the layout) so a parent with `overflow:hidden/auto` (cards, **accordion `Section`s** whose open animation clips), or a low stacking context, can't crop them. Pattern (see `CategorySearch`): position the panel **`fixed`** from the trigger's `getBoundingClientRect()`, recompute on `scroll` (capture) + `resize`, **flip up** when there's more room above than below, cap `max-height` to the available space (its own list scrolls), high `z-index`, and treat the portaled panel as "inside" for outside-click detection. Never rely on `absolute` positioning inside a clipping container for an overlay.

### Autocomplete dropdowns: portal + ABSOLUTE-in-document, attached below the field (Sprint 228→229)
ALL typing-autocomplete suggestion lists use **`components/ui/anchored-dropdown.tsx`** — `useAnchoredPosition(anchorRef, open, maxHeight)` + `<AnchoredDropdown anchorRef open maxHeight className>` — and the homepage hero's own `useAnchoredRect` (`landing-hero.tsx`) follows the identical rule. The panel is **portaled to `<body>`** (so no ancestor `overflow:hidden`/`transform` can clip it — e.g. the search pill) and positioned **`position:absolute` in DOCUMENT coordinates**: `left = rect.left + scrollX`, `top = rect.bottom + scrollY`. **Do NOT use `position:fixed`** — `fixed` pins the panel to the VIEWPORT, so on mobile, when focusing the input opens the keyboard and shifts the visual viewport, the panel floats UP and OVER the field (covers what you're typing) and DETACHES on scroll. Absolute-in-document keeps the panel in the same coordinate space as the input, so they move together (page scroll, keyboard shift, internal modal scroll) and it always sits **DIRECTLY BELOW** the field, never over it. It **always opens below** (no flip-up — "directly below" is the rule), clamps `max-height` to the space above the keyboard (`visualViewport.offsetTop + height − rect.bottom`) with **internal scroll** (`overflow-y-auto overscroll-contain`), and recomputes on scroll(capture)+resize+`visualViewport` resize/scroll. Anchor to the field's wrapper (its rect drives width + position). Used by: LandingHero (service + location/address), `/buscar` sidebar search + MobileServiceSearch, CategorySearch, LanguagesInput, AseguradorasInput, AdminUserSearch, landing-navbar (`CategoryAutocomplete` + compact bars), `/categorias` box. **When you build a new typing autocomplete, reuse this — never a bare `absolute top-full` in-flow list, and never `position:fixed`.** Google Places renders its own `.pac-container` (positioned by Google below the input); we only cap it via CSS (`max-height: 45vh; overflow-y:auto`) so a long list scrolls instead of overflowing.

### Long forms — collapsible sections
Break long forms (pro profile, etc.) into **accordion sections** with a header + chevron. **First section open by default, the rest collapsed.** Group logically (e.g. Datos básicos · Profesión · Ubicación y cobertura · Contacto y precios · …). Keep the save bar always visible. This kills the endless single-column scroll.

### Dashboards — ONE account, role-labeled (Mercado Libre model)
**Mobile dashboard nav (tap → section):** when the dashboard uses a **vertical sidebar** (the unified pro panel), on mobile it stacks above the content — so tapping a menu item must **smooth-scroll to that section's content** (`contentRef.scrollIntoView({ behavior: "smooth" })` gated on `matchMedia("(max-width:1023px)")`), with `scroll-mt-20 lg:scroll-mt-0` on the content so the fixed header doesn't hide the section title. Don't leave the user sitting on the menu. (A top **horizontal tab bar** — the client panel — already puts content right below, so it needs no scroll.) The unified panel label is **"Mi panel"** (never "Panel profesional" — it's one unified panel for both roles).

A professional is a **superset** of a client, so a professional uses a **single unified dashboard** (`/dashboard/profesional`) that contains BOTH roles — never two panels to switch between (like Mercado Libre's one account with "Mis compras" / "Mis ventas" together). The sidebar is split into **two clearly-labeled groups** + a standalone Notificaciones:
- **"Mi perfil profesional"** (acting as a professional): Mi perfil · Servicios · Casos de éxito · Disponibilidad · **Solicitudes recibidas** · **Proyectos recibidos** · Verificación.
- **"Contratar servicios"** (acting as a client): **Mis solicitudes enviadas** · **Mis proyectos publicados** · **Mis favoritos**.

**Anti-confusion rule:** label sections so the role is always obvious. Professional-side uses **received** wording ("Solicitudes recibidas" / "Proyectos recibidos"); client-side uses **sent/published** wording ("Mis solicitudes enviadas" / "Mis proyectos publicados"). Visually separate the groups (uppercase group headers + a divider) and give each section title a one-line context subtitle. The client-side views are the shared **`ClientActivity`** component (`section="bookings|projects|saved"`), reused by BOTH the unified pro dashboard and the plain client dashboard — never duplicate the booking/project logic.

**Account "Cuenta y seguridad" (OAuth-aware).** Both dashboards expose login management via the shared `AccountSecuritySection` (`@/components/account/account-security`): **change email** (`updateUser({ email }, { emailRedirectTo })` → confirmation email) and **change password** (`updateUser({ password })`, min 8 + confirm). **Email change is a SINGLE confirmation from the NEW address** — Supabase **"Secure email change" is OFF**, so the copy must say "Revisa tu correo **nuevo**…" and the `change-email.html` template confirms from the new email only (NO "ambos correos"/old-inbox wording, Sprint 249). After confirming, the link returns via `emailRedirectTo → /auth/callback → ?tab=cuenta&emailChanged=1` and the tab shows the green `emailApplied` banner. **Always detect the provider** (`app_metadata.provider` / non-email identities): for **Google/Facebook** accounts, NEVER show password/email fields that wouldn't work — show a clear note instead ("Iniciaste sesión con Google/Facebook. Tu acceso se administra desde esa cuenta."). **Change-password requires the CURRENT password**, verified via **re-authentication** (`signInWithPassword` — never read/handle the hash), then `updateUser({ password })`; **no emailed code while logged in**. A **"¿Olvidaste tu contraseña?"** link sits next to the form as an escape hatch → `resetPasswordForEmail` (the standard reset flow). It lives in the client "Mi perfil" tab and as a standalone **"Cuenta y seguridad"** sidebar item (`tab=cuenta`, `Settings` icon) in the unified pro panel, plus a link in the header account dropdown.

A **plain client** (not a professional) keeps the simple `/dashboard/cliente` (tabs Solicitudes · Proyectos · Guardados · Notificaciones · Mi perfil) plus an **"Ofrecer mis servicios"** card → convert. Only professionals get the two-group unified view.

**Professionals never use `/dashboard/cliente`.** Their client activity lives in the unified panel under "Contratar servicios", so `/dashboard/cliente` **redirects a professional** into the matching unified tab (`bookings→sent_bookings`, `projects→sent_projects`, `saved→saved`, `notifications→notifications`, `profile→cuenta`). Any "go to my projects / my panel" CTA (e.g. after publishing a project) must be **role-aware**: pro → `/dashboard/profesional?tab=…`, client → `/dashboard/cliente?tab=…`.

**Unified notifications (one stream, tagged):** the bell + notifications list show BOTH professional and client notifications from the single `notifications` table, each with a small **context tag** — "Como profesional" (blue) / "Como cliente" (purple) via `notificationContext`/`notificationContextLabel`. `notificationHref(n, role)` is **role-aware**: for a professional, client-context notifications route into the unified dashboard's "Contratar servicios" tabs (`sent_bookings`/`sent_projects`/`saved`); for a plain client, into `/dashboard/cliente`. Unread badge = unread count on the one stream. The header account menu mirrors this (pro → "Contratar servicios" links into the unified tabs).

**"¿Cómo recibes clientes?" — exactly TWO options** (`CONTACT_PREFERENCES`): **"Solo WhatsApp"** ("Los clientes te escriben directo para coordinar.") and **"Agenda + WhatsApp"** ("Los clientes ven tus horarios y agendan, o te escriben por WhatsApp."). **WhatsApp is always available** — the only real choice is whether they ALSO expose in-app scheduling — so never offer an app-only option, and the WhatsApp contact icon shows on every card with a number. `solo_citas` is a **legacy stored value** only; treat it as `ambas` everywhere (normalize on read; migrate in DB).

**Disponibilidad = ONE control (privada), then the recurring weekly schedule.** There is **no separate "¿Cómo recibes clientes?"** block — it was redundant. The **"Disponibilidad privada"** toggle is the single switch (it *is* the old Solo-WhatsApp vs Agenda+WhatsApp choice): **PRIVATE** (`availability_public=false`) = WhatsApp-only, no agenda — hides the whole schedule section and **deletes the materialized slots** (but **keeps** the weekly template + exceptions), shows a short amber note; **PUBLIC** = published agenda — shows "HORARIO PARA" + "Mis horarios de siempre" + "¿Un día distinto?" (see the "Disponibilidad editor — recurring weekly schedule" section). **"Permitir contacto por llamada" is independent** and lives in Mi perfil → Contacto; WhatsApp is always available. Keep `contact_preference` in sync with the toggle for downstream `/buscar` card + schedule logic (`pública→ambas`, `privada→solo_whatsapp`).

**Relative dates ("hace X") — ONE canonical helper, app-wide.** Always use
`formatRelativeTime(date, locale)` from `lib/utils.ts` — never `Intl.RelativeTimeFormat` with
`numeric:"auto"` (it produces **"anteayer"/"antier"**, which breaks the consistent "hace N días"
series). Scale (ES): `hace un momento · hace N minutos · hace 1 hora/N horas · ayer · hace N días ·
hace 1 semana/N semanas · hace 1 mes/N meses`, then the **actual date** ("15 jun 2025") past ~1 year.
Only 1 day → "ayer"; 2+ → "hace N días". EN mirrors it ("just now / yesterday / N days ago / …",
correct singular/plural). Pass the active `useLocale()` so EN renders in English.

**Uniform time chips (everywhere times are listed as chips).** Time chips must be a **uniform width in an even grid**, not text-sized in a `flex-wrap` (12h text like "8:00 AM" vs "12:00 PM" makes ragged rows). Use a **`grid` with fixed columns** + **`tabular-nums`** + **`whitespace-nowrap`** (NOT `truncate` — that cuts the time off). On MOBILE keep columns wide enough for the full 12h time: **`grid-cols-2 sm:grid-cols-3 md:grid-cols-4`** in the availability list (the part label Mañana/Tarde/Noche goes ABOVE the grid, not in a side column that steals width); `grid-cols-4 sm:grid-cols-5` for the 24h booking picker. When a chip has a remove-X use `justify-between` with the X `shrink-0`.

**Disponibilidad keeps labels icon-free.** No decorative icon next to "Disponibilidad privada", "Mis horarios de siempre", or "¿Un día distinto?" — the card headings + subtitles carry the structure; the toggles speak for themselves. The only icons in the editor are quiet grey utility marks (the `MapPin` prefix on a franja's location select, the `Calendar` on the "Cambiar un día" action) — consistent with the serious-icon tone. The one deliberate brand accent is the **preset shortcut pill's `CalendarClock` icon in a filled `#008ce0` circle** (Sprint 239) — an interactive one-tap control, not a decorative label icon, so it earns its color.

**Name fields — protect the verified official name.** The **"Nombre completo"** (official, from the TSE padrón) backs the "Identidad verificada" badge, so once `verification_status === "verified"` it is **read-only** (disabled + lock icon + "Verificado"), and the save **never overwrites** it. Corrections (typo/legal change) go through **admin review** — a support ticket (`/soporte`), not a free edit. **Not-yet-verified** pros can still edit it until verification locks it. The **"Nombre comercial o marca"** (e.g. "Plomería Don Juan") is always **freely editable** — that's their branding, separate from identity.

**Mobile dashboard nav — no bounce.** When `setTab` navigates (`router.push`), pass **`{ scroll: false }`** so Next's default scroll-to-top doesn't fire AFTER the manual `scrollIntoView` and bounce the user back to the menu. Then smooth-scroll to the content (mobile only). The result: tapping a section navigates to it and STAYS there.

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
  - **Search bar — short placeholder + responsive, never clipped:** the placeholder is **short** ("¿Qué servicio estás buscando?", `landing.hero.searchPlaceholder`) so it never truncates. The **compact/scrolled header** search is a **flex row** (`brand mark` shrink-0 + a `flex-1 min-w-0` form that centers a `max-w-5xl` box) — NOT an absolute-centered box over an absolute logo (that overlapped/clipped on mobile). The input is `flex-1 min-w-0` (shrinks), the **"Ubicación" field is `hidden sm:flex`** (drops on mobile), and the **"Buscar" button is icon-only `<sm`** (`Search` glyph) / text `sm+`. The hero bar stacks (input + full-width Buscar) on mobile. Logo, input, location and button stay visible/usable from ~360px up with no horizontal overflow.
  - **Rotating-headline word list** = highest-demand CR services only: **Limpieza · Plomería · Electricidad · Jardinería · Pintura · Niñera · Mudanzas · Fumigación** (drop niche ones like Soldadura).
  - **First rotating word = "Plomería"** (clearest/most recognizable on load); list order: Plomería · Electricidad · Limpieza · Jardinería · Pintura · Niñera · Mudanzas · Fumigación.
  - **Home animations IGNORE reduced-motion by design** — the **category carousel** and the **hero rotating-word** animation always play (subtle/smooth, GPU-optimized), even with `prefers-reduced-motion`/performance mode on. (This is a deliberate exception; other reveals/effects still respect reduced-motion.)
  - **Rotating-word animation = PER-LETTER staggered VERTICAL SLIDE-UP** (`RotatingLine` in `landing-hero.tsx`): each **letter** rises from below into place **one after another, left → right** (staggered, not the whole word at once), the word **holds** fully visible (~1.4s), then each letter slides **up and out** in the same staggered order as the next word's letters roll in. Implementation: a **clipping mask** (`flex justify-center; overflow-hidden`, height `1.18em` ≈ one line, room for accents like í/J) of per-letter `inline-block` spans (keyed `${index}-${i}` so each word's letters are fresh nodes). State machine per word: reset letters below (`translateY(110%)`, no transition) → `requestAnimationFrame`×2 → enter (`translateY(0)`, springy `cubic-bezier(0.16,1,0.3,1)`, `LETTER_MS=520` + `transitionDelay i·STAGGER_MS(46)`) → hold → exit (`translateY(-110%)`, same stagger) → next index. **NO typewriter, NO caret/pipe.** The line is `justify-center` so the word stays **horizontally CENTERED** above the static `sin complicaciones.` line (no layout shift as length changes). **Respects `prefers-reduced-motion`** → a static word, no animation. Pacing comfortable/elegant.
  - **Swappable hero image:** the hero image is **ONE asset behind a single named constant** (`HERO_IMAGE = { src, alt }` at the top of `landing-hero.tsx`) so it can be replaced by editing one line — never per-category. A local **service professional at work** (never a foreign-looking house/mansion). *Per-category hero images that swap with the rotating word are a **future enhancement**, not now.* Final art will be a high-quality Costa Rican photo (self-host on Cloudinary when provided).
  - **Trust-benefits section:** ONE clean section of **3–4 client-facing benefit pillars** (icon in a brand-tint square + short title + one line) — communicate **benefits, not technical features**. Use: identidad verificada, reseñas reales (only clients who got the service review), coordina por WhatsApp, soporte. **Never** list internal mechanics (map, panels, project states, third-party booking) and **never invent numbers/ratings**. Any "WhatsApp" point/action uses the **official `WhatsAppIcon`** (`@/components/icons/whatsapp-icon`, `currentColor`), NEVER a generic chat/message bubble — it inherits the tile color (brand-blue in the monochrome tiles), keeping the serious tone.
  - **Zonas / find-by-zone (Encuentra profesionales en tu zona):** a two-pane `rounded-3xl` panel — a **dark left rail** ("¿Dónde lo necesitas?" + **"Usar mi ubicación"** button → geolocation → `/buscar?sortBy=cercania&lat&lng`, with the honest disclaimer "No prometemos cobertura en todo el país…") and a **white right pane** with the **7 province tabs** (select feeds the search) → the active province's **cantón chips** → `/buscar?provincia=<id>&canton=<id>`, plus "Ver profesionales".
    - **Active-province header — name never truncated, stacks on mobile:** the header row (MapPin + province name + status + "Ver profesionales" button) must **never `truncate` the province name** (e.g. "San José" cutting to "San…"). On mobile **stack vertically** (`flex-col sm:flex-row sm:items-center sm:justify-between gap-4`): name + status on their own line (no `min-w-0`/`truncate` clamps), the button **full-width below** (`w-full sm:w-auto justify-center`); collapse back to one row at `sm+`. The province name has priority and always reads in full at every width (verify the longest: Puntarenas, Guanacaste).
    - **REAL-COVERAGE RULE (veracity — no fake counts):** the "N cantones con cobertura" count and the cantón chips must reflect **only zones that genuinely have ≥1 listed professional**. Compute this server-side with **`getZoneCoverage()`** (in `src/lib/queries/professionals.ts`) — it mirrors /buscar search semantics (fixed `canton_id`/`provincia_id` + denormalized `search_cantones`/`search_provincias` + whole-province `coverage_provincias` + whole-country `coverage_country`) and returns `{ byProvince, countryWide }`. **Never hardcode a count.** A province with zero coverage shows an **honest empty state** ("Aún no hay profesionales en {provincia}…") with a "Ver todos los profesionales" escape, and the count is hidden. Only `countryWide` pros expand a province to all its cantones. Keep "do NOT claim coverage everywhere".
  - **Home category cards:** ONE **self-hosted Cloudinary** image per category (folder `contratacr/categorias/<categoryId>`, delivered `f_auto,q_auto,c_fill,g_auto`). **Never hotlink external stock** (Unsplash/Pexels URLs break) — download/ingest license-safe stock into Cloudinary and reference only `res.cloudinary.com` URLs. Each image must clearly **match** its category (jardinería→garden, plomería→pipes…); no generic/duplicated images. Category **ids + labels come from the single taxonomy** (`src/lib/data/categories.ts`, `getCategoryLabel`) — only show categories you actually have matching imagery for, plus a "Ver todas las categorías" → /categorias.
  - **Category carousel — ONE staggered (zigzag) track** (`category-carousel.tsx`, client; `pros-section.tsx` is the heading wrapper): it is a **single horizontal carousel**, NOT two rows. All cards live in **one track** that moves together as one unit; the alternating up/down vertical offset (`translateY(±18px)` on even/odd cards) is **purely visual zigzag** — horizontally it's one continuous strip. **Spec (keep all of it):**
    1. **One track, moves as a unit** — never two independent rows / never opposite directions. A single JS-driven scroller (`scrollLeft`).
    2. **Auto + manual (motion is TRANSFORM-based, not native scroll; TIME-based for mobile smoothness)** — auto-scrolls via rAF advancing a **float `translateX` accumulator** on the track by **elapsed time** (`pos -= AUTO_SPEED(0.019 px/ms) * dt`, `dt` capped at 50ms) so the speed is **identical on 60/90/120 Hz** and **dropped frames don't slow it** (≈19px/s everywhere). Earlier per-frame px stepping made it slower/janky on phones. **Do NOT drive auto-scroll by incrementing `scrollLeft`** — browsers round `scrollLeft` to integers, so a sub-pixel/frame step never accumulates and the carousel sits dead-still (this was the "it doesn't move" bug). The user can **also drive it**: mouse/touch **drag** (pointer events update the same `pos`), or the **left/right arrow buttons** (an eased rAF tween of `pos`, `hidden md:flex` — swipe on mobile). Auto **pauses on hover and during any interaction (drag/tween)**, then resumes. A real drag suppresses the trailing click so it doesn't navigate. `touch-action: pan-y` so vertical page scroll still works while horizontal drags arrive as pointer events. Respects **`prefers-reduced-motion`** (auto off; manual still works).
    3. **Seamless loop, no on-screen duplicates** — the track renders the full set **twice**; `pos` is wrapped into `[-half, 0]` (`half = scrollWidth/2`, re-measured via `ResizeObserver` as images paint) so the wrap is invisible. Spacing is a per-card **right-margin (`mr-4 sm:mr-6`), NOT flex `gap`**, so one set width is exact. Because it's ONE track with all categories, a single set is far wider than any viewport — the duplicate set is always off-screen, so a category is never visible twice.
    4. **Uniform RECTANGULAR cards (Bark-like landscape)** — every card is the **EXACT same fixed size**, a **landscape rectangle wider than tall** (`w-[248px] h-[168px] sm:w-[300px] sm:h-[200px]`, ~3:2 — NOT square) regardless of label length; long labels **clamp to 2 lines** (`line-clamp-2`), never widening the card. Cloudinary delivery is landscape-cropped (`w_640,h_440`). **Subtle corner rounding only** — `rounded-lg` (near-square corners, not the old `rounded-2xl`). Soft constant shadow, dark bottom gradient + white label. **No hover arrow / overlay icon** — the bottom row is JUST the white label (the old `ArrowRight` that faded in on hover was removed); hover = the card scale only. **Hover = the whole card SCALES UP** (`transition-transform … hover:scale-[1.04] hover:z-10`) — a gentle smooth zoom of the entire card, **not** a shadow/translateY change and **not** an inner-image-only zoom. ONE self-hosted Cloudinary image per id; **no "Disponible en línea"/"available online" badge anywhere**. Zigzag = `translateY(±20px)` on even/odd cards (the hover-scale composes with this fine because it's a child transform).
    5. **Reduced-motion** — `prefers-reduced-motion: reduce` → **no auto-scroll** (manual drag/swipe/arrows still work). Soft **edge `mask-image`** fade at the rails; scrollbar hidden. Vertical padding on the track so the zigzag offset + hover lift never clip. Each card → `/buscar?categoria=<id>`.
    6. **MOBILE PERFORMANCE (non-negotiable):** **`will-change`/3d ONLY on the moving track**, NEVER per-card — promoting all ~38 cards to their own GPU layers choked mobile; cards paint into the single track layer (hover scale still auto-promotes on desktop). Images: `next/image` + `f_auto,q_auto`, modest base (`w_600,h_400`), `loading="lazy"`, **mobile-aware `sizes`** (`(max-width:640px) 250px, 300px`); lighter shadow on small screens. Animate **only `transform` (translate3d)** — never layout props.
- **SERIOUS / RESTRAINED ICON TONE (user preference):** ContrataCR is a serious app — **prefer NOT decorating with icons; when an icon is used, keep it monochrome (grey/black, e.g. `text-[#1a2744]`/`#374151` on a neutral `#f3f4f6` tile), not colorful.** Avoid playful multi-color gradient icon tiles in content sections. (Functional/brand marks are exempt where meaning depends on color: the green verification `ShieldCheck`, the rating star, the official WhatsApp green, the primary brand-blue CTA buttons.) Newer home work should lean on **typography, real photography (cutouts), spacing and depth** rather than colored iconography.
- **HONEST COPY (legal/veracity rule):** for a newly-launched platform, **never overstate coverage, volume, ratings, or guarantees.** Banned: "cubrimos cada provincia y cantón", "en toda Costa Rica" as a coverage promise, invented review counts/stars, "garantizamos". Say "en tu zona / en distintas zonas", "te conectamos" (not "garantizamos"). ContrataCR is an **intermediary** — connects, doesn't guarantee outcomes.
- **Do NOT** add phone mockups, a "coming soon" app-store section, or a brand-logo strip (unaffiliated brand names imply a false partnership — a veracity/legal risk). **No US-style stock photos** (e.g. American suburban houses).
- Subtle scroll reveals only (`FadeInUp`); the page must feel fast.

### Informational / explainer pages (¿Cómo funciona?, Sobre nosotros, etc.)
Hero with a subtle brand glow (`radial-gradient … #EBF5FB`) — a badge eyebrow + bold headline + one-line subtitle. Body = a few focused sections alternating `bg-white` / `bg-[#f9fafb]` / `bg-[#EBF5FB]`. Reusable blocks: **numbered Step cards** (a `#009FD9` number chip on the card's top-left, an icon in a brand-tint square, title + desc) for processes; when a page serves **two audiences**, split into clearly-labeled **"Para clientes" / "Para profesionales"** sections, each with its own steps; **trust cards** (icon + title + honest copy); an **FAQ accordion** inside one bordered card (`divide-y`, chevron rotates, one open at a time) — for a full **Help Center**, add a search box that filters questions accent-insensitively (flat results while querying, **grouped by audience** — Para clientes / Para profesionales / Cuenta — otherwise) and a "Contactar soporte" + WhatsApp footer; and a **dark final CTA** band (`bg-[#1a2744]`) with the primary actions. Professional CTAs use `SmartRegisterLink` (logged-out → registration, logged-in → panel). Subtle `FadeInUp` reveals only. **Content accuracy (mandatory on all explainer/marketing copy):** describe ContrataCR as it actually works — an **intermediary** that connects clients with professionals; **identity verification** (cédula vs the TSE/Registro Civil padrón) confirms the person is **real and verifiable, NOT the quality of their work**; **verified profiles rank first** but **unverified ones still appear**, labeled "Identidad sin verificar"; **coordination + payment happen off-platform** (WhatsApp); it's **free, no commissions** for clients and professionals. **No fabricated stats** — never invent percentages or multipliers ("95% por WhatsApp", "3× más contactos"); use honest, non-numeric phrasing for general guidance. For a **browse/index page** (Categorías) add a **smart search with autocomplete at the top** (the reusable **`CategorySearchBox`**, `@/components/search/category-search-box`): accent-insensitive (`searchCategories`/`normalizeText`) + edit-distance typo tolerance, ↑/↓/Enter, suggestion → `/buscar?categoria=<id>`, free text → `/buscar?q=`. Keep the **full grouped listing below** for browsing. Tie everything to `categories.ts` (single source of truth, human-readable labels). Plus a suggest-to-admin entry (`POST /api/categories/suggest`). The **professional recruitment landing** is `/para-profesionales` (hero value prop + session-aware CTA + benefits grid + 3-step recap + identity-verified trust band + dark final CTA); keep claims honest — ContrataCR is **free with no commissions** (never imply "pay-when-you-win" or guaranteed outcomes).

### Transactional / auth emails (Supabase)
Branded HTML templates live in **`supabase/email-templates/`** (paste into Supabase → Authentication → Email Templates). Spec: **table-based layout + inline CSS only** (Gmail/Outlook safe, no external CSS/JS/SVG); white card (`#ffffff`, `border-radius:16px`) on `#f4f7fa`; **logo PNG from a public URL** (`…/contratacr/brand/email-logo.png` — the navy+blue mark, good on white) + "ContrataCR" wordmark in an **Arial/Helvetica** stack (Poppins isn't email-safe); **heading/text `#162543`, button/links/accents `#008ce0`**; bulletproof `<a>` button in a `bgcolor` table cell; a copy-paste fallback link; an "ignora este correo" safety note; honest footer "ContrataCR — Encuentra y contrata profesionales en Costa Rica". Spanish, no "vos". **Never edit the `{{ .Variable }}` tokens** (`.ConfirmationURL`, `.Token`, `.Email`, `.NewEmail`) — they generate the real links. **Never print a raw/long URL as visible text** ("copia y pega este enlace: https://…long…") — it looks unprofessional. The primary action is the branded button; any fallback is a **short clickable phrase** ("¿No funciona el botón? **Abre este enlace**") with the URL only in the `href`. The **Confirm signup** template must carry **`{{ .Token }}`** (the 6-digit code), not `{{ .ConfirmationURL }}` — registration verifies via `verifyOtp({ type: "signup" })` ("Ingresa el código de 6 dígitos"), so a link-only email can't complete signup.

**Don't double-notify for the same event — pick the channel by context.** Our own transactional emails (e.g. identity-verification result) go through `notifyVerificationDecision({ …, channel })`: it ALWAYS writes the in-app notification but only emails when `channel === "both"`. **If the event happens while the user is already in the app (e.g. the auto identity check at registration), use `channel: "in_app"` — in-app notification only, no email** (a second email seconds after the OTP feels spammy). **Reserve email (`"both"`) for changes that happen later/outside the app** (admin decision, appeal, add-cédula, manual re-check) when the user may be offline. Also **fire the notification only when the status actually CHANGES** (`fromStatus !== newStatus`, or the first run via `isInitial`) so re-saving/editing never re-sends "identidad verificada".

### Brand assets & logo usage
- **Source files** live in `/marca` (favicon package, `logo.svg`, OG image); the integrated/served copies live in **`/public`**. The brand **mark** is a square two-tone "CR" monogram (light blue `#009FD9` + navy `#1a2744`); the **wordmark** is "Contrata" (navy) + "CR" (blue).
- **Use the small `logo-mark.png` (+`@2x`) for on-page logos** (header/footer/compact), NOT the raw `logo.svg` — the SVG is ~1.1 MB (embedded raster) and too heavy to load per page; keep it in `/public/logo.svg` only for large/print/crisp needs.
- **`ContrataCRLogo`** (in `landing-navbar.tsx`) = **mark + wordmark**; pass **`chip`** on dark backgrounds (footer) to seat the mark in a small white rounded square for contrast. Optional **`size`** — `md` (default: mark `h-7`, wordmark `text-[17px]`) for footer/legacy, or **`size="lg"` for the main header** (mark `h-8 → sm:h-9`, wordmark `text-[19px] → sm:text-[22px]`, `gap-2.5`) so the brand has presence balanced against the nav menus within the `h-16` header. **`ContrataCRMark`** = the icon alone (used in the **compact/scrolled header** at `h-9 w-9`, pinned left so the search stays centered). Crispness comes from the `@2x` (512px) mark, so it stays sharp at the larger header size. Both the app-wide `LandingNavbar` and the legacy `layout/navbar` render `ContrataCRLogo`, so login / 404 / dashboards inherit it.
- **Favicons & PWA:** the full package is wired via `metadata` in `[locale]/layout.tsx` — `favicon.ico` + `favicon-96x96.png` + `apple-touch-icon.png` (180) + `manifest: /site.webmanifest` (192/512 maskable). `src/app/favicon.ico` is also the brand icon.
- **Open Graph / social:** `metadataBase = https://contratacr.com`; `og:image = /og-image.png` (1200×630), `og:title`/`twitter` = "ContrataCR" + honest description "Encuentra y contrata profesionales en Costa Rica", `twitter:card = summary_large_image`. Keep titles/descriptions honest — no coverage/volume claims.

### Header, footer & utility pages
**Header** (`LandingNavbar`, Thumbtack-style): **the ONE header for the whole app — no per-page nav differences.** EVERY page renders the same `LandingNavbar`; `layout/navbar.tsx` `Navbar` is just a **thin wrapper** that renders `<LandingNavbar/>` + the `h-16` spacer (the header is `fixed`). Never build a second header or a per-page nav. A clean **single-row, full-width** bar (no centered `max-w` — `px-4 sm:px-6 lg:px-8`, **logo flush far-left**). Nav order: **logo → "Categorías" ▾ (mega-menu) · "Cómo funciona" (link) · "Recursos" ▾** → spacer → right actions.

**Categorías mega-menu** (the canonical way to browse services): a wide panel with (1) a **smart category search with autocomplete** at the top (`CategoryAutocomplete` — accent-insensitive via `searchCategories`, plus an **edit-distance typo fallback**; ↑/↓/Enter; a suggestion → `/buscar?categoria=<id>`, free text → `/buscar?q=`); (2) **curated columns** (Hogar e interior / Exterior y jardín / Más servicios); (3) **"Ver todas las categorías" → /categorias**. **Single source of truth = `categories.ts`** — every menu `id` MUST be a real category slug; **no two services may share a slug** (audit on edit — this caused the "Lavado a presión"/"Impermeabilización" both→`impermeabilizacion` bug; a label with no real category is removed, not pointed at a neighbour). The same autocomplete also powers the compact/scrolled search.

**Role-aware right actions** (`isPro = user.user_metadata.role === "professional"`; a professional is a **superset** of a client and keeps ALL client capabilities):
- **Logged out:** "Registrarse como profesional" (prominent pill) · "Iniciar sesión" · ES/EN.
- **Logged-in client:** "Ofrecer mis servicios" · "Mi panel" (/dashboard/cliente) · NotificationBell · avatar menu (Mis solicitudes/Proyectos/Favoritos via `?tab=bookings|projects|saved`, + Ofrecer mis servicios) · ES/EN. **No "Iniciar sesión".** The client→professional CTA label is **always "Ofrecer mis servicios"** (never "Convertirme en profesional"), everywhere it appears (header, account menu, client dashboard); it still leads to `/registro/profesional` (the convert flow).
- **Logged-in professional:** "Panel profesional" (/dashboard/profesional) · NotificationBell · avatar menu exposing BOTH the **pro panel** AND the **client area** (Panel de cliente + Mis solicitudes/Proyectos/Favoritos) · ES/EN. **No "Iniciar sesión" / "Registrarse".**
- **Registro guard:** `/registro/profesional` redirects anyone who already has a `professionals` row to /dashboard/profesional; a converting client (no pro row yet) stays in the flow.

**Scroll behavior:** an IntersectionObserver on `#hero-search-sentinel` (fallback `scrollY > 300`) collapses the header so ONLY a centered compact search bar remains (logo/nav/actions hide); the compact bar is a **visual twin of the hero search bar** (same `rounded-[6px]` bar + Search input + provincia select + "Buscar", same `max-w-5xl` centering) with the autocomplete suggestions dropdown. The **mobile drawer mirrors everything** (smart search + Categorías + Recursos + the role-aware actions).

**Mobile menu = slide-in LEFT drawer.** The mobile nav is a **left side drawer**, not a top-down panel: a semi-transparent **scrim** (`fixed inset-0 bg-black/50`, fades, tap-to-close, `pointer-events-none` when closed) + a **panel** (`fixed top-0 left-0 bottom-0 w-[84%] max-w-[360px]`) that animates with **GPU transform** (`-translate-x-full` ↔ `translate-x-0`, ~300ms ease, `will-change-transform`) — leave part of the page visible on the right. Close via scrim tap, an **X** in the drawer header (next to the home-linked logo), or **swipe-left**. **Lock body scroll** while open. A drawer (`flex flex-col`) with a fixed header + `flex-1 overflow-y-auto` content. Keep contents identical/role-aware — only change HOW it opens.
- **CRITICAL — render the scrim + drawer OUTSIDE `<header>`.** The header has `backdrop-blur-md`; `backdrop-filter` (like `filter`/`transform`/`will-change`) becomes the **containing block for `position:fixed` descendants**, so a drawer nested inside the header resolves its `fixed` coords against the 64px header box → it renders as a **top strip, not a full-height left drawer**, and the scrim only covers the header. Put them as siblings of `<header>` (viewport-relative `fixed`).
- **Exactly ONE close (X), inside the drawer.** The header hamburger must **only open** the drawer (always the `Menu` icon, `onClick → setMobileOpen(true)`) — never flip it to an X, or you get two X's (header + drawer). The scrim (z above header) hides the header button while open.

**Logo is ALWAYS a home link (`/`), in every state.** The `ContrataCRLogo`/`ContrataCRMark` must be wrapped in a `Link href="/"` everywhere it appears — full header, **collapsed/compact scrolled header**, and the **footer** — with a **comfortable mobile tap target** (don't leave a bare 36px mark jammed against the screen edge next to the search box; pad it and raise it `relative z-20` so the search form can't intercept the tap). Never render the logo as non-clickable.

**Search placeholder — responsive, never clipped:** the search input shows a **short placeholder on small screens** so it always fits at narrow widths (~360px) and a longer one above `sm`. Standard: **"¿Qué necesitas?"** (`<sm`) ↔ **"¿Qué servicio estás buscando?"** (`≥sm`) — keys `landing.hero.searchPlaceholderShort` / `searchPlaceholder`. The hero uses its separate mobile/desktop inputs; the single compact/scrolled input switches via a `matchMedia("(max-width: 639px)")` state. Never let the placeholder truncate.

**Footer** (`bg-[#111827]`): brand blurb + socials, then link columns — Para clientes · Para profesionales · Soporte · **ContrataCR** (Sobre nosotros · Para profesionales · Términos · Privacidad) — and a bottom bar (© · Términos · Privacidad · "Hecho en Costa Rica"). **Header/footer "Registra tu perfil" must be session-aware** (→ panel when logged in; `SmartRegisterLink` or the same role check). **Legal pages** (`/terminos`, `/privacidad`) use a **clean legal-document layout** in a `max-w-3xl` column: (1) a visible **draft banner** (amber `border-amber-200 bg-amber-50 text-[#92400e]` with an `AlertTriangle`) stating the document is a **borrador pendiente de revisión por un abogado costarricense** and not legal advice — keep this until a lawyer signs off; (2) an `h1` + "Última actualización" line; (3) a **"Contenido" table of contents** (bordered `#f9fafb` card) of anchor links to each section; (4) **numbered sections** as `<section id>` with `scroll-mt-24`, an `h2` (`text-xl font-bold`) and `text-[#374151] leading-relaxed` paragraphs; (5) a support-contact box at the end. Legal copy is **ContrataCR-specific**, a **base draft only** (never present invented clauses as final/authoritative), keeps the **intermediary framing** (connects, doesn't guarantee outcomes/quality; identity verification confirms identity only; no commissions; payments off-platform; two-way reviews/reports) and references **Ley 8968** with data minimization. About pages (`/sobre-nosotros`) use a brand-glow title + prose sections. **404 / error** pages are friendly and on-brand with a clear path to home/search (never a raw failure screen). **Contact/support** (`/soporte`): a ticket form (name optional, email/subject/message required, attachments) that **prefills the logged-in user** and welcomes guests; it creates an **admin ticket** (`support_tickets`, visible in **Admin → Soporte**) and emails support, plus a **WhatsApp** option for urgent issues — set the expectation (reply by email < 24 h).

### Support tickets — admin-managed, one threaded conversation (SINGLE channel)
**Support-channel hierarchy: TICKET is primary/featured; WhatsApp is a discreet secondary.** The ticket is always the prominent CTA (the form/main button); WhatsApp Business (`SUPPORT_WHATSAPP_URL`) appears as a **small, subtle** alternative below it ("¿Prefieres WhatsApp? Escríbenos" — tiny grey text + WhatsApp-green link), never a big competing button and never labeled "secondary" in copy. **No public email address / live-chat** anywhere. **Reports & disputes are TICKET-ONLY** (report-professional / report-client → moderation APIs → admin tickets) so there's a formal record — never offer WhatsApp for those. The **client↔professional coordination WhatsApp** (booking/profile/cards) is a separate core feature, untouched. Honest copy — no instant/24-7; mention "en horario laboral" for WhatsApp. Model: `support_tickets` + a **`support_ticket_messages` thread** (`sender_role` user|admin; distinct name — a legacy `support_messages` from migration 012 exists). Service-role only (RLS on, no policies).
- **Three statuses, ONE-WAY flow:** **Pendiente** (`open`) → **En proceso** (`in_progress`) → **Resuelto** (`resolved`). NO "Cerrado". Admin tab label is **"Pendientes"**. **Never move backward** (no En proceso→Pendiente) — the admin `<select>` only offers valid forward targets and PATCH rejects the rest. **Reopen is always the SAME thread, never a new ticket:** any new message on a Resuelto ticket — **admin reply OR user reply/"reabrir"** — sets it back to **En proceso** (`in_progress`).
- **Per-status badges + per-ticket markers (admin AND user):** show a count next to the status that has actionable activity (admin: "Pendientes"=open, "En proceso"=awaiting an admin reply; user: per-status + a Soporte-tab badge), and mark the SPECIFIC ticket row (dot/ring + "Espera respuesta"/"Nueva respuesta") so it's easy to find. **Clear on read.**
- **Auto-refresh, no manual reload:** the admin "Soporte" nav badge polls (~30s + on focus); reading a ticket marks its notifications read and the badges/markers clear live (`onUnreadChange`); the bell updates via its realtime subscription.
- **Notifications-bell integration:** an admin reply also inserts a **`support_reply`** notification (tagged **"Soporte"**, green) linking to the ticket — support activity lives in the general bell too, not only the Soporte section.
- **Client-side filtering:** "Mis tickets" has the same status filter (Todas/Pendiente/En proceso/Resuelto) as the admin inbox.
- **Creation:** logged-in users AND **guests** (name+email required) create tickets via `/api/contact`; both land in the inbox. `topic`, requester, message, status stored.
- **Admin inbox** (`AdminSupport`, Admin → Soporte): list filterable by the 3 statuses, each row shows a **Registrado/Invitado** chip (by `user_id`) + email + a "Espera respuesta" flag when the last message is the user's; open → **chat thread** (admin right/dark, user left/light), **reply in-panel** (stored + emailed to requester), status select with audit (`handled_by_name`/`handled_at`). The **"Soporte" nav badge** = pending + in-progress-awaiting-reply (kept accurate).
- **Every "Soporte" entry point is session- + location-aware (`SupportLink`, Sprint 159):** logged OUT, or anywhere **OUTSIDE the dashboard** → the **public `/soporte`** page/form (works without an account; the whole public context lands in one place). Logged IN and **INSIDE the dashboard** → the panel's **inline "Soporte" SECTION** (`?tab=soporte`, pro or client panel) — NOT a modal, NOT a separate page. There is **NO support modal** anymore (the old `SupportModalHost`/`SupportModal`/`OPEN_SUPPORT_EVENT` were deleted). Reuse `SupportLink` for any "Contactar soporte / Centro de soporte" link so behavior stays consistent.
- **Registered user side** (`SupportTickets`, "Soporte" tab in both dashboards): tickets + thread + reply; on a **Resuelto** ticket → **"Sí, está resuelto"** (confirm, `user_confirmed`) or **"No, sigo con el problema"** (reopen → Pendiente + notify). A reply also re-opens resolved.
- **Guest side = email:** confirmation says we'll reply by email. The guest ticket-created screen invites both paths — "Para dar seguimiento a tus tiquetes en la plataforma, **inicia sesión o crea una cuenta** con ese correo." — and gives a clear way out so the guest isn't stranded: PRIMARY **"Volver al inicio"** (filled, `Home` → `/`) + SECONDARY **"Iniciar sesión o crear cuenta"** (outline → `/login`). **Guest→account linking:** on a **verified** email match (`email_confirmed_at`), `claimGuestTickets()` attaches prior guest tickets to the account (in `/api/support` GET + `/auth/callback`) — never another person's, no duplicates.
- **Reply emails differ by account (`notifyUserOfReply`, `hasAccount = !!ticket.user_id`):** account holders get "responder desde tu panel" + a **"Ver conversación"** dashboard link; **guests (no panel)** get "crea una cuenta o inicia sesión con este correo … Encontrarás este tiquete en tu panel." + a **"Crear cuenta o iniciar sesión"** (→ `/login`) link — never tell a panel-less user to use "tu panel". **Never suggest replying to the email** — inbound email is NOT wired into the thread (no `reply_to`, no webhook). Support emails are **Spanish-only** (no locale threaded through `support-notify`).
- **Confirmation** ("¡Ticket creado!"): honest response-time copy, no email/WhatsApp; logged-in → **two actions** "Ver mis tickets" + "Ir a mi panel"; guest → email-reply message (no panel link).
- **Emails** (`support-notify.ts`, branded, **clickable links only — never raw URLs**): inbox notified on new ticket / user reply ("Abrir en el panel"); requester notified on admin reply ("Ver conversación"). Honest copy — don't promise instant/24-7.

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

**Also remove voseo in the present tense and pronouns/reflexives** (not just imperatives):

| ✅ Use (standard) | ❌ Not (voseo) |
|---|---|
| eres | sos |
| tienes / puedes / quieres | tenés / podés / querés |
| necesitas / eliges / describes | necesitás / elegís / describís |
| haces / apareces / trabajas | hacés / aparecés / trabajás |
| regístrate / contáctanos / escríbenos | registrate / contactanos / escribinos |
| menciónalo / dilo / pídele | mencionalo / decilo / pedile |
| cerca de ti / para ti | cerca de vos / para vos |

Rules:
- **Imperatives → standard form** (drop the accented final syllable: `-á/-í/-é` → `-a/-e`). Verb roots that change (Elegí→Elige, Seguí→Sigue) use the normal form.
- **No voseo anywhere, ever** — not in imperatives, present-tense verbs, the pronoun `vos`, or reflexive imperatives (`-ate/-ite` → `-ate` standard: registrate→regístrate). This is a recurring issue; sweep new copy before shipping.
- This applies to **second-person verb forms aimed at the user** (buttons, instructions, hints, placeholders, empty states, errors, FAQ answers, emails). Don't "fix" unrelated words that merely end in an accent (`más`, `país`, `qué`, `José`).
- Keep it **warm, plain, and short.** No jargon, no internal terms (never expose "/buscar" — say "los resultados de búsqueda"). Prefer concrete verbs ("Solicitar servicio") over vague ones.
- Sentence case, not Title Case, for sentences and most buttons. Costa Rican vocabulary is fine; just avoid the `vos` imperative.
- One idea per message. Errors say what's wrong **and** how to fix it, once.

When writing or editing ANY user-facing string, scan it against this list first.

---

### Profile completeness — count ONLY what applies (context-aware)
Any "perfil completo / X% completo" prompt must be computed from fields **relevant to that specific professional** — never penalize someone for a field that doesn't apply:
- **Aseguradoras** are **health-only** (`anyHealthCategory(professions)` / `es_salud`). For non-health pros, **hide the field entirely** and exclude it from completeness (a plumber has no insurance networks — it's not "missing", it doesn't exist for them).
- Any field where **"ninguno / no aplica"** is a valid answer must offer that **explicit choice**, and choosing it marks the item **COMPLETE (answered)**, not blank. Aseguradoras uses a **"No trabajo con seguros"** checkbox → sentinel `NO_INSURERS` (`"ninguna"`), which never matches a real /buscar filter.
- **Idiomas default to "Español"** — a Spanish-only pro is complete; extra languages are an optional bonus, never required.
- Net: a non-health pro reaches 100% without ever touching aseguradoras; benefit-framed "completa esto" prompts appear ONLY for fields that genuinely apply AND are actually empty.

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

---

## 8. Search bars (hero + compact navbar) — standard

Both the hero and the scrolled/compact navbar search share one model:

- **Two typeable autocompletes:** a **service** field (categories + professionals via `/api/search/suggestions`) and a **location** field (provinces + cantones via `src/lib/data/location-search.ts`).
- **Selecting a suggestion FILLS the field — it never searches.** The search runs **only** on `Buscar` click or `Enter` (with no active suggestion highlighted).
- Both dropdowns: overlay correctly (parent field is `relative`; never inside an `overflow-hidden` bar), keyboard-navigable (↑/↓/Enter/Escape, active row highlighted `bg-[#EBF5FB]`), and close on blur/click-outside.
- **Pass IDs, not names:** province → `provincia=<id>` (e.g. `sj`), canton → `canton=<id>`. `/buscar` looks up by id; sending a name silently filters nothing.
- **Empty search = browse all** (`/buscar` with no params). The hero stacks vertically on mobile (service → location → Buscar). The fixed navbar stays single-row on mobile (location is desktop-only there).

## 9. Carousels — mobile is manual

Auto-scrolling carousels (e.g. the home "Profesionales para cada proyecto" category strip) run **desktop-only** (`matchMedia("(min-width:640px)")`). On mobile they do **not** auto-move — single flat row the user swipes by hand (zigzag offset flattens too).

## 10. i18n

Infra: next-intl, `[locale]` (`es`/`en`), default **es**, `localePrefix: "always"`, `localeDetection: false`. Persistence = locale in URL (navigation/reload) **plus** a `NEXT_LOCALE` cookie written by the toggle. The **proxy** (`src/proxy.ts` — Next 16's renamed `middleware`; see context.md) redirects **every** unprefixed URL to its locale-prefixed canonical path (cookie → `/en`, else `/es`; params preserved), so old/bookmarked non-localized links never 404. First-time visitors still get ES — Accept-Language is deliberately ignored. The ES|EN pill highlights the active locale. **Never auto-translate legal content** (`/terminos`, `/privacidad`) — they stay authoritative static Spanish. **Routing/auth lives in `src/proxy.ts`, NOT a root `middleware.ts`** (the root file is silently ignored on Next 16) — the build must list `ƒ Proxy (Middleware)`.

---

## 11. Admin — consolidated user profile + user search

**Admin chrome = a navy LEFT SIDEBAR (`AdminShell`).** The admin uses a `#0f172a` left sidebar (accent `#38bdf8`; active item = `bg-white/10` + a `#38bdf8` left bar + accent icon) with the logo on top and the admin name + logout pinned at the bottom; on `<lg` it collapses to a horizontal-scroll top strip. Nav: **Resumen** (home/overview) · Verificación · Usuarios · Reportes · Aseguradoras · Categorías · Cuentas · Suscripciones · Soporte · **Analítica** · **Actividad** (`AdminTab`). Each `/admin/*` page wraps its content in `<AdminShell active="…">`.

**`/admin` = "Resumen" overview** (`AdminOverview`, server-aggregated via `lib/admin/overview.ts`): a topbar (⌘K search, bell, date-range select — presentational for now), **4 KPI cards** (big value + ▲/▼ colored delta + an SVG **sparkline**), a 14-day **"Crecimiento"** stacked-bar chart (profesionales `#008ce0` / clientes `#9ed8f2`), an **"Altas recientes"** feed, a **"Verificación pendiente"** mini-queue, and two ranking cards. The verification queue lives at its own route **`/admin/verificacion`** (was the old `/admin` home).

**`/admin/analitica` = comprehensive "Analítica"** (`AdminAnalytics` + `lib/admin/reports.ts`): real, server-side aggregation across **Usuarios** (totals, clients vs pros, verified, active clients, 30-day registrations), **Profesionales** (status segmented bar, by categoría/provincia, a domicilio vs fijo, con agenda, con servicios), **Actividad** (solicitudes/proyectos totals + by-status + 30-day volume + tasa de respuesta + categorías más solicitadas), **Suscripciones/pagos** (by plan/status/cycle/method, ingresos + by method, SINPE pendientes — built now, populates when `PAYMENTS_ENABLED`), **Soporte** (by status + 30-day). **`/admin/actividad`** is a recent cross-table events feed. Charts are **hand-rolled SVG/CSS** (sparkline, stacked daily bars, horizontal rank bars, segmented bar). **All aggregation is admin-only (`createAdminClient`), best-effort (try/catch), efficient (minimal columns, JS-side rollups at this scale), and shows a clean "Sin datos aún" empty state** so little/no data never breaks the view. Admin is **Spanish-only** (no i18n).

When you need to investigate ONE person end-to-end, use the person-centric layer instead of breaking the sections into per-user folders:

- **User search** (`AdminUserSearch`): a debounced box (name / cédula / correo) with a dropdown of results → `/admin/usuarios/[id]`. Reuse it as the main tool on the Usuarios tab AND embedded in section views (e.g. Soporte) where triaging a record benefits from a quick jump. Cédula is always **masked** in search + profile (`maskId`); the full value lives only in the verification case file.
- **Consolidated profile** (`AdminUserProfile`): identity header (avatar, name, role pill, verification/banned/disabled badges, contact, registro date, account-status reason block) followed by clearly-titled `Section` cards — support tickets, verification history + appeals, reports, projects, requests. Each section is a bordered white card with an icon heading + count; empty states are a muted one-liner. Status pills reuse the amber/blue/emerald/gray scale.
- **Reachable from anywhere a user appears**: link with either the user id (tickets) or the professional id (reports, verification case) — the profile route resolves a professional id to its owner.
- Keep every section view + its per-status filters/badges intact; the user layer is additive. Admin tab bar scrolls horizontally on mobile.

**Unified admin layout width:** ALL admin content width/centering is owned by **ONE shared container in `AdminShell`** — `<div className="mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-8 py-6">{children}</div>` — so every route (Resumen, Verificación + detail, Usuarios, Reportes, …) lines up identically. Wide tables/queues fill it; sparse detail pages get balanced side margins. **Admin pages/components must NOT apply their own `max-w`/`mx-auto` to the page container** (it would drift from the rest). If you need the detail page narrower, change the shared container, not one page.

**Unified admin color system (apply to every section/component):**
- **Brand blue `#009FD9`** — segment/filter tabs (active: `bg-[#009FD9] text-white border-[#009FD9]`; inactive: `bg-white text-[#374151] border-[#e5e7eb] hover:border-[#009FD9]`, always with a `border` on both states so there's no 1px shift), loading spinners (`<Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" />` — never a hand-rolled `border-t-transparent` div), links, input focus rings, and the icon in section/`Section` headings.
- **Navy `#0f172a`** — chrome only: the shell header, neutral-**primary** action buttons (e.g. "Responder", "Abrir caso de verificación"), and the admin side of chat bubbles. Not for tabs.
- **Green `#16a34a` / red `#dc2626`** — approve·verify / reject·danger actions.
- **Status pills** — amber/blue/emerald/gray-100 scale; **verification** pills always via the shared `verificationPillClasses` helper.
- **Every section gets a title header**: `flex items-center gap-2 mb-5` → tab icon (`h-5 w-5 text-[#009FD9]`) + `<h1 className="text-xl font-bold text-[#111827]">`. List sections render the header in every state (loading/empty/populated), not only when populated.

---

## 12. OAuth guidance blocks (Cuenta y seguridad)

When an action can't work because an external provider owns the data (OAuth email/password), show a guidance block — never a dead field or an error look:
- **Info style, not error:** sky palette (`bg-[#f0f9ff]`, `border-[#bae6fd]`, text `#0c4a6e`/`#0369a1`), an `Info` icon — calm and informative.
- **Structure:** bold heading → one-line intro → optional **ordered steps** (numbered circular badges `bg-[#0284c7]` + wrapping text) → an outbound link (`ExternalLink` icon) to manage it in the provider.
- **Name the provider** correctly (Google / Facebook), detected from `user.app_metadata.provider` / `identities`.
- **Responsive:** `break-words` + wrapping steps so it stays readable at ~360px (no overflow/cut-off).
- Reusable as `OAuthGuide({ title, intro, steps?, linkLabel, linkHref })`. Keep the normal working flow for accounts that DO own the credential (email/password users).

---

## 13. Error / empty-state pages (branded)

All error surfaces use one on-brand pattern via `ErrorScreen` (`src/components/error/error-screen.tsx`) — never a bare/system error:
- **Brand visual:** ContrataCR logo at top (links home), white background, the bold navy `#1a2744` heading, optional UPPERCASE blue eyebrow code (e.g. "Error 404"), and a **restrained** icon in a soft slate tile (`bg-[#f1f5f9]`, navy icon — not colorful/alarming, per the serious-tone rule).
- **Tone:** calm, friendly, honest Costa Rican Spanish (no voseo, no scary wording); reassure ("tus datos están a salvo") where relevant.
- **Recovery actions:** `errorPrimaryBtn` (filled brand) + `errorSecondaryBtn` (outline) — Reintentar / Ir al inicio / Buscar profesionales. Stack full-width on mobile, inline on desktop.
- **Responsive & centered** down to ~360px; self-contained (no heavy navbar import) so it stays light in the error bundle.
- Variants: generic error (`error.tsx`, with an **offline** branch via `navigator.onLine`), 404 (`not-found.tsx`, i18n), root/500 (`global-error.tsx`, inline-styled since the stylesheet may not have loaded).

---

## 14. Taxonomy translation + language switcher

**Taxonomy/DB values need per-language labels.** Fixed lists sourced from the DB or a constants file (categories, category groups, and similar — e.g. future service-name presets) must NOT render a single hardcoded label. Provide an `_EN` map (Spanish stays the source of truth) and a locale-aware getter — e.g. `getCategoryLabel(id, locale)` / `getCategoryGroupLabel(groupId, locale)` backed by `CATEGORY_LABELS_EN` / `CATEGORY_GROUP_LABELS_EN`. Pass `locale` (`useLocale()` in client, `getLocale()`/`await getTranslations` in server) at EVERY render site so the value translates consistently (carousel, megamenu, filters, /buscar, profiles, project creation, dashboards). For server API routes that emit labels, accept `?locale=` and translate there.

**Language switcher pattern.** The control must read instantly as a *language* switcher: a pill with a **globe icon** (`Globe`, grey — serious tone) + a segmented **ES | EN** toggle where the active locale is filled brand-blue and the other is a clearly-tappable grey button (never collapse to a single ambiguous label). Wrap in `role="group"` with an `aria-label` ("Cambiar idioma / Change language") and per-button `aria-pressed` + `aria-label` (Español/English). Compact + responsive (fits ~360px). Behavior: persists via locale-in-URL + `NEXT_LOCALE` cookie. Use the SAME component in the header and the mobile drawer (the drawer also keeps its "Idioma / Language" label).

---

## 15. Progressive disclosure & explicit add-actions (forms)

The marketplace forms favor **progressive disclosure over upfront clutter**, and **explicit add-actions over stray inputs**. Patterns locked in across registration + the pro panel:

- **Reveal-on-demand fields.** A secondary field appears only once its prerequisite toggle is ON. Example — Mi perfil → Contacto: ask for the WhatsApp number, show a "Permitir contacto por llamada" toggle, and reveal the separate "Número para llamadas" field ONLY when the toggle is on (empty ⇒ the WhatsApp number is used for calls). The toggle alone is self-explanatory, so its old helper text was removed. Same idea for the WorkplacesPicker map: the exact-pin/address-search block is collapsed behind an opt-in row.
- **Explicit "+ Agregar otra …" actions, never a second dropdown.** When a list can hold more than one item (extra professions, extra work zones), don't leave a permanently-visible empty picker — it reads as "is this required? did I already pick?". Instead show a clear text/icon link (`<Plus/> + Agregar otra profesión` / `+ Agregar otra ubicación`) that REVEALS a fresh picker on click; after committing, the picker collapses back to the link. For the primary add button, name the exact effect — **"Agregar esta ubicación"** (commits the current selection), not a generic "Agregar". The user must always know whether a button adds the current selection or starts a new blank one.
- **Anchor an option to the field it modifies.** A field-specific alternative belongs directly under that field as a subtle disclosure link, NOT floating at the end of the form. Example: "¿No tienes identificación costarricense?" sits right under the identification field (a `text-[#009FD9] hover:underline` button that flips to the manual-document fields), instead of a checkbox at the bottom.
- **Trim self-explanatory helper text.** Once the UI itself communicates intent (a revealed field, a clearly-named button, a labeled toggle), delete the explanatory `<p>` beneath it. This sprint removed the contact/email/certifications/location/slot-generator helper sentences. Keep only helpers that state a non-obvious consequence (e.g. "empty ⇒ uses your WhatsApp for calls").
  - **PRO REGISTRATION helpers stay to ONE short line (Sprint 221).** A field's helper says only the "what for" or a brief example — NOT step-by-step "how to" (the UI shows the buttons/map) nor "later in your panel" references (irrelevant during signup). `registration.pro.workplacesHelp` = **"Define dónde apareces cuando los clientes buscan."** / EN "Defines where you appear when clients search." (dropped "toca Agregar lugar / marca en el mapa / después en tu panel…"). `registration.pro.professionHelp` = **"Ejemplo: Nutricionista, Electricista."** / EN "Example: Nutritionist, Electrician." (kept the example, dropped "Después agregas los servicios… en tu panel."). The panel's own `profileEditor.workplacesHelp` is separate (and already short).

## 16. Status badges — terminal states are neutral

Booking/project status uses the shared `Badge` variants (all are bordered + tinted: `success` green, `warning` amber, `error` red, `muted` grey, `default` brand-blue). **A settled/terminal "Finalizada"/completed state uses the neutral `muted` badge, NOT the brand-blue `default`** — the prominent blue box drew the eye to a status that needs no action, looking inconsistent next to the semantic-colored active states. Reserve `default` (brand-blue) for active/attention badges, and use `muted` for done/archived. Applied in both `client-activity.tsx` and `booking-requests.tsx`.

## 17. Photo controls are identical client ↔ pro

The avatar control is the SAME in both panels: an avatar circle (with an upload spinner overlay) + a **Cambiar foto** button and a **Quitar foto** ghost button (red) when a photo exists, or a single **Agregar foto** button when none. Use a hidden `<input type="file">` driven by a ref; remove clears `avatar_url` in `profiles` + auth metadata. No format/size hint text under the control (the picker enforces it). Don't ship one panel with change-only and the other with change+remove.

## 18. Dashboards share ONE content shell (client = professional)

Both dashboards use the same two-part frame: a left vertical nav rail + a right content column where **each list/activity tab renders inside a `Card` with a titled `CardHeader`** (`<h2>` section title, optional `text-[#6b7280]` subtitle) and a `CardContent` body. The client and professional panels render the SAME `ClientActivity` component for the user's own Solicitudes (`section="bookings"`) and Proyectos (`section="projects"`), so those sections must look identical across panels — never wrap one in a titled Card and leave the other as bare content with a lone `h2`. Resolve the per-tab title/subtitle from a small `SECTION_TITLE`/`SECTION_SUBTITLE` map keyed by the active tab. A settings-style tab (Mi perfil) may keep its own multi-card layout instead of the single shell, since it's a stack of sub-cards rather than one list.

## 19. De-box by default — plain over pills/containers

The serious-tone rule extends to layout: **prefer plain text + a small icon over colored pills, and divider/spacing over bordered containers.** Concretely, across the public profile and "Sobre mí":
- **Status/most metadata = plain text.** Profession tags render as muted text joined by " · " (not `Badge` pills); "Identidad verificada" is green text + `ShieldCheck` icon (no filled pill); spoken languages and insurers are plain " · " text (no tinted chips). Reserve filled/colored badges for genuinely scannable states (e.g. an active booking status), not for every label.
- **One treatment per group — no odd boxes among plain rows.** When a section lists several facts (experience, verification, location, prices), present them as borderless `flex justify-between` label→value rows (`flex-col gap-2.5`), NOT a bordered/`divide-y` container sitting next to plain headed sections. If one item in a list is boxed and the rest aren't, that's the bug — make them all plain.
- **Informational banners aren't always boxes.** The "viewing as a client" preview banner is plain `text-[#6b7280]` + its action button — no tinted container. Use a colored container only when the message is a genuine alert/warning that must interrupt.

## 23. Legal pages (Términos / Privacidad)

Legal documents render through the shared `LegalDocument` component (`components/legal/legal-document.tsx`): content is **data** (`LegalSection[]` of typed blocks — `p` / `sub` heading / `ul` list / `note` callout), with a small inline renderer for `**bold**` and the support email auto-linked. It provides the title, "Última actualización", intro, a two-column TOC, hairline-separated sections, and the footer cross-link box. **These pages are Spanish-only** (the binding legal version) — never machine-translate the body; for EN visitors show the Spanish text plus a one-line English note that it's the binding version. No "borrador/draft" disclaimer on published legal text. Keep both linked from the footer AND every registration "acepto los términos…" step (pro registration, client registration page, client registration modal).

## 24. The "Verificado" badge + its always-reachable meaning

The identity badge label is **"Verificado"** (EN "Verified") everywhere it's the chip — cards, profile, panels, booking. For legal clarity, **wherever the badge shows there must be a reachable explanation of its LIMITED meaning**: a "¿Qué significa?" link beside the badge (public profile header + "Sobre mí" row) deep-links to `/proveedores-autorizados#que-significa`; on cards (no room for a link) the badge keeps a `title` tooltip and the card links through to the profile. The explainer states the badge ONLY confirms the cédula is real and the name matches official records — it does NOT guarantee quality, outcome, completion, permits, or that the registrant is physically that person. Verification is **optional**: a pro may register with a cédula (→ badge) or without ("Registrarme sin cédula por ahora" → unverified, no badge, verifiable later). A null cédula safely skips verification (status stays `pending`, never auto-rejected); registering without one is a normal unverified signup, not a review case. 18+ is enforced via Terms acceptance at registration (no age checkbox).

## 21. ONE save pattern: autosave everywhere + a shared status indicator

The whole app **autosaves** — there are NO "Guardar cambios" buttons in editable sections. Every section gives consistent feedback through the shared `SaveStatus` component (`components/dashboard/save-status.tsx`, `saveStatus` i18n): **Guardando… / Guardado / Sin guardar**. **Placement = ABSOLUTE OVERLAY on the section title's top-right — OUT OF THE DOCUMENT FLOW** (Sprint 215; supersedes the Sprint-214 in-flex slot, which still let the status affect the title row). TWO guarantees make a layout jump structurally impossible: (1) `SaveStatus` is **always mounted at a fixed height (`h-5`)** and only toggles **opacity + text** (never mounts/unmounts → never adds/removes height); (2) it is rendered **`absolute right-0 top-1`** inside a **`relative`** title wrapper, with the `<h2>` given a constant **`pr-28`** so its text never runs under it. Being absolute, the status occupies ZERO flow space — its presence/size/text can't push or reflow the title or the content below. Editors still **report** their state up via **`useReportSaveStatus(saving, saved, dirty)`** (context in `save-status-context.tsx`) to **`<HeaderSaveStatus/>`** (the absolute overlay) rendered in the tab `<h2>` wrapper (the pro dashboard wraps its content `Card` in `<SaveStatusProvider>`); the client dashboard owns its profile state, so it renders the absolute `SaveStatus` overlay directly in its title wrapper (gated to the profile tab). At ~360px the title just wraps within `pr-28`; the status stays pinned top-right (no overlap). **Never put the status back in the content flow, and never make it conditionally mounted in a way that changes height.** Two implementation shapes, both ending in the same indicator:
- **Form-based** (Pro Mi perfil, Client profile): edits call a `touch()` that marks dirty + bumps a nonce; a `useEffect` debounces the save ~1.5s after the last edit. Keep an `UnsavedChangesGuard` mounted so a pending edit is flushed if the user navigates away mid-debounce.
- **Action-based** (Servicios, Disponibilidad, Photos): each action (add/remove/toggle/upload) persists immediately; surface a brief "Guardado" pulse via the same `SaveStatus`.

Rules: never add a save button to one section while another autosaves; never autosave without showing the status (no silent persistence); validate before persisting so autosave can't write invalid data (e.g. a locked verified name is never overwritten). When adding a new editable section, wire it to autosave + `SaveStatus` — do not introduce a button.

## 22. /buscar card — fixed height, 3 action layouts

Search cards are uniform (`md:min-h-[190px]` floor); reorganizing them must NOT increase height. Layout grammar:
- **Identity zone (left):** name (priority — wraps to 2 lines on mobile, never truncates first), the compact **"Verificado"** trust mark (icon + short text, no box) right beside the name, and the **price** at the top-right as just the amount ("₡X/hora" — no "Desde/Tarifa", hidden when non-numeric). No separate top-row contact icons.
- **Action zone (right):** the schedule columns (always the full date "15 mar"/"Mar 15", never weekday-only "lun 15"; no "Próximos horarios" label) followed by the contact/primary actions in **3 layouts** driven by real data (`availabilityPublic`, `allowPhoneCall`, `whatsapp`):
  - **TYPE 1** — public + call enabled: `[WhatsApp · Llamar]` on ONE row, then the full-width **Solicitar servicio** primary below.
  - **TYPE 2** — public + no call: `[WhatsApp]` then **Solicitar servicio**.
  - **TYPE 3** — private: only WhatsApp (plus Llamar if the pro enabled it); no schedule, no Solicitar. Here the contact buttons are the ONLY actions, so they **stack VERTICALLY** (WhatsApp above Llamar, each `w-full`), bottom-pinned in the action column. This stacked layout is private-only.
  In TYPE 1/2 WhatsApp + Llamar share a single row (`flex gap`, each `flex-1`) so enabling calls never adds a line above "Solicitar servicio". `contactButtons(stacked)` switches between column/`w-full` (private) and row/`flex-1` (public). Either way the card height is unchanged (the identity zone drives height; the `md:min-h-[190px]` floor keeps cards uniform). To make room for the contact row without growing the card, the price moved to the identity zone and the redundant "Ver horario completo" link was dropped.
- **Filters:** the aseguradora filter never offers a "Ninguna / Todas / sin seguros" entry (excluded by id AND label — that's a pro attribute, not a client filter) and defaults to no insurer selected (neutral placeholder "Cualquiera", not a pre-selected value); the X clears back to unfiltered.
- **Uniform height:** the action zone carries a mobile floor (`min-h-[150px] md:min-h-0`) so all 3 button-layout types line up on mobile; desktop uses the row layout + the card `md:min-h` floor.
- **"Ver horario completo"** lives as a right-aligned link in the schedule's header row (shares the location row → no extra line); it opens the booking/full-schedule flow.
- **Reviews are a link:** the rating + count links to `/profesionales/[slug]?tab=resenas` (count brand-blue + hover underline, like the casos/cert links; ICU plural). The 0-review state stays the honest, non-link "Sin reseñas todavía" — never a fake number or misleading link.
- **Email action** wording is "Contactar por correo" (EN "Contact by email"), matching "Contactar por WhatsApp".

## 20. Optional map pin = opt-in disclosure (never shown by default)

Location is captured as **provincia → cantón first** (the authoritative data that drives `/buscar`); marking the exact spot on a map is an OPTIONAL precision refinement and must NOT be visible by default — a map shown upfront clutters the form and, on mobile, pushes everything down. The control is a **lightweight expandable link** (`MapPin` + "Buscar la dirección y marcar el punto en el mapa" + `ChevronDown`, brand-blue, `aria-expanded`), de-boxed (no bordered row) per §19, that reveals the Places address search + map only when the pro opts in. Default `showMap=false`; the map instance is created lazily on expand and torn down on collapse. When collapsed, show a small `Check` if a pin is already set. Use the SAME picker component in BOTH registration and the panel so the control behaves identically — never let the two flows diverge. The pin stores only `lat`/`lng`; it never overrides the chosen provincia/cantón, so a professional saved with or without a pin filters identically in search.

## 25. The "Verificado" badge is text-only (no icon, no inline explainer)

Every "Verificado" trust mark renders as the plain word "Verificado" (green) — NO check/shield icon anywhere (search card, public profile header + Sobre mí, pro dashboard, profile editor, client account, the /proveedores-autorizados hero chip, landing mockups). Do NOT re-add an icon. The badge's limited meaning is NOT explained inline next to it (no "¿Qué significa?" link); the explanation lives once on `/proveedores-autorizados#que-significa` and in the Terms. App copy says "Verificado"/"Verified" — never "Identidad verificada".

## 26. /buscar card grammar (refinements)

Within the uniform card (mobile floor `min-h-[320px]`, desktop `md:min-h-[190px]`):
- "Ver horario completo" sits CENTERED below the schedule grid (`self-center`), never in a top corner — it must not collide with the absolute top-right bookmark button.
- Reviews: star + rating value are plain text; ONLY the "N reseñas" count is the link (brand-blue, to the reviews tab). 0 reviews → honest non-link "Sin reseñas todavía".
- Casos de éxito / Formación are count-LESS links; Formación (certifications) only renders when the pro has any.

## 27. Dashboard panel spacing (title → content)

Panels use `<CardHeader className="px-6 pt-6 pb-3">` + `<CardContent className="px-6 pt-1 pb-6">`. NOTE: `CardContent`'s default is `p-5`, so an override that omits the top padding silently keeps `pt-5` (20px) and, with the header's bottom padding, produced a ~36px gap. Always set the content's top padding explicitly (`pt-1`) to keep a tight, consistent ~16px title-to-content gap across every section.

## 28. Filters: one behavior + no stuck focus ring

`/buscar` filters apply INSTANTLY (the desktop sidebar has no apply button, so the mobile drawer must not either — dismiss via X/backdrop). **ONE unified service control (sprint 290):** the filter has a SINGLE "Busca un servicio…" field that IS the category picker (type → category autocomplete → pick, OR free text) — there is NO separate "Categoría" dropdown (they were redundant). `q` XOR `categoria`: the field seeds from `q` else the active category's label; typing free text clears a picked category; picking a suggestion sets `categoria`, clears `q`, and cancels the pending free-text debounce; the clear-X resets both; `activeCount` counts it once. **Mobile drawer close X (sprint 290):** the X lives INSIDE the white "Filtros" card's own header (via `SearchFilters` `closable` → dispatches `ccr:close-filters`), NOT in a separate row above it; the page passes `drawerFilters={<SearchFilters closable/>}` while the desktop sidebar `filters` stays X-less. The drawer's gray panel is `p-2.5` so the white card rises near the top with only a thin gray frame visible. The aseguradora default is unselected = unfiltered, with the neutral field-label placeholder "Aseguradora" (never "Cualquiera/Ninguna/Todas"); X clears. The shared `Select` trigger uses `focus-visible:` (not `focus:`) so a mouse selection that returns focus to the trigger leaves no stuck border — keyboard users still get a brand-blue ring.

## 29. "Completa tu perfil" leads to the exact field

Each completion item opens the matching collapsed section in the profile editor and smooth-scrolls to the field, flashing it (`.field-flash`, globals.css). ProfileEditor sections are CONTROLLED (open state lifted; `focusField`/`focusKey` props; `FIELD_SECTION` map; `data-field` anchors). Any non-empty description counts as complete (no minimum length).

## 30. Free copy: honest present-tense, never "free forever"

Describe the app as free in the PRESENT tense and for specific actions ("Crear tu cuenta y empezar es gratis", "Registrarte es gratis", "No cobramos comisiones por los servicios"). NEVER promise permanence or totality ("gratis para siempre", "totalmente/completamente gratuito", "sin cargos de ningún tipo", "sin excepción") — paid professional subscriptions may arrive later. Don't announce future paid plans either; just avoid the perpetual-free promise.

## 31. Payments are behind PAYMENTS_ENABLED (default OFF)

All subscription/payment surfaces are gated by `PAYMENTS_ENABLED` (`lib/payments/config.ts`, from `NEXT_PUBLIC_PAYMENTS_ENABLED`). With it OFF: regular users see ZERO payment UI (no "Suscripción" tab, no links), the self APIs report `enabled:false`/refuse checkout, and the app is identical to the free version. Admin subscription management is the only payment surface visible while off (admin-only, for the manual SINPE flow). Raw card data must NEVER touch our server or DB — card billing goes through the gateway abstraction (`lib/payments/gateway.ts`); we keep only gateway references. To activate: apply migration 054, plug a gateway, set the SINPE number, update legal pages, flip the flag.

## 32. /buscar cards = FIXED height, buttons bottom-anchored

To guarantee identical card heights across every button-layout type (WhatsApp-only,
WhatsApp+Llamar, schedule, no-slots), the card uses a FIXED height — `h-[360px]`
mobile, `md:h-[232px]` desktop — with `overflow-hidden`, NOT a min-height floor (a
floor lets richer cards grow and breaks uniformity). Identity content is top-aligned
(`flex-1`); the contact/primary actions are bottom-anchored so all cards line up on
the same baseline. The name clamps (1 line desktop / 2 mobile) and is never
truncated mid-flow. If a future change adds card content, bump these two heights
together rather than reverting to min-h.

## 33. Verified badge: only verified pros are marked

Only verified professionals show the text-only "Verificado" mark. Unverified pros
show NOTHING — no badge, no "Sin verificar"/"Identidad sin verificar" label, no
inline "coordina con cuidado" warning on cards/profiles/booking. The meaning of
verification still lives in full on /proveedores-autorizados and the Terms; the
pro's OWN dashboard still shows their verification status + how to verify.

## 34. No published schedule → coordinate via WhatsApp (never a dead booking)

"Solicitar servicio" books a time slot, so it must not appear when a public pro has
no upcoming slots (it would open an empty calendar). In that case the card shows
"Este profesional coordina por WhatsApp." + the WhatsApp/Llamar actions, and the
booking modal's no-availability state offers a "Coordinar por WhatsApp" button.
Private-availability pros already follow this contact-only pattern.

## 35. Filters: dropdowns for choices, toggles for booleans

Keep the two kinds distinct and coherent: multi-value filters (categoría, provincia,
cantón, aseguradora, orden) are DROPDOWNS; on/off filters (cerca de mí, Solo
verificados) are TOGGLES, grouped under a small "Más filtros" heading. Default
dropdown labels read as inclusive "Todas/Todos …"; aseguradora's default
"Cualquier aseguradora" is greyed like a placeholder to signal it is NOT an active
filter (most pros have no insurer). Triggers/toggles use focus-visible (no stuck
ring); filters apply instantly (no apply button anywhere).

## 36. Subscription benefits = "operate & receive clients", not cosmetic extras

The paid subscription is what keeps a professional ACTIVE and able to receive
clients — frame benefits around that, honestly. Do NOT promise featured/highlighted
search placement (search is filter-based: categoría/provincia/cantón) and do NOT
invent a second badge (the only badge is "Verificado", identity). Valid benefit
themes: appearing in searches / being found, receiving solicitudes, receiving &
responding to projects, keeping the profile active. Keep it accurate — no premium
cosmetic claims the product doesn't deliver.

## 37. /buscar card name line: Verificado pill right-aligned, dashboard style

On the search card, the "Verificado" mark reuses the dashboard's `Badge
variant="verified"` (solid brand-blue pill) and is placed to the RIGHT of the name
on the name line — name is `flex-1 truncate` (one line), the pill + optional price
are `shrink-0` after it. Do NOT let the badge wrap below the name (it pushed the
layout and truncated the lines beneath). With the badge on the name line, the
location + coverage ("se desplaza") lines WRAP in full (no `truncate`; icon
`mt-0.5` top-aligned) and are never cut off at ~360px. Keep the card's fixed height.

## 38. /buscar card name line is responsive (badge beside name vs full name)

The name + "Verificado" pill line behaves differently per breakpoint, on purpose:
- DESKTOP (`md:flex-nowrap items-center`): name is content-width (`min-w-0`,
  `md:line-clamp-1`) so the pill sits IMMEDIATELY beside the name (not pushed to the
  far edge). Optional price is pushed right with `md:ml-auto`.
- MOBILE (`flex-wrap items-start`): the FULL name shows (up to 2 lines via
  `line-clamp-2` — never truncated to 1 line) and the pill wraps below when there's
  no room. Keeping the whole name visible beats keeping the pill on the name line.
Do NOT give the name `flex-1` (that pushes the badge to the far right) and do NOT
use single-line `truncate` (that cut off mobile names). Card height stays fixed.

## 39. /buscar cards shorten the PERSON name (first + both surnames)

On the search card, a person's name is shortened to first name + both surnames,
dropping middle name(s) — `shortPersonName()` in professional-card.tsx
(`parts.length <= 3 ? full : [first, secondLast, last]`). It applies to the person
name in BOTH layouts (primary line when there's no company, or the subtitle under a
company). A company/nombre-comercial is shown verbatim — shortening is for the
person only. The COMPLETE official name (incl. middle names) still shows on the
profile page; never shorten there. Card height + the responsive name/Verificado
line (see §37–38) are unchanged.

## 40. No-schedule card message is per-case (accurate, not card-growing)

When a /buscar card has no bookable schedule, show a concise note ABOVE the stacked
WhatsApp/Llamar buttons, matched to the real reason:
- Private availability (pro hid it, `!availabilityPublic`): `schedule.availabilityHiddenNote`
  — "Su disponibilidad no es pública. Escríbele para conocer sus horarios."
- No slots posted (public but none): `schedule.noScheduleNote` — "Aún no publica sus
  horarios. Escríbele para coordinar."
A WhatsApp-only-preference card shows just the buttons (no note). Keep the wording
short so it fits the FIXED card height (never grow the card); both end pointing the
client to message the pro (the buttons below are WhatsApp/Llamar).

## 41. Filters: neutral select borders + all filters visible (no "Más filtros")

The /buscar filter Select triggers keep a NEUTRAL border in every state via a
filter-scoped `FILTER_TRIGGER` override (`focus-visible:ring-0
focus-visible:border-[#e5e7eb]`) — the shared Select's brand-blue focus-visible ring
otherwise "sticks" after selecting (Radix returns focus to the trigger) and reads
as a stuck colored border. Don't reintroduce a colored focus/open border on filter
triggers; the open dropdown + chevron rotation are the affordance. (Scope the
override to the filters; leave the shared `ui/select.tsx` for other surfaces.)
Show ALL filters directly — booleans (cerca de mí, Solo verificados) are toggles at
the SAME level as the dropdowns, separated only by a thin divider; do NOT hide them
behind a "Más filtros" heading/collapse. (Supersedes the §28/§35 grouping note.)

## 42. Optional social links on the profile (URLs only, additive)

Professionals can add OPTIONAL social links (Instagram, Facebook, TikTok, website)
— URLs only (no storage cost), shown IN ADDITION to "casos de éxito" photos (never
a replacement). Editor section "Redes sociales"; inputs normalize to full URLs
(`socialUrl()` accepts a link, domain/path, or bare @handle). Store only the
filled-in ones (`professionals.social_links` jsonb). On the public profile, render a
compact row of recognizable icon buttons (only the set ones) that open in a new
tab, in the contact sidebar. Brand glyphs live in `components/icons/social-icons.tsx`
(lucide no longer ships Instagram/Facebook); website uses lucide `Globe`.

## 43. Auth-gated pages: check on the server (no flash)

For pages that require login, do the auth check in a SERVER component and
`redirect()` to /login BEFORE rendering — never render the page then redirect in a
client `useEffect` (that flashes the gated screen). Pattern: `page.tsx` (server)
calls `safeGetUser`; if absent `redirect(\`/${locale}/login\`)`; otherwise render
the gated content.

### 43.0 Shared `Modal` primitive (use it for all modals/dialogs)
There is now ONE modal primitive — **`Modal`** (`components/ui/modal.tsx`). It owns the canonical
chrome: dimmed `bg-black/50` backdrop (click to close), centered white `rounded-2xl shadow-2xl`
dialog, **pinned header (title + subtitle + X)**, **optional pinned footer**, and a **scrolling
body** (`max-h-[90vh]`); closes on **X / backdrop / Esc**, locks background scroll, and is a
**full-width bottom-sheet on mobile** (`items-end`, `rounded-t-2xl`). Props: `onClose`, `title`,
`subtitle?`, `size` (`sm|md|lg`), `footer?`, `closeLabel`, `bodyClassName`. **New modals must reuse
`Modal`** (the "Nuevo servicio" service form, the "Agregar profesión" picker, and the Soporte modal
all do) instead of hand-rolling backdrops. (Radix `Dialog` is still used by the booking flow; prefer
`Modal` for plain form/list dialogs, especially when a body-portaled dropdown like `CategorySearch`
would fight a focus-trap.)

### 43.1 "Publicar proyecto" = a MODAL in the panel, not a standalone page
The project form lives in **`PublishProjectModal`** (`components/projects/publish-project-modal.tsx`),
opened from the **"Mis proyectos publicados"** panel section (`ClientActivity` section="projects"
header button + empty-state button). Same fields/validation/submit as before — only the container
changed (page → modal). It uses the **app's hand-rolled modal pattern** (NOT Radix here, so the
body-portaled `CategorySearch` dropdown isn't fought by a focus-trap): dimmed `bg-black/50`
backdrop (click to close) + centered white `rounded-2xl shadow-2xl` dialog, **pinned header
(title + X) and footer (Cancelar / Publicar proyecto) with a `overflow-y-auto` body** (`max-h-[90vh]`),
closes on **X / Cancelar / backdrop / Esc**, locks background scroll, and is a **full-width bottom
sheet on mobile** (`rounded-t-2xl`, `items-end`). On success it calls `onSuccess` (the panel
refreshes its list) and closes — it **never navigates** to a separate page.
- **The old `/publicar-proyecto` route is now a server REDIRECTOR**, not a form: logged-out →
  `/login?redirect=projects`; logged-in → the role-aware projects section (`profesional?tab=sent_projects`
  / `cliente?tab=projects`). All "Publicar un proyecto" links (footer, /como-funciona CTAs) keep
  pointing at `/publicar-proyecto` and funnel through this one redirector, so they're consistent.
  Login honors `?redirect=projects` (email/password resolves it directly; OAuth threads it as the
  callback's `?next=projects`, resolved to the role-aware projects tab after the role is known).

### 43.2 "Soporte" = the page for guests, the in-panel section (+ modal) for logged-in users
The support ticket form is a **single shared component** — **`SupportForm`** (`components/support/support-form.tsx`,
fields/validation/submit unchanged; posts to `/api/contact`, which stamps the logged-in `user_id` so the
ticket is owned by the user and shows up in `GET /api/support`). It is rendered in THREE places, all reusing
that one form:
- The standalone **`/soporte` page** (kept as-is, its full success screen intact) — the entry point for GUESTS.
- The **in-dashboard Soporte section** (`SupportTickets`, the pro/client panel `?tab=soporte`) — the ticket
  list + thread view for logged-in users.
- The **`SupportModal`** (`components/support/support-modal.tsx` = the shared `Modal` + `SupportForm`).

**Global "Soporte"/"Centro de soporte" links** (footer + Recursos menu, desktop+mobile) go through
**`SupportLink`**, which is session/location-aware: logged-OUT or anywhere OUTSIDE the dashboard → navigate
to the public **`/soporte` page** (support must work for guests — never send them to login); logged-IN and
INSIDE the dashboard → the panel's inline **`?tab=soporte`** section. (The old `OPEN_SUPPORT_EVENT` /
`SupportModalHost` global-modal wiring was removed — `SupportLink` navigates, it does not dispatch an event.)

**Inside the panel's Soporte section**, the two **"Contactar soporte"** buttons (the top-right header button
and the centered empty-state button) **open `SupportModal` over the panel** — they do NOT navigate to
`/soporte`. `SupportModal` takes an optional **`onSubmitted(email)`**: the panel passes it, so on a successful
submit the modal closes and the panel reloads (`setShowModal(false); setFilter("open"); load(); loadUnread()`)
— the freshly-created ticket (defaults to `open`/Pendiente, `last_reply_at=now` → top of the list) appears
**inline, with no page navigation**. When `onSubmitted` is omitted, `SupportModal` falls back to its compact
in-modal confirmation (reusable for over-page contexts). Direct navigation to `/soporte` still shows the page.

**Ticket-created confirmation = tight hierarchy, NOT a wall of text.** Both the `/soporte` success screen and
the `SupportModal` confirmation follow one shape: **prominent** check icon + "¡Tiquete creado!" title + **ONE
concise reply line** — "Te responderemos por correo a **{email}**." with the EMAIL bold (rendered via `t.rich` +
a `<b>` tag in `successGuestDesc`, so any consumer of that key MUST use `t.rich`, never plain `t()`, or the tag
prints literally) — then the **action buttons**, then a **subtle muted footnote block** (`text-xs text-[#9ca3af]`)
holding the spam note (`SpamNotice`) and, for guests only, the follow-tickets hint (`guestFollow`). Drop redundant
lead-ins like "Recibimos tu consulta" (the title already confirms creation). No voseo; buttons stack
`flex-col sm:flex-row` for ~360px.

**Loading first — never flash a decided state.** While the initial `/api/support` fetch is in flight the
section shows ONLY a spinner in the content area; the header "Contactar soporte" button AND the status-filter
chips are gated on **`!loading && items.length > 0`** (NOT `loading || …`, which used to flash the "has tickets"
treatment for ~0.5s before data arrived), and the body renders the spinner while `loading`. Initial state is
`loading=true` / `items=[]`, so the component never assumes "empty" before the data resolves.

**Empty-state split in `SupportTickets`** — decided (after loading) by the user's TOTAL ticket count (`items.length`), never the
filtered count: **TRUE-empty** (0 tickets) → full headset empty-card + centered "Contactar soporte" button, with
the header button AND the status-filter chips HIDDEN (nothing to filter, one action only); **FILTERED-empty**
(has ≥1 ticket, none match the selected status) → chips + header button + the simple "No hay tiquetes en esta
vista." line (no big card); **HAS-tickets** → chips + header button + the ticket list. The `filtered.length===0`
branch is only reachable when `items.length!==0`, so a zero-ticket user can never be shown the filtered treatment.

## 44. Verification copy = "Verificado"-only (no unverified label)

App copy must match the model: verified pros show "Verificado"; unverified ones
simply don't show it — never describe a public "Identidad sin verificar" label.
Keep the meaning accurate (identity is real/verifiable via the TSE padrón; NOT a
quality rating). Prefer commas over em-dashes "—" in Spanish UI copy.

**PUBLIC vs OWN panel:** the no-negative-label rule is for the PUBLIC view (/buscar
card + public profile) — unverified pros show NO badge/text there. In the pro's OWN
panel, do NOT show a negative "sin verificar"/"rechazada" label either; instead show a
positive, OPTIONAL **"Verifica tu identidad"** invitation chip (brand-blue + ShieldCheck)
when not verified, that links to the Verificación tab (`setTab("verificacion")`) where the
detailed status/actions live. Verified pros show the "Verificado" badge and no invitation.
- **Dismiss is an explicit, LABELED control — not a bare corner ×.** The optional verification
  invite (in `ProfileCompletion`) can be dismissed via a small **"× Ahora no"** button (icon **+**
  visible label, muted, right-aligned in the row) so it unmistakably reads as "ignore this optional
  suggestion" (never as an error/close). It persists per-pro (`localStorage`) and does not reappear;
  the pro can still verify anytime from the Verificación section. Don't revert to a label-less ×.

## 45. Social links: username in, app builds the URL, icons out (updates §42)

The pro enters ONLY a username per network (Instagram, Facebook, TikTok), shown
with a visible prefix (`instagram.com/`, `facebook.com/`, `tiktok.com/@`) so it's
obvious to type just the handle. Be lenient on input (`cleanUsername` strips `@`,
`www.`, or a pasted full URL to the handle); validate plausibility
(`isValidUsername`); store ONLY the clean username (no URLs). The public profile
builds the link with `buildSocialUrl` and shows icons only (open in a new tab),
only for the networks filled in. All in `src/lib/social.ts`. No website field
(not a username), no feeds/OAuth/Meta API — username → constructed link → icon.

## 46. Labeled toggle buttons: left-align the label (button defaults to center)

A `<button>` defaults to `text-align: center`, and a flex child `<span>` inside it
INHERITS that. For a label+switch toggle row (`justify-between`), a short label fits
on one line so the centering is invisible — but a longer label that WRAPS renders its
lines centered, looking inconsistent with the left-aligned dropdown labels beside it.
Always give the label span `flex-1 text-left` so wrapped text stays left-aligned and
fills the available width (switch stays pinned right via `justify-between`). This bit
the "Buscar profesionales cerca de mí" filter toggle (ES/EN both wrap); the shorter
"Solo verificados" hid the same latent bug. Applies to any labeled toggle/segmented
control built on a `<button>`.

## 47. Footer = one component (`landing-footer.tsx`), links to current pages only

There is ONE footer: `src/components/landing/landing-footer.tsx` (dark `bg-[#111827]`),
rendered on every page. Do NOT reintroduce a second footer (the old light
`layout/footer.tsx` was deleted — it was dead code with stale `/planes`,`/nosotros`
links). Structure: a brand column (logo + tagline + the three brand social icons →
the real ContrataCR Facebook/Instagram/TikTok accounts) spanning 2 cols, then three
link columns — **Para clientes** (Buscar, Categorías, Cómo funciona, Publicar un
proyecto), **Para profesionales** (Registra tu perfil via `SmartRegisterLink`, Cómo
atraer clientes, Verificación de identidad → /proveedores-autorizados), **Ayuda y
soporte** (Centro de ayuda → /ayuda, Centro de soporte → /soporte). Bottom bar =
© year · Términos · Privacidad · "Hecho en Costa Rica".

**ONE support channel (no redundancy).** Support is centralized on the ticket system
at **/soporte** (also the header-nav support link). The footer support column is just
self-serve help (/ayuda) + the ticket center (/soporte) — do NOT add a separate
"Contacto" link or a raw support `mailto:` in the footer/nav (they fragment the
single-channel strategy). `/contacto` is a permanent redirect to `/soporte` (kept only
so old links don't 404). **The legal contact email `soporte@contratacr.com` lives on
Términos + Privacidad ONLY** (data-rights requirement) — never in the footer/nav.

Rules: every link must resolve to an EXISTING page (no dead links — re-verify when
pages are renamed/removed); legal (Términos/Privacidad) always present in the bottom
bar; keep "Hecho en Costa Rica" (reinforces the exclusively-CR identity; single grey
line, no colorful icon/flag). Keep the tagline short, appealing, and HONEST — no
"gratis/siempre gratis/free forever" promise; it states the exclusively-CR marketplace
+ the intermediary positioning (payment arranged directly with the professional). Use
current naming ("Verificado", intermediary positioning). The link renderer handles two
kinds: `SmartRegisterLink` (register) and internal `Link` otherwise. All labels come
from the `footer` i18n namespace (ES+EN).

## 48. Phone mockup ("Así funciona") = a FAITHFUL preview of the real app

The "Así funciona ContrataCR" section (`why-contratacr.tsx`) shows ONE device:
`PhoneFrame` + `ResultsScreen` from `phone-screens.tsx` (the live mockup;
`phone-mockup.tsx`/`app-section.tsx` are dead, unused). The mockup must be an HONEST
preview of the CURRENT product, not a stylized fake. Rules:
- **Device frame:** modern flagship look — titanium rail, slim black bezel, squircle
  screen, dynamic island, machined side buttons, layered shadow, subtle top glass
  sheen. Premium but restrained (serious tone, no gimmicks).
- **Inner content mirrors the REAL `/buscar` card** (`professional-card.tsx` +
  `professional-schedule.tsx`), 1:1 with the CURRENT design (refreshed Sprint 144):
  white `rounded-2xl`+border; **circular** `EBF5FB`/`#009FD9` avatar carrying the
  **navy ranking badge** (`#162543`, white number, `ring-2 ring-white`) that mirrors
  its map pin; the SAME **solid brand-blue "Verificado" pill** (`Badge variant="verified"`
  = `bg-[#009FD9] text-white`, `verifiedShort`) **on its OWN line** under the name —
  never a green check/text and never inline; **price = blue amount + grey unit**;
  grey profession chip; orange-star (`#ff9b32`) rating + **grey `(N reseñas)` in
  parens** (not a blue link); a **Doctoralia-style location TAB** (brand-blue, underlined,
  on a hairline divider) + address line. Then EITHER the **3-day availability strip**
  (hero) + a SINGLE filled **"Ver horario completo"** button — the booking entry point;
  the old separate **"Solicitar servicio" button no longer exists** — OR, for a pro with
  no public schedule, the **coral contact note** (`#FDF3F1`/`#F7D8D1`/`#DC5B4B`,
  `CalendarDays`) + a filled **WhatsApp** (`#25D366`) button. The live `ResultsScreen`
  shows BOTH variants (one of each card) to mirror the real mixed list. When the real
  card changes, update the mockup to match.
- **Example name:** the sample SG card is **"SG Solutions"** (company/brand) with the
  personal name **"Luis Sánchez"** below it. The card's company name **wraps**
  (`break-words line-clamp-2`) — NEVER `truncate` — so it's never cut off when the price
  shares the row in the narrow (~262px) phone. The **profession chip + reviews live in
  the name COLUMN** (under the personal name), NOT full-width below the avatar — mirror
  the real /buscar card order exactly: company → personal name → profession → reviews.
- **Avatar = real PHOTO with an initials fallback:** the cards use the client
  `<MockAvatar src initials>` — a circular profile photo when `src` is set, falling back
  to the `EBF5FB`/`#009FD9` initials circle if the image is missing or fails to load
  (`onError`), so the mockup never shows a broken image. SG Solutions → a **Cloudinary
  URL** (`res.cloudinary.com/dxxrjx2go/image/upload/v1781710352/sgimage_psyvpn.jpg`) via a
  plain `<img>` (no next/image domain config); the other card → a **free-license**
  portrait (randomuser.me). Keep `phone-screens.tsx` a server component; only `MockAvatar`
  is `"use client"`.
- **i18n:** never hardcode the in-phone copy. Build a locale-aware `ResultsCopy` in the
  (server) parent, reusing the real app's strings (`card.*`, `schedule.*`,
  `categories.*`) so ES/EN stay correct and in sync with the product.
- **Responsive:** fixed ~284px width, centered; fits ~360px; the section stacks with
  the phone on top on mobile.

## 49. THE SAVE STANDARD — reliable autosave everywhere (no save buttons, no data loss)

ONE save pattern app-wide. Do NOT mix autosave and save-buttons across sections.

**Pattern = reliable autosave** with a single consistent `SaveStatus` indicator
(`Guardando… / Guardado / Sin guardar` · `Saving… / Saved / Unsaved`), placed
top-right of each editable section. NO per-section "Guardar" buttons.

Two valid implementations, both guaranteeing NO silent data loss:
- **Form-field editor (debounced autosave)** — e.g. `profile-editor.tsx`, client
  profile. MUST implement all three: (1) `touch()` debounces a save (~1s); (2)
  `flush()` saves immediately, bound to every text field's `onBlur` (clicking away —
  to a tab, link, or button — blurs the field first, so it saves before navigating);
  (3) **flush on unmount** — a cleanup effect fires the pending save when the
  component unmounts (the fetch survives a same-page tab-switch unmount), using a
  `saveRef` (latest closure) + `dirtyRef` so the latest values persist and non-text
  changes (toggles, pickers) are covered too.
- **Action-based editor** — e.g. Servicios, Disponibilidad, Photos. Each action
  (add / remove / toggle / upload) calls `persist()` IMMEDIATELY (no debounce), so
  nothing is ever pending. Show the same `SaveStatus` pulse.

Always also mount `UnsavedChangesGuard` (dirty + onSave) as the safety net for HARD
navigation (in-app `<a>` links + tab close/refresh `beforeunload`). Note: dashboard
tab switches go through `router.push` from a `<button>`, so they are NOT caught by the
guard — they rely on flush-on-blur + flush-on-unmount above. That combination is what
fixed the "edit a field, switch section, lose the change" bug. Any NEW editable section
must follow this standard.

**Persist each group of OPTIONAL columns in its OWN Supabase update — never bundle them
all-or-nothing.** A combined `update({ ...core, ...optionalA, ...optionalB })` fails ENTIRELY
when ANY single optional column isn't migrated on that environment (`PGRST204` / "could not
find the 'X' column" / schema cache). The old fallback re-saved with ONLY the core columns,
**silently dropping unrelated data** (and still showing "Guardado"). This is the bug that hit
`workplaces` (Ubicación y cobertura wouldn't persist), and earlier `certifications` /
`social_links`. **Rule:** write the core (always-present) columns first (throw on error), then
each independent optional group in its OWN `update()` — `workplaces`+`search_*`,
`certifications`, `social_links`, the contact/coverage identity fields, etc. — so a missing
column in one group can never wipe another.

**Only CORE + the user-edited primary data may be FATAL; every other write is best-effort and
must NOT throw.** In a single `handleSave` that autosaves the WHOLE form, any throw skips the
success path (`setDirty(false)`), so the form stays `dirty` — which makes the
`UnsavedChangesGuard` fire the native "Changes you made may not be saved." beforeunload warning
FOREVER, even though the core/locations already saved. This was the recurring "zones don't save
+ beforeunload won't clear" bug: a `social_links` write threw because column 056 isn't migrated
in prod, aborting the save after the zones had persisted. **Rule:** throw ONLY for the core
update and the locations update (`workplaces`); make identity/certs/social writes best-effort —
log on failure, set a SOFT warning (shown via `setError` AFTER `setDirty(false)`) only for a
real failure with user data present, and swallow migration-missing errors entirely. So `dirty`
clears (and the beforeunload stops) whenever core + locations succeed, regardless of which
optional column is unmigrated. Keep the global `UnsavedChangesGuard` (it protects the debounce
window for ALL sections) — the fix is reliable dirty-clearing, NOT removing the guard.

**The debounced autosave MUST fire the latest closure via `saveRef.current`, never a captured
`handleSave`.** `touch()` runs SYNCHRONOUSLY inside an `onChange` (e.g. `setWorkplaces(next); touch()`)
— BEFORE React re-renders — so the `handleSave` in scope there closes over PRE-change state. If the
debounce timer calls that captured `handleSave` directly, a discrete single edit (add the first work
zone: `[]`→`[A]`) autosaves the STALE value (`[]`), "succeeds", and clears `dirty` — the UI shows the
new item but the DB got the empty array, and because `dirty` cleared, flush-on-unmount sees nothing
pending so the real value is orphaned in React state only. It also silently drops the LAST keystroke
of a text field when the user then sits idle. **Rule:** `setTimeout(() => saveRef.current?.(true), 1000)`
— `saveRef.current = handleSave` is reassigned every render, so when the timer fires (after the
re-render applied the new state) it points at a `handleSave` that sees the CURRENT value. This — not
the write-bundling above — was the deepest cause of "Ubicación y cobertura no guarda."

**Autosave reassurance line.** Every autosaving section shows a muted helper
`"Los cambios se guardan automáticamente."` / `"Changes are saved automatically."`
(`profileEditor.autosaveNote`, `text-xs text-[#9ca3af]`) at the SAME spot — the bottom of the
section body. In `profile-editor.tsx` it lives in the shared `Section` component (prop
`autosave` defaults true) so it's identical across sections; only add it where autosave is
actually wired.

## 50. /buscar card — MOBILE single column, DESKTOP COMPACT HORIZONTAL two columns

> **UPDATE (Sprint 161) — matches the HuliHealth target screenshots; supersedes the contradicting
> details below.** Net layout of the card body (owned by `ProfessionalSchedule`):
> - **LEFT column (~68%) = `{info}` + `{locationControl}`** — the location TABS + address now live
>   in the LEFT column, directly UNDER the rating (NOT in the right rail; this supersedes Sprint 157
>   and the "location belongs WITH its schedule" bullet). The card's old left-column location
>   SUMMARY line (`fixedText`/`mobileText`) was REMOVED — the tabs replace it.
> - **RIGHT rail (~32%, 300px) = `{scheduleBody}` + the action button(s)**, separated from the left
>   by a **vertical divider** (`lg:border-l lg:border-[#e5e7eb] lg:pl-4 lg:justify-center`; mobile =
>   a top divider `border-t pt-3`). Grid is `lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-5` with **no
>   `lg:items-start`** so both columns stretch to equal height (full-height divider; schedule
>   centers vertically against the taller left column).
> - **CIRCULAR photo** (`rounded-full`, + `rounded-full` fallback) — NOT square. This supersedes the
>   "SQUARE photo" bullet.
> - **The numbered RANK badge rides on the avatar** — navy `#162543`, `absolute -top-1.5 -left-1.5
>   h-[22px] w-[22px] ring-2 ring-white`, via a `rank?: number` prop on `ProfessionalCard` (passed
>   `rank={i+1}` from `buscar/page.tsx`). It is NO LONGER a `<span>` on the page wrapper, and the
>   card's **`pt-10` top band was removed**. The favorite bookmark still floats top-right; the
>   header's `pr-8 lg:pr-0` keeps the mobile price clear of it (on desktop the price is in the left
>   column, far from the bookmark).
> - **`locationControl` is ALWAYS shown** (decoupled from `slots.length`) so a pro with no public
>   schedule still says WHERE they work; with no named workplaces it falls back to a single static
>   **province/cantón tab** + a `cantón, provincia`/coverage address. A real workplace bolds the
>   business name as a venue prefix. Extra `ProfessionalSchedule` props: `placeFallback`,
>   `placeAddress`, `coverageText`, `businessName`.
> The schedule/booking LOGIC, slot styling, and the conditional-button rule (§ below / Sprint 159)
> are unchanged. THE GOLDEN RULE (mobile base + additive `lg:`) still holds.
>
> **UPDATE (Sprint 162) — schedule grid + map zoom polish (still matching the target screenshots).**
> - Right rail narrowed **`300px → 292px`**; the grid gains a **`lg:min-h-[184px]` floor** so short
>   cards keep a consistent height and the centered right rail (`lg:justify-center`) no longer floats
>   with a big empty gap above "Ver horario completo".
> - **Day columns now use RELATIVE labels** — `dayColumnLabel(d, i, locale)`: today → "Hoy", tomorrow →
>   "Mañana", else capitalized short weekday + day number ("Jue 18" / "Thu 18"). Replaces the always-full
>   "18 jun" label. Labels are muted `text-[#6b7280]`, normal case (no uppercase, no bold, no blue-for-soon).
> - Each day is its OWN equal-width grid cell (label on top, pills stacked below); each column shows
>   **up to 3 time pills** (was 2) before the dashed `+N`, with roomier `py-1` pills and `gap-1.5`/`gap-2`.
> - **Map (`google-map-panel.tsx`) `fitToMarkers`: maxZoom 12** (was 15) + padding `64` (was 48) so the
>   pin cluster stays focused on the result area instead of zooming out to the whole country; single-pin
>   zoom `14 → 13`.
> - **Basemap = warm CREAM/BEIGE, low-noise (Sprint 182).** `LIGHT_STYLE` (inline `styles`, no mapId, on
>   the single shared instance → desktop+mobile identical): land `#f4efe4`, natural `#ece5d6`, roads
>   `#fdfaf3`, water muted blue-grey `#c9d6da`. `labels.icon`/`poi`/`transit`/road-labels/admin-borders
>   OFF; locality/province TEXT kept (`#9b9077`). Navy pins `#162543` stay (high contrast). Hover
>   mini-card: a CSS override trims `.gm-style-iw-c/-d` padding so there's no empty band above the photo/name.
> - Initials avatar (light-blue `#EBF5FB` circle + blue `#009FD9` initials) confirmed as the no-photo
>   fallback — `avatarUrl` resolves to `null` when there's no photo, never a logo placeholder.
>
> **UPDATE (Sprint 163) — six target-screenshot mismatches fixed + exact contact copy.**
> - **Pricing**: AMOUNT in brand-blue `#009FD9`, `/unit` in muted grey `#9ca3af` (split on the first `/`);
>   the `Info` icon is GONE. Text prices ("Precio a consultar") now also show, in grey. Supersedes the
>   Sprint-161 black-price + Info-icon look.
> - **Map points** (`google-map-panel.tsx`): pins + cluster bubbles are **navy `#162543`** (was `#009FD9`)
>   to match the navy rank badge on each card's avatar (pin #N ↔ card #N, same colour).
> - **Reseñas**: no `·` separator; the count is parenthesised + muted grey (was brand-blue link) →
>   "★ 4.8 (47 reseñas)".
> - **Profesiones**: chip cap `2 → 3` (`allProfessions.slice(0,3)`) so 3-profession pros show all three.
> - **Favorites icon** (`save-button.tsx`): a PLAIN bookmark outline (`h-[18px]`, grey, no circle/border/bg),
>   filled brand-blue when saved — NOT the old circular bordered button.
>
> **Favorites on the PROFILE (Sprint 211).** The public professional profile (`/profesionales/[slug]`) reuses
> the SAME `SaveButton` (same `contratacr_saved_pros_<userId>` storage, `savePro/unsavePro/isSaved`, and
> `savedProsChanged` event) so favorites are consistent between a /buscar card and the profile — keyed on the
> `professionals` row id (`professional.id`), so saving on either surface reflects on the other (cross-page via
> localStorage on mount; same-tab live via a `savedProsChanged` listener now in SaveButton). The profile uses
> the **`withLabel`** variant: a clear, on-brand **labeled pill** ("Guardar"/"Guardado" — `card.saveLabel`/
> `card.savedLabel`, es+en; brand-blue `bg-[#EBF5FB]` when saved, outline otherwise; filled vs outline bookmark),
> placed in the contact/actions ASIDE after the "Desde" price (visible high up on mobile, where the aside stacks
> first). Cards keep the bare top-right icon. **Self-favorite is blocked via the shared `SelfActionModal`**:
> `isOwn` (viewerId === professional.profileId) shows `SELF_MSG.favorite` instead of saving — same reveal-then-
> block pattern as the other own-profile actions. Logged-out saving behaves exactly like the cards (guest bucket).
> - **Exact contact copy** (`schedule` namespace, ES + EN): the private/no-schedule note is
>   "La disponibilidad de este profesional no es pública. Contáctanos y conoce sus horarios."; the two
>   contact buttons are "Contáctanos por WhatsApp" / "Contáctanos por llamada" (was "WhatsApp"/"Llamar").
>
> **UPDATE (Sprint 164) — coral note, blue text-price, redesigned results header.**
> - **Availability note is CORAL** (`scheduleNote`): `CalendarDays` icon + text in coral `#DC5B4B` on a
>   pale coral panel (`bg-[#FDF3F1] border-[#F7D8D1]`, `flex items-start gap-2`). This is a deliberate,
>   single-purpose accent for the "availability not public" state — the general "serious app, no colorful
>   icons" rule still applies everywhere else.
> - **"Precio a consultar" uses the SAME brand-blue `#009FD9` as the colones price** (text price at
>   `text-[13px]`, colones at `text-[15px]`); no price renders grey anymore.
> - **Results header** ("Todos los profesionales / N profesionales en Costa Rica", `buscar/page.tsx`) is a
>   **brand-tinted panel `bg-[#f4f9fc]`** with a brand accent bar (`h-6 w-1.5 rounded-full bg-[#009FD9]`) to
>   the left of the grouped title+subtitle — not a flat white strip. Mobile still hides the subtitle.
>
> **UPDATE (Sprint 165) — favorites-icon clearance + per-location empty note.**
> - The right rail has **`lg:pr-6`** so its content (the coral note AND the day strip) clears the
>   top-right favorites bookmark (`SaveableCard`, `absolute top-2.5 right-2.5`) — the bookmark gets a clean
>   gutter instead of overlapping the note. (Mobile bookmark sits over the header, which has `pr-8`.)
> - **TWO empty-state notes, by case** (`scheduleBody`): `!canBook` (private/WhatsApp-only) → the general
>   "…no es pública…" note. `canBook && !hasUpcoming` → if the pro publishes times at ANOTHER of their
>   locations (`hasUpcomingAnywhere && locTabs.length > 1`) show **`noTimesAtLocation`** ("No hay horarios
>   disponibles en esta ubicación. Elige otra…"); otherwise the general note. `hasUpcomingAnywhere` is a
>   `useMemo` over the UNFILTERED `slots` (vs `hasUpcoming`, which is the selected location only).
>
> **UPDATE (Sprint 166) — a SINGLE location renders ACTIVE (selected color).** `defaultLoc` now resolves
> whenever `locationOptions.length > 0` (not only when `> 1`), so `effectiveId` points at the lone
> location and its tab gets the **active brand-blue `#009FD9` + underline** styling — identical to a
> selected tab in the multi-location case (and it now shows that workplace's address). The province/cantón
> FALLBACK tab was already always-active. Removed the unused `hasLocationSelector`.
>
> **UPDATE (Sprint 167) — favorites bookmark clearance via a TOP band (not a side gutter).** The right rail
> uses **`lg:pt-6`** (small top band) instead of the Sprint-165 `lg:pr-6`: the bookmark sits in the
> top-right CORNER above the content, and the schedule/note/buttons stay FULL-WIDTH (no blank strip on the
> right). `lg:justify-center` centers content in the space below the band, so the bookmark always clears.

**THE GOLDEN RULE (learned the hard way across many flip-flops): the MOBILE single column is the
BASE, and the desktop layout is ADDITIVE `lg:` classes ON TOP of it.** Never change a mobile
(unprefixed) class to alter desktop — only add `lg:`/`xl:`/`2xl:` variants. That guarantees
mobile renders byte-identically while desktop changes. Verify with `git diff`: a desktop-only
change must show ONLY `lg:`/`xl:`/`2xl:` additions.

- **MOBILE (<lg):** a single vertical column — `flex flex-col gap-3`, blocks `gap-2`: [info]
  then [location selector + schedule-or-message + action buttons] stacked. Content-driven height.
- **DESKTOP (lg+): a COMPACT HORIZONTAL card** so more fit per screen. The wrapper adds
  `lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-4 lg:items-start` → the **info in the LEFT
  (larger) column**, and the **location selector + schedule + buttons in the RIGHT 260px rail** —
  much SHORTER than stacking. Tighter desktop gaps (`lg:gap-1.5`) and the name/personal-name clamp
  to 1 line on desktop (`lg:line-clamp-1`, mobile keeps `line-clamp-2`). The desktop results
  column widens to fit it (`lg:w-[640px] xl:w-[700px] 2xl:w-[820px]`, map `lg:flex-1`). Cards are
  near-uniform height via the compact clamped content (no fixed height — that would truncate).
- **The LOCATION selector belongs WITH its schedule, not with the info.** The `locationControl`
  (tabs/label + address) sits in the RIGHT rail, **TIGHTLY grouped (`gap-1`) directly above its
  slots** — `<div className="flex flex-col gap-1">{locationControl}{scheduleBody}</div>` — so each
  location + its time slots read as ONE connected unit. Do NOT put `locationControl` in the LEFT
  info column (that split the label from its slots across columns and looked disconnected). The
  info's own location LINE ("San Ramón, Alajuela" + "se desplaza") stays in the info — that's the
  general summary, separate from the per-location selector.

Within the right rail the schedule + action buttons sit together (location+schedule on top,
buttons below); there is NO separate full-width bottom button strip.

**Who owns what (the server/client split matters):** `professional-card.tsx` is an ASYNC SERVER
component; `professional-schedule.tsx` is the `"use client"` component holding ALL schedule
state (location options, `effectiveId`, filtered slots, booking modals). The location TABS,
schedule preview, and action buttons all share that state, so they live in ONE client component
instance. **`ProfessionalSchedule` owns the card-body LAYOUT** and the card passes its info as a
slot: `<ProfessionalSchedule info={…} />`. The info JSX (server-rendered) is the photo + name +
Verificado + personal name + price + tags + rating + location line; the schedule appends the
location tabs/address below it, then the schedule block.

- **Location-nav chevrons are FIT-based** (Sprint 174): `showLocNav` = the tab row actually OVERFLOWS
  its container (`scrollWidth - clientWidth > 1`, measured via a `ResizeObserver`), NOT a fixed
  `locTabs.length > 3`. So the arrows appear as soon as a location won't fit — identical on the wide
  /buscar card and the narrow profile contact rail (the count rule showed them too late on the narrow
  one: the 3rd tab cut off at 3 locations, arrows only at 4). Monotonic (showing the chevrons only
  narrows the row), so it never oscillates. Don't revert to a count threshold.
- **The location TAB row is HORIZONTAL-scroll ONLY** (`overflow-x-auto overflow-y-hidden hide-scrollbar`).
  **Always pair `overflow-x-auto` with an explicit `overflow-y-hidden`** on any horizontal scroller:
  with overflow-y left `visible`, CSS COMPUTES it to `auto`, so the row becomes vertically draggable
  (it could be scrolled up/down even with ONE location — Sprint 169). Do NOT add `touch-action: pan-x`
  — that would stop vertical touch-drags from bubbling to the page/sheet scroll; the default
  touch-action already lets them pass through once overflow-y is hidden.

- **Sizing = CONTENT-DRIVEN height.** The article is `flex h-full flex-col`, **no hardcoded
  height, no `overflow-hidden`** — it grows for max content. Don't reintroduce a fixed `h-[…]`.
- **Layout (in ProfessionalSchedule) = a single column** (`flex flex-col gap-3`): the
  `{info}` + location tabs/address block, then the schedule-or-message + buttons block.
  ~~Two-column grid~~ removed. Below is the old two-column note kept for reference only —
  FRACTIONAL columns (`1.85fr` / `1fr`), NOT a fixed right width — a fixed `288px` right column
  became ~49% (near-equal columns) on the narrower ~620px card; fractions keep it ~⅓ at every
  width. `minmax(0,…)` lets both columns shrink so long content never forces overflow. LEFT
  (~65%) = ALL the professional info (`{info}`) + location tabs/address; RIGHT (~35%, `relative
  z-10`) = schedule-or-message ON TOP, then the **action buttons full-width of the right column**.
  **NOTHING spans both columns** (NO bottom strip). On mobile the same wrapper is `flex flex-col
  gap-3` (stacked: info → tabs → schedule-or-message → buttons). The narrower right column shows
  the same 3-day strip (it just pages with the `< >` arrows; chips get smaller).
- **Card WIDTH:** wrapper `w-full max-w-[520px] lg:max-w-none` — capped for the single-column
  mobile/tablet card, but on desktop it FILLS the results column, which hugs the wider two-column
  card responsively: `lg:w-[620px] xl:w-[680px] 2xl:w-[880px]` (≈820–900px ceiling). The **map
  takes the remaining space** (`lg:flex-1`). One card per row; no equal-height coupling.
- **SQUARE photo** (not circular): `<Avatar className="h-14 w-14 rounded-xl lg:h-16 lg:w-16">`
  (+ `rounded-xl` on the fallback) — `cn`/tailwind-merge overrides the Avatar's default
  `rounded-full`. Same square photo on mobile, just smaller.
- **Verificado on the /buscar card = GREEN TEXT** (`text-[11px] font-semibold text-[#16a34a]`),
  **no icon, no pill**, on its OWN line between the company name and the personal name (per the
  handoff). The solid brand-blue **"Verificado" pill** (`Badge variant="verified"`) stays
  canonical everywhere ELSE (profile, dashboard, saved-pros mockup) — only the search card uses
  the lighter green text. Unverified shows nothing.
- **Header uses the full width:** identity (square photo + company name + Verificado + personal
  name) on the LEFT (`min-w-0 flex-1`); the **PRICE is at the TOP-right of the left column, on
  the name line, with a small grey info icon** (`Info`, HuliHealth style) — `shrink-0 flex
  max-w-[45%] items-start gap-1`. It sits below the favorite bookmark (the `pt-10` band clears
  it); NOT `z-10` so the stretched card overlay still routes its clicks to the profile.
- **Schedule (right column) = ALWAYS 3 day-columns, prioritizing days WITH availability** (Sprint
  163, in `ProfessionalSchedule` → applies to BOTH the /buscar cards AND the profile). Fill the 3
  columns with the **next days that actually have appointments** (soonest first, **NOT necessarily
  consecutive** — e.g. today / +3 days / +2 weeks, each with its slots). Only when **fewer than 3**
  days have availability, **pad** the remaining columns with the **immediately following CONSECUTIVE
  calendar days marked "No disponible"** (`schedule.dayUnavailable`) — e.g. availability only today →
  today / Mañana (No disponible) / +2 (No disponible). Never waste a column on "No disponible" when a
  real availability day further out can fill it. Implementation: `availableDays` = days with slots;
  `windowDays` = `availableDays.slice(effOffset, +COLS)` padded (from the last shown day's `dayIndex`)
  when `< COLS`; `dayColsClass` is always `grid-cols-3`. Arrows page through the days-with-availability;
  "+N" per day + the per-location logic + the slot DATA/fetch are UNCHANGED. No bookable schedule (0
  available days) still shows the short coral note, not 3 empty columns.
- **Action buttons (IN the right column, full-width PILLS of it — HuliHealth style, NO bottom
  strip), conditional on availability** *(updated per the /buscar design handoff — this
  supersedes the old outlined-button / two-button rule)*: if the day strip is showing
  (`hasSchedule = canBook && hasUpcoming`) → a **SINGLE FILLED "Ver horario completo"**
  (`rounded-full bg-[#009FD9] text-white`) which opens the booking flow; the separate
  "Solicitar servicio" button was **removed** (booking happens inside "Ver horario completo").
  Otherwise (contact-to-coordinate state) → the message, then **FILLED WhatsApp** (`rounded-full
  bg-[#25D366] text-white`), plus **FILLED "Llamar"** (`rounded-full bg-[#009FD9] text-white`)
  **only when `showCall`** (phone calls enabled); NO "Solicitar servicio". All actions `w-full`,
  `py-2.5`, `rounded-full` (of the 260px right rail on desktop; full width on mobile).
- **No meaning-losing clipping (sized for MAX content):** company + personal name each wrap up
  to 2 lines (`line-clamp-2`) without colliding with the price; tags wrap + "+N"; location wraps
  + "+N"; location TABS scroll horizontally for 5+ locations; a busy day caps time chips with
  "+N". Max case → the card GROWS taller; nothing clips, collides, or pushes the buttons.

**Overlays + z-index:** ranking number (top-left, page wrapper) + favorite bookmark (top-right,
`SaveableCard`, z-20) are ABSOLUTE; `pt-10` reserves a top band so they never overlap. The whole
card is a stretched `<Link absolute inset-0 z-0>`; interactive bits (name/reviews links, location
tabs, schedule chips, action buttons) are `relative z-10`. The LEFT info column is NOT wrapped in
z-10 (only its links are) so clicking its empty space still navigates to the profile; the RIGHT
schedule column IS `z-10` (interactive). All scheduling/availability/filtering LOGIC lives in
`ProfessionalSchedule` and is NOT changed by card-layout work.

**Whole card opens the profile (stretched link).** A low-z overlay `<Link absolute inset-0
z-0 tabIndex={-1} aria-hidden>` covers the card → the professional's profile. Interactive
bits sit ABOVE it at `relative z-10` (logo + name links, the rating "N reseñas" link, the
whole action/schedule area); the favorite bookmark (z-20, `SaveableCard`) is above it too.
Keyboard/SR users use the focusable logo/name links. Don't add a separate "Ver perfil
completo" link.

**ON THE PROFILE ONLY — not on the card:** Casos de éxito, Formación, social-media
icons. Do NOT re-add them to the card.

**Page shell (responsive):** see §51 — desktop = filter sidebar · results column (hugs the
two-column card, `lg:w-[620px] xl:w-[680px] 2xl:w-[880px]`) · sticky map (`lg:flex-1`); mobile =
map on top + filter chips + list.

**No-overlap / consistency rules:**
- The favorite bookmark is `absolute top-2.5 right-2.5`; the card's `pt-10` top band keeps
  ALL content below it so nothing overlaps it. (The location control now lives in the BOTTOM
  action area, well clear of the top-right bookmark — the old `md:pr-9` guard was dropped.)
- **Multi-location selector = HORIZONTAL TABS (Doctoralia-style), not a dropdown.** Each
  location is a tab: a small `MapPin` + the name; the SELECTED tab is brand-blue
  (`text-[#009FD9] border-b-2 border-[#009FD9]`), the rest muted; the selected location's
  street ADDRESS shows directly below the tab row. The tab row is `flex overflow-x-auto
  hide-scrollbar` with every tab `shrink-0 whitespace-nowrap`, so when there are more tabs
  than fit it SCROLLS sideways and NEVER wraps (wrapping would shift the buttons / break
  equal-height). A single-location pro shows the name + address directly, no tab row.
- **Multi-location options — separate the two concerns (this kept regressing).** Build
  the tabs' OPTIONS from the pro's ACTUAL service locations: their named `workplaces`
  UNION any extra locations the slots carry (`cov_*` a-domicilio, videoconsulta), keyed by
  id. This makes them appear for EVERY multi-location pro regardless of which locations
  currently have upcoming slots. Keep the schedule FILTER STRICT per-location by id (a
  selected location shows only its own slots + location-agnostic `general` slots, never
  another location's; an empty location shows the honest "no upcoming" state). **Do NOT
  derive the options from the SLOTS alone** — that's the recurring regression (they vanish
  when a pro's upcoming slots are all at one location). Build the control ONCE
  (`locationControl`) and render it in EVERY schedule branch (incl. no-upcoming) so it can't
  be dropped per-layout or trap the client on an empty location.

## 51. /buscar page shell — desktop 3-column, MOBILE = Yelp map + bottom sheet

`SearchResultsLayout` (`search-results-layout.tsx`, `"use client"`) is the responsive shell.
**Filtering/search LOGIC is unchanged** — every control drives the same URL params via
`SearchFilters`.

**THE GOLDEN RULE still holds** (see §50): desktop is the *additive `lg:`* layer; mobile is the
base. The user redesigned MOBILE twice (Sprint 143 vertical flow → **Sprint 146 the real Yelp
map-first pattern**), so the unprefixed classes changed — but every mobile class carries a `lg:`
reset so DESKTOP renders byte-identically. The bottom-sheet wrapper is **`lg:contents`**: on desktop
its box dissolves and its children (the card column `lg:order-2`, the chrome `lg:hidden`) drop
straight into the flex shell. Verify with `git diff`: desktop columns/widths/sticky are untouched.

- **Desktop unchanged:** xl+ = sticky filter sidebar · results column · sticky map; lg–xl =
  results · map with a "Filtros" drawer button (`hidden lg:flex xl:hidden`). The results column
  (`lg:w-[640px] xl:w-[700px] 2xl:w-[820px]`) hugs the two-column card; the map is `lg:flex-1`.
  The shell is `lg:flex lg:flex-row lg:gap-5`; map `lg:order-3` (inner box `lg:sticky lg:top-20
  lg:h-[calc(100vh-104px)] lg:rounded-2xl lg:border`), results `lg:order-2 lg:static`, sidebar
  `lg:order-1 hidden xl:block`.
- **Filter panel fields (`SearchFilters` sidebar) are ALL FULL-WIDTH and uniform.** Categoría,
  **Provincia, Cantón**, Ordenar por, and Aseguradora each stack full-width in the `flex flex-col
  gap-3` field list, with the same label (`fieldLabel` = `text-[11px] font-semibold text-[#6b7280]`)
  and the same control height/border. Provincia/Cantón use the shared `SelectTrigger` (`h-10 w-full
  rounded-xl border-[#e5e7eb]`) + the `FILTER_TRIGGER` focus override (no stuck ring/border after
  picking). **Do NOT put Provincia + Cantón in a 2-column row** — the 256px (`w-64`) sidebar makes
  each half too narrow for "Todas las provincias"/"Todos los cantones" (overflow) and puts the
  disabled-Cantón faded border beside Provincia (looks inconsistent). **Cantón is `disabled` until a
  Provincia is chosen, and its placeholder GUIDES** — `!province ? t("filters.selectProvince") : …`
  → "Selecciona la provincia" / "Select a province first" (both sidebar + chips), never blank. Toggle
  rows ("Cerca de mí", "Solo verificados") are plain label+switch rows (no bordered boxes); a "Filtros"
  header carries the active-count + "Limpiar (N)".
- **Mobile (<lg) = a polished map-background bottom-sheet (Yelp/Airbnb/Hulihealth; Sprint 151).** The
  shell root is a fixed-viewport column `h-[calc(100dvh-64px)] flex flex-col overflow-hidden`
  (`lg:block lg:h-auto lg:overflow-visible`). Top→bottom: **(1) a SINGLE-LINE HEADER = the navbar**
  (Sprint 157) — `LandingNavbar` takes a `mobileInline` slot (`lg:hidden`, between the logo + the
  hamburger) and /buscar injects the **search** (`MobileServiceSearch`, flex-fills) + a compact
  **`MobileFiltersButton`** (icon-only, brand-blue `#008ce0` active dot) there, so **logo (compacted to
  the mark) + search + filters + menu share ONE row** at ~360px. The Filtros icon dispatches
  **`ccr:open-filters`**; the layout listens and opens the full-filter drawer. (Desktop navbar +
  other pages untouched — only /buscar passes `mobileInline`.) → **(2) the MAP**
  as a full-bleed BACKGROUND — a single `<GoogleMapPanel>` in an aside that `flex-1`-fills the rest
  (inner box `h-full`, no border/rounding on mobile; `lg:rounded-2xl lg:border lg:sticky lg:top-20
  lg:h-[calc(100vh-104px)]`), carrying the pins, "Buscar en esta área" + the top-right zoom/fullscreen
  controls. → **(3) the BOTTOM SHEET** floating over the map's lower part. In `page.tsx` the mobile
  chrome is trimmed so the map dominates: the **"Todos los profesionales" header strip is `hidden
  lg:block`**, the **footer is `hidden lg:block`**, and `main` padding is **zeroed on mobile** (`px-0
  py-0 lg:px-8 lg:py-4`).
- **The BOTTOM SHEET** (`fixed inset-x-0 bottom-0 z-30`, `rounded-t-[20px]` + top/side border + upward
  shadow): the **whole header strip (a clean grip + the "<N> profesionales en <área>" count) is the drag
  target** (`touch-none`, `select-none`). **Drag to resize** between snap points — **PEEK ≈ 0.44 dvh**
  (map-dominant; ~1 card + a peek of the next) and **FULL ≈ 0.9 dvh** — with **VELOCITY flick snapping**
  (flick up → FULL, flick down → PEEK; otherwise settle to nearest; a tap toggles) and a spring
  transition (`cubic-bezier(.32,.72,0,1)`). A `maxHeight: calc(100dvh - 112px)` keeps the header visible
  even at full. Below the header: the **scrolling card list** (`overflow-y-auto`, `children`). Cards live
  INSIDE the sheet and NEVER bleed onto the map. Filters are reached via the **header "Filtros" drawer**
  (the in-sheet chip row was dropped Sprint 151 for a cleaner, map-dominant look).
- **Mobile/tablet filters drawer (current — Sprint 274 REVERTED the Sprint 259→273 redesign).** The `xl:hidden`
  drawer in `search-results-layout` is a left side panel `absolute inset-y-0 left-0 w-[88%] max-w-xs bg-[#f4f7fa]
  shadow-xl overflow-y-auto p-4` over a `bg-black/40` backdrop (tap backdrop or X to close). It shows ONLY a close X at
  the top-right, then renders **`{filters}` = the standard `<SearchFilters/>`** (same node as the desktop sidebar) which
  supplies its OWN white card + "Filtros" header — so it intentionally reuses the sidebar's exact look (the redesign that
  made it a single header-less surface with `drawerFilters`/`hideHeader`, a left-slide white card, and the
  service-search ⊕ Categoría mutual-exclusivity was all reverted per the user; do NOT reintroduce those without a fresh
  request). The xl+ desktop sidebar is `{filters}` as before.
- **Pin ↔ sheet:** tapping a map pin dispatches a **`ccr:focus-card`** window event (detail = proId); the
  layout (mobile only, gated by `matchMedia(max-width:1023px)`) springs the sheet open to **FOCUS ≈ 0.64
  dvh** and `scrollIntoView({block:"center"})`s that card. The pin's ring highlight + mini-card popup
  still fire (`setActive` / `openPopup`). The reverse (card hover → pin) keeps the delegated-document
  listener.
- **ONE map instance + ONE card list, repositioned by classes** — NOT a second `<GoogleMapPanel>` and
  NOT a duplicated card list (duplicate `#pro-card-<id>` IDs would break the card↔pin highlight). The
  sheet wrapper is `lg:contents` so on desktop it dissolves: the card column (`lg:order-2 lg:w-[640px]
  xl:w-[700px] 2xl:w-[820px]`, with its mobile `flex-1 overflow-y-auto px-4` + the inline `height`/
  `maxHeight` all reset/ignored by `lg:`) and the map (`lg:order-3 lg:flex-1`) land in the `lg:flex-row`
  shell; the sheet header + the mobile header are `lg:hidden`. The full-filter **drawer** (left panel,
  `xl:hidden`) is shared by the mobile header "Filtros" AND the lg–xl "Filtros" button.
- **No clobbering between the search bar and the chips:** the search bar copies the live URL
  (preserving filters); the chips' `applyFilters` reads `q` from the URL (not the chip
  instance's stale local state). Keep this split. The mobile count is shown in the sheet, so the
  page-header subtitle is `hidden lg:block` (no duplication).
