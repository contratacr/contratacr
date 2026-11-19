"use client";

import { useMemo, type ReactNode } from "react";
import { Check, RotateCcw } from "lucide-react";
import { ordenDeSecciones, seccionConContenido, tituloDeSeccion, type Carta, type CvDocumento, type SeccionId } from "@/lib/cv/documento";
import { aplicarPlantilla, COLORES, disenoDe, esAptaAts, PLANTILLAS, type Diseno, type EstiloTitulo, type Fuente } from "@/lib/cv/diseno";
import { HojaCargando, Paginas, useMaquetas } from "./cv-hoja";
import { cn } from "@/lib/utils";

/**
 * EL PANEL «DISEÑO» (19-nov-2026), como el de FlowCV: plantillas, columnas,
 * página, letra, color, títulos, encabezado, fechas y habilidades. Todo cambia
 * la vista previa al instante; el contenido nunca se toca.
 */

type Texto = { es: string; en: string };

function Grupo({ titulo, ayuda, children, accion }: { titulo: string; ayuda?: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-black text-[#162543]">{titulo}</h3>
          {ayuda && <p className="mt-0.5 text-[13px] leading-5 text-[#667085]">{ayuda}</p>}
        </div>
        {accion}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

/** Una opción entre varias, como en el resto del editor. */
function Opciones<T extends string | number>({ etiqueta, valor, opciones, alCambiar }: { etiqueta: string; valor: T; opciones: { id: T; texto: ReactNode; nombre?: string }[]; alCambiar: (v: T) => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-semibold text-[#52627a]">{etiqueta}</span>
      <div role="radiogroup" aria-label={etiqueta} className="flex w-full max-w-full flex-wrap gap-1 rounded-2xl bg-[#eef3f7] p-1 sm:w-fit">
        {opciones.map((o) => (
          <button
            key={String(o.id)}
            type="button"
            role="radio"
            aria-checked={valor === o.id}
            aria-label={o.nombre}
            onClick={() => alCambiar(o.id)}
            className={cn("min-h-9 flex-1 rounded-xl px-3 text-[13px] font-bold transition-colors sm:flex-none", valor === o.id ? "bg-white text-[#162543] shadow-sm" : "text-[#52627a] hover:text-[#162543]")}
          >
            {o.texto}
          </button>
        ))}
      </div>
    </div>
  );
}

const FAMILIA: Record<Fuente, string> = { helvetica: "Helvetica, Arial, sans-serif", times: "'Times New Roman', Times, serif", courier: "'Courier New', Courier, monospace" };
const NOMBRE_FUENTE: Record<Fuente, string> = { helvetica: "Helvetica", times: "Times", courier: "Courier" };
const NOMBRE_COLOR: Record<string, Texto> = {
  "#162543": { es: "Azul noche", en: "Navy" }, "#1f3a5f": { es: "Azul acero", en: "Steel blue" }, "#009fd9": { es: "Celeste", en: "Sky blue" },
  "#0f766e": { es: "Verde azulado", en: "Teal" }, "#15803d": { es: "Verde", en: "Green" }, "#b45309": { es: "Ámbar", en: "Amber" },
  "#b42318": { es: "Rojo", en: "Red" }, "#6d28d9": { es: "Violeta", en: "Violet" },
};
const ESTILOS: { id: EstiloTitulo; nombre: Texto }[] = [
  { id: "linea", nombre: { es: "Con línea", en: "Underlined" } },
  { id: "simple", nombre: { es: "Simple", en: "Plain" } },
  { id: "caja", nombre: { es: "En caja", en: "Boxed" } },
  { id: "fina", nombre: { es: "Línea al lado", en: "Side line" } },
  { id: "barra", nombre: { es: "Con barra", en: "Side bar" } },
];

/** Cómo se ve cada estilo de título, en chiquito. */
function MuestraTitulo({ estilo, color }: { estilo: EstiloTitulo; color: string }) {
  const texto = <span className="text-[10px] font-black tracking-[0.06em]" style={{ color }}>EXPERIENCIA</span>;
  switch (estilo) {
    case "linea": return <span className="block w-full border-b pb-0.5" style={{ borderColor: color === "#162543" ? "#52627a" : color }}>{texto}</span>;
    case "simple": return <span className="block w-full">{texto}</span>;
    case "caja": return <span className="block w-full rounded-[3px] px-1.5 py-0.5" style={{ background: `color-mix(in srgb, ${color} 14%, white)` }}>{texto}</span>;
    case "fina": return <span className="flex w-full items-center gap-1.5">{texto}<span className="h-px flex-1" style={{ background: `color-mix(in srgb, ${color} 45%, white)` }} /></span>;
    case "barra": return <span className="block w-full border-l-[3px] pl-1.5" style={{ borderColor: color }}>{texto}</span>;
  }
}

/** Las plantillas, con una miniatura de la hoja de verdad (la del propio documento). */
function Plantillas({ cv, carta, d, en, alElegir }: { cv: CvDocumento; carta?: Carta; d: Diseno; en: boolean; alElegir: (id: Diseno["plantilla"]) => void }) {
  // La carta va siempre en una columna: las de dos columnas se verían repetidas.
  const lista = useMemo(() => PLANTILLAS.filter((p) => !carta || esAptaAts(p.diseno)), [carta]);
  const docs = useMemo(() => lista.map((p) => ({ cv: { ...cv, diseno: aplicarPlantilla(p.id) }, carta })), [lista, cv, carta]);
  const maquetas = useMaquetas(docs);
  return (
    <ul className="grid grid-cols-2 gap-3 @[560px]:grid-cols-3" role="radiogroup" aria-label={en ? "Templates" : "Plantillas"}>
      {lista.map((p, i) => {
        const elegida = d.plantilla === p.id;
        const ats = esAptaAts(p.diseno);
        return (
          <li key={p.id}>
            <button
              type="button"
              role="radio"
              aria-checked={elegida}
              onClick={() => alElegir(p.id)}
              className={cn("grid w-full gap-2 rounded-2xl border bg-[#f6f8fb] p-2 text-left transition-colors", elegida ? "border-[#009FD9] ring-2 ring-[#009FD9]/25" : "border-[#e5e7eb] hover:border-[#b9c8d6]")}
              data-testid={`cv-plantilla-${p.id}`}
            >
              <span className="pointer-events-none block overflow-hidden rounded-[3px]" aria-hidden>
                {maquetas[i] ? <Paginas maqueta={maquetas[i]!} soloPrimera /> : <HojaCargando />}
              </span>
              <span className="flex min-h-6 items-center justify-between gap-1 px-1">
                <span className="truncate text-[13px] font-black text-[#162543]">{p.nombre[en ? "en" : "es"]}</span>
                {elegida && <Check className="h-4 w-4 shrink-0 text-[#009FD9]" />}
              </span>
              {!carta && (
                <span className={cn("mx-1 w-fit rounded-full px-2 py-0.5 text-[11px] font-bold", ats ? "bg-[#ecfdf3] text-[#067647]" : "bg-[#f2f4f7] text-[#52627a]")}>
                  {ats ? (en ? "ATS-friendly" : "Apta para ATS") : (en ? "Two columns" : "Dos columnas")}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function PanelDiseno({ cv, carta, setCv, en, disenoDelCv }: {
  cv: CvDocumento;
  /** Con carta, el panel es el de la carta: sin columnas, títulos ni habilidades. */
  carta?: Carta;
  setCv: (cambio: Partial<CvDocumento>) => void;
  en: boolean;
  /** El diseño del currículum más reciente, para que la carta haga juego. */
  disenoDelCv?: Partial<Diseno>;
}) {
  const d = disenoDe(cv);
  const t = (es: string, eng: string) => (en ? eng : es);
  // Cambiar algo a mano no cambia la plantilla elegida: es «la plantilla, retocada».
  const cambiar = (c: Partial<Diseno>) => setCv({ diseno: { ...d, ...c } });
  const esCarta = !!carta;
  const dosColumnas = !esCarta && d.columnas !== "una";
  const enLateral = new Set(d.lateral);
  const candidatas = ordenDeSecciones(cv).filter((id): id is Exclude<SeccionId, "libres"> => id !== "libres" && (seccionConContenido(cv, id) || enLateral.has(id)));
  const delCv = disenoDelCv ? disenoDe({ diseno: disenoDelCv }) : null;
  const igualAlCv = !!delCv && JSON.stringify({ ...delCv, columnas: "una" }) === JSON.stringify({ ...d, columnas: "una" });
  const plantilla = PLANTILLAS.find((p) => p.id === d.plantilla);
  const retocada = !!plantilla && JSON.stringify(aplicarPlantilla(d.plantilla)) !== JSON.stringify(d);

  return (
    <div className="grid min-w-0 gap-4" data-testid="cv-panel-diseno">
      <Grupo
        titulo={t("Plantillas", "Templates")}
        ayuda={esCarta ? t("Cambian el aspecto; lo que escribiste queda igual.", "They change the look; what you wrote stays the same.") : t("Cambian el aspecto; lo que escribiste queda igual. Para postular en línea, mejor una apta para ATS.", "They change the look; what you wrote stays the same. To apply online, prefer an ATS-friendly one.")}
        accion={retocada ? (
          <button type="button" onClick={() => setCv({ diseno: aplicarPlantilla(d.plantilla) })} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-[#007fae] hover:bg-[#eef6fb]">
            <RotateCcw className="h-4 w-4" />{t("Deshacer retoques", "Reset tweaks")}
          </button>
        ) : undefined}
      >
        {esCarta && delCv && (
          <button
            type="button"
            disabled={igualAlCv}
            onClick={() => setCv({ diseno: { ...delCv } })}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-bold text-[#162543] hover:bg-[#f6f9fb] disabled:opacity-60 sm:w-fit"
          >
            {igualAlCv ? <><Check className="h-4 w-4 text-[#067647]" />{t("Hace juego con tu currículum", "Matches your resume")}</> : t("Usar el diseño de mi currículum", "Use my resume's design")}
          </button>
        )}
        <Plantillas cv={cv} carta={carta} d={d} en={en} alElegir={(id) => setCv({ diseno: aplicarPlantilla(id) })} />
      </Grupo>

      <Grupo titulo={t("Página", "Page")}>
        {!esCarta && (
          <Opciones etiqueta={t("Columnas", "Columns")} valor={d.columnas} alCambiar={(columnas) => cambiar({ columnas })} opciones={[
            { id: "una", texto: t("Una", "One") },
            { id: "izquierda", texto: t("Columna a la izquierda", "Sidebar left") },
            { id: "derecha", texto: t("Columna a la derecha", "Sidebar right") },
          ]} />
        )}
        {dosColumnas && (
          <div className="grid gap-2">
            <span className="text-xs font-semibold text-[#52627a]">{t("Qué va en la columna angosta", "What goes in the narrow column")}</span>
            <ul className="flex flex-wrap gap-2">
              {candidatas.map((id) => {
                const dentro = enLateral.has(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      aria-pressed={dentro}
                      onClick={() => cambiar({ lateral: dentro ? d.lateral.filter((x) => x !== id) : [...d.lateral, id] })}
                      className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors", dentro ? "border-[#009FD9] bg-[#eef8fd] text-[#007fae]" : "border-[#d7e1ea] bg-white text-[#52627a] hover:border-[#b9c8d6]")}
                    >
                      {dentro && <Check className="h-3.5 w-3.5" />}{tituloDeSeccion(cv, id)}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="rounded-xl bg-[#fffaeb] px-3 py-2 text-[12.5px] leading-5 text-[#93370d]">
              {t("Dos columnas se ven bien impresas, pero algunos filtros automáticos (ATS) leen mejor una sola. Si vas a postular en línea, usá una columna.", "Two columns look good printed, but some screening systems (ATS) read a single column better. If you're applying online, use one column.")}
            </p>
          </div>
        )}
        <div className="grid gap-4 @[560px]:grid-cols-2">
          <Opciones etiqueta={t("Tamaño de página", "Page size")} valor={d.formato} alCambiar={(formato) => cambiar({ formato })} opciones={[{ id: "carta", texto: t("Carta", "Letter") }, { id: "a4", texto: "A4" }]} />
          <Opciones etiqueta={t("Márgenes", "Margins")} valor={d.margen} alCambiar={(margen) => cambiar({ margen })} opciones={[{ id: 1, texto: t("Angostos", "Narrow") }, { id: 2, texto: "Normal" }, { id: 3, texto: t("Amplios", "Wide") }]} />
        </div>
      </Grupo>

      <Grupo titulo={t("Letra y espacio", "Font and spacing")}>
        <Opciones etiqueta={t("Letra", "Font")} valor={d.fuente} alCambiar={(fuente) => cambiar({ fuente })} opciones={(["helvetica", "times", "courier"] as const).map((f) => ({
          id: f, nombre: NOMBRE_FUENTE[f], texto: <span className="flex items-center gap-1.5"><span className="text-[16px]" style={{ fontFamily: FAMILIA[f] }}>Aa</span>{NOMBRE_FUENTE[f]}</span>,
        }))} />
        <Opciones etiqueta={t("Tamaño de letra", "Font size")} valor={d.tamano} alCambiar={(tamano) => cambiar({ tamano })} opciones={([1, 2, 3, 4, 5] as const).map((n) => ({
          id: n, nombre: `${t("Tamaño", "Size")} ${n}`, texto: <span style={{ fontSize: 10 + n * 1.5 }} className="leading-none">A</span>,
        }))} />
        <div className="grid gap-4 @[560px]:grid-cols-2">
          <Opciones etiqueta={t("Entre líneas", "Line spacing")} valor={d.interlineado} alCambiar={(interlineado) => cambiar({ interlineado })} opciones={[{ id: 1, texto: t("Junto", "Tight") }, { id: 2, texto: "Normal" }, { id: 3, texto: t("Amplio", "Relaxed") }]} />
          <Opciones etiqueta={t("Entre secciones", "Between sections")} valor={d.espacio} alCambiar={(espacio) => cambiar({ espacio })} opciones={[{ id: 1, texto: t("Poco", "Less") }, { id: 2, texto: "Normal" }, { id: 3, texto: t("Más", "More") }]} />
        </div>
      </Grupo>

      <Grupo titulo={t("Color", "Color")} ayuda={t("Para el nombre, los títulos y los enlaces.", "For your name, headings and links.")}>
        <div role="radiogroup" aria-label={t("Color de acento", "Accent color")} className="flex flex-wrap items-center gap-2.5">
          {COLORES.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={d.color === c}
              aria-label={NOMBRE_COLOR[c]?.[en ? "en" : "es"] ?? c}
              onClick={() => cambiar({ color: c })}
              className={cn("grid h-10 w-10 place-items-center rounded-full ring-offset-2 transition-shadow", d.color === c ? "ring-2 ring-[#162543]" : "hover:ring-2 hover:ring-[#d7e1ea]")}
              style={{ background: c }}
            >
              {d.color === c && <Check className="h-4 w-4 text-white" />}
            </button>
          ))}
          <label className={cn("relative grid h-10 cursor-pointer place-items-center rounded-full border border-dashed px-3 text-[13px] font-semibold text-[#52627a]", !COLORES.includes(d.color as (typeof COLORES)[number]) ? "border-[#162543] text-[#162543]" : "border-[#b9c8d6]")}>
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-full ring-1 ring-black/10" style={{ background: d.color }} />{t("Otro", "Custom")}
            </span>
            <input type="color" value={d.color} onChange={(e) => cambiar({ color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label={t("Otro color", "Custom color")} />
          </label>
        </div>
      </Grupo>

      {!esCarta && (
        <Grupo titulo={t("Títulos de sección", "Section headings")}>
          <div role="radiogroup" aria-label={t("Estilo de los títulos", "Heading style")} className="grid grid-cols-2 gap-2 @[560px]:grid-cols-3">
            {ESTILOS.map((e) => (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={d.titulos === e.id}
                onClick={() => cambiar({ titulos: e.id })}
                className={cn("grid gap-2 rounded-xl border bg-white p-3 text-left transition-colors", d.titulos === e.id ? "border-[#009FD9] ring-2 ring-[#009FD9]/20" : "border-[#e5e7eb] hover:border-[#b9c8d6]")}
              >
                <MuestraTitulo estilo={e.id} color={d.color} />
                <span className="text-[12px] font-bold text-[#52627a]">{e.nombre[en ? "en" : "es"]}</span>
              </button>
            ))}
          </div>
        </Grupo>
      )}

      <Grupo titulo={t("Encabezado", "Header")}>
        <div className="grid gap-4 @[560px]:grid-cols-2">
          <Opciones etiqueta={t("Nombre y título", "Name and title")} valor={d.encabezado} alCambiar={(encabezado) => cambiar({ encabezado })} opciones={[{ id: "apilado", texto: t("Uno debajo del otro", "Stacked") }, { id: "en-linea", texto: t("En una línea", "On one line") }]} />
          <Opciones etiqueta={t("Alineación", "Alignment")} valor={d.alineacion} alCambiar={(alineacion) => cambiar({ alineacion })} opciones={[{ id: "izquierda", texto: t("Izquierda", "Left") }, { id: "centro", texto: t("Centro", "Center") }]} />
        </div>
      </Grupo>

      {!esCarta && (
        <Grupo titulo={t("Experiencia y estudios", "Experience and education")}>
          <div className="grid gap-4 @[560px]:grid-cols-2">
            <Opciones etiqueta={t("Fechas", "Dates")} valor={d.fechas} alCambiar={(fechas) => cambiar({ fechas })} opciones={[{ id: "abajo", texto: t("Debajo del cargo", "Below the title") }, { id: "derecha", texto: t("A la derecha", "On the right") }]} />
            <Opciones etiqueta={t("Formato de fecha", "Date format")} valor={d.formatoFecha} alCambiar={(formatoFecha) => cambiar({ formatoFecha })} opciones={[{ id: "numero", texto: "03/2024" }, { id: "mes", texto: t("Mar 2024", "Mar 2024") }, { id: "anio", texto: "2024" }]} />
          </div>
        </Grupo>
      )}

      {!esCarta && (
        <Grupo titulo={t("Habilidades", "Skills")}>
          <Opciones etiqueta={t("Cómo se muestran", "How they look")} valor={d.habilidades} alCambiar={(habilidades) => cambiar({ habilidades })} opciones={[{ id: "comas", texto: t("Texto", "Text") }, { id: "etiquetas", texto: t("Etiquetas", "Tags") }, { id: "niveles", texto: t("Con nivel", "With level") }]} />
          {d.habilidades === "niveles" && (
            cv.habilidades.length ? (
              <ul className="grid gap-1.5" data-testid="cv-niveles">
                {cv.habilidades.map((h) => {
                  const nivel = cv.niveles?.[h] ?? 0;
                  return (
                    <li key={h} className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-[#f6f8fb] px-3">
                      <span className="min-w-0 truncate text-[14px] font-semibold text-[#162543]">{h}</span>
                      <span role="radiogroup" aria-label={`${t("Nivel de", "Level of")} ${h}`} className="flex shrink-0 items-center">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            role="radio"
                            aria-checked={nivel === n}
                            aria-label={`${n} ${t("de", "of")} 5`}
                            // Tocar el mismo nivel lo quita: la habilidad queda sin puntos.
                            onClick={() => setCv({ niveles: { ...(cv.niveles ?? {}), [h]: nivel === n ? 0 : n } })}
                            className="grid h-9 w-7 place-items-center"
                          >
                            <span className={cn("h-3 w-3 rounded-full", n <= nivel ? "" : "bg-[#d7e1ea]")} style={n <= nivel ? { background: d.color } : undefined} />
                          </button>
                        ))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-[13px] text-[#667085]">{t("Agregá habilidades en el paso Habilidades.", "Add skills in the Skills step.")}</p>
          )}
        </Grupo>
      )}
    </div>
  );
}
