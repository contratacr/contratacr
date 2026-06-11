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
- **Identity zone (`flex-1`, left):** 52px avatar (initials on `#EBF5FB`, or photo) · **name row — the NAME has horizontal priority**: top line is name (`flex-1`) + the compact right-aligned WhatsApp/call icons only. The **verified mark** sits **inline beside the name on desktop** but **drops to a small line BELOW the name on mobile** (`hidden md:inline-flex` inline + `md:hidden` under the name) so the name never loses space to the badge. The name uses **`line-clamp-2 md:line-clamp-1`** — on mobile it **wraps to 2 lines rather than truncating with "…"** (prefer the full name); single line on desktop. Don't put the badge on the name's line on mobile. (See "Verified mark & tag hierarchy".) · **business name** line · a row of **soft profession tags** · a **rating row** (one `#ff9b32` star + value + "· N reseñas", or "Sin reseñas todavía") · **location** line (`MapPin`) + **coverage** line (`Truck`), each truncating · **"Ver casos de éxito (N)"** pinned to the bottom (`mt-auto`). No bio.
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
- **Action button** (bottom of the availability panel): **"Solicitar servicio"** is a **single FULL-WIDTH primary** (`w-full`), identical on every card. The **direct-contact icons do NOT sit beside it** (that would vary card width / tempt a second row). Instead the **WhatsApp + call icon-buttons live in the card's TOP row, next to the name** (pushed right with `ml-auto`) — reusing existing horizontal space so **the card never grows taller**. They are **borderless** (no box/container): bare icons in a `h-7 w-7` tap target, `rounded-full`, with a **hover-only subtle circular highlight** (WhatsApp `text-[#1ebe5d] hover:bg-[#25D366]/10`; call `text-[#6b7280] hover:bg-[#EBF5FB] hover:text-[#009FD9]`). Official `WhatsAppIcon` + `Phone`, ~18px. They show only when enabled (WhatsApp when bookable + not appointments-only; call when `allowPhoneCall`); their presence/absence must not change card height or the button size. Contact-only (private / WhatsApp-only) cards show a **full-width "Solicitar por WhatsApp"** primary instead (the call icon, if any, is in the top row).
- **Verified wording:** the trust mark reads **"Identidad verificada"** (green `ShieldCheck`) on cards and profiles (unverified → amber `ShieldAlert` "Sin verificar"). Keep it a small icon+label, visually distinct from profession chips.
- **Category labels must never leak raw i18n keys:** if `tCat(id)` returns a `"categories.xxx"` path (missing message), fall back to `getCategoryLabel(id)` from the taxonomy (e.g. `otro` → "Otro servicio"). The `otro` key is now in `messages/{es,en}.json`.
- **Private / contact-only:** shown as a compact **inline chip** in the card's chips row ("🔒 Coordina por WhatsApp" / "Solo WhatsApp") — NOT a full-width band — so it never adds card height; the availability column then renders just the compact WhatsApp/llamar actions (pinned to the bottom).
- **Insurance (aseguradora) filter:** **no "Todas" option.** Default is **NONE selected** (placeholder "Cualquiera", no filtering → normal results). Picking an insurer filters to pros who accept it; a small **X button** beside the select clears it (deselect → back to no filter). Same pattern for any "optional single-select filter that defaults to off".

### Client identity at booking (cédula) + masked display
- **Cédula is collected at booking, not signup.** A national cédula is confirmed against the **padrón**; the **official name prevails**. **For myself**: if the cédula's official name **differs** from the account name, show a **responsive amber warning** ("La cédula ingresada pertenece a **[Nombre oficial]**. Al confirmar, tu cuenta usará este nombre oficial. Usa únicamente tu propia cédula.") — contained box, `ShieldAlert`, `text-xs`, `break-words`, fits ~360px → desktop; on confirm the cédula links to the account, the name becomes official, and it **persists + prefills** future bookings. If the name **matches**, link silently. **For another person**: the beneficiary cédula is used **only on that booking** — **never** linked to the account, never changes the holder's name.
- **Name lock follows a VERIFIED cédula only.** A client with a saved **national** cédula (padrón-confirmed) shows **"Identidad verificada"** and their **Nombre completo is read-only** (lock icon; corrections → soporte). **No cédula / DIMEX-NITE → name freely editable.** Mirror of the professional rule.
- **Masked cédula display:** anywhere a saved cédula is shown back, mask it with `maskId()` → **last 4 digits only** (`X-XXXX-1234`; NITE/DIMEX `XXXXXX1234`). The client panel's **Identidad** card shows the masked cédula + a status chip (verified green / "Pendiente de revisión" amber for DIMEX/NITE).
- **Health (es_salud) bookings require the patient's DOB** — for **myself** (manual input; the padrón has no birth date) and for **another person** (beneficiary DOB, not optional). Block the step's Continue/Submit until it's provided. Non-health bookings never ask DOB (data minimization).
- **No double-booking:** the booking API rejects (409) a slot already held by an active booking; the modal surfaces it inline ("Ese horario acaba de ser reservado…"). Cancelling/completing frees the slot again.

