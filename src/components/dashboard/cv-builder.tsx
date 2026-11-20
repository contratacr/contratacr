"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useLocale } from "next-intl";
import { AlertCircle, ArrowDown, ArrowUp, Bold, Palette, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardPaste, Cloud, CloudOff, Copy, CopyPlus, Download, Eye, EyeOff, FileText, FileUp, Globe, Lightbulb, Link2, List, Mail, Pencil, Plus, RefreshCw, RotateCcw, Search, Trash2, UserRound } from "lucide-react";
import { MenuFicha } from "@/components/ui/menu-ficha";
import { AccionesAlPie } from "@/components/ui/acciones-al-pie";
import { Skeleton } from "@/components/ui/content-loading";
import { Link } from "@/i18n/navigation";
import { VACANTE_PARA_CURRICULUM } from "@/components/jobs/preparar-curriculum";
import { alLlegarDesdeUnEmpleo, leerVacanteGuardada, type VacanteParaCurriculum } from "@/lib/cv/vacante-empleo";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { getCantonById, getProvinceById } from "@/lib/data/cr-geography";
import { getCategoryLabel } from "@/lib/data/categories";
import { languageLabel } from "@/lib/data/languages";
import { blankDates, parseCvDates, serializeCvDates, type CvDates } from "@/lib/cv/dates";
import type { CvEntry } from "@/lib/cv/model";
import {
  LIMITES, TITULOS, asuntoPorDefecto, cartaComoTexto, cartaInicial, despedidaPorDefecto, fechaDeLaCarta, saludoPorDefecto, saludosSugeridos, cvComoTexto, encabezadoDeEntrada, nombreDeArchivo, ordenDeSecciones, palabrasClave, prellenar, revisarCarta, revisarCv, seccionConContenido, sumarDesdeArchivo,
  type Aviso, type Carta, type CvDocumento, type DatosDelPerfil, type Idioma, type Referencia, type SeccionId, type SeccionLibre,
} from "@/lib/cv/documento";
import { VistaPrevia } from "./cv-hoja";
import { FirmaDibujada } from "./cv-firma";
import { Manija, moverEnLista, useArrastrar } from "./cv-arrastrar";
import { PanelDiseno } from "./cv-diseno";
import { AdaptarConIa, CartaConIa, MejorarConIa } from "./cv-ia";
import type { Diseno } from "@/lib/cv/diseno";
import { htmlDeTexto, textoDeHtml } from "@/lib/cv/editor-formato";
import { cn } from "@/lib/utils";
import { formatFullPersonName } from "@/lib/display-name";
import { borrarDeLaNube, elegirCvPublico, esUuid, guardarEnLaNube, leerDeLaNube } from "@/lib/cv/nube";
import { enlacePerfil } from "@/lib/profile-url";

/**
 * «MI CV» EN EL PANEL: CV y carta de presentación listos para descargar.
 * Se prellena con el perfil y todo se puede editar. Desde el 19-nov-2026 los
 * documentos se guardan en la cuenta (`cv_documents`, solo del dueño) y el
 * dispositivo guarda una copia para trabajar sin conexión.
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
/** `etiqueta`: el nombre del documento en la lista (p. ej. el CV adaptado a una oferta). */
type Borrador = { cv: CvDocumento; carta: Carta; etiqueta?: string };

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
  const leido = parseCvDates(periodo);
  const d: CvDates = leido ?? blankDates();
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
            {en ? "Present" : "Actualidad"}
          </label>
        </div>
        {d.current ? <p className={cn(campo, "flex h-11 items-center bg-[#f6f9fb] py-0 text-[#667085]")}>{en ? "Present" : "Actualidad"}</p> : parte(d.endMonth, d.endYear, "end")}
      </div>
      {/* Una fecha escrita a mano en un CV viejo se respeta tal cual hasta que
          se elijan mes y año (19-nov-2026). */}
      {!leido && periodo.trim() && (
        <p className="text-xs leading-5 text-[#93370d] @[560px]:col-span-2">
          {en ? `Written by hand: "${periodo.trim()}". Pick month and year so it looks the same across your resume.` : `Escrita a mano: "${periodo.trim()}". Elija mes y año para que quede igual en todo el CV.`}
        </p>
      )}
    </div>
  );
}

type TipoEntrada = "experiencia" | "educacion" | "proyecto" | "curso" | "premio" | "voluntariado" | "publicacion";
type Par = readonly [string, string];
const CAMPOS: Record<TipoEntrada, { titulo: Par; org: Par; desc: Par | null; agregar: Par; ubicacion: boolean; ejemplo?: Par }> = {
  experiencia: { titulo: ["Cargo", "Role"], org: ["Empresa o cliente", "Company or client"], desc: ["Logros (uno por línea)", "Achievements (one per line)"], agregar: ["Agregar experiencia", "Add experience"], ubicacion: true, ejemplo: ["Instalé el sistema eléctrico de más de 40 casas\nReduje el tiempo de reparación un 20 %", "Installed electrical systems in 40+ homes\nReduced repair times by 20%"] },
  educacion: { titulo: ["Título o curso", "Degree or course"], org: ["Institución", "Institution"], desc: null, agregar: ["Agregar estudio", "Add education"], ubicacion: true },
  proyecto: { titulo: ["Nombre del proyecto", "Project name"], org: ["Cliente o empresa (opcional)", "Client or company (optional)"], desc: ["Qué hizo (uno por línea)", "What you did (one per line)"], agregar: ["Agregar proyecto", "Add project"], ubicacion: false, ejemplo: ["Hice la tienda en línea de una panadería\nLas ventas subieron un 30 % en 3 meses", "Built the online store for a local bakery\nSales grew 30% in 3 months"] },
  curso: { titulo: ["Nombre del curso", "Course name"], org: ["Institución", "Institution"], desc: null, agregar: ["Agregar curso", "Add course"], ubicacion: false },
  premio: { titulo: ["Premio o reconocimiento", "Award"], org: ["Otorgado por", "Awarded by"], desc: ["Por qué (opcional)", "What for (optional)"], agregar: ["Agregar premio", "Add award"], ubicacion: false },
  voluntariado: { titulo: ["Rol", "Role"], org: ["Organización", "Organization"], desc: ["Qué hizo (uno por línea)", "What you did (one per line)"], agregar: ["Agregar voluntariado", "Add volunteering"], ubicacion: true },
  publicacion: { titulo: ["Título", "Title"], org: ["Editorial o medio", "Publisher or outlet"], desc: ["Descripción o enlace (opcional)", "Description or link (optional)"], agregar: ["Agregar publicación", "Add publication"], ubicacion: false },
};
const vacia = (): CvEntry => ({ title: "", organization: "", period: "", description: "" });

/**
 * TEXTO CON FORMATO (19-nov-2026), como la barrita de FlowCV: lo que se ve es
 * lo que sale. Negrita se ve en negrita, las viñetas como lista y los enlaces
 * como enlaces. Por dentro se guarda el mismo texto simple de siempre
 * («**negrita**», «- viñeta», «[texto](https://…)»; ver editor-formato.ts),
 * así la vista previa, el PDF y el texto para pegar no cambian.
 * Lo pegado entra como texto sin formato.
 */
