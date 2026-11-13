"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { AlertCircle, CheckCircle2, Copy, Download, FileText, Lightbulb, Mail, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { getCantonById, getProvinceById } from "@/lib/data/cr-geography";
import { getCategoryLabel } from "@/lib/data/categories";
import { languageLabel } from "@/lib/data/languages";
import { blankDates, parseCvDates, serializeCvDates, type CvDates } from "@/lib/cv/dates";
import type { CvEntry } from "@/lib/cv/model";
import {
  TITULOS, cartaComoTexto, cartaInicial, cuerpoDeLaCarta, cvComoTexto, fechasAts, nombreDeArchivo, palabrasClave, prellenar, revisarCarta, revisarCv,
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

const CLAVE = "ccr:cv-borrador:v1";
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
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
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
    <div className="grid gap-2 sm:grid-cols-2">
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
          <div className="grid gap-3 sm:grid-cols-2">
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
    return guardado?.cv && guardado?.carta ? { ...guardado, vacante: guardado.vacante ?? "" } : null;
  } catch { return null; /* sin almacenamiento: se trabaja con el perfil */ }
}

/** Espera la sesión: el borrador es de cada cuenta. Se rearma si llega el perfil. */
export function CvBuilder({ pro }: { pro: ProData }) {
  const { user } = useAuth();
  if (!user) return null;
  const clave = `${CLAVE}:${user.id}`;
  return <Editor key={`${clave}:${pro?.id ?? ""}`} pro={pro} clave={clave} nombreCuenta={String(user.user_metadata?.full_name ?? "")} correo={user.email ?? ""} />;
}