### Request/list cards with actions (e.g. "Solicitudes recibidas")
- **Vertical hierarchy, not a left/right split:** header (status badge + date) → details → a **footer separated by `border-top`** holding the actions. Never put the action buttons in a `shrink-0` right column — it cramps them on mobile.
- **Actions are full-width STACKED on mobile, inline-wrap on desktop:** wrapper `flex flex-col sm:flex-row sm:flex-wrap gap-2`, each button `className="w-full sm:w-auto"`. Keep the **same footer shape across every status** so cards stay uniform. Subtle/destructive links (e.g. "Reportar cliente") go last, `self-start`.

### Mobile menu (left drawer) — grouped sections, both auth states
- **Always grouped under uppercase section headers** (`text-[10px] font-bold text-gray-400 uppercase tracking-widest`), never a flat list. Keep the left slide-in drawer + swipe-to-close + scrim.
- **Logged-in order:** search → **MI CUENTA** (avatar + name/email header, then Mi panel [bold + brand icon], Mis solicitudes, Mis proyectos, Mis favoritos, Ofrecer mis servicios [client-only], Cuenta y seguridad — all **role-aware**, with icons) → CATEGORÍAS → RECURSOS → Idioma ES/EN → **Cerrar sesión** (red, bottom). Surface the account area **right after the search** so the panel is one tap away.
- **Logged-out order:** search → CATEGORÍAS → RECURSOS → Idioma → **"Ingresar"** (outline) + "Registrarse como profesional" (brand pill). No account area.
- **Auth label is "Ingresar"** (not "Iniciar sesión" — friendlier, and not "Mis citas"/medical wording since not all services are appointments). Use it consistently on the **mobile drawer AND the desktop nav trigger**.

### Never strand the user — "Volver a mi panel"
- Any **full-view preview or deep flow** a logged-in user can enter must offer a **clear way back to their dashboard**. The professional "Ver cómo me ven los clientes" preview opens **same-tab with `?preview=1`**, and the public profile shows a prominent **"Volver a mi panel"** bar (→ `/dashboard/profesional`) in that mode instead of the generic "back to search". Standalone pages that keep the global `Navbar` (logo→home + account menu) already satisfy this; full-bleed views do not — add an explicit back action.

### Image uploads (avatars + casos de éxito)
- **Accept any image, including iPhone HEIC/HEIF** (Cloudinary converts). Don't whitelist only jpeg/png/webp — mobile photos are often HEIC and some browsers send an **empty MIME type**, so allow `type === "" || type.startsWith("image/")` and use `image/*` on the `<input accept>`. Size cap **10 MB** (phone photos exceed 5 MB; images are downscaled server-side anyway).
- **Always surface the SERVER's specific error** (size/format/Cloudinary-not-configured) to the user — never collapse it into a generic "no se pudo subir". Revert any optimistic preview on failure.
- **The 5-photo limit is ONLY for "casos de éxito"** (`MAX_PORTFOLIO_PHOTOS`, on `portfolio_urls`/`portfolio_items`). The **profile photo (avatar) is a single, independent image** (`profiles.avatar_url`, `type=avatar`) and must NEVER be subject to that limit.

### Certificaciones (professional, text-only)
- **TEXT entries only — never image/document uploads** (avoids exposing IDs/personal data on certificates). Each entry = **nombre** (required) + **institución** (optional) + **año** (optional); add/edit/remove multiple in a collapsible profile section.
- **Public profile:** a **"Certificaciones" tab** appears only when the pro has any (mirrors the "Casos de éxito" tab pattern), each row = `Award` icon + name + "institución · año". Include the honest note that authenticity isn't verified yet (future admin enhancement).
- **/buscar card:** **never list certificates on the card** (would grow it). Show a compact **"Ver certificaciones (N)"** link (Award icon) ONLY when there are any, **sharing the same bottom `flex-wrap` row as "Ver casos de éxito"** so the card height stays uniform. It deep-links to `?tab=certificaciones`. Same rule for any future "extra detail" surfaced from a card: a compact link in the shared bottom row, not inline content.

### Dismiss standard — tap-away + Escape (always)
- **Every** dropdown, menu, autocomplete, popover, modal, and date/time picker MUST close on **click/tap outside** AND on **Escape**, and return focus sensibly. Prefer **Radix** primitives (Dialog/Select/Popover) — they handle this for free. For a CUSTOM outside-click handler, **listen to `mousedown` AND `touchstart`** (mousedown alone can miss touch taps) and add a `keydown`/Escape handler. The content node should `stopPropagation` (or be ref-excluded) so taps inside don't self-close.
- A modal scrim (`absolute inset-0` / overlay) gets `onClick={onClose}`; the dialog body stops propagation. Never trap the user in an overlay with no tap-away exit.

