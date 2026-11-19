"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useLocale } from "next-intl";
import { AlertCircle, Check, CheckCircle2, ChevronLeft, ChevronRight, Copy, CopyPlus, Download, FileText, FileUp, Lightbulb, Mail, Plus, RotateCcw, Search, Trash2, UserRound } from "lucide-react";
import { MenuFicha } from "@/components/ui/menu-ficha";
import { AccionesAlPie } from "@/components/ui/acciones-al-pie";
import { Skeleton } from "@/components/ui/content-loading";
import { Link } from "@/i18n/navigation";
import { VACANTE_PARA_CURRICULUM } from "@/components/jobs/preparar-curriculum";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { getCantonById, getProvinceById } from "@/lib/data/cr-geography";
import { getCategoryLabel } from "@/lib/data/categories";
import { languageLabel } from "@/lib/data/languages";
import { blankDates, parseCvDates, serializeCvDates, type CvDates } from "@/lib/cv/dates";
import type { CvEntry } from "@/lib/cv/model";
import {
  LIMITES, TITULOS, cartaComoTexto, cartaInicial, cuerpoDeLaCarta, cvComoTexto, encabezadoDeEntrada, fechasAts, lineasDeReferencia, nombreDeArchivo, opcionales, palabrasClave, prellenar, revisarCarta, revisarCv, sumarDesdeArchivo,
  type Aviso, type Carta, type CvDocumento, type DatosDelPerfil, type Idioma, type Referencia, type SeccionLibre,
} from "@/lib/cv/documento";
import { cn } from "@/lib/utils";
import { formatFullPersonName } from "@/lib/display-name";

/**
 * «MI CV» EN EL PANEL: CV y carta de presentación listos para descargar.
 * Se prellena con el perfil, todo se puede editar, y los documentos quedan en
 * este dispositivo (no se suben a ningún lado: el CV lleva teléfono y correo).
 * «Volver a cargar desde mi perfil» lo rehace desde cero.
 *
 * VARIOS DOCUMENTOS (16-nov-2026): «Mis currículums» y «Mis cartas». Antes
 * había un solo borrador y «Preparar mi carta» desde una vacante lo pisaba sin
 * avisar; ahora cada vacante abre una carta nueva y las anteriores quedan.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProData = Record<string, any> | null;

// v2: el prellenado separa títulos de certificaciones y limita las habilidades.
const CLAVE = "ccr:cv-borrador:v2";
type Borrador = { cv: CvDocumento; carta: Carta };

function datosDelPerfil(pro: ProData, nombreCuenta: string, correo: string, idioma: Idioma): DatosDelPerfil {
  const servicios = Array.isArray(pro?.services)
    ? pro.services.filter((s: { active?: boolean; name?: string }) => s?.active !== false && s?.name).map((s: { name: string }) => s.name)
    : [];
  const profesiones = Array.isArray(pro?.professions) ? pro.professions.map((id: string) => getCategoryLabel(id, idioma)) : [];
  const ubicacion = [getCantonById(String(pro?.canton_id ?? ""))?.name, getProvinceById(String(pro?.provincia_id ?? ""))?.name].filter(Boolean).join(", ");
  const perfil = Array.isArray(pro?.profiles) ? pro.profiles[0] : pro?.profiles;
  return {
    nombre: formatFullPersonName(perfil?.full_name || nombreCuenta),
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
    // La etiqueta se ve: sin ella «Español / English» no decía que era el
    // idioma del documento (16-nov-2026).
    <div className="flex flex-col gap-1.5">
    <span className="text-xs font-semibold text-[#52627a]">{etiqueta}</span>
    <div role="radiogroup" aria-label={etiqueta} className="inline-flex w-fit rounded-full bg-[#eef3f7] p-1">
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

function Entradas({ lista, alCambiar, en, tipo }: { lista: CvEntry[]; alCambiar: (l: CvEntry[]) => void; en: boolean; tipo: "experiencia" | "educacion" | "proyecto" }) {
  const exp = tipo === "experiencia";
  const proyecto = tipo === "proyecto";
  const cambiar = (i: number, cambio: Partial<CvEntry>) => alCambiar(lista.map((e, j) => (j === i ? { ...e, ...cambio } : e)));
  return (
    <div className="grid gap-3">
      {lista.map((e, i) => (
        <div key={i} className="grid gap-3 rounded-xl border border-[#eef2f6] bg-[#fbfcfd] p-3">
          <div className="grid gap-3 @[560px]:grid-cols-2">
            <Input label={proyecto ? (en ? "Project name" : "Nombre del proyecto") : exp ? (en ? "Role" : "Cargo") : (en ? "Degree or course" : "Título o curso")} value={e.title} maxLength={160} onChange={(ev) => cambiar(i, { title: ev.target.value })} />
            <Input label={proyecto ? (en ? "Client or company (optional)" : "Cliente o empresa (opcional)") : exp ? (en ? "Company or client" : "Empresa o cliente") : (en ? "Institution" : "Institución")} value={e.organization} maxLength={160} onChange={(ev) => cambiar(i, { organization: ev.target.value })} />
            {/* La ubicación de cada puesto o estudio, como en FlowCV (18-nov-2026). */}
            {!proyecto && <Input label={en ? "Location (optional)" : "Ubicación (opcional)"} placeholder={en ? "E.g. San José or Remote" : "Ej.: San José o Remoto"} value={e.location ?? ""} maxLength={80} onChange={(ev) => cambiar(i, { location: ev.target.value })} />}
          </div>
          <Fechas periodo={e.period} en={en} alCambiar={(period) => cambiar(i, { period })} />
          {(exp || proyecto) && (
            <label className="grid gap-1">
              <span className="text-sm font-semibold text-[#162543]">{proyecto ? (en ? "What you did (one per line)" : "Qué hiciste (uno por línea)") : (en ? "Achievements (one per line)" : "Logros (uno por línea)")}</span>
              <textarea rows={4} value={e.description} maxLength={1000} onChange={(ev) => cambiar(i, { description: ev.target.value })} placeholder={proyecto ? (en ? "Built the online store for a local bakery\nSales grew 30% in 3 months" : "Hice la tienda en línea de una panadería\nLas ventas subieron un 30 % en 3 meses") : en ? "Installed electrical systems in 40+ homes\nReduced repair times by 20%" : "Instalé el sistema eléctrico de más de 40 casas\nReduje el tiempo de reparación un 20 %"} className={campo} />
            </label>
          )}
          <button type="button" onClick={() => alCambiar(lista.filter((_, j) => j !== i))} className="inline-flex h-9 items-center gap-1.5 justify-self-start rounded-full px-2 text-[13px] font-semibold text-[#b42318] hover:bg-[#fef3f2]">
            <Trash2 className="h-4 w-4" /> {en ? "Remove" : "Quitar"}
          </button>
        </div>
      ))}
      <button type="button" onClick={() => alCambiar([...lista, { title: "", organization: "", period: "", description: "" }])} className={cn(pastilla, "justify-self-start border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb]")}>
        <Plus className="h-4 w-4" /> {proyecto ? (en ? "Add project" : "Agregar proyecto") : exp ? (en ? "Add experience" : "Agregar experiencia") : (en ? "Add education" : "Agregar estudio")}
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