function Editor({ pro, clave, nombreCuenta, correo }: { pro: ProData; clave: string; nombreCuenta: string; correo: string }) {
  const idiomaApp: Idioma = useLocale() === "en" ? "en" : "es";
  const en = idiomaApp === "en";
  const desdeElPerfil = (idioma: Idioma): Borrador => {
    const cv = prellenar(datosDelPerfil(pro, nombreCuenta, correo, idioma), idioma);
    return { cv, carta: cartaInicial(cv), vacante: "" };
  };
  // El borrador vive en este dispositivo. Si no hay, se arma desde el perfil.
  const [borrador, setBorrador] = useState<Borrador>(() => leerBorrador(clave) ?? desdeElPerfil(idiomaApp));
  const [pestana, setPestana] = useState<"cv" | "carta">("cv");
  const [verHoja, setVerHoja] = useState(false);
  const [aviso, setAviso] = useState("");
  const [generando, setGenerando] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => { try { window.localStorage.setItem(clave, JSON.stringify(borrador)); } catch { /* sin almacenamiento */ } }, 400);
    return () => window.clearTimeout(t);
  }, [borrador, clave]);

  const { cv, carta, vacante } = borrador;
  const setCv = (cambio: Partial<CvDocumento>) => setBorrador((b) => ({ ...b, cv: { ...b.cv, ...cambio } }));
  const setCarta = (cambio: Partial<Carta>) => setBorrador((b) => ({ ...b, carta: { ...b.carta, ...cambio } }));
  const avisos = useMemo(() => (pestana === "cv" ? revisarCv(cv) : revisarCarta(carta)), [pestana, cv, carta]);
  const coincidencia = useMemo(() => (vacante.trim().length > 30 ? palabrasClave(vacante, cv) : null), [vacante, cv]);

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
    <div className="mx-auto aspect-[8.5/11] w-full max-w-[430px] overflow-hidden rounded-lg bg-white p-6 shadow-[0_12px_40px_-18px_rgba(22,37,67,0.45)] ring-1 ring-[#e5e7eb]" data-testid="cv-hoja">
      {pestana === "cv" ? <HojaCv cv={cv} /> : <HojaCarta cv={cv} carta={carta} />}
    </div>
  );

  return (
    <div className="grid gap-4" data-testid="cv-builder">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmentos etiqueta={en ? "Document" : "Documento"} valor={pestana} alCambiar={setPestana} opciones={[{ id: "cv", texto: en ? "Resume" : "CV" }, { id: "carta", texto: en ? "Cover letter" : "Carta de presentación" }]} />
        <div className="flex flex-wrap items-center gap-2">
          <Segmentos etiqueta={en ? "Document language" : "Idioma del documento"} valor={cv.idioma} alCambiar={cambiarIdioma} opciones={[{ id: "es", texto: "Español" }, { id: "en", texto: "English" }]} />
          <Segmentos<Plantilla> etiqueta={en ? "Template" : "Plantilla"} valor={cv.plantilla} alCambiar={(plantilla) => setCv({ plantilla })} opciones={[{ id: "clasica", texto: en ? "Classic" : "Clásica" }, { id: "moderna", texto: en ? "Modern" : "Moderna" }]} />
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,430px)]">
        <div className="grid min-w-0 gap-4">
          {pestana === "cv" ? (
            <>
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label={en ? "Full name" : "Nombre completo"} value={cv.nombre} maxLength={120} onChange={(e) => setCv({ nombre: e.target.value })} />
                  <Input label={en ? "Headline" : "Título"} placeholder={en ? "Residential electrician" : "Electricista residencial"} value={cv.titular} maxLength={120} onChange={(e) => setCv({ titular: e.target.value })} />
                  <Input label={en ? "Email" : "Correo"} type="email" value={cv.correo} maxLength={160} onChange={(e) => setCv({ correo: e.target.value })} />
                  <Input label={en ? "Phone" : "Teléfono"} inputMode="tel" value={cv.telefono} maxLength={40} onChange={(e) => setCv({ telefono: e.target.value })} />
                  <Input label={en ? "Location" : "Ubicación"} value={cv.ubicacion} maxLength={120} onChange={(e) => setCv({ ubicacion: e.target.value })} />
                  <Input label={en ? "Link (profile or portfolio)" : "Enlace (perfil o portafolio)"} value={cv.enlace} maxLength={200} onChange={(e) => setCv({ enlace: e.target.value })} />
                </div>
              </Tarjeta>
              <Tarjeta titulo={TITULOS[cv.idioma].resumen} ayuda={en ? "2–3 lines: what you do, your experience and your strengths." : "2 o 3 líneas: qué hacés, tu experiencia y en qué sos fuerte."}>
                <textarea rows={4} maxLength={600} value={cv.resumen} onChange={(e) => setCv({ resumen: e.target.value })} className={campo} />
                <p className="mt-1 text-right text-xs text-[#98a2b3]">{cv.resumen.length}/600</p>
              </Tarjeta>
              <Tarjeta titulo={TITULOS[cv.idioma].experiencia} ayuda={en ? "Most recent first. Start each achievement with a verb and add numbers." : "Lo más reciente primero. Empezá cada logro con un verbo y agregá números."}>
                <Entradas tipo="experiencia" en={en} lista={cv.experiencia} alCambiar={(experiencia) => setCv({ experiencia })} />
              </Tarjeta>
              <Tarjeta titulo={TITULOS[cv.idioma].educacion}>
                <Entradas tipo="educacion" en={en} lista={cv.educacion} alCambiar={(educacion) => setCv({ educacion })} />
              </Tarjeta>
              <Tarjeta titulo={TITULOS[cv.idioma].habilidades} ayuda={en ? "Use the same words job posts use." : "Usá las mismas palabras que usan las vacantes."}>
                <Etiquetas en={en} lista={cv.habilidades} alCambiar={(habilidades) => setCv({ habilidades })} ejemplo={en ? "Excel, customer service…" : "Excel, servicio al cliente…"} />
              </Tarjeta>
              <div className="grid gap-4 sm:grid-cols-2">
                <Tarjeta titulo={TITULOS[cv.idioma].idiomas}>
                  <Etiquetas en={en} lista={cv.idiomas} alCambiar={(idiomas) => setCv({ idiomas })} ejemplo={en ? "English (B2)" : "Inglés (B2)"} />
                </Tarjeta>
                <Tarjeta titulo={TITULOS[cv.idioma].certificaciones}>
                  <Etiquetas en={en} lista={cv.certificaciones} alCambiar={(certificaciones) => setCv({ certificaciones })} ejemplo={en ? "CPR · Red Cross · 2024" : "RCP · Cruz Roja · 2024"} />
                </Tarjeta>
              </div>
              <Tarjeta titulo={en ? "Compare with a job post" : "Comparar con una vacante"} ayuda={en ? "Paste the job description: you'll see which of its words are in your CV." : "Pegá la descripción de la vacante: vas a ver cuáles de sus palabras están en tu CV."}>
                <textarea rows={4} value={vacante} onChange={(e) => setBorrador((b) => ({ ...b, vacante: e.target.value.slice(0, 6000) }))} className={campo} placeholder={en ? "Paste the job post here…" : "Pegá aquí la vacante…"} />
                {coincidencia && (
                  <div className="mt-3 grid gap-2 text-[13px]">
                    {coincidencia.faltan.length > 0 && <p className="leading-6 text-[#93370d]"><span className="font-bold">{en ? "Missing: " : "Faltan: "}</span>{coincidencia.faltan.join(", ")}</p>}
                    {coincidencia.estan.length > 0 && <p className="leading-6 text-[#067647]"><span className="font-bold">{en ? "Already in your CV: " : "Ya están en tu CV: "}</span>{coincidencia.estan.join(", ")}</p>}
                    <p className="text-xs text-[#667085]">{en ? "Add the missing ones only if they are true for you." : "Agregá las que faltan solo si de verdad aplican a vos."}</p>
                  </div>
                )}
              </Tarjeta>
            </>
          ) : (
            <>
              <Tarjeta titulo={en ? "The position" : "El puesto"} ayuda={en ? "A cover letter goes with your CV: one page, about 300 words." : "La carta acompaña tu CV: una página, unas 300 palabras."}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label={en ? "Position" : "Puesto"} value={carta.puesto} maxLength={120} onChange={(e) => setCarta({ puesto: e.target.value })} />
                  <Input label={en ? "Company" : "Empresa"} value={carta.empresa} maxLength={120} onChange={(e) => setCarta({ empresa: e.target.value })} />
                  <div className="sm:col-span-2"><Input label={en ? "Addressed to" : "Dirigida a"} value={carta.destinatario} maxLength={120} onChange={(e) => setCarta({ destinatario: e.target.value })} /></div>
                </div>
                <button type="button" onClick={() => setCarta(cartaInicial(cv, { puesto: carta.puesto, empresa: carta.empresa }))} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-[#007fae] hover:bg-[#eef6fb]">
                  <RotateCcw className="h-4 w-4" />{en ? "Rewrite with this position" : "Rehacer con este puesto"}
                </button>
              </Tarjeta>
              {([
                ["apertura", en ? "1. Opening" : "1. Apertura", en ? "Which position and how you found it." : "A qué puesto te postulás y cómo lo encontraste."],
                ["porQueEncajo", en ? "2. Why you fit" : "2. Por qué encajás", en ? "2–3 achievements from your CV, with numbers." : "2 o 3 logros de tu CV, con números."],
                ["porQueLaEmpresa", en ? "3. Why this company" : "3. Por qué esta empresa", en ? "Something specific about them." : "Algo concreto de ellos."],
                ["cierre", en ? "4. Closing" : "4. Cierre", en ? "Invite them to talk and say thanks." : "Invitá a conversar y agradecé."],
              ] as const).map(([k, titulo, ayuda]) => (
                <Tarjeta key={k} titulo={titulo} ayuda={ayuda}>
                  <textarea rows={k === "porQueEncajo" ? 5 : 3} maxLength={900} value={carta[k]} onChange={(e) => setCarta({ [k]: e.target.value } as Partial<Carta>)} className={campo} />
                </Tarjeta>
              ))}
            </>
          )}

          <button type="button" onClick={() => setVerHoja((v) => !v)} className={cn(pastilla, "border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb] lg:hidden")}>
            <FileText className="h-4 w-4" />{verHoja ? (en ? "Hide preview" : "Ocultar vista previa") : (en ? "See preview" : "Ver vista previa")}
          </button>
          {verHoja && <div className="lg:hidden">{hoja}</div>}
        </div>

        <aside className="grid gap-3 lg:sticky lg:top-24">
          <div className="hidden lg:block">{hoja}</div>
          <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
            <p className="mb-2 text-[13px] font-black text-[#162543]">{en ? "Review before sending" : "Revisión antes de enviar"}</p>
            <Revision avisos={avisos} idiomaApp={idiomaApp} />
            <div className="mt-4 grid gap-2">
              <button type="button" disabled={generando} onClick={() => void descargar()} className={cn(pastilla, "w-full bg-[#009FD9] text-white hover:bg-[#0089bb]")}>
                <Download className="h-4 w-4" />{pestana === "cv" ? (en ? "Download CV (PDF)" : "Descargar CV (PDF)") : (en ? "Download letter (PDF)" : "Descargar carta (PDF)")}
              </button>
              <button type="button" onClick={() => void copiar()} className={cn(pastilla, "w-full border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb]")}>
                {pestana === "cv" ? <Copy className="h-4 w-4" /> : <Mail className="h-4 w-4" />}{en ? "Copy as text" : "Copiar como texto"}
              </button>
              <p role="status" aria-live="polite" className="min-h-4 text-center text-xs font-semibold text-[#067647]">{aviso}</p>
              <p className="text-center text-[11px] leading-4 text-[#98a2b3]">{en ? "Your draft is saved on this device only." : "El borrador se guarda solo en este dispositivo."}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