### Responsive baseline (standing rule)
- Everything must fit and stay clean from **~360px** up to desktop: **no horizontal scroll**, no off-screen or overlapping elements, no truncated names/labels/placeholders that hide meaning (wrap or shorten on small screens — e.g. `line-clamp-2 md:line-clamp-1`, shorter mobile placeholders).
- **Actions stack full-width on mobile, inline on desktop** (`flex-col sm:flex-row`, buttons `w-full sm:w-auto`); filter/tab rows use `flex-wrap`. Comfortable tap targets (≥ ~36px), not cramped or too close. Inputs must not hide behind the keyboard.

### Overlays must never be clipped by parents
Dropdowns, autocompletes, popovers and menus **must render in a portal to `document.body`** (or otherwise escape the layout) so a parent with `overflow:hidden/auto` (cards, **accordion `Section`s** whose open animation clips), or a low stacking context, can't crop them. Pattern (see `CategorySearch`): position the panel **`fixed`** from the trigger's `getBoundingClientRect()`, recompute on `scroll` (capture) + `resize`, **flip up** when there's more room above than below, cap `max-height` to the available space (its own list scrolls), high `z-index`, and treat the portaled panel as "inside" for outside-click detection. Never rely on `absolute` positioning inside a clipping container for an overlay.

### Long forms — collapsible sections
Break long forms (pro profile, etc.) into **accordion sections** with a header + chevron. **First section open by default, the rest collapsed.** Group logically (e.g. Datos básicos · Profesión · Ubicación y cobertura · Contacto y precios · …). Keep the save bar always visible. This kills the endless single-column scroll.

### Dashboards — ONE account, role-labeled (Mercado Libre model)
**Mobile dashboard nav (tap → section):** when the dashboard uses a **vertical sidebar** (the unified pro panel), on mobile it stacks above the content — so tapping a menu item must **smooth-scroll to that section's content** (`contentRef.scrollIntoView({ behavior: "smooth" })` gated on `matchMedia("(max-width:1023px)")`), with `scroll-mt-20 lg:scroll-mt-0` on the content so the fixed header doesn't hide the section title. Don't leave the user sitting on the menu. (A top **horizontal tab bar** — the client panel — already puts content right below, so it needs no scroll.) The unified panel label is **"Mi panel"** (never "Panel profesional" — it's one unified panel for both roles).

