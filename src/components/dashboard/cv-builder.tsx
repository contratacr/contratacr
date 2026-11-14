"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardPaste, Copy, Download, FileText, ImageUp, Lightbulb, Mail, Plus, RotateCcw, Target, Trash2 } from "lucide-react";
import { AccionesAlPie } from "@/components/ui/acciones-al-pie";
import { VACANTE_PARA_CURRICULUM } from "@/components/jobs/preparar-curriculum";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { getCantonById, getProvinceById } from "@/lib/data/cr-geography";
import { getCategoryLabel } from "@/lib/data/categories";
import { languageLabel } from "@/lib/data/languages";
import { blankDates, parseCvDates, serializeCvDates, type CvDates } from "@/lib/cv/dates";
import type { CvEntry } from "@/lib/cv/model";
import {
  LIMITES, TITULOS, ajustarAVacante, cartaComoTexto, cartaInicial, cuerpoDeLaCarta, cvComoTexto, fechasAts, nombreDeArchivo, palabrasClave, prellenar, revisarCarta, revisarCv,
  type Aviso, type Carta, type CvDocumento, type DatosDelPerfil, type Idioma, type Plantilla,
} from "@/lib/cv/documento";
import { cn } from "@/lib/utils";

/**
 * «MI CV» EN EL PANEL: CV y carta de presentación listos para descargar.
 * Se prellena con el perfil, todo se puede editar, y el borrador queda en este
 * dispositivo (no se sube a ningún lado: el CV lleva teléfono y correo).
 * «Volver a cargar desde mi perfil» lo rehace desde cero.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProData = Record<string, any> | null;

// v2: el prellenado separa títulos de certificaciones y limita las habilidades.
const CLAVE = "ccr:cv-borrador:v2";
type Borrador = { cv: CvDocumento; carta: Carta; vacante: string };

function datosDelPerfil(pro: ProData, nombreCuenta: string, correo: string, idioma: Idioma): DatosDelPerfil {
  const servicios = Array.isArray(pro?.services)
    ? pro.services.filter((s: { active?: boolean; name?: string }) => s?.active !== false && s?.name).map((s: { name: string }) => s.name)
    : [];
  const profesiones = Array.isArray(pro?.professions) ? pro.professions.map((id: string) => getCategoryLabel(id, idioma)) : [];
  const ubicacion = [getCantonById(String(pro?.canton_id ?? ""))?.name, getProvinceById(String(pro?.provincia_id ?? ""))?.name].filter(Boolean).join(", ");
  const perfil = Array.isArray(pro?.profiles) ? pro.profiles[0] : pro?.profiles;
  return {
    nombre: perfil?.full_name || nombreCuenta,
    correo,
    telefono: pro?.whatsapp || pro?.call_phone || "",
    ubicacion: ubicacion ? `${ubicacion}, Costa Rica` : "",
    enlace: pro?.slug ? `contratacr.com/profesionales/${pro.slug}` : "",
    bio: pro?.bio ?? "",
    servicios: [...new Set([...profesiones, ...servicios])],
    cv: pro?.cv_profile,
    idiomas: Array.isArray(pro?.languages) ? pro.languages.map((id: string) => languageLabel(id, idioma)) : [],
    certificaciones: Array.isArray(pro?.certifications) ? pro.certifications : [],
  };
}

const campo = "w-full rounded-xl border border-[#d7e1ea] bg-white px-3.5 py-2.5 text-[15px] text-[#162543] outline-none transition-colors placeholder:text-[#98a2b3] focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15";
const pastilla = "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition-colors disabled:opacity-60";

function Tarjeta({ titulo, ayuda, children, accion }: { titulo: string; ayuda?: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-56">
          <h3 className="text-[15px] font-black text-[#162543]">{titulo}</h3>
          {ayuda && <p className="mt-0.5 text-[13px] leading-5 text-[#667085]">{ayuda}</p>}
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}

function Segmentos<T extends string>({ valor, opciones, alCambiar, etiqueta }: { valor: T; opciones: { id: T; texto: string }[]; alCambiar: (v: T) => void; etiqueta: string }) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="inline-flex rounded-full bg-[#eef3f7] p-1">
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={valor === o.id}
          onClick={() => alCambiar(o.id)}
          className={cn("h-9 rounded-full px-4 text-[13px] font-bold transition-colors", valor === o.id ? "bg-white text-[#162543] shadow-sm" : "text-[#52627a] hover:text-[#162543]")}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

const MESES = { es: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"], en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] };

function Fechas({ periodo, alCambiar, en }: { periodo: string; alCambiar: (p: string) => void; en: boolean }) {
  const d: CvDates = parseCvDates(periodo) ?? blankDates();
  const set = (cambio: Partial<CvDates>) => alCambiar(serializeCvDates({ ...d, ...cambio }));
  const meses = MESES[en ? "en" : "es"];
  const parte = (mes: string, anio: string, clave: "start" | "end") => (
    <div className="grid grid-cols-[1fr_96px] gap-2">
      <select aria-label={en ? "Month" : "Mes"} value={mes} onChange={(e) => set({ [`${clave}Month`]: e.target.value } as Partial<CvDates>)} className={cn(campo, "h-11 py-0")}>
        <option value="">{en ? "Month" : "Mes"}</option>
        {meses.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
      </select>
      <input aria-label={en ? "Year" : "Año"} inputMode="numeric" maxLength={4} placeholder={en ? "Year" : "Año"} value={anio} onChange={(e) => set({ [`${clave}Year`]: e.target.value.replace(/\D/g, "").slice(0, 4) } as Partial<CvDates>)} className={cn(campo, "h-11 py-0")} />
    </div>
  );
  return (
    <div className="grid gap-2 @[560px]:grid-cols-2">
      <div><p className="mb-1 text-xs font-semibold text-[#52627a]">{en ? "Start" : "Inicio"}</p>{parte(d.startMonth, d.startYear, "start")}</div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold text-[#52627a]">{en ? "End" : "Fin"}</p>
          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#52627a]">
            <input type="checkbox" checked={d.current} onChange={(e) => set({ current: e.target.checked, endMonth: "", endYear: "" })} className="h-4 w-4 accent-[#009FD9]" />
            {en ? "Current" : "Actual"}
          </label>
        </div>
        {d.current ? <p className={cn(campo, "flex h-11 items-center bg-[#f6f9fb] py-0 text-[#667085]")}>{en ? "Present" : "Actualidad"}</p> : parte(d.endMonth, d.endYear, "end")}
      </div>
    </div>
  );
}

function Entradas({ lista, alCambiar, en, tipo }: { lista: CvEntry[]; alCambiar: (l: CvEntry[]) => void; en: boolean; tipo: "experiencia" | "educacion" }) {
  const exp = tipo === "experiencia";
  const cambiar = (i: number, cambio: Partial<CvEntry>) => alCambiar(lista.map((e, j) => (j === i ? { ...e, ...cambio } : e)));
  return (
    <div className="grid gap-3">
      {lista.map((e, i) => (
        <div key={i} className="grid gap-3 rounded-xl border border-[#eef2f6] bg-[#fbfcfd] p-3">
          <div className="grid gap-3 @[560px]:grid-cols-2">
            <Input label={exp ? (en ? "Role" : "Cargo") : (en ? "Degree or course" : "Título o curso")} value={e.title} maxLength={160} onChange={(ev) => cambiar(i, { title: ev.target.value })} />
            <Input label={exp ? (en ? "Company or client" : "Empresa o cliente") : (en ? "Institution" : "Institución")} value={e.organization} maxLength={160} onChange={(ev) => cambiar(i, { organization: ev.target.value })} />
          </div>
          <Fechas periodo={e.period} en={en} alCambiar={(period) => cambiar(i, { period })} />
          {exp && (
            <label className="grid gap-1">
              <span className="text-sm font-semibold text-[#162543]">{en ? "Achievements (one per line)" : "Logros (uno por línea)"}</span>
              <textarea rows={4} value={e.description} maxLength={1000} onChange={(ev) => cambiar(i, { description: ev.target.value })} placeholder={en ? "Installed electrical systems in 40+ homes\nReduced repair times by 20%" : "Instalé el sistema eléctrico de más de 40 casas\nReduje el tiempo de reparación un 20 %"} className={campo} />
            </label>
          )}
          <button type="button" onClick={() => alCambiar(lista.filter((_, j) => j !== i))} className="inline-flex h-9 items-center gap-1.5 justify-self-start rounded-full px-2 text-[13px] font-semibold text-[#b42318] hover:bg-[#fef3f2]">
            <Trash2 className="h-4 w-4" /> {en ? "Remove" : "Quitar"}
          </button>
        </div>
      ))}
      <button type="button" onClick={() => alCambiar([...lista, { title: "", organization: "", period: "", description: "" }])} className={cn(pastilla, "justify-self-start border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb]")}>
        <Plus className="h-4 w-4" /> {exp ? (en ? "Add experience" : "Agregar experiencia") : (en ? "Add education" : "Agregar estudio")}
      </button>
    </div>
  );
}

function Etiquetas({ lista, alCambiar, en, ejemplo }: { lista: string[]; alCambiar: (l: string[]) => void; en: boolean; ejemplo: string }) {
  const [texto, setTexto] = useState("");
  const agregar = () => {
    const nuevas = texto.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean);
    if (nuevas.length) alCambiar([...new Map([...lista, ...nuevas].map((t) => [t.toLowerCase(), t])).values()]);
    setTexto("");
  };
  return (
    <div className="grid gap-2">
      {lista.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {lista.map((t) => (
            <li key={t} className="inline-flex h-8 items-center gap-1 rounded-full bg-[#eef6fb] pl-3 pr-1 text-[13px] font-semibold text-[#162543]">
              {t}
              <button type="button" aria-label={`${en ? "Remove" : "Quitar"} ${t}`} onClick={() => alCambiar(lista.filter((x) => x !== t))} className="grid h-6 w-6 place-items-center rounded-full text-[#667085] hover:bg-white">×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } }} placeholder={ejemplo} className={cn(campo, "h-11 py-0")} />
        <button type="button" onClick={agregar} className={cn(pastilla, "shrink-0 border border-[#d7e1ea] bg-white px-4 text-[#162543] hover:bg-[#f6f9fb]")}>{en ? "Add" : "Agregar"}</button>
      </div>
    </div>
  );
}

function Revision({ avisos, idiomaApp }: { avisos: Aviso[]; idiomaApp: Idioma }) {
  const en = idiomaApp === "en";
  if (!avisos.length) {
    return <p className="flex items-center gap-2 rounded-xl bg-[#ecfdf3] px-3 py-2.5 text-[13px] font-semibold text-[#067647]"><CheckCircle2 className="h-4 w-4 shrink-0" />{en ? "Looks good: clear format and nothing missing." : "Se ve bien: formato claro y no falta nada."}</p>;
  }
  return (
    <ul className="grid gap-2">
      {avisos.map((a) => (
        <li key={a.id} className={cn("flex gap-2 rounded-xl px-3 py-2.5 text-[13px] leading-5", a.nivel === "falta" ? "bg-[#fef3f2] text-[#912018]" : "bg-[#fffaeb] text-[#93370d]")}>
          {a.nivel === "falta" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{a.texto[idiomaApp]}</span>
        </li>
      ))}
    </ul>
  );
}

function TituloHoja({ moderna, children }: { moderna: boolean; children: ReactNode }) {
  return (
    <h4 className={cn("mt-4 border-b pb-1 text-[11px] font-bold", moderna ? "border-transparent text-[#007fae]" : "border-[#52627a]/40 uppercase tracking-[0.06em] text-[#162543]")}>
      {children}
      {moderna && <span className="mt-1 block h-[2px] w-8 bg-[#007fae]" />}
    </h4>
  );
}

function EntradasHoja({ lista, idioma }: { lista: CvEntry[]; idioma: Idioma }) {
  return (
    <div className="mt-1.5 grid gap-2">
      {lista.map((e, i) => (
        <div key={i}>
          <p className="text-[11px] font-bold text-[#162543]">{[e.title, e.organization].filter(Boolean).join(" — ")}</p>
          {e.period && <p className="text-[10px] text-[#52627a]">{fechasAts(e.period, idioma)}</p>}
          {e.description.trim() && (
            <ul className="mt-0.5 list-disc pl-4 text-[10.5px] leading-[1.45] text-[#162543]">
              {e.description.split("\n").map((l) => l.trim().replace(/^[•\-–]\s*/, "")).filter(Boolean).map((l, j) => <li key={j}>{l}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

/** La vista previa dibuja lo MISMO que el PDF: una columna, mismos títulos y fechas. */
function HojaCv({ cv }: { cv: CvDocumento }) {
  const t = TITULOS[cv.idioma];
  const m = cv.plantilla === "moderna";
  const contacto = [cv.correo, cv.telefono, cv.ubicacion, cv.enlace].filter((v) => v.trim()).join("  |  ");
  return (
    <div className="text-left">
      <p className="text-[20px] font-black leading-tight text-[#162543]">{cv.nombre || "—"}</p>
      {cv.titular && <p className={cn("text-[12px]", m ? "text-[#007fae]" : "text-[#52627a]")}>{cv.titular}</p>}
      {contacto && <p className="mt-1 break-words text-[10px] text-[#52627a]">{contacto}</p>}
      {cv.resumen.trim() && <><TituloHoja moderna={m}>{t.resumen}</TituloHoja><p className="mt-1.5 whitespace-pre-line text-[10.5px] leading-[1.45] text-[#162543]">{cv.resumen}</p></>}
      {cv.experiencia.length > 0 && <><TituloHoja moderna={m}>{t.experiencia}</TituloHoja><EntradasHoja lista={cv.experiencia} idioma={cv.idioma} /></>}
      {cv.educacion.length > 0 && <><TituloHoja moderna={m}>{t.educacion}</TituloHoja><EntradasHoja lista={cv.educacion} idioma={cv.idioma} /></>}
      {cv.certificaciones.length > 0 && <><TituloHoja moderna={m}>{t.certificaciones}</TituloHoja>{cv.certificaciones.map((c) => <p key={c} className="mt-1 text-[10.5px] text-[#162543]">{c}</p>)}</>}
      {cv.habilidades.length > 0 && <><TituloHoja moderna={m}>{t.habilidades}</TituloHoja><p className="mt-1.5 text-[10.5px] leading-[1.45] text-[#162543]">{cv.habilidades.join(", ")}</p></>}
      {cv.idiomas.length > 0 && <><TituloHoja moderna={m}>{t.idiomas}</TituloHoja><p className="mt-1.5 text-[10.5px] text-[#162543]">{cv.idiomas.join(", ")}</p></>}
    </div>
  );
}

function HojaCarta({ cv, carta }: { cv: CvDocumento; carta: Carta }) {
  const contacto = [cv.correo, cv.telefono, cv.ubicacion].filter((v) => v.trim()).join("  |  ");
  return (
    <div className="text-left">
      <p className="text-[20px] font-black leading-tight text-[#162543]">{cv.nombre || "—"}</p>
      {cv.titular && <p className={cn("text-[12px]", cv.plantilla === "moderna" ? "text-[#007fae]" : "text-[#52627a]")}>{cv.titular}</p>}
      {contacto && <p className="mt-1 break-words text-[10px] text-[#52627a]">{contacto}</p>}
      <div className="mt-5 whitespace-pre-line text-[11px] leading-[1.55] text-[#162543]">{cuerpoDeLaCarta(cv, carta)}</div>
    </div>
  );
}

function leerBorrador(clave: string): Borrador | null {
  try {
    const guardado = JSON.parse(window.localStorage.getItem(clave) ?? "null") as Borrador | null;
    if (!guardado?.cv || !guardado?.carta) return null;
    return { ...guardado, cv: { ...guardado.cv, sugeridas: guardado.cv.sugeridas ?? [] }, vacante: guardado.vacante ?? "" };
  } catch { return null; /* sin almacenamiento: se trabaja con el perfil */ }
}

/** La vacante desde la que se llegó («Preparar mi currículum para este puesto»). */
const VACANTE = VACANTE_PARA_CURRICULUM;
type VacanteRecibida = { puesto?: string; empresa?: string; texto?: string };
function leerVacante(): VacanteRecibida | null {
  try { return JSON.parse(window.sessionStorage.getItem(VACANTE) ?? "null") as VacanteRecibida | null; } catch { return null; }
}

/** Espera la sesión: el borrador es de cada cuenta. Se rearma si llega el perfil. */
export function CvBuilder({ pro, documentoInicial = "cv" }: { pro: ProData; documentoInicial?: "cv" | "carta" }) {
  const { user } = useAuth();
  if (!user) return null;
  const clave = `${CLAVE}:${user.id}`;
  return <Editor key={`${clave}:${pro?.id ?? ""}`} pro={pro} clave={clave} documentoInicial={documentoInicial} nombreCuenta={String(user.user_metadata?.full_name ?? "")} correo={user.email ?? ""} />;
}

type PasoCv = "contacto" | "experiencia" | "educacion" | "habilidades" | "perfil" | "revisar";
type PasoCarta = "puesto" | "contenido" | "revisar";
const PASOS_CV: PasoCv[] = ["contacto", "experiencia", "educacion", "habilidades", "perfil", "revisar"];
const PASOS_CARTA: PasoCarta[] = ["puesto", "contenido", "revisar"];
const NOMBRE_PASO: Record<PasoCv | PasoCarta, { es: string; en: string }> = {
  contacto: { es: "Contacto", en: "Contact" },
  experiencia: { es: "Experiencia", en: "Experience" },
  educacion: { es: "Educación", en: "Education" },
  habilidades: { es: "Habilidades", en: "Skills" },
  perfil: { es: "Perfil", en: "Summary" },
  revisar: { es: "Revisar y descargar", en: "Review & download" },
  puesto: { es: "Puesto", en: "Position" },
  contenido: { es: "Contenido", en: "Content" },
};

function Pasos<T extends PasoCv | PasoCarta>({ pasos, actual, hechos, alElegir, en }: { pasos: T[]; actual: T; hechos: Set<T>; alElegir: (p: T) => void; en: boolean }) {
  const indice = pasos.indexOf(actual);
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between text-xs font-semibold text-[#52627a]">
        <span>{en ? `Step ${indice + 1} of ${pasos.length}` : `Paso ${indice + 1} de ${pasos.length}`}</span>
        <span className="text-[#162543]">{NOMBRE_PASO[actual][en ? "en" : "es"]}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#eef3f7]" aria-hidden>
        <div className="h-full rounded-full bg-[#009FD9] transition-[width] duration-300" style={{ width: `${((indice + 1) / pasos.length) * 100}%` }} />
      </div>
      <ol className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {pasos.map((paso, i) => (
          <li key={paso} className="shrink-0">
            <button
              type="button"
              onClick={() => alElegir(paso)}
              aria-current={paso === actual ? "step" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors",
                paso === actual ? "border-[#009FD9] bg-[#eef8fd] text-[#007fae]" : "border-[#e5e7eb] bg-white text-[#52627a] hover:text-[#162543]",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
                  paso === actual ? "bg-[#009FD9] text-white" : hechos.has(paso) ? "bg-[#d1f0e0] text-[#067647]" : "bg-[#eef3f7] text-[#52627a]",
                )}
              >
                {i + 1}
              </span>
              {NOMBRE_PASO[paso][en ? "en" : "es"]}
              {hechos.has(paso) && paso !== actual && <span className="sr-only">{en ? " (done)" : " (completo)"}</span>}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * «ADAPTAR A UN PUESTO»: lo primero del generador. Se pega la vacante o se sube
 * una foto (se lee en el dispositivo). Sin IA, adaptar es ORDENAR, RESALTAR y
 * PRELLENAR: suben las habilidades que pide, se ven las palabras que faltan y
 * la carta sale dirigida. Lo que la persona escribió no se reescribe.
 */
function AdaptarAPuesto({ en, vacante, puesto, empresa, cv, alAdaptar, alQuitar, alSumar }: {
  en: boolean; vacante: string; puesto: string; empresa: string; cv: CvDocumento;
  alAdaptar: (v: { texto: string; puesto: string; empresa: string }) => void;
  alQuitar: () => void;
  alSumar: (habilidad: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(vacante);
  // Sin vacante todavía, el puesto lo trae la vacante, no el título del CV.
  const [p, setP] = useState(vacante ? puesto : "");
  const [e, setE] = useState(vacante ? empresa : "");
  const [leyendo, setLeyendo] = useState<number | null>(null);
  const [error, setError] = useState("");
  const archivo = useRef<HTMLInputElement>(null);
  const coincidencia = useMemo(() => (vacante.trim().length > 30 ? palabrasClave(vacante, cv) : null), [vacante, cv]);

  const leerImagen = async (f: File | undefined) => {
    if (!f) return;
    const { empresaProbable, imagenValida, leerTextoDeImagen, puestoProbable } = await import("@/lib/cv/leer-imagen");
    const ok = imagenValida(f);
    if (ok !== "ok") { setError(ok === "tipo" ? (en ? "That file isn't an image." : "Ese archivo no es una imagen.") : (en ? "The image is over 10 MB." : "La imagen pasa de 10 MB.")); return; }
    setError(""); setLeyendo(0); setAbierto(true);
    try {
      const leido = await leerTextoDeImagen(f, (a) => setLeyendo(a));
      if (leido.length < 20) setError(en ? "We couldn't read much from that image. Try a sharper one or paste the text." : "No pudimos leer casi nada de esa imagen. Probá con una más nítida o pegá el texto.");
      setTexto((t) => [t.trim(), leido].filter(Boolean).join("\n\n"));
      setP((actual) => actual.trim() || puestoProbable(leido));
      setE((actual) => actual.trim() || empresaProbable(leido));
    } catch {
      setError(en ? "The image couldn't be read on this device. Paste the text instead." : "No se pudo leer la imagen en este dispositivo. Pegá el texto.");
    } finally {
      setLeyendo(null);
      if (archivo.current) archivo.current.value = "";
    }
  };

  const entrada = (
    <input ref={archivo} type="file" accept="image/*" className="sr-only" aria-label={en ? "Upload an image of the job post" : "Subir una imagen de la vacante"} onChange={(ev) => void leerImagen(ev.target.files?.[0])} />
  );

  if (vacante.trim() && !abierto) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#cfe8f4] bg-[#f3fafe] px-4 py-3" data-testid="cv-adaptado">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] font-black text-[#162543]"><Target className="h-4 w-4 text-[#007fae]" />{en ? "Tailored to: " : "Adaptado a: "}<span className="truncate">{[puesto, empresa].filter(Boolean).join(" – ") || (en ? "a job post" : "una vacante")}</span></p>
          {coincidencia && <p className="mt-0.5 text-xs text-[#52627a]">{en ? `Your resume has ${coincidencia.estan.length} of ${coincidencia.estan.length + coincidencia.faltan.length} keywords from the post.` : `Tu currículum tiene ${coincidencia.estan.length} de ${coincidencia.estan.length + coincidencia.faltan.length} palabras clave del puesto.`}</p>}
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => { setTexto(vacante); setP(puesto); setE(empresa); setAbierto(true); }} className="h-9 rounded-full px-3 text-[13px] font-semibold text-[#007fae] hover:bg-white">{en ? "Change" : "Cambiar"}</button>
          <button type="button" onClick={alQuitar} className="h-9 rounded-full px-3 text-[13px] font-semibold text-[#52627a] hover:bg-white">{en ? "Remove" : "Quitar"}</button>
        </div>
        {coincidencia && coincidencia.faltan.length > 0 && (
          <div className="w-full">
            <p className="mb-1.5 text-xs font-semibold text-[#93370d]">{en ? "It asks for — add only if true for you:" : "Pide esto, sumalo solo si de verdad aplica a vos:"}</p>
            <ul className="flex flex-wrap gap-1.5">
              {coincidencia.faltan.slice(0, 12).map((h) => (
                <li key={h}><button type="button" onClick={() => alSumar(h)} className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-[#f1b37a] bg-white px-2.5 text-[12px] font-semibold text-[#93370d] hover:bg-[#fffaeb]"><Plus className="h-3.5 w-3.5" />{h}</button></li>
              ))}
            </ul>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 sm:p-5" data-testid="cv-adaptar">
      {entrada}
      <div className="flex items-start gap-3">
        <span className="ccr-caja-icono grid h-10 w-10 shrink-0 place-items-center rounded-xl"><Target className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-black text-[#162543]">{en ? "Tailor my resume to a job" : "Adaptar mi currículum a un puesto"}</h3>
          <p className="mt-0.5 text-[13px] leading-5 text-[#667085]">{en ? "Paste the job post or upload a photo of it. We put first the skills it asks for and address your letter. Your own sentences stay as you wrote them." : "Pegá la vacante o subí una foto. Ponemos primero las habilidades que pide y dirigimos tu carta. Tus frases quedan como las escribiste."}</p>
        </div>
      </div>
      {!abierto ? (
        <div className="mt-3 grid gap-2 @[420px]:grid-cols-2">
          <button type="button" onClick={() => setAbierto(true)} className={cn(pastilla, "border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb]")}><ClipboardPaste className="h-4 w-4" />{en ? "Paste text" : "Pegar texto"}</button>
          <button type="button" onClick={() => archivo.current?.click()} className={cn(pastilla, "border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb]")}><ImageUp className="h-4 w-4" />{en ? "Upload image" : "Subir imagen"}</button>
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          <div className="grid gap-3 @[560px]:grid-cols-2">
            <Input label={en ? "Position" : "Puesto"} value={p} maxLength={120} onChange={(ev) => setP(ev.target.value)} />
            <Input label={en ? "Company" : "Empresa"} value={e} maxLength={120} onChange={(ev) => setE(ev.target.value)} />
          </div>
          <label className="grid gap-1">
            <span className="text-sm font-semibold text-[#162543]">{en ? "Job post" : "La vacante"}</span>
            <textarea rows={6} value={texto} onChange={(ev) => setTexto(ev.target.value.slice(0, 6000))} className={campo} placeholder={en ? "Paste the job post here…" : "Pegá aquí la vacante…"} />
          </label>
          {leyendo !== null && (
            <div role="status" className="grid gap-1.5">
              <p className="text-xs font-semibold text-[#52627a]">{en ? "Reading the image on your device…" : "Leyendo la imagen en tu dispositivo…"} {Math.round(leyendo * 100)}%</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#eef3f7]"><div className="h-full rounded-full bg-[#009FD9] transition-[width]" style={{ width: `${Math.max(4, leyendo * 100)}%` }} /></div>
            </div>
          )}
          {error && <p role="alert" className="text-[13px] text-[#b42318]">{error}</p>}
          <p className="text-xs leading-5 text-[#667085]">{en ? "Tip: on iPhone and Android you can press and hold the text in a photo to copy it, and paste it here." : "Consejo: en iPhone y Android podés mantener presionado el texto de una foto para copiarlo y pegarlo aquí."}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={texto.trim().length < 20 || leyendo !== null} onClick={() => { alAdaptar({ texto: texto.trim(), puesto: p.trim(), empresa: e.trim() }); setAbierto(false); }} className={cn(pastilla, "bg-[#009FD9] text-white hover:bg-[#0089bb]")}><Target className="h-4 w-4" />{en ? "Tailor" : "Adaptar"}</button>
            <button type="button" disabled={leyendo !== null} onClick={() => archivo.current?.click()} className={cn(pastilla, "border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb]")}><ImageUp className="h-4 w-4" />{en ? "Read an image" : "Leer una imagen"}</button>
            <button type="button" onClick={() => { setAbierto(false); setError(""); }} className={cn(pastilla, "px-3 text-[#52627a] hover:bg-[#f6f9fb]")}>{en ? "Cancel" : "Cancelar"}</button>
          </div>
        </div>
      )}
    </section>
  );
}

function Editor({ pro, clave, documentoInicial, nombreCuenta, correo }: { pro: ProData; clave: string; documentoInicial: "cv" | "carta"; nombreCuenta: string; correo: string }) {
  const idiomaApp: Idioma = useLocale() === "en" ? "en" : "es";
  const en = idiomaApp === "en";
  const desdeElPerfil = (idioma: Idioma): Borrador => {
    const cv = prellenar(datosDelPerfil(pro, nombreCuenta, correo, idioma), idioma);
    return { cv, carta: cartaInicial(cv), vacante: "" };
  };
  // El borrador vive en este dispositivo. Si no hay, se arma desde el perfil.
  // Si se llegó desde una vacante, ese puesto se aplica encima.
  const [borrador, setBorrador] = useState<Borrador>(() => {
    const base = leerBorrador(clave) ?? desdeElPerfil(idiomaApp);
    const v = leerVacante();
    if (!v?.texto && !v?.puesto) return base;
    const cv = ajustarAVacante(base.cv, [v.puesto, v.texto].filter(Boolean).join("\n"));
    return { cv, carta: cartaInicial(cv, { puesto: v.puesto, empresa: v.empresa }), vacante: v.texto ?? "" };
  });
  const [pestana, setPestana] = useState<"cv" | "carta">(documentoInicial);
  const [pasoCv, setPasoCv] = useState<PasoCv>("contacto");
  const [pasoCarta, setPasoCarta] = useState<PasoCarta>("puesto");
  const [verHoja, setVerHoja] = useState(false);
  const [aviso, setAviso] = useState("");
  const [generando, setGenerando] = useState(false);
  const arriba = useRef<HTMLDivElement>(null);
  useEffect(() => { try { window.sessionStorage.removeItem(VACANTE); } catch { /* sin almacenamiento */ } }, []);
  useEffect(() => {
    const t = window.setTimeout(() => { try { window.localStorage.setItem(clave, JSON.stringify(borrador)); } catch { /* sin almacenamiento */ } }, 400);
    return () => window.clearTimeout(t);
  }, [borrador, clave]);

  const { cv, carta, vacante } = borrador;
  const setCv = (cambio: Partial<CvDocumento>) => setBorrador((b) => ({ ...b, cv: { ...b.cv, ...cambio } }));
  const setCarta = (cambio: Partial<Carta>) => setBorrador((b) => ({ ...b, carta: { ...b.carta, ...cambio } }));
  const avisos = useMemo(() => (pestana === "cv" ? revisarCv(cv) : revisarCarta(carta)), [pestana, cv, carta]);
  // Adaptar: ordena habilidades y dirige la carta. La carta solo se rehace si
  // sigue siendo la plantilla; si la persona ya la escribió, cambian puesto y empresa.
  const adaptar = ({ texto, puesto, empresa }: { texto: string; puesto: string; empresa: string }) => setBorrador((b) => {
    const cvAdaptado = ajustarAVacante(b.cv, [puesto, texto].filter(Boolean).join("\n"));
    const anterior = cartaInicial(b.cv, { puesto: b.carta.puesto, empresa: b.carta.empresa });
    const nueva = cartaInicial(cvAdaptado, { puesto, empresa });
    const carta = { ...b.carta, puesto, empresa };
    for (const k of ["apertura", "porQueEncajo"] as const) if (b.carta[k] === anterior[k]) carta[k] = nueva[k];
    return { ...b, cv: cvAdaptado, carta, vacante: texto };
  });
  const quitarVacante = () => setBorrador((b) => ({ ...b, vacante: "" }));
  const sumarHabilidad = (h: string) => setCv({ habilidades: [...cv.habilidades, h], sugeridas: cv.sugeridas.filter((x) => x.toLowerCase() !== h.toLowerCase()) });
  const cobertura = useMemo(() => (vacante.trim().length > 30 ? palabrasClave(vacante, cv) : null), [vacante, cv]);

  const hechosCv = useMemo(() => new Set<PasoCv>(([
    ["contacto", !!cv.nombre.trim() && !!(cv.correo.trim() || cv.telefono.trim())],
    ["experiencia", cv.experiencia.some((e) => e.title.trim())],
    ["educacion", cv.educacion.some((e) => e.title.trim())],
    ["habilidades", cv.habilidades.length >= 4 && cv.habilidades.length <= LIMITES.habilidades],
    ["perfil", cv.resumen.trim().length >= 80],
  ] as [PasoCv, boolean][]).filter(([, ok]) => ok).map(([p]) => p)), [cv]);
  const hechosCarta = useMemo(() => new Set<PasoCarta>(([
    ["puesto", !!carta.puesto.trim()],
    ["contenido", !revisarCarta(carta).some((a) => a.id === "corchetes")],
  ] as [PasoCarta, boolean][]).filter(([, ok]) => ok).map(([p]) => p)), [carta]);

  const irA = (accion: () => void) => { accion(); window.setTimeout(() => arriba.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); };
  const pasos: string[] = pestana === "cv" ? PASOS_CV : PASOS_CARTA;
  const paso = pestana === "cv" ? pasoCv : pasoCarta;
  const indice = pasos.indexOf(paso);
  const mover = (delta: number) => irA(() => {
    const siguiente = pasos[Math.max(0, Math.min(pasos.length - 1, indice + delta))];
    if (pestana === "cv") setPasoCv(siguiente as PasoCv); else setPasoCarta(siguiente as PasoCarta);
  });

  const avisar = (texto: string) => { setAviso(texto); window.setTimeout(() => setAviso(""), 2500); };
  const [confirmarRecarga, setConfirmarRecarga] = useState(false);
  const recargar = () => { setBorrador(desdeElPerfil(cv.idioma)); setConfirmarRecarga(false); };
  const cambiarIdioma = (idioma: Idioma) => setBorrador((b) => {
    // Solo cambia lo que es de la plantilla; lo que la persona escribió queda.
    const plantillaCarta = cartaInicial({ ...b.cv, idioma }, { puesto: b.carta.puesto, empresa: b.carta.empresa });
    const anterior = cartaInicial(b.cv, { puesto: b.carta.puesto, empresa: b.carta.empresa });
    const carta = { ...b.carta };
    for (const k of ["destinatario", "apertura", "porQueEncajo", "porQueLaEmpresa", "cierre"] as const) if (carta[k] === anterior[k]) carta[k] = plantillaCarta[k];
    return { ...b, cv: { ...b.cv, idioma }, carta };
  });

  const descargar = async () => {
    setGenerando(true);
    try {
      const { pdfDelCv, pdfDeLaCarta } = await import("@/lib/cv/pdf-documento");
      const blob = pestana === "cv" ? await pdfDelCv(cv) : await pdfDeLaCarta(cv, carta);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreDeArchivo(cv.nombre, pestana === "cv" ? "CV" : "Carta", cv.idioma);
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      avisar(en ? "The PDF couldn't be created. Try again." : "No se pudo crear el PDF. Probá de nuevo.");
    } finally {
      setGenerando(false);
    }
  };
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(pestana === "cv" ? cvComoTexto(cv) : cartaComoTexto(cv, carta));
      avisar(en ? "Copied" : "Copiado");
    } catch { avisar(en ? "Couldn't copy" : "No se pudo copiar"); }
  };

  const hoja = (
    <div className="mx-auto min-h-[520px] w-full max-w-[430px] rounded-lg bg-white p-6 shadow-[0_12px_40px_-18px_rgba(22,37,67,0.45)] ring-1 ring-[#e5e7eb]" data-testid="cv-hoja">
      {pestana === "cv" ? <HojaCv cv={cv} /> : <HojaCarta cv={cv} carta={carta} />}
    </div>
  );
  const tituloCv = TITULOS[cv.idioma];
  const lleno = cv.habilidades.length >= LIMITES.habilidades;
  const baseDelPerfil = () => {
    const h = cv.habilidades.slice(0, 3).join(", ");
    return cv.idioma === "en"
      ? `${cv.titular || "[Your role]"}${h ? ` experienced in ${h}` : ""}. [Your main achievement or strength, ideally with a number.] [What you are looking for.]`
      : `${cv.titular || "[Tu oficio o cargo]"}${h ? ` con experiencia en ${h}` : ""}. [Tu logro o fortaleza principal, idealmente con un número.] [Qué buscás.]`;
  };

  // ── LOS PASOS ──
  const pasoDelCv: Record<PasoCv, ReactNode> = {
    contacto: (
      <Tarjeta
        titulo={en ? "Your details" : "Tus datos"}
        ayuda={en ? "They go in the body of the document, where screening systems read them." : "Van en el cuerpo del documento, donde los filtros automáticos sí los leen."}
        accion={<button type="button" onClick={() => setConfirmarRecarga(true)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-[#007fae] hover:bg-[#eef6fb]"><RotateCcw className="h-4 w-4" />{en ? "Reload from profile" : "Cargar de mi perfil"}</button>}
      >
        {confirmarRecarga && (
          <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#fffaeb] px-3 py-2.5 text-[13px] text-[#93370d]">
            <span>{en ? "This replaces what you edited here." : "Esto reemplaza lo que editaste aquí."}</span>
            <span className="flex gap-2">
              <button type="button" onClick={() => setConfirmarRecarga(false)} className="h-9 rounded-full px-3 font-semibold text-[#52627a] hover:bg-white">{en ? "Cancel" : "Cancelar"}</button>
              <button type="button" onClick={recargar} className="h-9 rounded-full bg-[#162543] px-4 font-bold text-white">{en ? "Reload" : "Cargar"}</button>
            </span>
          </div>
        )}
        <div className="grid gap-3 @[560px]:grid-cols-2">
          <Input label={en ? "Full name" : "Nombre completo"} value={cv.nombre} maxLength={120} onChange={(e) => setCv({ nombre: e.target.value })} />
          <Input label={en ? "Professional title" : "Título profesional"} placeholder={en ? "E.g. Residential electrician" : "Ej.: Electricista residencial"} value={cv.titular} maxLength={120} onChange={(e) => setCv({ titular: e.target.value })} />
          <Input label={en ? "Email" : "Correo"} type="email" value={cv.correo} maxLength={160} onChange={(e) => setCv({ correo: e.target.value })} />
          <Input label={en ? "Phone" : "Teléfono"} inputMode="tel" value={cv.telefono} maxLength={40} onChange={(e) => setCv({ telefono: e.target.value })} />
          <Input label={en ? "Location" : "Ubicación"} value={cv.ubicacion} maxLength={120} onChange={(e) => setCv({ ubicacion: e.target.value })} />
          <Input label={en ? "Link (profile or website)" : "Enlace (perfil o sitio web)"} value={cv.enlace} maxLength={200} onChange={(e) => setCv({ enlace: e.target.value })} />
        </div>
      </Tarjeta>
    ),
    experiencia: (
      <Tarjeta titulo={tituloCv.experiencia} ayuda={en ? "Most recent first. Start each achievement with a verb and add numbers." : "Lo más reciente primero. Empezá cada logro con un verbo y agregá números."}>
        <Entradas tipo="experiencia" en={en} lista={cv.experiencia} alCambiar={(experiencia) => setCv({ experiencia })} />
      </Tarjeta>
    ),
    educacion: (
      <>
        <Tarjeta titulo={tituloCv.educacion} ayuda={en ? "Degrees, technical studies and school." : "Títulos, estudios técnicos y colegio."}>
          <Entradas tipo="educacion" en={en} lista={cv.educacion} alCambiar={(educacion) => setCv({ educacion })} />
        </Tarjeta>
        <Tarjeta titulo={tituloCv.certificaciones} ayuda={en ? "Only certificates, short courses and licenses." : "Solo certificados, cursos cortos y licencias."}>
          <Etiquetas en={en} lista={cv.certificaciones} alCambiar={(certificaciones) => setCv({ certificaciones })} ejemplo={en ? "CPR · Red Cross · 2024" : "RCP · Cruz Roja · 2024"} />
        </Tarjeta>
        <Tarjeta titulo={tituloCv.idiomas}>
          <Etiquetas en={en} lista={cv.idiomas} alCambiar={(idiomas) => setCv({ idiomas })} ejemplo={en ? "English (B2)" : "Inglés (B2)"} />
        </Tarjeta>
      </>
    ),
    habilidades: (
      <>
        <Tarjeta
          titulo={tituloCv.habilidades}
          ayuda={en ? `Choose 6 to ${LIMITES.habilidades}: the ones the job asks for. A long list reads as filler.` : `Elegí de 6 a ${LIMITES.habilidades}: las que pide el puesto. Una lista larga se lee como relleno.`}
          accion={<span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", lleno ? "bg-[#eef8fd] text-[#007fae]" : "bg-[#f2f4f7] text-[#52627a]")}>{cv.habilidades.length}/{LIMITES.habilidades}</span>}
        >
          <Etiquetas en={en} lista={cv.habilidades} alCambiar={(habilidades) => setCv({
            habilidades,
            // La que se quita vuelve a las sugeridas: no se pierde.
            sugeridas: [...cv.habilidades.filter((x) => !habilidades.includes(x)), ...cv.sugeridas.filter((x) => !habilidades.includes(x))],
          })} ejemplo={en ? "Excel, customer service…" : "Excel, servicio al cliente…"} />
          {cv.sugeridas.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold text-[#52627a]">{en ? "From your profile — tap to add" : "De tu perfil: tocá para sumar"}</p>
              <ul className="flex flex-wrap gap-2">
                {cv.sugeridas.map((h) => (
                  <li key={h}>
                    <button
                      type="button"
                      disabled={lleno}
                      onClick={() => setCv({ habilidades: [...cv.habilidades, h], sugeridas: cv.sugeridas.filter((x) => x !== h) })}
                      className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-[#b9c8d6] bg-white px-3 text-[13px] font-semibold text-[#52627a] hover:border-[#009FD9] hover:text-[#007fae] disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" />{h}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Tarjeta>
      </>
    ),
    perfil: (
      <Tarjeta titulo={tituloCv.resumen} ayuda={en ? "Written last on purpose: 2–3 lines with what you do, your experience and your strengths." : "Se escribe al final a propósito: 2 o 3 líneas con qué hacés, tu experiencia y en qué sos fuerte."}>
        <textarea rows={5} maxLength={600} value={cv.resumen} onChange={(e) => setCv({ resumen: e.target.value })} className={campo} />
        <div className="mt-1 flex items-center justify-between gap-2">
          <button type="button" onClick={() => setCv({ resumen: baseDelPerfil() })} className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-[#007fae] hover:bg-[#eef6fb]">
            <Lightbulb className="h-4 w-4" />{en ? "Start from a template" : "Empezar con una base"}
          </button>
          <span className="text-xs text-[#98a2b3]">{cv.resumen.length}/600</span>
        </div>
      </Tarjeta>
    ),
    revisar: null,
  };
  const pasoDeLaCarta: Record<PasoCarta, ReactNode> = {
    puesto: (
      <Tarjeta titulo={en ? "The position" : "El puesto"} ayuda={en ? "A cover letter goes with your resume: one page, about 300 words." : "La carta acompaña tu currículum: una página, unas 300 palabras."}>
        <div className="grid gap-3 @[560px]:grid-cols-2">
          <Input label={en ? "Position" : "Puesto"} value={carta.puesto} maxLength={120} onChange={(e) => setCarta({ puesto: e.target.value })} />
          <Input label={en ? "Company" : "Empresa"} value={carta.empresa} maxLength={120} onChange={(e) => setCarta({ empresa: e.target.value })} />
          <div className="@[560px]:col-span-2"><Input label={en ? "Addressed to" : "Dirigida a"} value={carta.destinatario} maxLength={120} onChange={(e) => setCarta({ destinatario: e.target.value })} /></div>
        </div>
        <button type="button" onClick={() => setCarta(cartaInicial(cv, { puesto: carta.puesto, empresa: carta.empresa }))} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-[#007fae] hover:bg-[#eef6fb]">
          <RotateCcw className="h-4 w-4" />{en ? "Rewrite with this position" : "Rehacer con este puesto"}
        </button>
      </Tarjeta>
    ),
    contenido: (
      <>
        {([
          ["apertura", en ? "1. Opening" : "1. Apertura", en ? "Which position and how you found it." : "A qué puesto te postulás y cómo lo encontraste."],
          ["porQueEncajo", en ? "2. Why you fit" : "2. Por qué encajás", en ? "2–3 achievements from your resume, with numbers." : "2 o 3 logros de tu currículum, con números."],
          ["porQueLaEmpresa", en ? "3. Why this company" : "3. Por qué esta empresa", en ? "Something specific about them." : "Algo concreto de ellos."],
          ["cierre", en ? "4. Closing" : "4. Cierre", en ? "Invite them to talk and say thanks." : "Invitá a conversar y agradecé."],
        ] as const).map(([k, titulo, ayuda]) => (
          <Tarjeta key={k} titulo={titulo} ayuda={ayuda}>
            <textarea rows={k === "porQueEncajo" ? 5 : 3} maxLength={900} value={carta[k]} onChange={(e) => setCarta({ [k]: e.target.value } as Partial<Carta>)} className={campo} />
          </Tarjeta>
        ))}
      </>
    ),
    revisar: null,
  };
  const enRevision = paso === "revisar";
  const revision = (
    <div className="grid gap-4 rounded-2xl border border-[#e5e7eb] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Segmentos etiqueta={en ? "Document language" : "Idioma del documento"} valor={cv.idioma} alCambiar={cambiarIdioma} opciones={[{ id: "es", texto: "Español" }, { id: "en", texto: "English" }]} />
        <Segmentos<Plantilla> etiqueta={en ? "Template" : "Plantilla"} valor={cv.plantilla} alCambiar={(plantilla) => setCv({ plantilla })} opciones={[{ id: "clasica", texto: en ? "Classic" : "Clásica" }, { id: "moderna", texto: en ? "Modern" : "Moderna" }]} />
      </div>
      <div>
        <p className="mb-2 text-[13px] font-black text-[#162543]">{en ? "Review before sending" : "Revisión antes de enviar"}</p>
        {cobertura && pestana === "cv" && (
          <p className="mb-2 flex items-center gap-2 rounded-xl bg-[#f3fafe] px-3 py-2.5 text-[13px] text-[#162543]">
            <Target className="h-4 w-4 shrink-0 text-[#007fae]" />
            {en ? `It has ${cobertura.estan.length} of ${cobertura.estan.length + cobertura.faltan.length} keywords from the job post.` : `Tiene ${cobertura.estan.length} de ${cobertura.estan.length + cobertura.faltan.length} palabras clave del puesto.`}
          </p>
        )}
        <Revision avisos={avisos} idiomaApp={idiomaApp} />
      </div>
      <div className="grid gap-2 @[560px]:grid-cols-2">
        <button type="button" disabled={generando} onClick={() => void descargar()} className={cn(pastilla, "w-full bg-[#009FD9] text-white hover:bg-[#0089bb]")}>
          <Download className="h-4 w-4" />{pestana === "cv" ? (en ? "Download resume (PDF)" : "Descargar currículum (PDF)") : (en ? "Download letter (PDF)" : "Descargar carta (PDF)")}
        </button>
        <button type="button" onClick={() => void copiar()} className={cn(pastilla, "w-full border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb]")}>
          {pestana === "cv" ? <Copy className="h-4 w-4" /> : <Mail className="h-4 w-4" />}{en ? "Copy as text" : "Copiar como texto"}
        </button>
      </div>
      <p role="status" aria-live="polite" className="-mt-2 min-h-4 text-center text-xs font-semibold text-[#067647]">{aviso}</p>
      <p className="-mt-2 text-center text-[11px] leading-4 text-[#98a2b3]">{en ? "Your draft is saved on this device only." : "El borrador se guarda solo en este dispositivo."}</p>
    </div>
  );

  return (
    // El ancho que manda es el del panel, no el de la pantalla: lado a lado
    // solo cuando el panel mide 980 px o más; si no, la hoja va abajo.
    <div ref={arriba} className="@container grid scroll-mt-24 gap-4" data-testid="cv-builder">
      <Segmentos etiqueta={en ? "Document" : "Documento"} valor={pestana} alCambiar={(d) => irA(() => setPestana(d))} opciones={[{ id: "cv", texto: en ? "Resume" : "Currículum" }, { id: "carta", texto: en ? "Cover letter" : "Carta de presentación" }]} />
      <AdaptarAPuesto key={vacante ? "con" : "sin"} en={en} vacante={vacante} puesto={carta.puesto} empresa={carta.empresa} cv={cv} alAdaptar={adaptar} alQuitar={quitarVacante} alSumar={sumarHabilidad} />
      {pestana === "cv"
        ? <Pasos en={en} pasos={PASOS_CV} actual={pasoCv} hechos={hechosCv} alElegir={(p) => irA(() => setPasoCv(p))} />
        : <Pasos en={en} pasos={PASOS_CARTA} actual={pasoCarta} hechos={hechosCarta} alElegir={(p) => irA(() => setPasoCarta(p))} />}

      <div className="grid items-start gap-4 @[980px]:grid-cols-[minmax(0,1fr)_400px]">
        <div className="grid min-w-0 gap-4" data-testid={`cv-paso-${paso}`}>
          {enRevision ? (
            <>
              {revision}
              <div className="@[980px]:hidden">{hoja}</div>
            </>
          ) : (
            <>
              {pestana === "cv" ? pasoDelCv[pasoCv] : pasoDeLaCarta[pasoCarta]}
              <button type="button" onClick={() => setVerHoja((v) => !v)} className={cn(pastilla, "justify-self-start px-3 text-[#007fae] hover:bg-[#eef6fb] @[980px]:hidden")}>
                <FileText className="h-4 w-4" />{verHoja ? (en ? "Hide preview" : "Ocultar vista previa") : (en ? "See preview" : "Ver vista previa")}
              </button>
              {verHoja && <div className="@[980px]:hidden">{hoja}</div>}
            </>
          )}
          {/* Atrás / Siguiente pegados al fondo en el teléfono, ENCIMA de la
              barra del app (antes la barra tapaba descargar). */}
          <AccionesAlPie className="grid grid-cols-2 gap-3">
            <button type="button" disabled={indice === 0} onClick={() => mover(-1)} className={cn(pastilla, "w-full border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb] disabled:opacity-40")}>
              <ChevronLeft className="h-4 w-4" />{en ? "Back" : "Atrás"}
            </button>
            {enRevision ? (
              <button type="button" disabled={generando} onClick={() => void descargar()} className={cn(pastilla, "w-full bg-[#009FD9] text-white hover:bg-[#0089bb]")}>
                <Download className="h-4 w-4" />{en ? "Download PDF" : "Descargar PDF"}
              </button>
            ) : (
              <button type="button" onClick={() => mover(1)} className={cn(pastilla, "w-full bg-[#009FD9] text-white hover:bg-[#0089bb]")}>
                {indice === pasos.length - 2 ? (en ? "Review" : "Revisar") : (en ? "Next" : "Siguiente")}<ChevronRight className="h-4 w-4" />
              </button>
            )}
          </AccionesAlPie>
        </div>
        <aside className="hidden @[980px]:sticky @[980px]:top-24 @[980px]:block">{hoja}</aside>
      </div>
    </div>
  );
}
