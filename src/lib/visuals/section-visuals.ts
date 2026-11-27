import {
  Beef, Beer, BedDouble, BookOpen, Building2, Bus, Coffee, Compass, Droplets, Dumbbell, FileText, Fuel, Hammer, Heart,
  HeartPulse, Hotel, House, IceCream, Landmark, Mountain, PawPrint, Pill, ShoppingBag, ShoppingCart, SquareParking, Star,
  Store, Utensils, Wrench, Car, Plane, GraduationCap, type LucideIcon,
} from "lucide-react";
import { categoryImageUrl } from "@/lib/data/category-images";
import { getCategoryGroupId } from "@/lib/data/categories";
import { getCategoryGroupIcon } from "@/lib/data/category-group-visuals";
import { placeSectionById } from "@/lib/directory/place-verticals";

/**
 * ONE source of truth for the photo and the icon of every business section, section variant, professional service group
 * and professional service (owner 2026-11-27: «si sale en la portada Talleres y en otro lado Talleres, misma imagen; igual
 * con los íconos mejorados»). Every screen imports from here; no screen keeps its own photo or icon map.
 *
 * Production stays as it is: the service photos (categoryImageUrl) and the service-group icons (getCategoryGroupIcon) keep
 * their production data files and this module reads them. The business sections (test only) bend to match production when a
 * label is shared (Belleza, Salud, Educación and the Talleres ↔ Mecánica photo). Table and history: docs/section-visuals.md.
 * The «improved» icon style (soft tinted circle, outline glyph) is <SectionIcon>/<CategoryIcon> in ./section-icon.tsx.
 */

const U = (id: string, w: number) => `https://images.unsplash.com/photo-${id}?w=${w}&auto=format&fit=crop&q=70`;

/** Business sections and their fixed variants ("section:variant"). photo = Unsplash id (null = icon only). */
const SECTION_VISUALS: Record<string, { photo: string | null; icon: LucideIcon }> = {
  restaurantes: { photo: "1517248135467-4c7edcad34c4", icon: Utensils },
  cafes: { photo: "1495474472287-4d71bcdd2085", icon: Coffee },
  "cafes:cafeterias": { photo: "1495474472287-4d71bcdd2085", icon: Coffee },
  "cafes:bares": { photo: "1514362545857-3bc16c4c7d1b", icon: Beer }, // the Bartending photo
  "cafes:postres": { photo: null, icon: IceCream },
  supermercados: { photo: "1542838132-92c53300491e", icon: ShoppingCart },
  pulperias: { photo: "1604719312566-8912e9227c6a", icon: Store },
  ferreterias: { photo: "1581783898377-1c85bf937427", icon: Hammer },
  farmacias: { photo: "1576602976047-174e57a47881", icon: Pill },
  gasolineras: { photo: "1527018601619-a508a2be00cd", icon: Fuel },
  talleres: { photo: "1625047509248-ec889cbff17f", icon: Wrench }, // = service Mecánica (production)
  bancos: { photo: "1601597111158-2fceff292cdc", icon: Landmark },
  hospedaje: { photo: "1566073771259-6a8506099945", icon: BedDouble },
  "hospedaje:hoteles": { photo: "1566073771259-6a8506099945", icon: Hotel },
  "hospedaje:por-dias": { photo: null, icon: House },
  tours: { photo: "1519046904884-53103b34b206", icon: Compass },
  salud: { photo: "1576765608535-5f04d1e3f289", icon: Heart }, // = service group Salud (production icon, Enfermería photo)
  gimnasios: { photo: "1534438327276-14e5300c3a48", icon: Dumbbell },
  veterinarias: { photo: "1628009368231-7bb7cfcb0def", icon: PawPrint },
  belleza: { photo: "1560066984-138dadb4c035", icon: Star }, // = service group Belleza (production icon)
  parqueos: { photo: "1470224114660-3f6686c562eb", icon: SquareParking },
  lavacar: { photo: "1754296577179-0e14f78a1262", icon: Droplets },
  atracciones: { photo: "1432405972618-c60b0225b8f9", icon: Mountain },
  tiendas: { photo: "1528698827591-e19ccd7bc23d", icon: ShoppingBag },
  "centros-comerciales": { photo: "1567958451986-2de427a4a0be", icon: Building2 },
  "mercados-y-carnicerias": { photo: "1488459716781-31db52582fe9", icon: Beef },
  tramites: { photo: "1555848962-6e79363ec58f", icon: FileText },
  educacion: { photo: "1503676260728-1c00da094a0b", icon: BookOpen }, // = service group Educación (production icon, Tutorías photo)
  transporte: { photo: "1544620347-c4fd4a3d5957", icon: Bus },
};

