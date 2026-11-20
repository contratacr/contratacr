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

/**
 * EL CV DEL PANEL COMO CV PÚBLICO (20-nov-2026). La persona elige uno de los
 * currículums que armó en el panel y contratacr.com/<perfil>/cv sale con su
 * diseño. Como el resto del perfil, sin correo, teléfono ni firma dibujada: al
 * profesional se le escribe por ContrataCR. Devuelve null si los datos no
 * tienen forma de currículum (se usa entonces el que se arma con el perfil).
 */
export function cvDelPanelParaPublicar(datos: unknown, enlace: string): CvDocumento | null {
  const cv = (datos as { cv?: unknown } | null)?.cv as Partial<CvDocumento> | undefined;
  if (!cv || typeof cv !== "object" || typeof cv.nombre !== "string" || !cv.nombre.trim()) return null;
  const textos = ["titular", "ubicacion", "enlace", "resumen"] as const;
  const listas = ["experiencia", "educacion", "habilidades", "idiomas", "certificaciones"] as const;
  if (textos.some((k) => typeof cv[k] !== "string") || listas.some((k) => !Array.isArray(cv[k]))) return null;
  const base: CvDocumento = { ...(cv as CvDocumento), idioma: cv.idioma === "en" ? "en" : "es", correo: "", telefono: "", sugeridas: [], enlace: cv.enlace?.trim() || enlace };
  if (base.declaracion) base.declaracion = { texto: String(base.declaracion.texto ?? ""), lugarFecha: String(base.declaracion.lugarFecha ?? "") };
  return base;
}
