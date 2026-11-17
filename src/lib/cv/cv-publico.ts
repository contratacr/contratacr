import { getCategoryLabel } from "@/lib/data/categories";
import { languageLabel } from "@/lib/data/languages";
import { enlacePerfil } from "@/lib/profile-url";
import { hasCv, normalizeCv } from "./model";
import { prellenar, type CvDocumento, type Idioma } from "./documento";

/**
 * EL PDF DEL PERFIL (16-nov-2026): un solo currículum en el perfil público.
 * Lo escrito en la pestaña Currículum es la vista rápida y el PDF es ese mismo
 * contenido con el formato del generador. Si el profesional subió su propio
 * archivo, se muestra ese; si no, se arma con esto.
 * Solo datos que el perfil ya muestra: sin correo ni teléfono (al profesional
 * se le escribe por ContrataCR), con el enlace al perfil.
 */
export type PerfilParaCv = {
  slug: string;
  fullName: string;
  bio?: string | null;
  provinceName?: string | null;
  cantonName?: string | null;
  professions?: string[];
  languages?: string[];
  services?: { name?: string; active?: boolean }[];
  certifications?: { name: string; institution?: string; year?: string }[];
  cvProfile?: unknown;
};

/** ¿Hay algo que poner en el PDF? Sin estudios, experiencia ni habilidades, no. */
export function tieneCvPublico(perfil: Pick<PerfilParaCv, "cvProfile" | "certifications">): boolean {
  return hasCv(normalizeCv(perfil.cvProfile)) || (perfil.certifications ?? []).some((c) => c?.name?.trim());
}

export function cvPublico(perfil: PerfilParaCv, idioma: Idioma): CvDocumento | null {
  if (!tieneCvPublico(perfil)) return null;
  const servicios = (perfil.services ?? []).filter((s) => s?.active !== false && s?.name?.trim()).map((s) => s.name!.trim());
  const profesiones = (perfil.professions ?? []).map((id) => getCategoryLabel(id, idioma)).filter(Boolean);
  const lugar = [perfil.cantonName, perfil.provinceName].filter((v) => v?.trim()).join(", ");
  const cv = prellenar({
    nombre: perfil.fullName,
    correo: "",
    telefono: "",
    ubicacion: lugar ? `${lugar}, Costa Rica` : "",
    enlace: enlacePerfil(perfil.slug).replace(/^https?:\/\//, ""),
    bio: perfil.bio ?? "",
    servicios: [...new Set([...profesiones, ...servicios])],
    cv: perfil.cvProfile,
    idiomas: (perfil.languages ?? []).map((id) => languageLabel(id, idioma)).filter(Boolean),
    certificaciones: perfil.certifications ?? [],
  }, idioma);
  return { ...cv, sugeridas: [] };
}