A professional is a **superset** of a client, so a professional uses a **single unified dashboard** (`/dashboard/profesional`) that contains BOTH roles — never two panels to switch between (like Mercado Libre's one account with "Mis compras" / "Mis ventas" together). The sidebar is split into **two clearly-labeled groups** + a standalone Notificaciones:
- **"Mi perfil profesional"** (acting as a professional): Mi perfil · Servicios · Casos de éxito · Disponibilidad · **Solicitudes recibidas** · **Proyectos recibidos** · Verificación.
- **"Contratar servicios"** (acting as a client): **Mis solicitudes enviadas** · **Mis proyectos publicados** · **Mis favoritos**.

**Anti-confusion rule:** label sections so the role is always obvious. Professional-side uses **received** wording ("Solicitudes recibidas" / "Proyectos recibidos"); client-side uses **sent/published** wording ("Mis solicitudes enviadas" / "Mis proyectos publicados"). Visually separate the groups (uppercase group headers + a divider) and give each section title a one-line context subtitle. The client-side views are the shared **`ClientActivity`** component (`section="bookings|projects|saved"`), reused by BOTH the unified pro dashboard and the plain client dashboard — never duplicate the booking/project logic.

**Account "Cuenta y seguridad" (OAuth-aware).** Both dashboards expose login management via the shared `AccountSecuritySection` (`@/components/account/account-security`): **change email** (`updateUser({ email })` → confirmation email) and **change password** (`updateUser({ password })`, min 8 + confirm). **Always detect the provider** (`app_metadata.provider` / non-email identities): for **Google/Facebook** accounts, NEVER show password/email fields that wouldn't work — show a clear note instead ("Iniciaste sesión con Google/Facebook. Tu acceso se administra desde esa cuenta."). **Change-password requires the CURRENT password**, verified via **re-authentication** (`signInWithPassword` — never read/handle the hash), then `updateUser({ password })`; **no emailed code while logged in**. A **"¿Olvidaste tu contraseña?"** link sits next to the form as an escape hatch → `resetPasswordForEmail` (the standard reset flow). It lives in the client "Mi perfil" tab and as a standalone **"Cuenta y seguridad"** sidebar item (`tab=cuenta`, `Settings` icon) in the unified pro panel, plus a link in the header account dropdown.

A **plain client** (not a professional) keeps the simple `/dashboard/cliente` (tabs Solicitudes · Proyectos · Guardados · Notificaciones · Mi perfil) plus an **"Ofrecer mis servicios"** card → convert. Only professionals get the two-group unified view.

**Professionals never use `/dashboard/cliente`.** Their client activity lives in the unified panel under "Contratar servicios", so `/dashboard/cliente` **redirects a professional** into the matching unified tab (`bookings→sent_bookings`, `projects→sent_projects`, `saved→saved`, `notifications→notifications`, `profile→cuenta`). Any "go to my projects / my panel" CTA (e.g. after publishing a project) must be **role-aware**: pro → `/dashboard/profesional?tab=…`, client → `/dashboard/cliente?tab=…`.

**Unified notifications (one stream, tagged):** the bell + notifications list show BOTH professional and client notifications from the single `notifications` table, each with a small **context tag** — "Como profesional" (blue) / "Como cliente" (purple) via `notificationContext`/`notificationContextLabel`. `notificationHref(n, role)` is **role-aware**: for a professional, client-context notifications route into the unified dashboard's "Contratar servicios" tabs (`sent_bookings`/`sent_projects`/`saved`); for a plain client, into `/dashboard/cliente`. Unread badge = unread count on the one stream. The header account menu mirrors this (pro → "Contratar servicios" links into the unified tabs).

**"¿Cómo recibes clientes?" — exactly TWO options** (`CONTACT_PREFERENCES`): **"Solo WhatsApp"** ("Los clientes te escriben directo para coordinar.") and **"Agenda + WhatsApp"** ("Los clientes ven tus horarios y agendan, o te escriben por WhatsApp."). **WhatsApp is always available** — the only real choice is whether they ALSO expose in-app scheduling — so never offer an app-only option, and the WhatsApp contact icon shows on every card with a number. `solo_citas` is a **legacy stored value** only; treat it as `ambas` everywhere (normalize on read; migrate in DB).

**Disponibilidad = a guided, conditional 3-step flow (progressive disclosure).** Never show every toggle at once — reveal options as they become relevant, with **numbered step badges** (1/2/3) for a clear top-to-bottom path so the pro never feels lost. **STEP 1 — "¿Cómo recibes clientes?"** (the two options above) + **"Permitir contacto por llamada"** (shown in every mode). *Solo WhatsApp* → stop here (short info note; no schedule). *Agenda + WhatsApp* → **STEP 2 — "Tu disponibilidad"** with the **"Disponibilidad privada"** toggle: **PRIVATE** (`availability_public=false`) hides BOTH "Ofreces videoconsulta" and the entire schedule section, showing only a short amber note (clients contact by WhatsApp/llamada); **PUBLIC** reveals "Ofreces videoconsulta" (nested) and **STEP 3 — "Agregar horarios disponibles"** + "Tus horarios próximos". Phone-call is the only contact option always visible; videoconsulta + schedule are public-only. Keep it responsive and the same step structure on mobile/desktop.

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
    4. **Uniform RECTANGULAR cards (Bark-like landscape)** — every card is the **EXACT same fixed size**, a **landscape rectangle wider than tall** (`w-[248px] h-[168px] sm:w-[300px] sm:h-[200px]`, ~3:2 — NOT square) regardless of label length; long labels **clamp to 2 lines** (`line-clamp-2`), never widening the card. Cloudinary delivery is landscape-cropped (`w_640,h_440`). **Subtle corner rounding only** — `rounded-lg` (near-square corners, not the old `rounded-2xl`). Soft constant shadow, dark bottom gradient + white label. **Hover = the whole card SCALES UP** (`transition-transform … hover:scale-[1.04] hover:z-10`) — a gentle smooth zoom of the entire card, **not** a shadow/translateY change and **not** an inner-image-only zoom. ONE self-hosted Cloudinary image per id; **no "Disponible en línea"/"available online" badge anywhere**. Zigzag = `translateY(±20px)` on even/odd cards (the hover-scale composes with this fine because it's a child transform).
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
- **Registered user side** (`SupportTickets`, "Soporte" tab in both dashboards): tickets + thread + reply; on a **Resuelto** ticket → **"Sí, está resuelto"** (confirm, `user_confirmed`) or **"No, sigo con el problema"** (reopen → Pendiente + notify). A reply also re-opens resolved.
- **Guest side = email:** confirmation says we'll reply by email (NO "Ver mis tickets" link); admin replies are emailed; a soft "Inicia sesión para seguir tus tickets" nudge. **Guest→account linking:** on a **verified** email match (`email_confirmed_at`), `claimGuestTickets()` attaches prior guest tickets to the account (in `/api/support` GET + `/auth/callback`) — never another person's, no duplicates.
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
