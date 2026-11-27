// One photo and one icon per section / service group / service (owner 2026-11-27). Fails when:
//  1. an Unsplash URL appears outside the visuals data files (a per-screen photo);
//  2. a screen builds its own section/vertical → icon map, or reads the section icons / group visuals directly instead of
//     the single module (src/lib/visuals/section-visuals.ts + section-icon.tsx);
//  3. one Spanish label (Talleres, Belleza, Salud…) resolves to two different photos or two different glyphs across the
//     namespaces (sections, section variants, service groups, services).
// Usage: node scripts/verify-section-visuals.mjs
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const files = walk(path.join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => path.relative(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const problems = [];

// 1. Unsplash URLs only in the data files. landing-hero.tsx: production's hero banners (campaign photos, not a section or
// service tile); progressive-image.tsx: generic preview helper for any Unsplash URL.
const UNSPLASH_OK = new Set(["src/lib/visuals/section-visuals.ts", "src/lib/data/category-images.ts", "src/components/landing/landing-hero.tsx", "src/components/ui/progressive-image.tsx"]);
for (const f of files) if (read(f).includes("images.unsplash.com") && !UNSPLASH_OK.has(f)) problems.push(`${f}: Unsplash URL outside the visuals module`);

// 2. No per-screen icon maps. Thin compatibility aliases that delegate to the module are allowed by name.
const SECTION_KEYS = "restaurantes|cafes|supermercados|pulperias|farmacias|ferreterias|gasolineras|talleres|hospedaje|tours|belleza|gimnasios|veterinarias|salud|bancos|parqueos|lavacar|atracciones|tiendas|tramites|educacion|transporte";
const VERTICAL_KEYS = "restaurant|cafe_bar|fuel|pharmacy|grocery|convenience|hardware|lodging|health|vet_pets|auto_services|beauty|fitness|banking";
const mapRe = new RegExp(`[{,]\\s*(?:${SECTION_KEYS}|${VERTICAL_KEYS})\\s*:\\s*(?:[A-Z][A-Za-z0-9]+)\\s*[,}]`);
const ICON_MAP_OK = new Set(["src/lib/visuals/section-visuals.ts"]);
const DIRECT_OK = new Set([
  "src/lib/visuals/section-visuals.ts", "src/lib/visuals/section-icon.tsx",
  "src/lib/directory/directory-groups.ts", // DIRECTORY_SECTION_ICONS alias built from the module
  "src/components/landing/directory-nav.tsx", // re-export of that alias
  "src/lib/data/category-group-visuals.ts", // production data of the service-group icons
  // Production files that already read the production group data directly (unchanged with the flags off):
  "src/components/ui/category-group-picker.tsx", "src/components/professionals/service-image.tsx", "src/components/projects/projects-board.tsx",
  "src/components/landing/servicios-por-seccion.tsx",
]);
for (const f of files) {
  const s = read(f);
  if (!ICON_MAP_OK.has(f) && /from ["']lucide-react["']/.test(s) && mapRe.test(s)) problems.push(`${f}: own section/vertical → icon map`);
  if (!DIRECT_OK.has(f) && /DIRECTORY_SECTION_ICONS\s*\[|getCategoryGroupIcon\s*\(|getCategoryGroupVisual\s*\(/.test(s)) problems.push(`${f}: reads section/group icons directly; use lib/visuals/section-visuals`);
  if (/lib\/directory\/section-photos|lib\/data\/service-group-photos/.test(s)) problems.push(`${f}: imports a removed photo map`);
}

// 3. Same label → same photo and same glyph.
const { createJiti } = await import(path.join(root, "node_modules/jiti/lib/jiti.mjs"));
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") } });
const v = await jiti.import(path.join(root, "src/lib/visuals/section-visuals.ts"));
const c = await jiti.import(path.join(root, "src/lib/data/categories.ts"));
const { DIRECTORY_SECTION_LABELS } = await jiti.import(path.join(root, "src/lib/search/directory-search.ts"));
const VARIANT_LABELS = { "cafes:cafeterias": "Cafeterías", "cafes:bares": "Bares", "cafes:postres": "Postres", "hospedaje:hoteles": "Hoteles", "hospedaje:por-dias": "Casas y apartamentos por días" };
const norm = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const glyph = (icon) => icon?.displayName ?? icon?.render?.displayName ?? icon?.name ?? String(icon);
const photoId = (url) => url?.match(/photo-([0-9a-f-]+)/)?.[1] ?? null;
const byLabel = new Map();
const add = (label, who, photo, icon) => {
  const k = norm(label);
  if (!byLabel.has(k)) byLabel.set(k, []);
  byLabel.get(k).push({ who, photo: photoId(photo), icon: glyph(icon) });
};
for (const id of v.SECTION_VISUAL_IDS) add(id.includes(":") ? VARIANT_LABELS[id] ?? id : DIRECTORY_SECTION_LABELS[id]?.es ?? id, `sección ${id}`, v.sectionPhoto(id), v.sectionIcon(id));
for (const g of c.CATEGORY_GROUPS) add(c.getCategoryGroupLabel(g.id, "es"), `grupo ${g.id}`, v.serviceGroupPhoto(g.id), v.serviceGroupIcon(g.id, g.iconKey));
// Services hidden from the menus because a business section covers them (SERVICE_MENU_HIDE) are production catalogue
// entries; they are listed but not compared (their production icon is the group's).
const { SERVICE_MENU_HIDE } = await jiti.import(path.join(root, "src/lib/directory/directory-groups.ts"));
for (const item of c.ALL_CATEGORIES) if (!SERVICE_MENU_HIDE.has(item.id)) add(c.getCategoryLabel(item.id, "es"), `servicio ${item.id}`, v.categoryPhoto(item.id), v.categoryIcon(item.id));
for (const [label, entries] of byLabel) {
  if (entries.length < 2) continue;
  const photos = new Set(entries.map((e) => e.photo).filter(Boolean));
  const icons = new Set(entries.map((e) => e.icon));
  if (photos.size > 1) problems.push(`"${label}": ${photos.size} fotos (${entries.map((e) => `${e.who}=${e.photo}`).join(", ")})`);
  if (icons.size > 1) problems.push(`"${label}": ${icons.size} íconos (${entries.map((e) => `${e.who}=${e.icon}`).join(", ")})`);
}
// Vertical → section icon resolver must agree with the section icon.
for (const s of (await jiti.import(path.join(root, "src/lib/directory/place-verticals.ts"))).PLACE_SECTIONS) {
  if (v.sectionIconForVertical(s.id) !== v.sectionIcon(s.section)) problems.push(`vertical ${s.id}: icon differs from section ${s.section}`);
}

if (problems.length) {
  console.error(`verify-section-visuals: ${problems.length} problem(s)\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`verify-section-visuals: OK (${v.SECTION_VISUAL_IDS.length} section visuals, ${c.CATEGORY_GROUPS.length} service groups, ${byLabel.size} labels checked)`);