function TextoConFormato({ etiqueta, valor, alCambiar, en, filas = 4, max = 1000, placeholder, vinetas = true }: { etiqueta: string; valor: string; alCambiar: (v: string) => void; en: boolean; filas?: number; max?: number; placeholder?: string; vinetas?: boolean }) {
  const editor = useRef<HTMLDivElement>(null);
  const idEtiqueta = useId();
  const ultimo = useRef<string | null>(null);
  const rango = useRef<Range | null>(null);
  const [vacio, setVacio] = useState(!valor.trim());
  const [activos, setActivos] = useState({ negrita: false, lista: false, enlace: false });
  const [pidiendoEnlace, setPidiendoEnlace] = useState(false);
  const [url, setUrl] = useState("");
  const [urlMala, setUrlMala] = useState(false);

  // Lo guardado se dibuja al abrir, y otra vez solo si cambió desde afuera
  // (por ejemplo «Cargar de mi perfil»): lo que se escribe aquí no se redibuja.
  useEffect(() => {
    const el = editor.current;
    if (!el || valor === ultimo.current) return;
    el.innerHTML = htmlDeTexto(valor, vinetas);
    ultimo.current = valor;
    setVacio(!valor.trim());
  }, [valor, vinetas]);

  const dentro = (n: Node | null) => !!n && !!editor.current?.contains(n);
  /** Guarda dónde está el cursor y qué botones van encendidos. */
  const leerSeleccion = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !dentro(sel.anchorNode)) return;
    rango.current = sel.getRangeAt(0).cloneRange();
    let n: Node | null = sel.anchorNode, enlace = false;
    while (n && n !== editor.current) { if ((n as Element).tagName === "A") enlace = true; n = n.parentNode; }
    setActivos({ negrita: document.queryCommandState("bold"), lista: document.queryCommandState("insertUnorderedList"), enlace });
  };
  useEffect(() => {
    document.addEventListener("selectionchange", leerSeleccion);
    return () => document.removeEventListener("selectionchange", leerSeleccion);
  });

  const emitir = () => {
    const el = editor.current;
    if (!el) return;
    let texto = textoDeHtml(el);
    if (texto.length > max) {
      texto = texto.slice(0, max);
      el.innerHTML = htmlDeTexto(texto, vinetas);
    }
    setVacio(!el.textContent?.trim() && !el.querySelector("li"));
    leerSeleccion();
    if (texto === ultimo.current) return;
    ultimo.current = texto;
    alCambiar(texto);
  };
  /** Vuelve a la selección de antes de tocar la barrita (en iPhone se pierde). */
  const recuperar = () => {
    const el = editor.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const sel = window.getSelection();
    if (rango.current && sel && dentro(rango.current.startContainer)) { sel.removeAllRanges(); sel.addRange(rango.current); }
  };
  const comando = (nombre: string, arg?: string) => {
    recuperar();
    document.execCommand("defaultParagraphSeparator", false, "div");
    document.execCommand(nombre, false, arg);
    emitir();
  };
  const abrirEnlace = () => {
    if (activos.enlace) { comando("unlink"); return; }
    recuperar();
    setUrl(""); setUrlMala(false); setPidiendoEnlace(true);
  };
  const ponerEnlace = () => {
    const limpia = url.trim();
    const conEsquema = /^https?:\/\//i.test(limpia) ? limpia : `https://${limpia}`;
    if (!/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(conEsquema)) { setUrlMala(true); return; }
    setPidiendoEnlace(false);
    recuperar();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      const a = conEsquema.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
      document.execCommand("insertHTML", false, `<a href="${a}">${a}</a>&nbsp;`);
      emitir();
    } else comando("createLink", conEsquema);
  };

  const boton = (activo: boolean) => cn("grid h-9 w-9 place-items-center rounded-lg transition-colors", activo ? "bg-white text-[#007fae] shadow-sm" : "text-[#52627a] hover:bg-white hover:text-[#162543]");
  // Que tocar la barrita no saque el cursor del texto. Solo mousedown: en
  // iPhone, cancelar pointerdown se come el toque.
  const sinRobarFoco = { onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault() };
  return (
    <div className="grid gap-1">
      <span id={idEtiqueta} className="text-sm font-semibold text-[#162543]">{etiqueta}</span>
      <div className="overflow-hidden rounded-xl border border-[#d7e1ea] bg-white focus-within:border-[#009FD9] focus-within:ring-2 focus-within:ring-[#009FD9]/15">
        <div role="toolbar" aria-label={en ? "Text format" : "Formato del texto"} className="flex items-center gap-1 border-b border-[#eef2f6] bg-[#f6f9fb] px-1.5 py-1">
          <button type="button" aria-label={en ? "Bold" : "Negrita"} aria-pressed={activos.negrita} title={en ? "Bold" : "Negrita"} {...sinRobarFoco} onClick={() => comando("bold")} className={boton(activos.negrita)}><Bold className="h-4 w-4" /></button>
          {vinetas && <button type="button" aria-label={en ? "Bullet list" : "Viñetas"} aria-pressed={activos.lista} title={en ? "Bullet list" : "Viñetas"} {...sinRobarFoco} onClick={() => comando("insertUnorderedList")} className={boton(activos.lista)}><List className="h-4 w-4" /></button>}
          <button type="button" aria-label={activos.enlace ? (en ? "Remove link" : "Quitar enlace") : (en ? "Link" : "Enlace")} aria-pressed={activos.enlace} title={en ? "Link" : "Enlace"} {...sinRobarFoco} onClick={abrirEnlace} className={boton(activos.enlace)}><Link2 className="h-4 w-4" /></button>
        </div>
        {pidiendoEnlace && (
          <div className="flex flex-wrap items-end gap-2 border-b border-[#eef2f6] bg-[#fbfcfd] px-3 py-2.5">
            <label className="grid min-w-0 flex-1 basis-48 gap-1">
              <span className="text-xs font-semibold text-[#52627a]">{en ? "Link address" : "Dirección del enlace"}</span>
              <input autoFocus type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://" value={url} onChange={(e) => { setUrl(e.target.value); setUrlMala(false); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ponerEnlace(); } if (e.key === "Escape") setPidiendoEnlace(false); }} className={cn(campo, "h-10 py-0", urlMala && "border-[#d92d20]")} />
            </label>
            <span className="flex gap-1.5">
              <button type="button" onClick={() => setPidiendoEnlace(false)} className="h-10 rounded-full px-3 text-[13px] font-semibold text-[#52627a] hover:bg-white">{en ? "Cancel" : "Cancelar"}</button>
              <button type="button" onClick={ponerEnlace} className="h-10 rounded-full bg-[#162543] px-4 text-[13px] font-bold text-white">{en ? "Add link" : "Poner enlace"}</button>
            </span>
            {urlMala && <p role="alert" className="basis-full text-xs font-semibold text-[#b42318]">{en ? "That doesn't look like a web address." : "Eso no parece una dirección web."}</p>}
          </div>
        )}
        <div className="relative">
          {vacio && placeholder && <p aria-hidden className="pointer-events-none absolute inset-x-0 top-0 whitespace-pre-line px-3.5 py-2.5 text-[15px] leading-6 text-[#98a2b3]">{placeholder}</p>}
          <div
            ref={editor}
            role="textbox"
            aria-multiline="true"
            aria-labelledby={idEtiqueta}
            aria-placeholder={placeholder}
            contentEditable
            suppressContentEditableWarning
            spellCheck
            onInput={emitir}
            onBlur={emitir}
            onPaste={(e) => {
              // Sin el formato de otra página: solo el texto.
              e.preventDefault();
              document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
              emitir();
            }}
            onDrop={(e) => e.preventDefault()}
            onKeyUp={leerSeleccion}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") { e.preventDefault(); comando("bold"); }
            }}
            style={{ minHeight: `${filas * 1.5 + 1.25}rem` }}
            className="relative w-full whitespace-pre-wrap break-words px-3.5 py-2.5 text-[15px] leading-6 text-[#162543] outline-none [&_a]:text-[#006f9c] [&_a]:underline [&_b]:font-bold [&_strong]:font-bold [&_ul]:list-disc [&_ul]:pl-5"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Cada entrada con su «···» (19-nov-2026): subir, bajar, duplicar, ocultar del
 * CV sin borrarla, o eliminarla. Lo oculto se sigue editando aquí.
 */
/** Confirmar antes de borrar, en la misma ficha (nunca un cuadro del navegador). */
function ConfirmarBorrado({ texto, en, alConfirmar, alCancelar }: { texto: string; en: boolean; alConfirmar: () => void; alCancelar: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#fef3f2] px-3 py-2.5 text-[13px] text-[#912018]" data-testid="cv-confirmar-borrado">
      <span>{texto}</span>
      <span className="flex gap-2">
        <button type="button" onClick={alCancelar} className="h-10 rounded-full px-3 font-semibold text-[#52627a] hover:bg-white">{en ? "Cancel" : "Cancelar"}</button>
        <button type="button" onClick={alConfirmar} className="h-10 rounded-full bg-[#b42318] px-4 font-bold text-white">{en ? "Delete" : "Eliminar"}</button>
      </span>
    </div>
  );
}

function Entradas({ lista, alCambiar, en, tipo, ia }: { lista: CvEntry[]; alCambiar: (l: CvEntry[]) => void; en: boolean; tipo: TipoEntrada; ia?: { idioma: Idioma; titular: string } }) {
  const c = CAMPOS[tipo];
  const k = en ? 1 : 0;
  const cambiar = (i: number, cambio: Partial<CvEntry>) => alCambiar(lista.map((e, j) => (j === i ? { ...e, ...cambio } : e)));
  const mover = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= lista.length) return;
    const nueva = [...lista];
    [nueva[i], nueva[j]] = [nueva[j], nueva[i]];
    alCambiar(nueva);
  };
  const [borrando, setBorrando] = useState<number | null>(null);
  const arrastre = useArrastrar(lista.length, (desde, hasta) => { setBorrando(null); alCambiar(moverEnLista(lista, desde, hasta)); });
  // Una entrada vacía se borra sin preguntar: no hay nada que perder.
  const pedirBorrar = (i: number) => {
    const e = lista[i];
    if (!e.title.trim() && !e.organization.trim() && !e.description.trim() && !e.period.trim()) alCambiar(lista.filter((_, j) => j !== i));
    else setBorrando(i);
  };
  return (
    <div className="grid gap-3" {...arrastre.lista}>
      {lista.map((e, i) => (
        <div key={i} {...arrastre.elemento(i)} className={cn("grid gap-3 rounded-xl border border-[#eef2f6] bg-[#fbfcfd] p-3 transition-shadow", e.hidden && "border-dashed", arrastre.elemento(i).className)} data-testid="cv-entrada">
          <div className="-mb-1 flex min-w-0 items-center gap-2">
            {lista.length > 1 && <Manija etiqueta={en ? "Drag to reorder" : "Arrastre para ordenar"} {...arrastre.manija(i)} />}
            <span className={cn("min-w-0 flex-1 truncate text-[13px] font-bold", e.hidden ? "text-[#98a2b3]" : "text-[#52627a]")}>
              {i + 1}. {encabezadoDeEntrada(e) || (en ? "New entry" : "Entrada nueva")}
            </span>
            {e.hidden && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#f2f4f7] px-2 py-0.5 text-[11px] font-bold text-[#52627a]"><EyeOff className="h-3 w-3" />{en ? "Hidden" : "Oculta"}</span>}
            <MenuFicha className="shrink-0" opciones={[
              ...(i > 0 ? [{ id: "subir", icono: <ArrowUp className="h-[18px] w-[18px]" />, texto: en ? "Move up" : "Subir", onSelect: () => mover(i, -1) }] : []),
              ...(i < lista.length - 1 ? [{ id: "bajar", icono: <ArrowDown className="h-[18px] w-[18px]" />, texto: en ? "Move down" : "Bajar", onSelect: () => mover(i, 1) }] : []),
              ...(lista.length < LIMITES.entradas ? [{ id: "duplicar", icono: <CopyPlus className="h-[18px] w-[18px]" />, texto: en ? "Duplicate" : "Duplicar", onSelect: () => alCambiar([...lista.slice(0, i + 1), { ...e }, ...lista.slice(i + 1)]) }] : []),
              e.hidden
                ? { id: "mostrar", icono: <Eye className="h-[18px] w-[18px]" />, texto: en ? "Show on resume" : "Mostrar en el CV", onSelect: () => cambiar(i, { hidden: false }) }
                : { id: "ocultar", icono: <EyeOff className="h-[18px] w-[18px]" />, texto: en ? "Hide from resume" : "Ocultar del CV", onSelect: () => cambiar(i, { hidden: true }) },
              { id: "eliminar", icono: <Trash2 className="h-[18px] w-[18px]" />, texto: en ? "Delete" : "Eliminar", onSelect: () => pedirBorrar(i), peligro: true },
            ]} />
          </div>
          {borrando === i && (
            <ConfirmarBorrado en={en} alCancelar={() => setBorrando(null)} alConfirmar={() => { setBorrando(null); alCambiar(lista.filter((_, j) => j !== i)); }}
              texto={en ? `Delete "${encabezadoDeEntrada(e) || "this entry"}"?` : `¿Eliminar "${encabezadoDeEntrada(e) || "esta entrada"}"?`} />
          )}
          <div className="grid gap-3 @[560px]:grid-cols-2">
            <Input label={c.titulo[k]} value={e.title} maxLength={160} onChange={(ev) => cambiar(i, { title: ev.target.value })} />
            <Input label={c.org[k]} value={e.organization} maxLength={160} onChange={(ev) => cambiar(i, { organization: ev.target.value })} />
            {/* La ubicación de cada puesto o estudio, como en FlowCV (18-nov-2026). */}
            {c.ubicacion && <Input label={en ? "Location (optional)" : "Ubicación (opcional)"} placeholder={en ? "E.g. San José or Remote" : "Ej.: San José o Remoto"} value={e.location ?? ""} maxLength={80} onChange={(ev) => cambiar(i, { location: ev.target.value })} />}
          </div>
          <Fechas periodo={e.period} en={en} alCambiar={(period) => cambiar(i, { period })} />
          {c.desc && <TextoConFormato etiqueta={c.desc[k]} vinetas={false} en={en} valor={e.description} alCambiar={(description) => cambiar(i, { description })} placeholder={c.ejemplo?.[k]} />}
          {c.desc && ia && <MejorarConIa tipo="logros" en={en} idioma={ia.idioma} texto={e.description} contexto={[ia.titular, e.title, e.organization].filter((x) => x.trim()).join(" — ")} alElegir={(description) => cambiar(i, { description })} />}
        </div>
      ))}
      {lista.length < LIMITES.entradas && (
        <button type="button" onClick={() => alCambiar([...lista, vacia()])} className={cn(pastilla, "justify-self-start border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb]")}>
          <Plus className="h-4 w-4" /> {c.agregar[k]}
        </button>
      )}
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

function leerBorrador(clave: string): Borrador | null {
  try {
    const guardado = JSON.parse(window.localStorage.getItem(clave) ?? "null") as Borrador | null;
    if (!guardado?.cv || !guardado?.carta) return null;
    return { ...guardado, cv: { ...guardado.cv, sugeridas: guardado.cv.sugeridas ?? [] } };
  } catch { return null; /* sin almacenamiento: se trabaja con el perfil */ }
}

/** La vacante desde la que se llegó («Prepare su postulación a este empleo»). */
const VACANTE = VACANTE_PARA_CURRICULUM;
type VacanteRecibida = VacanteParaCurriculum;
/** El anuncio que llega a un documento recién abierto desde un empleo (20-nov-2026). */
type OfertaDeEmpleo = { puesto?: string; empresa?: string; texto?: string };
function leerVacante(): VacanteRecibida | null {
  try { return leerVacanteGuardada(JSON.parse(window.sessionStorage.getItem(VACANTE) ?? "null")); } catch { return null; }
}

// v3: varios currículums y cartas por cuenta. El borrador único (v2) se pasa
// a la lista la primera vez.
const CLAVE_DOCS = "ccr:cv-documentos:v3";
const MAX_DOCUMENTOS = 10;
type Tipo = "cv" | "carta";
/** `nube`: ya se guardó alguna vez en la cuenta (si falta allá, se borró en otro dispositivo). */
type Documento = { id: string; tipo: Tipo; actualizado: number; borrador: Borrador; nube?: boolean };
// Un UUID siempre: es la clave del documento también en la cuenta.
const nuevoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16); }));
/** Lo que vino de la cuenta, si tiene forma de borrador. */
function leerDatos(datos: unknown): Borrador | null {
  const b = datos as Borrador | null;
  if (!b || typeof b !== "object" || !b.cv || !b.carta || typeof b.cv !== "object" || typeof b.carta !== "object") return null;
  return { ...b, cv: { ...b.cv, sugeridas: Array.isArray(b.cv.sugeridas) ? b.cv.sugeridas : [] } };
}

