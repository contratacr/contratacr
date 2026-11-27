import { categoryImageUrl } from "@/lib/data/category-images";
import { sectionPhoto } from "@/lib/directory/section-photos";

/**
 * One photo per service group (owner 2026-11-26): the same picture on the home "Categorías" tiles and on the
 * Servicios tab of /categorias. A service photo of the group when there is one; groups without any use the
 * closest existing photo, never an invented one.
 */
const GROUP_SERVICE_PHOTO: Record<string, string> = {
  hogar: "electricidad",
  construccion_ingenieria: "construccion",
  limpieza: "limpieza",
  salud: "enfermeria",
  bienestar: "masajes",
  belleza: "peluqueria",
  automotriz: "mecanica",
  tecnologia: "reparacion_computadoras",
  profesional: "contabilidad",
  comercios: "chef",
  creatividad: "diseno_grafico",
  eventos: "decoracion",
  educacion: "tutorias",
  agricultura: "jardineria",
  mascotas: "veterinaria",
};
const GROUP_SECTION_PHOTO: Record<string, string> = {
  turismo: "tours",
  moda_y_cuidado_personal: "tiendas",
};

/** Photo URL of a service group at the given width, or null when none fits. */
export function serviceGroupPhoto(groupId: string, width = 700, groupIds: readonly string[] = []): string | null {
  const service = GROUP_SERVICE_PHOTO[groupId] ?? groupIds.find((id) => categoryImageUrl(id));
  const url = service ? categoryImageUrl(service) : undefined;
  if (url) return url.replace(/w=\d+/, `w=${width}`);
  const section = GROUP_SECTION_PHOTO[groupId];
  return section ? sectionPhoto(section, width) : null;
}