/** Ids that have a visual (sections and "section:variant"). */
export const SECTION_VISUAL_IDS: readonly string[] = Object.keys(SECTION_VISUALS);

/** Photo URL of a business section or variant at the given width, or null when it has none. */
export function sectionPhoto(id: string, width = 700): string | null {
  const photo = SECTION_VISUALS[id]?.photo;
  return photo ? U(photo, width) : null;
}

/** Icon of a business section or variant (a variant without its own entry uses its section's). */
export function sectionIcon(id: string): LucideIcon {
  return SECTION_VISUALS[id]?.icon ?? SECTION_VISUALS[id.split(":")[0]]?.icon ?? Store;
}

/** Section of a directory vertical ("auto_services" → "talleres"). */
export function verticalSection(verticalId: string): string | null {
  return placeSectionById(verticalId)?.section ?? null;
}

/** Icon of a directory vertical: always its section's icon. */
export function sectionIconForVertical(verticalId: string): LucideIcon {
  return sectionIcon(verticalSection(verticalId) ?? "");
}

/** Photo of a directory vertical: always its section's photo. */
export function sectionPhotoForVertical(verticalId: string, width = 700): string | null {
  const section = verticalSection(verticalId);
  return section ? sectionPhoto(section, width) : null;
}

/** Icons of the place groups of the /lugares hub and menus (lib/directory/directory-groups.ts DIRECTORY_GROUPS). */
const PLACE_GROUP_ICONS: Record<string, LucideIcon> = {
  comer: Utensils, compras: ShoppingCart, salud: HeartPulse, autos: Car, viajes: Plane, dinero: Landmark, "servicios-publicos": GraduationCap,
};
export function placeGroupIcon(groupId: string): LucideIcon {
  return PLACE_GROUP_ICONS[groupId] ?? Store;
}

// ─── Professional services ──────────────────────────────────────────────────────────────────────────────────────────

/** Photo of a professional service at the given width (production data: lib/data/category-images.ts). */
export function categoryPhoto(categoryId: string, width = 1100): string | null {
  const url = categoryImageUrl(categoryId);
  return url ? url.replace(/w=\d+/, `w=${width}`) : null;
}

/** Icon of a professional service: its group's icon, as production draws it (/servicios search rows). */
export function categoryIcon(categoryId: string): LucideIcon {
  return getCategoryGroupIcon(getCategoryGroupId(categoryId));
}

/** Icon of a professional service group (production data: lib/data/category-group-visuals.ts). */
export function serviceGroupIcon(groupId: string, iconKey?: string | null): LucideIcon {
  return getCategoryGroupIcon(groupId, iconKey);
}

/** One photo per service group: a service photo of the group; groups that share a label with a business section use the
 * section photo (same label → same photo); groups without any use the closest existing photo, never an invented one. */
const GROUP_SERVICE_PHOTO: Record<string, string> = {
  hogar: "electricidad", construccion_ingenieria: "construccion", limpieza: "limpieza", salud: "enfermeria", bienestar: "masajes",
  belleza: "peluqueria", automotriz: "mecanica", tecnologia: "reparacion_computadoras", profesional: "contabilidad", comercios: "chef",
  creatividad: "diseno_grafico", eventos: "decoracion", educacion: "tutorias", agricultura: "jardineria", mascotas: "veterinaria",
};
const GROUP_SECTION_PHOTO: Record<string, string> = { turismo: "tours", moda_y_cuidado_personal: "tiendas", restaurantes: "restaurantes" };

/** Photo URL of a service group at the given width, or null when none fits. */
export function serviceGroupPhoto(groupId: string, width = 700, groupIds: readonly string[] = []): string | null {
  const service = GROUP_SERVICE_PHOTO[groupId] ?? (GROUP_SECTION_PHOTO[groupId] ? undefined : groupIds.find((id) => categoryImageUrl(id)));
  if (service) return categoryPhoto(service, width);
  const section = GROUP_SECTION_PHOTO[groupId];
  return section ? sectionPhoto(section, width) : null;
}