function leerDocumentos(uid: string): Documento[] {
  try {
    const lista = JSON.parse(window.localStorage.getItem(`${CLAVE_DOCS}:${uid}`) ?? "null") as Documento[] | null;
    if (Array.isArray(lista)) {
      return lista
        .filter((d) => d?.id && (d.tipo === "cv" || d.tipo === "carta") && d.borrador?.cv && d.borrador?.carta)
        // Los ids viejos que no eran UUID se cambian: la cuenta los pide así.
        .map((d) => ({ ...d, id: esUuid(d.id) ? d.id : nuevoId(), nube: esUuid(d.id) ? d.nube : false, borrador: { ...d.borrador, cv: { ...d.borrador.cv, sugeridas: d.borrador.cv.sugeridas ?? [] } } }));
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

type EstadoNube = "cargando" | "guardando" | "guardado" | "local" | "error";
/** «Guardado en tu cuenta», «Guardando…» o que quedó solo en este dispositivo. */
function EstadoGuardado({ estado, en, className }: { estado: EstadoNube; en: boolean; className?: string }) {
  if (estado === "cargando") return <p className={cn("min-h-5 text-xs text-transparent", className)} aria-hidden>.</p>;
  const texto = {
    guardando: en ? "Saving…" : "Guardando…",
    guardado: en ? "Saved to your account" : "Guardado en su cuenta",
    local: en ? "Saved on this device only" : "Guardado solo en este dispositivo",
    error: en ? "No connection: saved on this device, it will upload later" : "Sin conexión: se guarda en este dispositivo y se sube después",
  }[estado];
  const Icono = estado === "guardado" ? Cloud : estado === "guardando" ? RefreshCw : CloudOff;
  return (
    <p role="status" aria-live="polite" data-testid="cv-estado-guardado" data-estado={estado} className={cn("inline-flex min-h-5 items-center gap-1.5 text-xs font-semibold", estado === "guardado" ? "text-[#067647]" : estado === "error" ? "text-[#b54708]" : "text-[#667085]", className)}>
      <Icono className={cn("h-3.5 w-3.5 shrink-0", estado === "guardando" && "animate-spin")} aria-hidden />{texto}
    </p>
  );
}

const tituloDe = (d: Documento, en: boolean) => d.tipo === "cv"
  ? d.borrador.etiqueta?.trim() || d.borrador.cv.titular.trim() || d.borrador.cv.nombre.trim() || (en ? "Resume" : "Currículum")
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
  const [estado, setEstado] = useState<{ docs: Documento[]; abierto: string | null; oferta?: OfertaDeEmpleo & { id: string } }>(() => {
    const docs = leerDocumentos(uid);
    const v = leerVacante();
    const datos: OfertaDeEmpleo = { puesto: v?.puesto, empresa: v?.empresa, texto: v?.texto };
    // Desde un empleo cada botón lleva a lo suyo: la carta abre una carta nueva y
    // el currículum abre el currículum más reciente con «Adaptar a una oferta»
    // listo (sin correr nada). Un aviso viejo, sin destino, solo sirve a la carta.
    const llegada = alLlegarDesdeUnEmpleo(tipo, v, docs.filter((d) => d.tipo === "cv"));
    if (llegada?.accion === "carta-nueva") {
      const doc = nuevo(docs, v ?? undefined);
      return { docs: [doc, ...docs], abierto: doc.id, oferta: { id: doc.id, ...datos } };
    }
    if (llegada?.accion === "cv-existente") return { docs, abierto: llegada.id, oferta: { id: llegada.id, ...datos } };
    if (llegada?.accion === "cv-nuevo") {
      const doc = nuevo(docs);
      return { docs: [doc, ...docs], abierto: doc.id, oferta: { id: doc.id, ...datos } };
    }
    if (docs.some((d) => d.tipo === tipo)) return { docs, abierto: null };
    const doc = nuevo(docs);
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

  // ── EN LA CUENTA ── al abrir se trae lo de la cuenta y se junta con lo de
  // este dispositivo: gana lo editado más reciente. Lo que solo estaba aquí
  // (incluidos los de antes de guardar en la cuenta) se sube una vez.
  const [nube, setNube] = useState<EstadoNube>("cargando");
  // El CV que se abre en contratacr.com/<perfil>/cv (20-nov-2026).
  const [publico, setPublico] = useState<string | null | undefined>(undefined);
  const [cambiandoPublico, setCambiandoPublico] = useState(false);
  const [avisoPublico, setAvisoPublico] = useState<string | null>(null);
  const enlaceCvPublico = pro?.slug ? `${enlacePerfil(pro.slug)}/cv` : "";
  const hacerPublico = async (id: string | null) => {
    setCambiandoPublico(true); setAvisoPublico(null);
    const ok = await elegirCvPublico(id);
    setCambiandoPublico(false);
    if (ok) setPublico(id);
    else setAvisoPublico(en ? "That couldn't be changed. Try again." : "No se pudo cambiar. Pruebe de nuevo.");
  };
  const copiarEnlace = async () => {
    try { await navigator.clipboard.writeText(enlaceCvPublico); setAvisoPublico(en ? "Link copied." : "Enlace copiado."); }
    catch { setAvisoPublico(enlaceCvPublico); }
  };
  const subido = useRef(new Map<string, string>());
  const [reintento, setReintento] = useState(0);
  useEffect(() => {
    let vivo = true;
    void leerDeLaNube().then((filas) => {
      if (!vivo) return;
      if (!filas) { setNube("local"); return; }
      // undefined: la base todavía no sabe de CV públicos (antes de la 291).
      setPublico(filas.some((f) => "publico" in f) || !filas.length ? (filas.find((f) => f.publico)?.id ?? null) : undefined);
      setEstado((s) => {
        const remotos = new Map(filas.map((f) => [f.id, f]));
        const docs: Documento[] = [];
        for (const d of s.docs) {
          const r = remotos.get(d.id);
          remotos.delete(d.id);
          const datos = r ? leerDatos(r.datos) : null;
          if (r && datos && r.actualizado > d.actualizado) {
            subido.current.set(d.id, JSON.stringify(datos));
            docs.push({ ...d, tipo: r.tipo, actualizado: r.actualizado, borrador: datos, nube: true });
          } else if (r) {
            if (datos && JSON.stringify(datos) === JSON.stringify(d.borrador)) subido.current.set(d.id, JSON.stringify(d.borrador));
            docs.push({ ...d, nube: true });
          } else if (!d.nube || d.id === s.abierto) {
            // Nuevo de este dispositivo (o el que está abierto): se sube.
            docs.push({ ...d, nube: false });
          } // Si ya estuvo en la cuenta y no está, se borró en otro dispositivo.
        }
        for (const r of remotos.values()) {
          const datos = leerDatos(r.datos);
          if (!datos) continue;
          subido.current.set(r.id, JSON.stringify(datos));
          docs.push({ id: r.id, tipo: r.tipo, actualizado: r.actualizado, borrador: datos, nube: true });
        }
        return { ...s, docs };
      });
      setNube("guardado");
    });
    return () => { vivo = false; };
  }, []);
  // Cada cambio se sube un momento después de dejar de escribir.
  const conectada = nube !== "cargando" && nube !== "local";
  useEffect(() => {
    if (!conectada) return;
    const pendientes = estado.docs.filter((d) => subido.current.get(d.id) !== JSON.stringify(d.borrador));
    if (!pendientes.length) return;
    const t = window.setTimeout(() => {
      setNube("guardando");
      const filas = pendientes.map((d) => ({ id: d.id, tipo: d.tipo, titulo: tituloDe(d, false), datos: d.borrador }));
      void guardarEnLaNube(filas).then((ok) => {
        if (!ok) { setNube("error"); return; }
        for (const d of pendientes) subido.current.set(d.id, JSON.stringify(d.borrador));
        setEstado((s) => (s.docs.some((d) => pendientes.some((p) => p.id === d.id) && !d.nube)
          ? { ...s, docs: s.docs.map((d) => (pendientes.some((p) => p.id === d.id) ? { ...d, nube: true } : d)) }
          : s));
        setNube("guardado");
      });
    }, 1200);
    return () => window.clearTimeout(t);
  }, [estado.docs, conectada, reintento]);
  // Al volver la conexión se reintenta.
  useEffect(() => {
    const volver = () => setReintento((n) => n + 1);
    window.addEventListener("online", volver);
    return () => window.removeEventListener("online", volver);
  }, []);
  // Al salir, lo último se manda igual (sin esperar respuesta).
  const conectadaRef = useRef(conectada);
  useEffect(() => { conectadaRef.current = conectada; }, [conectada]);
  useEffect(() => () => {
    if (!conectadaRef.current) return;
    const pendientes = ultimo.current.filter((d) => subido.current.get(d.id) !== JSON.stringify(d.borrador));
    if (pendientes.length) void guardarEnLaNube(pendientes.map((d) => ({ id: d.id, tipo: d.tipo, titulo: tituloDe(d, false), datos: d.borrador })));
  }, []);

  const propios = estado.docs.filter((d) => d.tipo === tipo).sort((x, y) => y.actualizado - x.actualizado);
  const abierto = estado.docs.find((d) => d.id === estado.abierto && d.tipo === tipo);
  const hayAbierto = !!abierto;
  const avisarEditor = useRef(alCambiarEditor);
  useEffect(() => { avisarEditor.current = alCambiarEditor; }, [alCambiarEditor]);
  useEffect(() => {
    avisarEditor.current?.(hayAbierto);
    if (!hayAbierto) return;
    const cerrar = () => setEstado((s) => ({ ...s, abierto: null, oferta: undefined }));
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
  const eliminar = (id: string) => {
    const enLaCuenta = estado.docs.find((d) => d.id === id)?.nube;
    setEstado((s) => ({ ...s, docs: s.docs.filter((d) => d.id !== id) }));
    setBorrar(null);
    if (publico === id) setPublico(null);
    subido.current.delete(id);
    if (enLaCuenta && conectada) void borrarDeLaNube(id).then((ok) => setNube(ok ? "guardado" : "error"));
  };

  if (abierto) {
    const setBorrador: Dispatch<SetStateAction<Borrador>> = (cambio) => setEstado((s) => ({
      ...s,
      docs: s.docs.map((d) => (d.id === abierto.id ? { ...d, actualizado: Date.now(), borrador: typeof cambio === "function" ? cambio(d.borrador) : cambio } : d)),
    }));
    // El CV adaptado a una oferta se guarda como uno nuevo y se abre; el original queda igual.
    const alCrearCopia = lleno ? undefined : (b: Borrador) => setEstado((s) => {
      const doc: Documento = { id: nuevoId(), tipo, actualizado: Date.now(), borrador: b };
      return { docs: [doc, ...s.docs], abierto: doc.id };
    });
    return <Editor key={abierto.id} pro={pro} documento={tipo} borrador={abierto.borrador} setBorrador={setBorrador} desdeElPerfil={desdeElPerfil} nube={nube} alVolver={() => setEstado((s) => ({ ...s, abierto: null, oferta: undefined }))} alCrearCopia={alCrearCopia} ofertaInicial={estado.oferta?.id === abierto.id ? estado.oferta : undefined}
      disenoDelCv={tipo === "carta" ? estado.docs.filter((d) => d.tipo === "cv").sort((x, y) => y.actualizado - x.actualizado)[0]?.borrador.cv.diseno : undefined} />;
  }

  const fecha = (t: number) => new Date(t).toLocaleDateString(en ? "en-US" : "es-CR", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" data-testid="cv-documentos">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-[#162543]">{tipo === "cv" ? (en ? "My resumes" : "Mis currículums") : (en ? "My cover letters" : "Mis cartas")}</h2>
          <p className="text-[13px] leading-5 text-[#667085]">{en ? "One per job type, if you like." : "Puede tener uno para cada tipo de puesto."}</p>
          <EstadoGuardado estado={nube} en={en} className="mt-1" />
        </div>
        <button type="button" disabled={lleno} onClick={crear} className={cn(pastilla, "bg-[#009FD9] text-white hover:bg-[#0089bb]")} data-testid="cv-nuevo">
          <Plus className="h-4 w-4" />{tipo === "cv" ? (en ? "New resume" : "Nuevo currículum") : (en ? "New letter" : "Nueva carta")}
        </button>
      </div>
      {errorPdf && <p role="alert" className="rounded-xl bg-[#fef3f2] px-3 py-2.5 text-[13px] text-[#912018]">{en ? "The PDF couldn't be created. Try again." : "No se pudo crear el PDF. Pruebe de nuevo."}</p>}
      {lleno && <p className="text-[13px] text-[#667085]">{en ? `You can keep up to ${MAX_DOCUMENTOS}. Delete one to create another.` : `Puede guardar hasta ${MAX_DOCUMENTOS}. Elimine uno para crear otro.`}</p>}
      {tipo === "cv" && publico !== undefined && enlaceCvPublico && conectada && (
        <div className="grid gap-2 rounded-2xl border border-[#d7e1ea] bg-[#f7fafc] p-3 sm:p-4" data-testid="cv-publico">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#007fae]"><Globe className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-black text-[#162543]">{en ? "Resume on your profile" : "Currículum de su perfil"}</p>
              <p className="text-[13px] leading-5 text-[#667085]">
                {publico
                  ? (en ? `"${tituloDe(estado.docs.find((d) => d.id === publico) ?? propios[0], en)}" opens at your link, without your email, phone or signature.` : `"${tituloDe(estado.docs.find((d) => d.id === publico) ?? propios[0], en)}" se abre en su enlace, sin su correo, teléfono ni firma.`)
                  : (en ? 'Pick one with "···" > "Show on my profile". Until then, your link shows the resume built from your profile.' : 'Elija uno en "···" > "Mostrar en mi perfil". Mientras tanto, su enlace muestra el que se arma con su perfil.')}
              </p>
              <p className="mt-1 truncate text-[13px] font-semibold text-[#007fae]">{enlaceCvPublico.replace(/^https?:\/\//, "")}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pl-[52px]">
            <button type="button" onClick={() => void copiarEnlace()} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#d7e1ea] bg-white px-4 text-[13px] font-bold text-[#162543] hover:bg-[#f5f8fb]"><Copy className="h-4 w-4" />{en ? "Copy link" : "Copiar enlace"}</button>
            {publico && <button type="button" disabled={cambiandoPublico} onClick={() => void hacerPublico(null)} className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold text-[#475467] hover:bg-white disabled:opacity-60"><EyeOff className="h-4 w-4" />{en ? "Stop showing" : "Dejar de mostrar"}</button>}
          </div>
          {avisoPublico && <p role="status" className="pl-[52px] text-[13px] font-semibold text-[#344054]">{avisoPublico}</p>}
        </div>
      )}
      {propios.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#d7e1ea] bg-white px-4 py-8 text-center text-sm text-[#667085]">
          {tipo === "cv" ? (en ? "You have no resumes yet." : "Todavía no tiene currículums.") : (en ? "You have no letters yet." : "Todavía no tiene cartas.")}
        </p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
          {propios.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#e5e7eb] bg-white p-3 sm:p-4" data-testid="cv-documento">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e6f6fc] text-[#007fae]">{tipo === "cv" ? <FileText className="h-5 w-5" /> : <Mail className="h-5 w-5" />}</span>
              <button type="button" onClick={() => setEstado((s) => ({ ...s, abierto: d.id, oferta: undefined }))} className="min-h-11 min-w-0 flex-1 text-left">
                <span className="block truncate text-[15px] font-black text-[#162543]">{tituloDe(d, en)}</span>
                <span className="block text-[13px] text-[#667085]">{d.borrador.cv.idioma === "en" ? "English" : "Español"} · {en ? "Edited" : "Editado"} {fecha(d.actualizado)}</span>
                {publico === d.id && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#e6f6fc] px-2 py-0.5 text-[12px] font-bold text-[#006f9c]"><Globe className="h-3.5 w-3.5" />{en ? "On your profile" : "En su perfil"}</span>}
              </button>
              {/* Tocar la fila abre el editor; lo demás va en el «···», como en
                  Google Docs y FlowCV (18-nov-2026). Antes eran tres íconos
                  sueltos y descargar obligaba a entrar hasta el último paso. */}
              {bajando === d.id
                ? <span className="grid h-10 w-10 shrink-0 place-items-center" role="status" aria-label={en ? "Creating PDF" : "Creando PDF"}><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#d7e1ea] border-t-[#009FD9]" /></span>
                : <MenuFicha className="shrink-0" opciones={[
                  { id: "descargar", icono: <Download className="h-[18px] w-[18px]" />, texto: en ? "Download PDF" : "Descargar PDF", onSelect: () => void descargar(d) },
                  ...(tipo === "cv" && publico !== undefined && d.nube && conectada && !cambiandoPublico ? [publico === d.id
                    ? { id: "publico", icono: <EyeOff className="h-[18px] w-[18px]" />, texto: en ? "Remove from my profile" : "Quitar de mi perfil", onSelect: () => void hacerPublico(null) }
                    : { id: "publico", icono: <Globe className="h-[18px] w-[18px]" />, texto: en ? "Show on my profile" : "Mostrar en mi perfil", onSelect: () => void hacerPublico(d.id) }] : []),
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
 * ORDEN DE LAS SECCIONES (19-nov-2026), como «Section order» de FlowCV: subir,
 * bajar, ocultar sin borrar, o cambiarle el nombre. Solo salen las que ya
 * tienen algo; lo vacío no se ve en el CV de todos modos.
 */
function OrganizarSecciones({ cv, setCv, en }: { cv: CvDocumento; setCv: (cambio: Partial<CvDocumento>) => void; en: boolean }) {
  const [renombrando, setRenombrando] = useState<SeccionId | null>(null);
  const orden = ordenDeSecciones(cv);
  const ocultas = new Set(cv.ocultas ?? []);
  const presentes = orden.filter((id) => seccionConContenido(cv, id));
  // Arrastrar entre las presentes: la sección queda delante (o detrás) de la que estaba ahí.
  const arrastre = useArrastrar(presentes.length, (desde, hasta) => {
    const id = presentes[desde], ancla = presentes[hasta];
    const nuevo = orden.filter((x) => x !== id);
    nuevo.splice(nuevo.indexOf(ancla) + (hasta > desde ? 1 : 0), 0, id);
    setCv({ orden: nuevo });
  });
  if (!presentes.length) return null;
  const nombre = (id: SeccionId) => (id === "libres" ? (en ? "Custom sections" : "Secciones propias") : cv.titulosPropios?.[id]?.trim() || TITULOS[cv.idioma][id]);
  const mover = (id: SeccionId, d: number) => {
    const otro = presentes[presentes.indexOf(id) + d];
    if (!otro) return;
    const nuevo = [...orden];
    const a = nuevo.indexOf(id), b = nuevo.indexOf(otro);
    [nuevo[a], nuevo[b]] = [nuevo[b], nuevo[a]];
    setCv({ orden: nuevo });
  };
  const alternar = (id: SeccionId) => setCv({ ocultas: ocultas.has(id) ? [...ocultas].filter((x) => x !== id) : [...ocultas, id] });
  const icono = "grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#52627a] hover:bg-[#eef3f7] hover:text-[#162543] disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <Tarjeta titulo={en ? "Section order" : "Orden de las secciones"} ayuda={en ? "Move, hide or rename the sections of your resume." : "Suba, baje, oculte o cámbiele el nombre a cada sección del CV."}>
      <ol className="grid gap-1.5" data-testid="cv-orden-secciones" {...arrastre.lista}>
        {presentes.map((id, i) => {
          const oculta = ocultas.has(id);
          return (
            <li key={id} {...arrastre.elemento(i)} className={cn("grid gap-2 rounded-xl border border-[#eef2f6] bg-[#fbfcfd] px-2 py-1.5 transition-shadow", arrastre.elemento(i).className)} data-seccion={id}>
              <div className="flex min-w-0 items-center gap-1">
                {presentes.length > 1 && <Manija etiqueta={en ? "Drag to reorder" : "Arrastre para ordenar"} {...arrastre.manija(i)} />}
                <span className={cn("min-w-0 flex-1 truncate pl-1 text-[14px] font-bold", oculta ? "text-[#98a2b3] line-through" : "text-[#162543]")}>{nombre(id)}</span>
                <button type="button" disabled={i === 0} onClick={() => mover(id, -1)} aria-label={`${en ? "Move up" : "Subir"} ${nombre(id)}`} className={icono}><ArrowUp className="h-4 w-4" /></button>
                <button type="button" disabled={i === presentes.length - 1} onClick={() => mover(id, 1)} aria-label={`${en ? "Move down" : "Bajar"} ${nombre(id)}`} className={icono}><ArrowDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => alternar(id)} aria-pressed={oculta} aria-label={`${oculta ? (en ? "Show" : "Mostrar") : (en ? "Hide" : "Ocultar")} ${nombre(id)}`} className={icono}>{oculta ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                {id !== "libres" && <button type="button" onClick={() => setRenombrando(renombrando === id ? null : id)} aria-expanded={renombrando === id} aria-label={`${en ? "Rename" : "Cambiar nombre de"} ${nombre(id)}`} className={icono}><Pencil className="h-4 w-4" /></button>}
              </div>
              {renombrando === id && id !== "libres" && (
                <div className="flex items-end gap-2 px-1 pb-1">
                  <div className="min-w-0 flex-1">
                    <Input label={en ? "Name on the resume" : "Nombre en el CV"} placeholder={TITULOS[cv.idioma][id]} value={cv.titulosPropios?.[id] ?? ""} maxLength={60} onChange={(e) => setCv({ titulosPropios: { ...cv.titulosPropios, [id]: e.target.value } })} />
                  </div>
                  <button type="button" onClick={() => setRenombrando(null)} className={cn(pastilla, "shrink-0 bg-[#162543] px-4 text-white")}>{en ? "Done" : "Listo"}</button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Tarjeta>
  );
}

/**
 * MÁS SECCIONES (18 y 19-nov-2026): Proyectos, Cursos, Premios, Voluntariado,
 * Publicaciones, Intereses, Referencias, Declaración y secciones con nombre
 * propio, como en FlowCV. Todas opcionales: cerradas, solo un botón para
 * sumarlas; abiertas cuando ya tienen algo. Lo que queda en blanco no sale.
 */
type Extra = "proyectos" | "cursos" | "premios" | "voluntariado" | "publicaciones";
const EXTRAS: { id: Extra; tipo: TipoEntrada; ayuda: Par }[] = [
  { id: "proyectos", tipo: "proyecto", ayuda: ["Trabajos por cuenta propia, proyectos personales u obras destacadas.", "Freelance jobs, personal projects or notable work."] },
  { id: "cursos", tipo: "curso", ayuda: ["Cursos, talleres o capacitaciones que sumen para el puesto.", "Courses, workshops or training that help for the job."] },
  { id: "premios", tipo: "premio", ayuda: ["Reconocimientos, becas o concursos.", "Recognitions, scholarships or competitions."] },
  { id: "voluntariado", tipo: "voluntariado", ayuda: ["Voluntariado, asociaciones, comités o grupos.", "Volunteering, associations, committees or groups."] },
  { id: "publicaciones", tipo: "publicacion", ayuda: ["Artículos, investigaciones o libros.", "Articles, research or books."] },
];
const DECLARACION = {
  es: "Declaro que la información de este currículum es verdadera y puede comprobarse.",
  en: "I declare that the information in this resume is true and can be verified.",
};
function MasSecciones({ cv, setCv, en }: { cv: CvDocumento; setCv: (cambio: Partial<CvDocumento>) => void; en: boolean }) {
  const t = TITULOS[cv.idioma];
  const k = en ? 1 : 0;
  const referencias = cv.referencias ?? [], secciones = cv.secciones ?? [], intereses = cv.intereses ?? [];
  const [abiertas, setAbiertas] = useState(() => new Set<string>([
    ...EXTRAS.filter((x) => (cv[x.id] ?? []).length).map((x) => x.id),
    referencias.length ? "referencias" : "", intereses.length ? "intereses" : "", cv.declaracion ? "declaracion" : "",
  ].filter(Boolean)));
  const abrir = (clave: string) => setAbiertas((a) => new Set(a).add(clave));
  const cerrar = (clave: string) => setAbiertas((a) => { const n = new Set(a); n.delete(clave); return n; });
  const cambiarRef = (i: number, cambio: Partial<Referencia>) => setCv({ referencias: referencias.map((r, j) => (j === i ? { ...r, ...cambio } : r)) });
  const cambiarSec = (i: number, cambio: Partial<SeccionLibre>) => setCv({ secciones: secciones.map((x, j) => (j === i ? { ...x, ...cambio } : x)) });
  const quitar = "inline-flex h-9 items-center gap-1.5 justify-self-start rounded-full px-2 text-[13px] font-semibold text-[#b42318] hover:bg-[#fef3f2]";
  const sumar = cn(pastilla, "border border-dashed border-[#b9c8d6] bg-white text-[#162543] hover:border-[#009FD9] hover:text-[#007fae]");
  // Quitar una sección pide confirmación si tiene algo escrito (20-nov-2026).
  const [quitando, setQuitando] = useState<string | null>(null);
  const quitarSeccion = (clave: string, cambio: Partial<CvDocumento>) => {
    const hacer = () => { setQuitando(null); setCv(cambio); cerrar(clave); };
    const conAlgo = clave === "intereses" ? !!cv.intereses?.length : clave === "referencias" ? !!cv.referencias?.some((r) => r.nombre.trim()) : clave === "declaracion" ? !!cv.declaracion?.texto.trim() : clave.startsWith("libre") ? true : seccionConContenido(cv, clave as SeccionId);
    if (quitando === clave) return <ConfirmarBorrado en={en} alCancelar={() => setQuitando(null)} alConfirmar={hacer} texto={en ? "Remove this section and what you wrote in it?" : "¿Quitar esta sección y lo que escribió en ella?"} />;
    return <button type="button" onClick={() => (conAlgo ? setQuitando(clave) : hacer())} className={quitar}><Trash2 className="h-4 w-4" /> {en ? "Remove section" : "Quitar sección"}</button>;
  };
  return (
    <div className="grid gap-4">
      <OrganizarSecciones cv={cv} setCv={setCv} en={en} />
      <p className="text-[13px] leading-5 text-[#667085]">{en ? "Optional. Add only what helps for the job you want; empty sections don't appear." : "Opcional. Agregue solo lo que ayude para el puesto que busca; lo que quede vacío no sale en el CV."}</p>
      {EXTRAS.filter((x) => abiertas.has(x.id)).map((x) => (
        <Tarjeta key={x.id} titulo={cv.titulosPropios?.[x.id]?.trim() || t[x.id]} ayuda={x.ayuda[k]}>
          <div className="grid gap-3">
            <Entradas tipo={x.tipo} en={en} lista={cv[x.id] ?? []} alCambiar={(lista) => setCv({ [x.id]: lista } as Partial<CvDocumento>)} ia={x.tipo === "proyecto" || x.tipo === "voluntariado" ? { idioma: cv.idioma, titular: cv.titular } : undefined} />
            {quitarSeccion(x.id, { [x.id]: [] } as Partial<CvDocumento>)}
          </div>
        </Tarjeta>
      ))}
      {abiertas.has("intereses") && (
        <Tarjeta titulo={cv.titulosPropios?.intereses?.trim() || t.intereses} ayuda={en ? "A few, and only if they say something about you." : "Pocos, y solo si dicen algo de usted."}>
          <div className="grid gap-3">
            <Etiquetas en={en} lista={intereses} alCambiar={(lista) => setCv({ intereses: lista })} ejemplo={en ? "Cycling, photography…" : "Ciclismo, fotografía…"} />
            {quitarSeccion("intereses", { intereses: [] })}
          </div>
        </Tarjeta>
      )}
      {secciones.map((x, i) => (
        <Tarjeta key={i} titulo={x.titulo.trim() || (en ? "New section" : "Sección nueva")}>
          <div className="grid gap-3">
            <Input label={en ? "Section name" : "Nombre de la sección"} placeholder={en ? "E.g. Volunteering" : "Ej.: Voluntariado"} value={x.titulo} maxLength={60} onChange={(e) => cambiarSec(i, { titulo: e.target.value })} />
            <TextoConFormato etiqueta={en ? "Content" : "Contenido"} en={en} valor={x.texto} alCambiar={(texto) => cambiarSec(i, { texto })} />
            {quitando === `libre-${i}`
              ? <ConfirmarBorrado en={en} alCancelar={() => setQuitando(null)} alConfirmar={() => { setQuitando(null); setCv({ secciones: secciones.filter((_, j) => j !== i) }); }} texto={en ? "Remove this section and what you wrote in it?" : "¿Quitar esta sección y lo que escribió en ella?"} />
              : <button type="button" onClick={() => (x.titulo.trim() || x.texto.trim() ? setQuitando(`libre-${i}`) : setCv({ secciones: secciones.filter((_, j) => j !== i) }))} className={quitar}><Trash2 className="h-4 w-4" /> {en ? "Remove section" : "Quitar sección"}</button>}
          </div>
        </Tarjeta>
      ))}
      {abiertas.has("referencias") && (
        <Tarjeta titulo={cv.titulosPropios?.referencias?.trim() || t.referencias} ayuda={en ? "Ask first whether they agree to be contacted." : "Preguntales antes si están de acuerdo en que les llamen."}>
          <div className="grid gap-3">
            {referencias.map((r, i) => (
              <div key={i} className="grid gap-3 rounded-xl border border-[#eef2f6] bg-[#fbfcfd] p-3">
                <div className="grid gap-3 @[560px]:grid-cols-2">
                  <Input label={en ? "Name" : "Nombre"} value={r.nombre} maxLength={120} onChange={(e) => cambiarRef(i, { nombre: e.target.value })} />
                  <Input label={en ? "Role and company" : "Cargo y empresa"} placeholder={en ? "E.g. Manager, Hotel Atenas" : "Ej.: Gerente, Hotel Atenas"} value={r.cargo} maxLength={160} onChange={(e) => cambiarRef(i, { cargo: e.target.value })} />
                  <div className="@[560px]:col-span-2"><Input label={en ? "Phone or email" : "Teléfono o correo"} value={r.contacto} maxLength={160} onChange={(e) => cambiarRef(i, { contacto: e.target.value })} /></div>
                </div>
                {quitando === `ref-${i}`
                  ? <ConfirmarBorrado en={en} alCancelar={() => setQuitando(null)} alConfirmar={() => { setQuitando(null); setCv({ referencias: referencias.filter((_, j) => j !== i) }); }} texto={en ? `Remove ${r.nombre.trim() || "this reference"}?` : `¿Quitar a ${r.nombre.trim() || "esta referencia"}?`} />
                  : <button type="button" onClick={() => (r.nombre.trim() || r.cargo.trim() || r.contacto.trim() ? setQuitando(`ref-${i}`) : setCv({ referencias: referencias.filter((_, j) => j !== i) }))} className={quitar}><Trash2 className="h-4 w-4" /> {en ? "Remove" : "Quitar"}</button>}
              </div>
            ))}
            <button type="button" onClick={() => setCv({ referencias: [...referencias, { nombre: "", cargo: "", contacto: "" }] })} className={cn(pastilla, "justify-self-start border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb]")}>
              <Plus className="h-4 w-4" /> {en ? "Add reference" : "Agregar referencia"}
            </button>
          </div>
        </Tarjeta>
      )}
      {abiertas.has("declaracion") && (
        <Tarjeta titulo={cv.titulosPropios?.declaracion?.trim() || t.declaracion} ayuda={en ? "Some employers and public institutions ask for it. It goes at the end, with your name." : "Algunas empresas e instituciones públicas la piden. Va al final, con su nombre."}>
          <div className="grid gap-3">
            <TextoConFormato etiqueta={en ? "Text" : "Texto"} en={en} vinetas={false} filas={3} max={600} valor={cv.declaracion?.texto ?? ""} alCambiar={(texto) => setCv({ declaracion: { ...cv.declaracion, lugarFecha: cv.declaracion?.lugarFecha ?? "", texto } })} />
            <Input label={en ? "Place and date" : "Lugar y fecha"} placeholder={en ? "E.g. San José, November 19, 2026" : "Ej.: San José, 19 de noviembre de 2026"} value={cv.declaracion?.lugarFecha ?? ""} maxLength={120} onChange={(e) => setCv({ declaracion: { ...cv.declaracion, texto: cv.declaracion?.texto ?? "", lugarFecha: e.target.value } })} />
            <FirmaDibujada en={en} valor={cv.declaracion?.firma} alCambiar={(firma) => setCv({ declaracion: { texto: cv.declaracion?.texto ?? "", lugarFecha: cv.declaracion?.lugarFecha ?? "", ...(firma ? { firma } : {}) } })} />
            {quitarSeccion("declaracion", { declaracion: undefined })}
          </div>
        </Tarjeta>
      )}
      <div className="flex flex-wrap gap-2">
        {EXTRAS.filter((x) => !abiertas.has(x.id)).map((x) => (
          <button key={x.id} type="button" onClick={() => { abrir(x.id); if (!(cv[x.id] ?? []).length) setCv({ [x.id]: [vacia()] } as Partial<CvDocumento>); }} className={sumar}><Plus className="h-4 w-4" />{t[x.id]}</button>
        ))}
        {!abiertas.has("intereses") && <button type="button" onClick={() => abrir("intereses")} className={sumar}><Plus className="h-4 w-4" />{t.intereses}</button>}
        {!abiertas.has("referencias") && <button type="button" onClick={() => { abrir("referencias"); if (!referencias.length) setCv({ referencias: [{ nombre: "", cargo: "", contacto: "" }] }); }} className={sumar}><Plus className="h-4 w-4" />{t.referencias}</button>}
        {!abiertas.has("declaracion") && <button type="button" onClick={() => { abrir("declaracion"); if (!cv.declaracion) setCv({ declaracion: { texto: DECLARACION[cv.idioma], lugarFecha: "" } }); }} className={sumar}><Plus className="h-4 w-4" />{t.declaracion}</button>}
        {secciones.length < 4 && <button type="button" onClick={() => setCv({ secciones: [...secciones, { titulo: "", texto: "" }] })} className={sumar}><Plus className="h-4 w-4" />{en ? "Custom section" : "Sección propia"}</button>}
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
  // "¿Ya tiene un CV?" y al rato cambiaba a "Tiene un CV en su perfil" (parpadeo).
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
          format: ["Elija un PDF o un Word (.docx).", "Choose a PDF or a Word file (.docx)."],
          size: ["El archivo está vacío o pesa más de 5 MB.", "The file is empty or larger than 5 MB."],
          protected: ["El archivo tiene contraseña. Exporte una copia sin contraseña.", "The file is password-protected. Export an unprotected copy."],
        };
        const [es, eng] = textos[codigo] ?? ["No pudimos leerlo. Use un PDF con texto seleccionable o un Word.", "We couldn't read it. Use a PDF with selectable text or a Word file."];
        throw new Error(en ? eng : es);
      }
      setMensaje(resultado(alLeer(reviewCv(texto).profile)));
    } catch (err) {
      setMensaje({ tipo: "error", texto: err instanceof Error && err.message ? err.message : (en ? "We couldn't read it." : "No pudimos leerlo.") });
    } finally { setLeyendo(false); }
  };
  const resultado = (n: number) => (n
    ? { tipo: "ok" as const, texto: en ? `Added ${n} item${n === 1 ? "" : "s"}. Review them in each step.` : `Agregamos ${n} dato${n === 1 ? "" : "s"}. Revisalos en cada paso.` }
    : { tipo: "ok" as const, texto: en ? "Everything in that CV is already here." : "Todo lo de ese CV ya estaba aquí." });
  // PEGAR EL TEXTO (20-nov-2026): para quien tiene el CV en un correo, en
  // LinkedIn o en un documento que no es PDF ni Word. Pasa por la misma lectura.
  const [pegando, setPegando] = useState(false);
  const [pegado, setPegado] = useState("");
  const usarPegado = async () => {
    const texto = pegado.trim();
    if (texto.length < 40) { setMensaje({ tipo: "error", texto: en ? "Paste a bit more of your CV: at least a few lines." : "Pegue un poco más de su CV: al menos unas líneas." }); return; }
    setLeyendo(true); setMensaje(null);
    try {
      const { reviewCv } = await import("@/lib/cv/model");
      setMensaje(resultado(alLeer(reviewCv(texto.slice(0, 30000)).profile)));
      setPegando(false); setPegado("");
    } catch { setMensaje({ tipo: "error", texto: en ? "We couldn't read it." : "No pudimos leerlo." }); }
    finally { setLeyendo(false); }
  };
  const usarAdjunto = () => leer(async () => {
    const r = await fetch(endpoint, { cache: "no-store" });
    if (!r.ok) throw new Error(en ? "We couldn't open the CV on your profile." : "No pudimos abrir el CV de su perfil.");
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
            {destacado ? (en ? "You have a CV on your profile" : "Tiene un CV en su perfil") : (en ? "Already have a CV?" : "¿Ya tiene un CV?")}
          </h3>
          <p className="mt-0.5 text-[13px] leading-5 text-[#667085]">
            {destacado
              ? (en ? "Shall we use it to fill this in? Nothing you wrote is deleted." : "¿Lo usamos para llenar esto? No se borra nada de lo que ya tiene.")
              : (en ? "Fill this in from your file (PDF or Word). Nothing you wrote is deleted." : "Llénelo desde su archivo (PDF o Word). No se borra nada de lo que ya tiene.")}
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
        {!pegando && (
          <button type="button" disabled={leyendo} onClick={() => { setPegando(true); setMensaje(null); }} className={cn(pastilla, "text-[#007fae] hover:bg-[#eef6fb] @[560px]:col-span-2")} data-testid="cv-pegar-texto">
            <ClipboardPaste className="h-4 w-4" />{en ? "Paste your CV text" : "Pegar texto de su CV"}
          </button>
        )}
      </div>
      {pegando && (
        <div className="mt-3 grid gap-2">
          <label className="text-sm font-semibold text-[#344054]" htmlFor="cv-texto-pegado">{en ? "Your CV text" : "El texto de su CV"}</label>
          <textarea id="cv-texto-pegado" rows={7} maxLength={30000} value={pegado} onChange={(e) => setPegado(e.target.value)} className={campo}
            placeholder={en ? "Copy everything from your CV (Word, Google Docs, LinkedIn…) and paste it here." : "Copie todo su CV (Word, Google Docs, LinkedIn…) y péguelo aquí."} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={leyendo || !pegado.trim()} onClick={() => void usarPegado()} className={cn(pastilla, "bg-[#009FD9] text-white hover:bg-[#0089bb]")}>{en ? "Fill in with this text" : "Llenar con este texto"}</button>
            <button type="button" onClick={() => { setPegando(false); setPegado(""); }} className={cn(pastilla, "text-[#475467] hover:bg-[#f2f4f7]")}>{en ? "Cancel" : "Cancelar"}</button>
          </div>
        </div>
      )}
      {leyendo && <p role="status" className="mt-2 text-[13px] text-[#667085]">{en ? "Reading your CV…" : "Leyendo su CV…"}</p>}
      {mensaje && <p role={mensaje.tipo === "error" ? "alert" : "status"} className={cn("mt-2 text-[13px] font-semibold", mensaje.tipo === "error" ? "text-[#b42318]" : "text-[#067647]")}>{mensaje.texto}</p>}
    </section>
  );
}

/**
 * «REVISAR PARA UNA VACANTE» (opcional, al final): se pega el anuncio y se ve
 * qué palabras clave ya tiene el currículum y cuáles no. Solo informa: no
 * reescribe ni agrega nada, para no meter en el CV algo que la persona no tiene.
 */
function RevisarVacante({ cv, en, textoInicial }: { cv: CvDocumento; en: boolean; textoInicial?: string }) {
  const [texto, setTexto] = useState(() => (textoInicial ?? "").slice(0, 6000));
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
        <p className="text-[13px] leading-5 text-[#667085]">{en ? "Paste the job post. We show which keywords your resume already has and which are missing. Nothing is changed." : "Pegue el anuncio. Le mostramos qué palabras clave ya tiene su currículum y cuáles faltan. No cambiamos nada."}</p>
        <textarea rows={5} maxLength={6000} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label={en ? "Job post" : "Anuncio de la vacante"} placeholder={en ? "Paste the job post here" : "Pegue aquí el anuncio"} className={campo} />
        {resultado && (
          <div className="grid gap-2" role="status">
            <p className="text-[13px] font-black text-[#162543]">{en ? `${resultado.puntaje}% of the keywords match` : `Coincide el ${resultado.puntaje} % de las palabras clave`}</p>
            {resultado.estan.length > 0 && <div><p className="text-xs font-semibold text-[#067647]">{en ? "Already in your resume" : "Ya están en su currículum"}</p>{chips(resultado.estan, "bg-[#ecfdf3] text-[#067647]")}</div>}
            {resultado.faltan.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#93370d]">{en ? "Not in your resume" : "No aparecen"}</p>
                {chips(resultado.faltan, "bg-[#fffaeb] text-[#93370d]")}
                <p className="mt-1.5 text-[12px] leading-4 text-[#667085]">{en ? "Add them only if they are true for you, in your own words, in skills or achievements." : "Agréguelas solo si de verdad las tiene, con sus palabras, en habilidades o en sus logros."}</p>
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
      avisar(en ? "Done: it's on your profile" : "Listo: ya está en su perfil");
      setPaso("inicio");
    } catch {
      avisar(en ? "It couldn't be added to your profile. Try again." : "No se pudo poner en su perfil. Pruebe de nuevo.");
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
      <span>{en ? "Clients will see this resume when they tap \"View PDF\" on your profile. It goes without your email or phone, and replaces the file you had." : "Los clientes verán este currículum al tocar \"Ver PDF\" en su perfil. Va sin su correo ni su teléfono y reemplaza el archivo que tenía."}</span>
      <span className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={paso === "subiendo"} onClick={() => setPaso("inicio")} className="h-11 rounded-full px-3 font-semibold text-[#52627a] hover:bg-white">{en ? "Cancel" : "Cancelar"}</button>
        <button type="button" disabled={paso === "subiendo"} onClick={() => void subir()} className="h-11 rounded-full bg-[#009FD9] px-4 font-bold text-white disabled:opacity-60">{paso === "subiendo" ? (en ? "Uploading…" : "Subiendo…") : (en ? "Put it on my profile" : "Ponerlo en mi perfil")}</button>
      </span>
    </div>
  );
}

type Vista = "editar" | "diseno" | "vista";
const VISTAS = [["editar", Pencil, "Editar", "Edit"], ["diseno", Palette, "Diseño", "Design"], ["vista", Eye, "Vista previa", "Preview"]] as const;

function Editor({ pro, documento, borrador, setBorrador, desdeElPerfil, nube, alVolver, disenoDelCv, alCrearCopia, ofertaInicial }: { pro: ProData; documento: Tipo; borrador: Borrador; setBorrador: Dispatch<SetStateAction<Borrador>>; desdeElPerfil: (idioma: Idioma) => Borrador; nube: EstadoNube; alVolver: () => void; disenoDelCv?: Partial<Diseno>; alCrearCopia?: (b: Borrador) => void; ofertaInicial?: OfertaDeEmpleo }) {
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
  // EDITAR / DISEÑO / VISTA PREVIA (19-nov-2026), como FlowCV en el teléfono.
  // En la computadora la vista previa está siempre a la derecha.
  const [vista, setVista] = useState<Vista>("editar");
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
      avisar(en ? "The PDF couldn't be created. Try again." : "No se pudo crear el PDF. Pruebe de nuevo.");
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

  const botonDescargar = (
    <button type="button" disabled={generando} onClick={() => void descargar()} className={cn(pastilla, "w-full bg-[#009FD9] text-white hover:bg-[#0089bb]")}>
      <Download className="h-4 w-4" />{en ? "Download PDF" : "Descargar PDF"}
    </button>
  );
  const tituloCv = TITULOS[cv.idioma];
  const lleno = cv.habilidades.length >= LIMITES.habilidades;
  const baseDelPerfil = () => {
    const h = cv.habilidades.slice(0, 3).join(", ");
    return cv.idioma === "en"
      ? `${cv.titular || "[Your role]"}${h ? ` experienced in ${h}` : ""}. [Your main achievement or strength, ideally with a number.] [What you are looking for.]`
      : `${cv.titular || "[Su oficio o cargo]"}${h ? ` con experiencia en ${h}` : ""}. [Su logro o fortaleza principal, idealmente con un número.] [Qué busca.]`;
  };

  // ── LOS PASOS ──
  const pasoDelCv: Record<PasoCv, ReactNode> = {
    contacto: (
      <div className="grid gap-4">
      <LlenarDesdeCv professionalId={String(pro?.id ?? "")} vacio={!cv.experiencia.length && !cv.educacion.length} en={en} alLeer={sumarArchivo} />
      <Tarjeta
        titulo={en ? "Your details" : "Sus datos"}
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
      <Tarjeta titulo={tituloCv.experiencia} ayuda={en ? "Most recent first. Start each achievement with a verb and add numbers." : "Lo más reciente primero. Empiece cada logro con un verbo y agregue números."}>
        <Entradas tipo="experiencia" en={en} lista={cv.experiencia} alCambiar={(experiencia) => setCv({ experiencia })} ia={{ idioma: cv.idioma, titular: cv.titular }} />
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
          ayuda={en ? `Choose 6 to ${LIMITES.habilidades}: the ones the job asks for. A long list reads as filler.` : `Elija de 6 a ${LIMITES.habilidades}: las que pide el puesto. Una lista larga se lee como relleno.`}
          accion={<span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", lleno ? "bg-[#eef8fd] text-[#007fae]" : "bg-[#f2f4f7] text-[#52627a]")}>{cv.habilidades.length}/{LIMITES.habilidades}</span>}
        >
          <Etiquetas en={en} lista={cv.habilidades} alCambiar={(habilidades) => setCv({
            habilidades,
            // La que se quita vuelve a las sugeridas: no se pierde.
            sugeridas: [...cv.habilidades.filter((x) => !habilidades.includes(x)), ...cv.sugeridas.filter((x) => !habilidades.includes(x))],
          })} ejemplo={en ? "Excel, customer service…" : "Excel, servicio al cliente…"} />
          {cv.sugeridas.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold text-[#52627a]">{en ? "From your profile — tap to add" : "De su perfil: toque para agregar"}</p>
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
      <Tarjeta titulo={tituloCv.resumen} ayuda={en ? "2–3 lines at the top of your CV: what you do, your experience and your strengths." : "2 o 3 líneas que van arriba en su CV: qué hace, su experiencia y en qué es fuerte."}>
        <TextoConFormato etiqueta={en ? "Summary" : "Resumen"} en={en} filas={5} max={600} valor={cv.resumen} alCambiar={(resumen) => setCv({ resumen })} />
        <div className="mt-1 flex items-center justify-between gap-2">
          <button type="button" onClick={() => setCv({ resumen: baseDelPerfil() })} className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-[#007fae] hover:bg-[#eef6fb]">
            <Lightbulb className="h-4 w-4" />{en ? "Start from a template" : "Empezar con una base"}
          </button>
          <span className="text-xs text-[#98a2b3]">{cv.resumen.length}/600</span>
        </div>
        <MejorarConIa tipo="resumen" en={en} idioma={cv.idioma} texto={cv.resumen} contexto={cv.titular} alElegir={(resumen) => setCv({ resumen })} />
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
      <Tarjeta titulo={en ? "The position" : "El puesto"} ayuda={en ? "A cover letter goes with your resume: one page, about 300 words." : "La carta acompaña su currículum: una página, unas 300 palabras."}>
        <div className="grid gap-3 @[560px]:grid-cols-2">
          <Input label={en ? "Position" : "Puesto"} value={carta.puesto} maxLength={120} onChange={(e) => setCarta({ puesto: e.target.value })} />
          <Input label={en ? "Company" : "Empresa"} value={carta.empresa} maxLength={120} onChange={(e) => setCarta({ empresa: e.target.value })} />
        </div>
        <button type="button" onClick={() => setCarta(cartaInicial(cv, { puesto: carta.puesto, empresa: carta.empresa }))} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-[#007fae] hover:bg-[#eef6fb]">
          <RotateCcw className="h-4 w-4" />{en ? "Rewrite with this position" : "Rehacer con este puesto"}
        </button>
      </Tarjeta>
      <Tarjeta titulo={en ? "Who it is for" : "Para quién es"} ayuda={en ? "Only the name is needed; the rest appears above the greeting if you fill it in." : "Basta con el nombre; lo demás sale arriba del saludo si lo completa."}>
        <div className="grid gap-3 @[560px]:grid-cols-2">
          <Input label={en ? "Addressed to" : "Dirigida a"} value={carta.destinatario} maxLength={120} onChange={(e) => setCarta({ destinatario: e.target.value })} />
          <Input label={en ? "Their role (optional)" : "Cargo (opcional)"} placeholder={en ? "E.g. HR Manager" : "Ej.: Jefa de Recursos Humanos"} value={carta.cargo ?? ""} maxLength={120} onChange={(e) => setCarta({ cargo: e.target.value })} />
          <div className="@[560px]:col-span-2"><Input label={en ? "Company address (optional)" : "Dirección de la empresa (opcional)"} placeholder={en ? "E.g. Escazú, San José" : "Ej.: Escazú, San José"} value={carta.direccion ?? ""} maxLength={160} onChange={(e) => setCarta({ direccion: e.target.value })} /></div>
        </div>
      </Tarjeta>
      <CartaConIa cv={cv} carta={carta} en={en} ofertaInicial={ofertaInicial} alEscribir={(p) => setCarta(p)} />
      <Tarjeta titulo={en ? "Date and subject" : "Fecha y asunto"}>
        <div className="grid gap-3 @[560px]:grid-cols-2">
          <div className="grid gap-1.5">
            <Input type="date" label={en ? "Date" : "Fecha"} value={carta.fecha ?? ""} onChange={(e) => setCarta({ fecha: e.target.value })} />
            <p className="text-[12px] text-[#667085]">{carta.fecha ? fechaDeLaCarta(carta, cv.idioma) : (en ? `Empty: the day you download it (${fechaDeLaCarta({}, cv.idioma)}).` : `Vacía: el día que la descargues (${fechaDeLaCarta({}, cv.idioma)}).`)}</p>
          </div>
          <Input label={en ? "Subject" : "Asunto"} placeholder={asuntoPorDefecto(carta, cv.idioma) || (en ? "Application for…" : "Postulación al puesto de…")} value={carta.asunto ?? ""} maxLength={160} onChange={(e) => setCarta({ asunto: e.target.value })} />
        </div>
      </Tarjeta>
      <Tarjeta titulo={en ? "How you greet them" : "Cómo saluda"} ayuda={en ? "Tap one or write your own." : "Toque uno o escriba el suyo."}>
        <Input label={en ? "Greeting" : "Saludo"} placeholder={saludoPorDefecto(carta, cv.idioma)} value={carta.saludo ?? ""} maxLength={120} onChange={(e) => setCarta({ saludo: e.target.value })} />
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label={en ? "Suggested greetings" : "Saludos sugeridos"}>
          {saludosSugeridos(carta, cv.idioma).map((x) => {
            const activo = (carta.saludo?.trim() || saludoPorDefecto(carta, cv.idioma)) === x;
            return (
              <button key={x} type="button" aria-pressed={activo} onClick={() => setCarta({ saludo: x === saludoPorDefecto(carta, cv.idioma) ? "" : x })}
                className={cn("rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors", activo ? "border-[#009FD9] bg-[#eef8fc] text-[#006f9c]" : "border-[#d7e1ea] bg-white text-[#344054] hover:bg-[#f5f8fb]")}>
                {x}
              </button>
            );
          })}
        </div>
      </Tarjeta>
        {([
          ["apertura", en ? "Which job are you applying for?" : "¿A qué puesto se postula?", en ? "Say the position and how you found it." : "Dígalo y cuente cómo lo encontró."],
          ["porQueEncajo", en ? "What shows you can do this job?" : "¿Qué muestra que puede hacer este trabajo?", en ? "2–3 achievements from your resume, with numbers." : "2 o 3 logros de su currículum, con números."],
          ["porQueLaEmpresa", en ? "Why this company?" : "¿Por qué esta empresa?", en ? "Something specific about them." : "Algo concreto de ellos."],
          ["cierre", en ? "How do you want to close?" : "¿Cómo quiere cerrar?", en ? "Invite them to talk and say thanks." : "Invite a conversar y agradezca."],
        ] as const).map(([k, titulo, ayuda]) => (
          <Tarjeta key={k} titulo={titulo} ayuda={ayuda}>
            <TextoConFormato etiqueta={titulo} en={en} filas={k === "porQueEncajo" ? 5 : 3} max={900} valor={carta[k]} alCambiar={(v) => setCarta({ [k]: v } as Partial<Carta>)} />
          </Tarjeta>
        ))}
      <Tarjeta titulo={en ? "Sign-off and signature" : "Despedida y firma"}>
        <div className="grid gap-4">
          <Input label={en ? "Sign-off" : "Despedida"} placeholder={despedidaPorDefecto(cv.idioma)} value={carta.despedida ?? ""} maxLength={80} onChange={(e) => setCarta({ despedida: e.target.value })} />
          <FirmaDibujada en={en} valor={carta.firma} alCambiar={(firma) => setCarta({ firma })} />
        </div>
      </Tarjeta>
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
      {pestana === "cv" && <RevisarVacante cv={cv} en={en} textoInicial={ofertaInicial?.texto} />}
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
        {pestana === "cv" ? (en ? "Next: your cover letter" : "Siguiente: su carta de presentación") : (en ? "See my resume" : "Ver mi currículum")}<ChevronRight className="h-4 w-4" />
      </Link>
      <EstadoGuardado estado={nube} en={en} className="-mt-2 justify-self-center" />
    </div>
  );

  const contenido = enRevision ? revision : (pestana === "cv" ? pasoDelCv[pasoCv] : pasoDeLaCarta[pasoCarta]);
  const enDiseno = vista === "diseno";
  return (
    // El ancho que manda es el del panel, no el de la pantalla: lado a lado
    // solo cuando el panel mide 980 px o más; si no, la hoja va en su pestaña.
    <div ref={arriba} className="@container grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] scroll-mt-24 gap-4 overflow-x-clip" data-testid="cv-builder">
      {/* Debajo de lg la barra ya tiene la flecha que vuelve a la lista. */}
      <button type="button" onClick={alVolver} className="hidden min-h-11 items-center gap-1 justify-self-start rounded-full pr-3 text-sm font-bold text-[#007fae] hover:bg-[#eef6fb] lg:inline-flex" data-testid="cv-volver-lista">
        <ChevronLeft className="h-4 w-4" />{pestana === "cv" ? (en ? "My resumes" : "Mis currículums") : (en ? "My cover letters" : "Mis cartas")}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label={en ? "Editor" : "Editor"} className="grid w-full grid-cols-3 gap-1 rounded-2xl bg-[#eef3f7] p-1 @[980px]:w-fit @[980px]:grid-cols-2">
          {VISTAS.map(([id, Icono, es, eng]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={vista === id}
              onClick={() => irA(() => setVista(id))}
              className={cn("inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-bold transition-colors @[980px]:px-5", vista === id ? "bg-white text-[#162543] shadow-sm" : "text-[#52627a] hover:text-[#162543]", id === "vista" && "@[980px]:hidden")}
              data-testid={`cv-vista-${id}`}
            >
              {/* En un teléfono angosto sin ícono: «Vista previa» cabe en una línea. */}
              <Icono className="hidden h-4 w-4 shrink-0 @[440px]:block" /><span className="whitespace-nowrap">{en ? eng : es}</span>
            </button>
          ))}
        </div>
        <EstadoGuardado estado={nube} en={en} className="ml-auto" />
      </div>
      {pestana === "cv" && !enDiseno && (
        <div className={cn("min-w-0", vista === "vista" && "hidden @[980px]:block")}>
          <AdaptarConIa cv={cv} en={en} puedeCrear={!!alCrearCopia} ofertaInicial={ofertaInicial} alAplicar={(nuevo, como) => {
            if (como.nuevo && alCrearCopia) alCrearCopia({ cv: nuevo, carta, etiqueta: como.nombre });
            else { setCv(nuevo); avisar(en ? "Changes applied." : "Cambios aplicados."); }
          }} />
        </div>
      )}
      {!enDiseno && (
        <div className={cn(vista === "vista" && "hidden @[980px]:block")}>
          {pestana === "cv"
            ? <Pasos en={en} pasos={PASOS_CV} actual={pasoCv} hechos={hechosCv} alElegir={(p) => irA(() => { dejar(`cv:${pasoCv}`); setPasoCv(p); })} />
            : <Pasos en={en} pasos={PASOS_CARTA} actual={pasoCarta} hechos={hechosCarta} alElegir={(p) => irA(() => { dejar(`carta:${pasoCarta}`); setPasoCarta(p); })} />}
        </div>
      )}

      <div className="grid items-start gap-4 @[980px]:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
        <div className={cn("grid min-w-0 gap-4", vista === "vista" && "hidden @[980px]:grid")} data-testid={enDiseno ? "cv-paso-diseno" : `cv-paso-${paso}`}>
          {enDiseno
            ? <PanelDiseno cv={cv} carta={pestana === "carta" ? carta : undefined} setCv={setCv} en={en} disenoDelCv={pestana === "carta" ? disenoDelCv : undefined} />
            : contenido}
          {/* Atrás / Siguiente pegados al fondo en el teléfono, ENCIMA de la
              barra del app (antes la barra tapaba descargar). */}
          <AccionesAlPie className="grid grid-cols-2 gap-3">
            {enDiseno ? (
              <>
                <button type="button" onClick={() => irA(() => setVista("editar"))} className={cn(pastilla, "w-full border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb]")}>
                  <Pencil className="h-4 w-4" />{en ? "Edit" : "Editar"}
                </button>
                {botonDescargar}
              </>
            ) : (
              <>
                <button type="button" disabled={indice === 0} onClick={() => mover(-1)} className={cn(pastilla, "w-full border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb] disabled:opacity-40")}>
                  <ChevronLeft className="h-4 w-4" />{en ? "Back" : "Atrás"}
                </button>
                {enRevision ? botonDescargar : (
                  <button type="button" onClick={() => mover(1)} className={cn(pastilla, "w-full bg-[#009FD9] text-white hover:bg-[#0089bb]")}>
                    {indice === pasos.length - 2 ? (en ? "Review" : "Revisar") : (en ? "Next" : "Siguiente")}<ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
          </AccionesAlPie>
        </div>
        {/* Una sola vista previa: a la derecha en la computadora, y en su
            pestaña en el teléfono. */}
        <aside className={cn("min-w-0", vista === "vista" ? "block" : "hidden", "@[980px]:sticky @[980px]:top-24 @[980px]:block @[980px]:max-h-[calc(100dvh-7rem)] @[980px]:overflow-y-auto")}>
          <VistaPrevia cv={cv} carta={pestana === "carta" ? carta : undefined} en={en} pie={<div className="@[980px]:hidden">{botonDescargar}</div>} />
        </aside>
      </div>
    </div>
  );
}