function TituloHoja({ children }: { children: ReactNode }) {
  return <h4 className="mt-4 border-b border-[#52627a]/40 pb-1 text-[11px] font-bold uppercase tracking-[0.06em] text-[#162543]">{children}</h4>;
}

function EntradasHoja({ lista, idioma }: { lista: CvEntry[]; idioma: Idioma }) {
  return (
    <div className="mt-1.5 grid gap-2">
      {lista.map((e, i) => (
        <div key={i}>
          <p className="text-[11px] font-bold text-[#162543]">{encabezadoDeEntrada(e)}</p>
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
  const extra = opcionales(cv);
  const contacto = [cv.correo, cv.telefono, cv.ubicacion, cv.enlace].filter((v) => v.trim()).join("  |  ");
  return (
    <div className="text-left">
      <p className="text-[20px] font-black leading-tight text-[#162543]">{cv.nombre || "—"}</p>
      {cv.titular && <p className="text-[12px] text-[#52627a]">{cv.titular}</p>}
      {contacto && <p className="mt-1 break-words text-[10px] text-[#52627a]">{contacto}</p>}
      {cv.resumen.trim() && <><TituloHoja>{t.resumen}</TituloHoja><p className="mt-1.5 whitespace-pre-line text-[10.5px] leading-[1.45] text-[#162543]">{cv.resumen}</p></>}
      {cv.experiencia.length > 0 && <><TituloHoja>{t.experiencia}</TituloHoja><EntradasHoja lista={cv.experiencia} idioma={cv.idioma} /></>}
      {extra.proyectos.length > 0 && <><TituloHoja>{t.proyectos}</TituloHoja><EntradasHoja lista={extra.proyectos} idioma={cv.idioma} /></>}
      {cv.educacion.length > 0 && <><TituloHoja>{t.educacion}</TituloHoja><EntradasHoja lista={cv.educacion} idioma={cv.idioma} /></>}
      {cv.certificaciones.length > 0 && <><TituloHoja>{t.certificaciones}</TituloHoja>{cv.certificaciones.map((c) => <p key={c} className="mt-1 text-[10.5px] text-[#162543]">{c}</p>)}</>}
      {cv.habilidades.length > 0 && <><TituloHoja>{t.habilidades}</TituloHoja><p className="mt-1.5 text-[10.5px] leading-[1.45] text-[#162543]">{cv.habilidades.join(", ")}</p></>}
      {cv.idiomas.length > 0 && <><TituloHoja>{t.idiomas}</TituloHoja><p className="mt-1.5 text-[10.5px] text-[#162543]">{cv.idiomas.join(", ")}</p></>}
      {extra.secciones.map((x, i) => <div key={i}><TituloHoja>{x.titulo}</TituloHoja><p className="mt-1.5 whitespace-pre-line text-[10.5px] leading-[1.45] text-[#162543]">{x.texto.trim()}</p></div>)}
      {extra.referencias.length > 0 && <><TituloHoja>{t.referencias}</TituloHoja>{extra.referencias.map((r, i) => {
        const [primera, ...resto] = lineasDeReferencia(r);
        return <div key={i} className="mt-1.5"><p className="text-[11px] font-bold text-[#162543]">{primera}</p>{resto.map((x) => <p key={x} className="text-[10px] text-[#52627a]">{x}</p>)}</div>;
      })}</>}
    </div>
  );
}

function HojaCarta({ cv, carta }: { cv: CvDocumento; carta: Carta }) {
  const contacto = [cv.correo, cv.telefono, cv.ubicacion].filter((v) => v.trim()).join("  |  ");
  return (
    <div className="text-left">
      <p className="text-[20px] font-black leading-tight text-[#162543]">{cv.nombre || "—"}</p>
      {cv.titular && <p className="text-[12px] text-[#52627a]">{cv.titular}</p>}
      {contacto && <p className="mt-1 break-words text-[10px] text-[#52627a]">{contacto}</p>}
      <div className="mt-5 whitespace-pre-line text-[11px] leading-[1.55] text-[#162543]">{cuerpoDeLaCarta(cv, carta)}</div>
    </div>
  );
}

function leerBorrador(clave: string): Borrador | null {
  try {
    const guardado = JSON.parse(window.localStorage.getItem(clave) ?? "null") as Borrador | null;
    if (!guardado?.cv || !guardado?.carta) return null;
    return { ...guardado, cv: { ...guardado.cv, sugeridas: guardado.cv.sugeridas ?? [] } };
  } catch { return null; /* sin almacenamiento: se trabaja con el perfil */ }
}

/** La vacante desde la que se llegó («Preparar mi currículum para este puesto»). */
const VACANTE = VACANTE_PARA_CURRICULUM;
type VacanteRecibida = { puesto?: string; empresa?: string };
function leerVacante(): VacanteRecibida | null {
  try { return JSON.parse(window.sessionStorage.getItem(VACANTE) ?? "null") as VacanteRecibida | null; } catch { return null; }
}

// v3: varios currículums y cartas por cuenta. El borrador único (v2) se pasa
// a la lista la primera vez.
const CLAVE_DOCS = "ccr:cv-documentos:v3";
const MAX_DOCUMENTOS = 10;
type Tipo = "cv" | "carta";
type Documento = { id: string; tipo: Tipo; actualizado: number; borrador: Borrador };
const nuevoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function leerDocumentos(uid: string): Documento[] {
  try {
    const lista = JSON.parse(window.localStorage.getItem(`${CLAVE_DOCS}:${uid}`) ?? "null") as Documento[] | null;
    if (Array.isArray(lista)) {
      return lista
        .filter((d) => d?.id && (d.tipo === "cv" || d.tipo === "carta") && d.borrador?.cv && d.borrador?.carta)
        .map((d) => ({ ...d, borrador: { ...d.borrador, cv: { ...d.borrador.cv, sugeridas: d.borrador.cv.sugeridas ?? [] } } }));
    }
  } catch { /* sin almacenamiento: se trabaja con el perfil */ }
  const viejo = leerBorrador(`${CLAVE}:${uid}`);
  if (!viejo) return [];
  const ahora = Date.now();
  const cartaTocada = JSON.stringify(viejo.carta) !== JSON.stringify(cartaInicial(viejo.cv, { puesto: viejo.carta.puesto, empresa: viejo.carta.empresa }));
  return [
    { id: nuevoId(), tipo: "cv", actualizado: ahora, borrador: viejo },
    ...(cartaTocada || viejo.carta.puesto.trim() ? [{ id: nuevoId(), tipo: "carta" as const, actualizado: ahora, borrador: viejo }] : []),
  ];
}

function guardarDocumentos(uid: string, lista: Documento[]) {
  try {
    window.localStorage.setItem(`${CLAVE_DOCS}:${uid}`, JSON.stringify(lista));
    window.localStorage.removeItem(`${CLAVE}:${uid}`);
  } catch { /* sin almacenamiento */ }
}

const tituloDe = (d: Documento, en: boolean) => d.tipo === "cv"
  ? d.borrador.cv.titular.trim() || d.borrador.cv.nombre.trim() || (en ? "Resume" : "Currículum")
  : [d.borrador.carta.puesto.trim(), d.borrador.carta.empresa.trim()].filter(Boolean).join(" · ") || (en ? "Letter without a position" : "Carta sin puesto");

/** El PDF de un currículum o carta, entregado al sistema (guardar o compartir). */
async function bajarPdf(borrador: Borrador, tipo: Tipo) {
  const { pdfDelCv, pdfDeLaCarta } = await import("@/lib/cv/pdf-documento");
  const blob = tipo === "cv" ? await pdfDelCv(borrador.cv) : await pdfDeLaCarta(borrador.cv, borrador.carta);
  // En el app un <a download> no hace nada (16-nov-2026): saveFile entrega
  // el archivo al sistema (guardar o compartir), igual que las cotizaciones.
  const { saveFile } = await import("@/lib/file-download");
  await saveFile(blob, nombreDeArchivo(borrador.cv.nombre, tipo === "cv" ? "CV" : "Carta", borrador.cv.idioma));
}
const esCancelacion = (error: unknown) => /cancel/i.test(String((error as Error)?.message ?? error));

/** El panel escucha esto para cerrar el editor con la flecha de la barra. */
export const CERRAR_EDITOR_CV = "ccr:cv-close-editor";

/**
 * Espera la sesión: los documentos son de cada cuenta. Se rearma si llega el perfil.
 * `alCambiarEditor` avisa al panel cuando se abre o cierra un documento: la
 * flecha de la barra vuelve entonces a la lista (antes había un segundo
 * «< Mis currículums» debajo de la barra, 18-nov-2026).
 */
export function CvBuilder({ pro, documento = "cv", alCambiarEditor }: { pro: ProData; documento?: "cv" | "carta"; alCambiarEditor?: (abierto: boolean) => void }) {
  const { user } = useAuth();
  if (!user) return null;
  return <Documentos key={`${user.id}:${pro?.id ?? ""}:${documento}`} pro={pro} uid={user.id} tipo={documento} nombreCuenta={String(user.user_metadata?.full_name ?? "")} correo={user.email ?? ""} alCambiarEditor={alCambiarEditor} />;
}

function Documentos({ pro, uid, tipo, nombreCuenta, correo, alCambiarEditor }: { pro: ProData; uid: string; tipo: Tipo; nombreCuenta: string; correo: string; alCambiarEditor?: (abierto: boolean) => void }) {
  const idiomaApp: Idioma = useLocale() === "en" ? "en" : "es";
  const en = idiomaApp === "en";
  const desdeElPerfil = (idioma: Idioma): Borrador => {
    const cv = prellenar(datosDelPerfil(pro, nombreCuenta, correo, idioma), idioma);
    return { cv, carta: cartaInicial(cv) };
  };
  const nuevo = (docs: Documento[], vacante?: VacanteRecibida): Documento => {
    const base = desdeElPerfil(idiomaApp);
    // La carta toma el encabezado del currículum editado más reciente.
    const cv = tipo === "carta" ? (docs.filter((d) => d.tipo === "cv").sort((x, y) => y.actualizado - x.actualizado)[0]?.borrador.cv ?? base.cv) : base.cv;
    return { id: nuevoId(), tipo, actualizado: Date.now(), borrador: { cv, carta: cartaInicial(cv, vacante ?? {}) } };
  };
  // Si no hay ninguno, o se llegó desde una vacante, se abre uno nuevo directo.
  const [estado, setEstado] = useState<{ docs: Documento[]; abierto: string | null }>(() => {
    const docs = leerDocumentos(uid);
    const v = tipo === "carta" ? leerVacante() : null;
    if (!v?.puesto && !v?.empresa && docs.some((d) => d.tipo === tipo)) return { docs, abierto: null };
    const doc = nuevo(docs, v ?? undefined);
    return { docs: [doc, ...docs], abierto: doc.id };
  });
  const [borrar, setBorrar] = useState<string | null>(null);
  useEffect(() => { try { window.sessionStorage.removeItem(VACANTE); } catch { /* sin almacenamiento */ } }, []);
  useEffect(() => {
    const t = window.setTimeout(() => guardarDocumentos(uid, estado.docs), 400);
    return () => window.clearTimeout(t);
  }, [estado.docs, uid]);
  // Al salir no se pierde lo último que se escribió.
  const ultimo = useRef(estado.docs);
  useEffect(() => { ultimo.current = estado.docs; }, [estado.docs]);
  useEffect(() => () => guardarDocumentos(uid, ultimo.current), [uid]);

  const propios = estado.docs.filter((d) => d.tipo === tipo).sort((x, y) => y.actualizado - x.actualizado);
  const abierto = estado.docs.find((d) => d.id === estado.abierto && d.tipo === tipo);
  const hayAbierto = !!abierto;
  const avisarEditor = useRef(alCambiarEditor);
  useEffect(() => { avisarEditor.current = alCambiarEditor; }, [alCambiarEditor]);
  useEffect(() => {
    avisarEditor.current?.(hayAbierto);
    if (!hayAbierto) return;
    const cerrar = () => setEstado((s) => ({ ...s, abierto: null }));
    window.addEventListener(CERRAR_EDITOR_CV, cerrar);
    return () => window.removeEventListener(CERRAR_EDITOR_CV, cerrar);
  }, [hayAbierto]);
  useEffect(() => () => avisarEditor.current?.(false), []);
  const [bajando, setBajando] = useState<string | null>(null);
  const [errorPdf, setErrorPdf] = useState(false);
  const descargar = async (d: Documento) => {
    setBajando(d.id); setErrorPdf(false);
    try { await bajarPdf(d.borrador, d.tipo); } catch (error) { if (!esCancelacion(error)) setErrorPdf(true); } finally { setBajando(null); }
  };
  const lleno = propios.length >= MAX_DOCUMENTOS;
  const crear = () => setEstado((s) => { const doc = nuevo(s.docs); return { docs: [doc, ...s.docs], abierto: doc.id }; });
  const duplicar = (id: string) => setEstado((s) => {
    const original = s.docs.find((d) => d.id === id);
    if (!original) return s;
    const copia: Documento = { ...original, id: nuevoId(), actualizado: Date.now(), borrador: JSON.parse(JSON.stringify(original.borrador)) as Borrador };
    return { ...s, docs: [copia, ...s.docs] };
  });
  const eliminar = (id: string) => { setEstado((s) => ({ ...s, docs: s.docs.filter((d) => d.id !== id) })); setBorrar(null); };

  if (abierto) {
    const setBorrador: Dispatch<SetStateAction<Borrador>> = (cambio) => setEstado((s) => ({
      ...s,
      docs: s.docs.map((d) => (d.id === abierto.id ? { ...d, actualizado: Date.now(), borrador: typeof cambio === "function" ? cambio(d.borrador) : cambio } : d)),
    }));
    return <Editor key={abierto.id} pro={pro} documento={tipo} borrador={abierto.borrador} setBorrador={setBorrador} desdeElPerfil={desdeElPerfil} alVolver={() => setEstado((s) => ({ ...s, abierto: null }))} />;
  }

  const fecha = (t: number) => new Date(t).toLocaleDateString(en ? "en-US" : "es-CR", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="grid min-w-0 gap-4" data-testid="cv-documentos">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-[#162543]">{tipo === "cv" ? (en ? "My resumes" : "Mis currículums") : (en ? "My cover letters" : "Mis cartas")}</h2>
          <p className="text-[13px] leading-5 text-[#667085]">{en ? "One per job type, if you like. Saved on this device only." : "Puedes tener uno para cada tipo de puesto. Se guardan solo en este dispositivo."}</p>
        </div>
        <button type="button" disabled={lleno} onClick={crear} className={cn(pastilla, "bg-[#009FD9] text-white hover:bg-[#0089bb]")} data-testid="cv-nuevo">
          <Plus className="h-4 w-4" />{tipo === "cv" ? (en ? "New resume" : "Nuevo currículum") : (en ? "New letter" : "Nueva carta")}
        </button>
      </div>
      {errorPdf && <p role="alert" className="rounded-xl bg-[#fef3f2] px-3 py-2.5 text-[13px] text-[#912018]">{en ? "The PDF couldn't be created. Try again." : "No se pudo crear el PDF. Probá de nuevo."}</p>}
      {lleno && <p className="text-[13px] text-[#667085]">{en ? `You can keep up to ${MAX_DOCUMENTOS}. Delete one to create another.` : `Puedes guardar hasta ${MAX_DOCUMENTOS}. Elimina uno para crear otro.`}</p>}
      {propios.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#d7e1ea] bg-white px-4 py-8 text-center text-sm text-[#667085]">
          {tipo === "cv" ? (en ? "You have no resumes yet." : "Todavía no tienes currículums.") : (en ? "You have no letters yet." : "Todavía no tienes cartas.")}
        </p>
      ) : (
        <ul className="grid gap-3">
          {propios.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#e5e7eb] bg-white p-3 sm:p-4" data-testid="cv-documento">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e6f6fc] text-[#007fae]">{tipo === "cv" ? <FileText className="h-5 w-5" /> : <Mail className="h-5 w-5" />}</span>
              <button type="button" onClick={() => setEstado((s) => ({ ...s, abierto: d.id }))} className="min-h-11 min-w-0 flex-1 text-left">
                <span className="block truncate text-[15px] font-black text-[#162543]">{tituloDe(d, en)}</span>
                <span className="block text-[13px] text-[#667085]">{d.borrador.cv.idioma === "en" ? "English" : "Español"} · {en ? "Edited" : "Editado"} {fecha(d.actualizado)}</span>
              </button>
              {/* Tocar la fila abre el editor; lo demás va en el «···», como en
                  Google Docs y FlowCV (18-nov-2026). Antes eran tres íconos
                  sueltos y descargar obligaba a entrar hasta el último paso. */}
              {bajando === d.id
                ? <span className="grid h-10 w-10 shrink-0 place-items-center" role="status" aria-label={en ? "Creating PDF" : "Creando PDF"}><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#d7e1ea] border-t-[#009FD9]" /></span>
                : <MenuFicha className="shrink-0" opciones={[
                  { id: "descargar", icono: <Download className="h-[18px] w-[18px]" />, texto: en ? "Download PDF" : "Descargar PDF", onSelect: () => void descargar(d) },
                  ...(lleno ? [] : [{ id: "duplicar", icono: <CopyPlus className="h-[18px] w-[18px]" />, texto: en ? "Duplicate" : "Duplicar", onSelect: () => duplicar(d.id) }]),
                  { id: "eliminar", icono: <Trash2 className="h-[18px] w-[18px]" />, texto: en ? "Delete" : "Eliminar", onSelect: () => setBorrar(d.id), peligro: true },
                ]} />}
              {borrar === d.id && (
                <div role="alert" className="flex basis-full flex-wrap items-center justify-between gap-2 rounded-xl bg-[#fef3f2] px-3 py-2.5 text-[13px] text-[#912018]">
                  <span>{en ? `Delete "${tituloDe(d, en)}"? This can't be undone.` : `¿Eliminar "${tituloDe(d, en)}"? No se puede deshacer.`}</span>
                  <span className="flex gap-2">
                    <button type="button" onClick={() => setBorrar(null)} className="h-11 rounded-full px-3 font-semibold text-[#52627a] hover:bg-white">{en ? "Cancel" : "Cancelar"}</button>
                    <button type="button" onClick={() => eliminar(d.id)} className="h-11 rounded-full bg-[#b42318] px-4 font-bold text-white">{en ? "Delete" : "Eliminar"}</button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type PasoCv = "contacto" | "experiencia" | "educacion" | "habilidades" | "perfil" | "extras" | "revisar";
type PasoCarta = "contenido" | "revisar";
// EL RESUMEN VA SEGUNDO (18-nov-2026), justo después del contacto, como en
// FlowCV, Resume.io y los demás armadores: es lo primero que se lee en el CV.
// «Más secciones» (opcional) antes de revisar, como el «Agregar contenido» de FlowCV.
const PASOS_CV: PasoCv[] = ["contacto", "perfil", "experiencia", "educacion", "habilidades", "extras", "revisar"];
const PASOS_CARTA: PasoCarta[] = ["contenido", "revisar"];
const NOMBRE_PASO: Record<PasoCv | PasoCarta, { es: string; en: string }> = {
  contacto: { es: "Contacto", en: "Contact" },
  experiencia: { es: "Experiencia", en: "Experience" },
  educacion: { es: "Educación", en: "Education" },
  habilidades: { es: "Habilidades", en: "Skills" },
  perfil: { es: "Resumen", en: "Summary" },
  extras: { es: "Más secciones", en: "More sections" },
  revisar: { es: "Revisar y descargar", en: "Review & download" },
  contenido: { es: "Escribir", en: "Write" },
};

/**
 * MÁS SECCIONES (18-nov-2026): Proyectos, Referencias y secciones con nombre
 * propio. Todas opcionales: cerradas, solo un botón para sumarlas; abiertas
 * cuando ya tienen algo. Lo que queda en blanco no sale en el documento.
 */
function MasSecciones({ cv, setCv, en }: { cv: CvDocumento; setCv: (cambio: Partial<CvDocumento>) => void; en: boolean }) {
  const t = TITULOS[cv.idioma];
  const proyectos = cv.proyectos ?? [], referencias = cv.referencias ?? [], secciones = cv.secciones ?? [];
  const [abiertas, setAbiertas] = useState(() => new Set<string>([proyectos.length ? "proyectos" : "", referencias.length ? "referencias" : ""].filter(Boolean)));
  const abrir = (k: string) => setAbiertas((a) => new Set(a).add(k));
  const cambiarRef = (i: number, cambio: Partial<Referencia>) => setCv({ referencias: referencias.map((r, j) => (j === i ? { ...r, ...cambio } : r)) });
  const cambiarSec = (i: number, cambio: Partial<SeccionLibre>) => setCv({ secciones: secciones.map((x, j) => (j === i ? { ...x, ...cambio } : x)) });
  const quitar = "inline-flex h-9 items-center gap-1.5 justify-self-start rounded-full px-2 text-[13px] font-semibold text-[#b42318] hover:bg-[#fef3f2]";
  const sumar = cn(pastilla, "border border-dashed border-[#b9c8d6] bg-white text-[#162543] hover:border-[#009FD9] hover:text-[#007fae]");
  return (
    <div className="grid gap-4">
      <p className="text-[13px] leading-5 text-[#667085]">{en ? "Optional. Add only what helps for the job you want; empty sections don't appear." : "Opcional. Sumá solo lo que ayude para el puesto que buscás; lo que quede vacío no sale en el CV."}</p>
      {abiertas.has("proyectos") && (
        <Tarjeta titulo={t.proyectos} ayuda={en ? "Freelance jobs, personal projects or notable work." : "Trabajos por cuenta propia, proyectos personales u obras destacadas."}>
          <Entradas tipo="proyecto" en={en} lista={proyectos} alCambiar={(lista) => setCv({ proyectos: lista })} />
        </Tarjeta>
      )}
      {secciones.map((x, i) => (
        <Tarjeta key={i} titulo={x.titulo.trim() || (en ? "New section" : "Sección nueva")}>
          <div className="grid gap-3">
            <Input label={en ? "Section name" : "Nombre de la sección"} placeholder={en ? "E.g. Volunteering" : "Ej.: Voluntariado"} value={x.titulo} maxLength={60} onChange={(e) => cambiarSec(i, { titulo: e.target.value })} />
            <label className="grid gap-1">
              <span className="text-sm font-semibold text-[#162543]">{en ? "Content" : "Contenido"}</span>
              <textarea rows={4} maxLength={1000} value={x.texto} onChange={(e) => cambiarSec(i, { texto: e.target.value })} className={campo} />
            </label>
            <button type="button" onClick={() => setCv({ secciones: secciones.filter((_, j) => j !== i) })} className={quitar}><Trash2 className="h-4 w-4" /> {en ? "Remove section" : "Quitar sección"}</button>
          </div>
        </Tarjeta>
      ))}
      {abiertas.has("referencias") && (
        <Tarjeta titulo={t.referencias} ayuda={en ? "Ask first whether they agree to be contacted." : "Preguntales antes si están de acuerdo en que les llamen."}>
          <div className="grid gap-3">
            {referencias.map((r, i) => (
              <div key={i} className="grid gap-3 rounded-xl border border-[#eef2f6] bg-[#fbfcfd] p-3">
                <div className="grid gap-3 @[560px]:grid-cols-2">
                  <Input label={en ? "Name" : "Nombre"} value={r.nombre} maxLength={120} onChange={(e) => cambiarRef(i, { nombre: e.target.value })} />
                  <Input label={en ? "Role and company" : "Cargo y empresa"} placeholder={en ? "E.g. Manager, Hotel Atenas" : "Ej.: Gerente, Hotel Atenas"} value={r.cargo} maxLength={160} onChange={(e) => cambiarRef(i, { cargo: e.target.value })} />
                  <div className="@[560px]:col-span-2"><Input label={en ? "Phone or email" : "Teléfono o correo"} value={r.contacto} maxLength={160} onChange={(e) => cambiarRef(i, { contacto: e.target.value })} /></div>
                </div>
                <button type="button" onClick={() => setCv({ referencias: referencias.filter((_, j) => j !== i) })} className={quitar}><Trash2 className="h-4 w-4" /> {en ? "Remove" : "Quitar"}</button>
              </div>
            ))}
            <button type="button" onClick={() => setCv({ referencias: [...referencias, { nombre: "", cargo: "", contacto: "" }] })} className={cn(pastilla, "justify-self-start border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb]")}>
              <Plus className="h-4 w-4" /> {en ? "Add reference" : "Agregar referencia"}
            </button>
          </div>
        </Tarjeta>
      )}
      <div className="flex flex-wrap gap-2">
        {!abiertas.has("proyectos") && <button type="button" onClick={() => { abrir("proyectos"); if (!proyectos.length) setCv({ proyectos: [{ title: "", organization: "", period: "", description: "" }] }); }} className={sumar}><Plus className="h-4 w-4" />{t.proyectos}</button>}
        {!abiertas.has("referencias") && <button type="button" onClick={() => { abrir("referencias"); if (!referencias.length) setCv({ referencias: [{ nombre: "", cargo: "", contacto: "" }] }); }} className={sumar}><Plus className="h-4 w-4" />{t.referencias}</button>}
        {secciones.length < 3 && <button type="button" onClick={() => setCv({ secciones: [...secciones, { titulo: "", texto: "" }] })} className={sumar}><Plus className="h-4 w-4" />{en ? "Custom section" : "Sección propia"}</button>}
      </div>
    </div>
  );
}

function Pasos<T extends PasoCv | PasoCarta>({ pasos, actual, hechos, alElegir, en }: { pasos: T[]; actual: T; hechos: Set<T>; alElegir: (p: T) => void; en: boolean }) {
  const indice = pasos.indexOf(actual);
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      <div className="flex items-center justify-between text-xs font-semibold text-[#52627a]">
        <span>{en ? `Step ${indice + 1} of ${pasos.length}` : `Paso ${indice + 1} de ${pasos.length}`}</span>
        <span className="text-[#162543]">{NOMBRE_PASO[actual][en ? "en" : "es"]}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#eef3f7]" aria-hidden>
        <div className="h-full rounded-full bg-[#009FD9] transition-[width] duration-300" style={{ width: `${((indice + 1) / pasos.length) * 100}%` }} />
      </div>
      {/* En el teléfono los pasos caben en una fila (solo el número; el nombre
          del paso actual va arriba). Antes la fila se deslizaba de lado. */}
      <ol className="grid gap-1.5 @[640px]:flex @[640px]:flex-wrap" style={{ gridTemplateColumns: `repeat(${pasos.length}, minmax(0, 1fr))` }}>
        {pasos.map((paso, i) => (
          <li key={paso} className="min-w-0 @[640px]:shrink-0">
            <button
              type="button"
              onClick={() => alElegir(paso)}
              aria-current={paso === actual ? "step" : undefined}
              className={cn(
                "inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full border px-0 text-[13px] font-semibold transition-colors @[640px]:w-auto @[640px]:px-3",
                paso === actual ? "border-[#009FD9] bg-[#eef8fd] text-[#007fae]" : "border-[#e5e7eb] bg-white text-[#52627a] hover:text-[#162543]",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
                  paso === actual ? "bg-[#009FD9] text-white" : hechos.has(paso) ? "bg-[#d1f0e0] text-[#067647]" : "bg-[#eef3f7] text-[#52627a]",
                )}
              >
                {hechos.has(paso) && paso !== actual ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : i + 1}
              </span>
              <span className="sr-only @[640px]:not-sr-only">{NOMBRE_PASO[paso][en ? "en" : "es"]}</span>
              {hechos.has(paso) && paso !== actual && <span className="sr-only">{en ? " (done)" : " (completo)"}</span>}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * «LLENAR DESDE MI CV»: si la persona ya tiene su CV en un archivo (el que
 * adjuntó en Formación u otro), se lee aquí mismo y se suma a lo que ya hay.
 * Usa el mismo lector que Formación; nada se borra y todo queda editable.
 */
function LlenarDesdeCv({ professionalId, vacio, en, alLeer }: { professionalId: string; vacio: boolean; en: boolean; alLeer: (leido: unknown) => number }) {
  const endpoint = professionalId ? `/api/professional-cv?professionalId=${encodeURIComponent(professionalId)}` : "";
  const [adjunto, setAdjunto] = useState<{ name: string } | null>(null);
  // Hasta saber si hay CV en el perfil se muestra el esqueleto: antes salía
  // "¿Ya tenés un CV?" y al rato cambiaba a "Tenés un CV en tu perfil" (parpadeo).
  const [listo, setListo] = useState(!endpoint);
  const [leyendo, setLeyendo] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!endpoint) return;
    const abort = new AbortController();
    fetch(`${endpoint}&metadata=1`, { cache: "no-store", signal: abort.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.file?.name) setAdjunto({ name: String(d.file.name) }); })
      .catch(() => { /* sin CV adjunto: queda la opción de elegir un archivo */ })
      .finally(() => { if (!abort.signal.aborted) setListo(true); });
    return () => abort.abort();
  }, [endpoint]);

  const leer = async (obtener: () => Promise<File>) => {
    setLeyendo(true); setMensaje(null);
    try {
      const archivo = await obtener();
      const { readCvFile, CvReadError } = await import("@/lib/cv/read-file");
      const { reviewCv } = await import("@/lib/cv/model");
      let texto: string;
      try { texto = await readCvFile(archivo); } catch (err) {
        const codigo = err instanceof CvReadError ? err.code : "unreadable";
        const textos: Record<string, [string, string]> = {
          format: ["Elegí un PDF o un Word (.docx).", "Choose a PDF or a Word file (.docx)."],
          size: ["El archivo está vacío o pesa más de 5 MB.", "The file is empty or larger than 5 MB."],
          protected: ["El archivo tiene contraseña. Exportá una copia sin contraseña.", "The file is password-protected. Export an unprotected copy."],
        };
        const [es, eng] = textos[codigo] ?? ["No pudimos leerlo. Usá un PDF con texto seleccionable o un Word.", "We couldn't read it. Use a PDF with selectable text or a Word file."];
        throw new Error(en ? eng : es);
      }
      const n = alLeer(reviewCv(texto).profile);
      setMensaje(n
        ? { tipo: "ok", texto: en ? `Added ${n} item${n === 1 ? "" : "s"}. Review them in each step.` : `Agregamos ${n} dato${n === 1 ? "" : "s"}. Revisalos en cada paso.` }
        : { tipo: "ok", texto: en ? "Everything in that CV is already here." : "Todo lo de ese CV ya estaba aquí." });
    } catch (err) {
      setMensaje({ tipo: "error", texto: err instanceof Error && err.message ? err.message : (en ? "We couldn't read it." : "No pudimos leerlo.") });
    } finally { setLeyendo(false); }
  };
  const usarAdjunto = () => leer(async () => {
    const r = await fetch(endpoint, { cache: "no-store" });
    if (!r.ok) throw new Error(en ? "We couldn't open the CV on your profile." : "No pudimos abrir el CV de tu perfil.");
    const blob = await r.blob();
    return new File([blob], adjunto?.name || "cv", { type: blob.type });
  });
  const destacado = vacio && !!adjunto;

  if (!listo) {
    return (
      <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4" aria-busy="true" data-testid="cv-llenar-cargando">
        <div className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <Skeleton className="h-4 w-1/2 rounded-full" />
            <Skeleton className="h-3 w-5/6 rounded-full" />
          </div>
        </div>
        <Skeleton className="mt-3 h-11 w-full rounded-full" />
      </section>
    );
  }

  return (
    <section className={cn("rounded-2xl border p-4", destacado ? "border-[#9fd8ee] bg-[#f1faff]" : "border-[#e5e7eb] bg-white")}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e6f6fc] text-[#007fae]"><FileUp className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-black text-[#162543]">
            {destacado ? (en ? "You have a CV on your profile" : "Tenés un CV en tu perfil") : (en ? "Already have a CV?" : "¿Ya tenés un CV?")}
          </h3>
          <p className="mt-0.5 text-[13px] leading-5 text-[#667085]">
            {destacado
              ? (en ? "Shall we use it to fill this in? Nothing you wrote is deleted." : "¿Lo usamos para llenar esto? No se borra nada de lo que ya tenés.")
              : (en ? "Fill this in from your file (PDF or Word). Nothing you wrote is deleted." : "Llenalo desde tu archivo (PDF o Word). No se borra nada de lo que ya tenés.")}
          </p>
        </div>
      </div>
      <input ref={input} hidden type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label={en ? "Choose CV file" : "Elegir archivo del CV"} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void leer(async () => f); }} />
      <div className="mt-3 grid gap-2 @[560px]:grid-cols-2">
        {adjunto && (
          <button type="button" disabled={leyendo} onClick={() => void usarAdjunto()} className={cn(pastilla, "bg-[#009FD9] text-white hover:bg-[#0089bb]")}>
            <FileText className="h-4 w-4" />{en ? "Use my profile CV" : "Usar el CV de mi perfil"}
          </button>
        )}
        <button type="button" disabled={leyendo} onClick={() => input.current?.click()} className={cn(pastilla, "border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f8fafc]")}>
          <FileUp className="h-4 w-4" />{adjunto ? (en ? "Choose another file" : "Elegir otro archivo") : (en ? "Choose file" : "Elegir archivo")}
        </button>
      </div>
      {leyendo && <p role="status" className="mt-2 text-[13px] text-[#667085]">{en ? "Reading your CV…" : "Leyendo tu CV…"}</p>}
      {mensaje && <p role={mensaje.tipo === "error" ? "alert" : "status"} className={cn("mt-2 text-[13px] font-semibold", mensaje.tipo === "error" ? "text-[#b42318]" : "text-[#067647]")}>{mensaje.texto}</p>}
    </section>
  );
}

/**
 * «REVISAR PARA UNA VACANTE» (opcional, al final): se pega el anuncio y se ve
 * qué palabras clave ya tiene el currículum y cuáles no. Solo informa: no
 * reescribe ni agrega nada, para no meter en el CV algo que la persona no tiene.
 */
function RevisarVacante({ cv, en }: { cv: CvDocumento; en: boolean }) {
  const [texto, setTexto] = useState("");
  const resultado = useMemo(() => (texto.trim().length >= 40 ? palabrasClave(texto, cv) : null), [texto, cv]);
  const chips = (lista: string[], clase: string) => (
    <ul className="mt-1.5 flex flex-wrap gap-1.5">{lista.map((p) => <li key={p} className={cn("rounded-full px-2.5 py-1 text-[12px] font-semibold", clase)}>{p}</li>)}</ul>
  );
  return (
    <details className="group rounded-xl border border-[#e5e7eb] px-3" data-testid="cv-revisar-vacante">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[13px] font-black text-[#162543]">
        <Search className="h-4 w-4 text-[#007fae]" />{en ? "Check against a job post (optional)" : "Revisar para una vacante (opcional)"}
        <ChevronRight className="ml-auto h-4 w-4 text-[#98a2b3] transition-transform group-open:rotate-90" />
      </summary>
      <div className="grid gap-2 pb-3">
        <p className="text-[13px] leading-5 text-[#667085]">{en ? "Paste the job post. We show which keywords your resume already has and which are missing. Nothing is changed." : "Pega el anuncio. Te mostramos qué palabras clave ya tiene tu currículum y cuáles faltan. No cambiamos nada."}</p>
        <textarea rows={5} maxLength={6000} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label={en ? "Job post" : "Anuncio de la vacante"} placeholder={en ? "Paste the job post here" : "Pega aquí el anuncio"} className={campo} />
        {resultado && (
          <div className="grid gap-2" role="status">
            <p className="text-[13px] font-black text-[#162543]">{en ? `${resultado.puntaje}% of the keywords match` : `Coincide el ${resultado.puntaje} % de las palabras clave`}</p>
            {resultado.estan.length > 0 && <div><p className="text-xs font-semibold text-[#067647]">{en ? "Already in your resume" : "Ya están en tu currículum"}</p>{chips(resultado.estan, "bg-[#ecfdf3] text-[#067647]")}</div>}
            {resultado.faltan.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#93370d]">{en ? "Not in your resume" : "No aparecen"}</p>
                {chips(resultado.faltan, "bg-[#fffaeb] text-[#93370d]")}
                <p className="mt-1.5 text-[12px] leading-4 text-[#667085]">{en ? "Add them only if they are true for you, in your own words, in skills or achievements." : "Agrégalas solo si de verdad las tienes, con tus palabras, en habilidades o en tus logros."}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

/**
 * «USAR EN MI PERFIL»: el currículum terminado pasa a ser el PDF de «Ver PDF»
 * en el perfil público. Se sube sin correo ni teléfono (al profesional se le
 * escribe por ContrataCR) y reemplaza el archivo que hubiera.
 */
function UsarEnMiPerfil({ professionalId, cv, en, avisar }: { professionalId: string; cv: CvDocumento; en: boolean; avisar: (t: string) => void }) {
  const [paso, setPaso] = useState<"inicio" | "confirmar" | "subiendo">("inicio");
  const subir = async () => {
    setPaso("subiendo");
    try {
      const endpoint = `/api/professional-cv?professionalId=${encodeURIComponent(professionalId)}`;
      const meta = await fetch(`${endpoint}&metadata=1`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { file?: { version?: string } | null } | null;
      const { pdfDelCv } = await import("@/lib/cv/pdf-documento");
      const blob = await pdfDelCv({ ...cv, correo: "", telefono: "" });
      const form = new FormData();
      form.append("file", new File([blob], nombreDeArchivo(cv.nombre, "CV", cv.idioma), { type: "application/pdf" }));
      form.append("share", "true");
      form.append("version", meta?.file?.version ?? "");
      const r = await fetch(endpoint, { method: "POST", body: form });
      if (!r.ok) throw new Error(String(r.status));
      avisar(en ? "Done: it's on your profile" : "Listo: ya está en tu perfil");
      setPaso("inicio");
    } catch {
      avisar(en ? "It couldn't be added to your profile. Try again." : "No se pudo poner en tu perfil. Prueba de nuevo.");
      setPaso("confirmar");
    }
  };
  if (paso === "inicio") {
    return (
      <button type="button" onClick={() => setPaso("confirmar")} className={cn(pastilla, "w-full border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb]")} data-testid="cv-usar-en-perfil">
        <UserRound className="h-4 w-4" />{en ? "Use on my profile" : "Usar en mi perfil"}
      </button>
    );
  }
  return (
    <div role="alert" className="grid gap-2 rounded-xl bg-[#f1faff] px-3 py-2.5 text-[13px] leading-5 text-[#162543]">
      <span>{en ? "Clients will see this resume when they tap \"View PDF\" on your profile. It goes without your email or phone, and replaces the file you had." : "Los clientes verán este currículum al tocar \"Ver PDF\" en tu perfil. Va sin tu correo ni tu teléfono y reemplaza el archivo que tenías."}</span>
      <span className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={paso === "subiendo"} onClick={() => setPaso("inicio")} className="h-11 rounded-full px-3 font-semibold text-[#52627a] hover:bg-white">{en ? "Cancel" : "Cancelar"}</button>
        <button type="button" disabled={paso === "subiendo"} onClick={() => void subir()} className="h-11 rounded-full bg-[#009FD9] px-4 font-bold text-white disabled:opacity-60">{paso === "subiendo" ? (en ? "Uploading…" : "Subiendo…") : (en ? "Put it on my profile" : "Ponerlo en mi perfil")}</button>
      </span>
    </div>
  );
}

function Editor({ pro, documento, borrador, setBorrador, desdeElPerfil, alVolver }: { pro: ProData; documento: Tipo; borrador: Borrador; setBorrador: Dispatch<SetStateAction<Borrador>>; desdeElPerfil: (idioma: Idioma) => Borrador; alVolver: () => void }) {
  const idiomaApp: Idioma = useLocale() === "en" ? "en" : "es";
  const en = idiomaApp === "en";
  const pestana = documento;
  const [pasoCv, setPasoCv] = useState<PasoCv>("contacto");
  const [pasoCarta, setPasoCarta] = useState<PasoCarta>("contenido");
  // El ✓ es "ya pasaste por aquí y quedó completo", no "el dato existe": al
  // abrir por primera vez el CV viene lleno desde el perfil y todos los pasos
  // salían marcados sin haberlos visto (16-nov-2026). Se anota el paso que se
  // deja al moverse.
  const [visitados, setVisitados] = useState<Set<string>>(() => new Set());
  const dejar = (p: string) => setVisitados((v) => (v.has(p) ? v : new Set(v).add(p)));
  const [verHoja, setVerHoja] = useState(false);
  const [aviso, setAviso] = useState("");
  const [generando, setGenerando] = useState(false);
  const arriba = useRef<HTMLDivElement>(null);

  const { cv, carta } = borrador;
  const setCv = (cambio: Partial<CvDocumento>) => setBorrador((b) => ({ ...b, cv: { ...b.cv, ...cambio } }));
  const setCarta = (cambio: Partial<Carta>) => setBorrador((b) => ({ ...b, carta: { ...b.carta, ...cambio } }));
  const avisos = useMemo(() => (pestana === "cv" ? revisarCv(cv) : revisarCarta(carta)), [pestana, cv, carta]);
  const sumarArchivo = (leido: unknown) => {
    const { cv: nuevo, agregadas } = sumarDesdeArchivo(cv, leido);
    if (agregadas) setCv(nuevo);
    return agregadas;
  };

  const hechosCv = useMemo(() => new Set<PasoCv>(([
    ["contacto", !!cv.nombre.trim() && !!(cv.correo.trim() || cv.telefono.trim())],
    ["experiencia", cv.experiencia.some((e) => e.title.trim())],
    ["educacion", cv.educacion.some((e) => e.title.trim())],
    ["habilidades", cv.habilidades.length >= 4 && cv.habilidades.length <= LIMITES.habilidades],
    ["perfil", cv.resumen.trim().length >= 80],
  ] as [PasoCv, boolean][]).filter(([p, ok]) => ok && visitados.has(`cv:${p}`)).map(([p]) => p)), [cv, visitados]);
  const hechosCarta = useMemo(() => new Set<PasoCarta>(([
    ["contenido", !!carta.puesto.trim() && !revisarCarta(carta).some((a) => a.id === "corchetes")],
  ] as [PasoCarta, boolean][]).filter(([p, ok]) => ok && visitados.has(`carta:${p}`)).map(([p]) => p)), [carta, visitados]);

  const irA = (accion: () => void) => { accion(); window.setTimeout(() => arriba.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); };
  const pasos: string[] = pestana === "cv" ? PASOS_CV : PASOS_CARTA;
  const paso = pestana === "cv" ? pasoCv : pasoCarta;
  const indice = pasos.indexOf(paso);
  const mover = (delta: number) => irA(() => {
    const siguiente = pasos[Math.max(0, Math.min(pasos.length - 1, indice + delta))];
    dejar(`${pestana}:${paso}`);
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
      await bajarPdf({ cv, carta }, pestana);
    } catch (error) {
      // Cerrar la hoja de compartir sin elegir nada no es un error.
      if (esCancelacion(error)) return;
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
      <div className="grid gap-4">
      <LlenarDesdeCv professionalId={String(pro?.id ?? "")} vacio={!cv.experiencia.length && !cv.educacion.length} en={en} alLeer={sumarArchivo} />
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
      </div>
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
      <Tarjeta titulo={tituloCv.resumen} ayuda={en ? "2–3 lines at the top of your CV: what you do, your experience and your strengths." : "2 o 3 líneas que van arriba en tu CV: qué hacés, tu experiencia y en qué sos fuerte."}>
        <textarea rows={5} maxLength={600} value={cv.resumen} onChange={(e) => setCv({ resumen: e.target.value })} className={campo} />
        <div className="mt-1 flex items-center justify-between gap-2">
          <button type="button" onClick={() => setCv({ resumen: baseDelPerfil() })} className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-[#007fae] hover:bg-[#eef6fb]">
            <Lightbulb className="h-4 w-4" />{en ? "Start from a template" : "Empezar con una base"}
          </button>
          <span className="text-xs text-[#98a2b3]">{cv.resumen.length}/600</span>
        </div>
      </Tarjeta>
    ),
    extras: <MasSecciones cv={cv} setCv={setCv} en={en} />,
    revisar: null,
  };
  const pasoDeLaCarta: Record<PasoCarta, ReactNode> = {
    // Un solo paso para escribir (16-nov-2026): el puesto ya no es un paso
    // aparte al inicio; va arriba, como un dato más de la carta.
    contenido: (
      <>
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
        {([
          ["apertura", en ? "Which job are you applying for?" : "¿A qué puesto te postulás?", en ? "Say the position and how you found it." : "Decilo y contá cómo lo encontraste."],
          ["porQueEncajo", en ? "What shows you can do this job?" : "¿Qué muestra que podés hacer este trabajo?", en ? "2–3 achievements from your resume, with numbers." : "2 o 3 logros de tu currículum, con números."],
          ["porQueLaEmpresa", en ? "Why this company?" : "¿Por qué esta empresa?", en ? "Something specific about them." : "Algo concreto de ellos."],
          ["cierre", en ? "How do you want to close?" : "¿Cómo querés cerrar?", en ? "Invite them to talk and say thanks." : "Invitá a conversar y agradecé."],
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
      </div>
      <div>
        <p className="mb-2 text-[13px] font-black text-[#162543]">{en ? "Review before sending" : "Revisión antes de enviar"}</p>
        <Revision avisos={avisos} idiomaApp={idiomaApp} />
      </div>
      {pestana === "cv" && <RevisarVacante cv={cv} en={en} />}
      <div className="grid gap-2 @[560px]:grid-cols-2">
        <button type="button" disabled={generando} onClick={() => void descargar()} className={cn(pastilla, "w-full bg-[#009FD9] text-white hover:bg-[#0089bb]")}>
          <Download className="h-4 w-4" />{pestana === "cv" ? (en ? "Download resume (PDF)" : "Descargar currículum (PDF)") : (en ? "Download letter (PDF)" : "Descargar carta (PDF)")}
        </button>
        <button type="button" onClick={() => void copiar()} className={cn(pastilla, "w-full border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb]")}>
          {pestana === "cv" ? <Copy className="h-4 w-4" /> : <Mail className="h-4 w-4" />}{en ? "Copy as text" : "Copiar como texto"}
        </button>
      </div>
      {pestana === "cv" && pro?.id && <UsarEnMiPerfil professionalId={String(pro.id)} cv={cv} en={en} avisar={avisar} />}
      <p role="status" aria-live="polite" className="-mt-2 min-h-4 text-center text-xs font-semibold text-[#067647]">{aviso}</p>
      <Link href={pestana === "cv" ? "/dashboard/profesional?tab=carta" : "/dashboard/profesional?tab=cv"} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-bold text-[#007fae] hover:bg-[#eef6fb]">
        {pestana === "cv" ? (en ? "Next: your cover letter" : "Siguiente: tu carta de presentación") : (en ? "See my resume" : "Ver mi currículum")}<ChevronRight className="h-4 w-4" />
      </Link>
      <p className="-mt-2 text-center text-[11px] leading-4 text-[#98a2b3]">{en ? "Your resumes and letters are saved on this device only." : "Tus currículums y cartas se guardan solo en este dispositivo."}</p>
    </div>
  );

  return (
    // El ancho que manda es el del panel, no el de la pantalla: lado a lado
    // solo cuando el panel mide 980 px o más; si no, la hoja va abajo.
    <div ref={arriba} className="@container grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] scroll-mt-24 gap-4 overflow-x-clip" data-testid="cv-builder">
      {/* Debajo de lg la barra ya tiene la flecha que vuelve a la lista. */}
      <button type="button" onClick={alVolver} className="hidden min-h-11 items-center gap-1 justify-self-start rounded-full pr-3 text-sm font-bold text-[#007fae] hover:bg-[#eef6fb] lg:inline-flex" data-testid="cv-volver-lista">
        <ChevronLeft className="h-4 w-4" />{pestana === "cv" ? (en ? "My resumes" : "Mis currículums") : (en ? "My cover letters" : "Mis cartas")}
      </button>
      {pestana === "cv"
        ? <Pasos en={en} pasos={PASOS_CV} actual={pasoCv} hechos={hechosCv} alElegir={(p) => irA(() => { dejar(`cv:${pasoCv}`); setPasoCv(p); })} />
        : <Pasos en={en} pasos={PASOS_CARTA} actual={pasoCarta} hechos={hechosCarta} alElegir={(p) => irA(() => { dejar(`carta:${pasoCarta}`); setPasoCarta(p); })} />}

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
