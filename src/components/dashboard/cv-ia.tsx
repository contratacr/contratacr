"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, HelpCircle, Loader2, RotateCcw, Sparkles, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { empresaDeLaVacante, palabrasClave, type Carta, type CvDocumento } from "@/lib/cv/documento";
import { aplicarSugerencias, LIMITE_DIARIO, MAX_OFERTA, type AccionIa, type CartaIa, type Sugerencia } from "@/lib/cv/ia";

/**
 * LA IA EN EL EDITOR (20-nov-2026). Tres usos, los tres con la misma regla:
 * la IA propone y la persona decide; nada se aplica solo.
 *  - «Adaptar a una oferta»: pega el anuncio y revisa, sugerencia por
 *    sugerencia, lo que cambiaría; por defecto el resultado es un CV NUEVO
 *    (el original queda igual).
 *  - «Mejorar con IA»: 2 o 3 versiones de un resumen o de unos logros.
 *  - «Escribir con IA» en la carta: los cuatro párrafos desde el CV y la
 *    oferta, con [corchetes] donde falta un dato; se puede deshacer.
 * Si la IA no está disponible o se llegó al límite del día, se dice claro y
 * el editor sigue igual.
 */

const campo = "w-full rounded-xl border border-[#d7e1ea] bg-white px-3.5 py-2.5 text-[15px] text-[#162543] outline-none transition-colors placeholder:text-[#98a2b3] focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15";
const pastilla = "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition-colors disabled:opacity-60";
const enlace = "inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold text-[#007fae] hover:bg-[#eef6fb] disabled:opacity-50";

type Fallo = "sesion" | "limite" | "no_disponible" | "respuesta" | "invalido" | "red";
type Resultado<T> = { ok: true; datos: T } | { ok: false; fallo: Fallo };

async function pedir<T>(accion: AccionIa, cuerpo: unknown): Promise<Resultado<T>> {
  try {
    const res = await fetch(`/api/cv/ai/${accion}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const datos = await res.json().catch(() => null);
    if (res.ok && datos) return { ok: true, datos: datos as T };
    const fallo = (datos as { error?: string } | null)?.error;
    return { ok: false, fallo: (["sesion", "limite", "no_disponible", "respuesta", "invalido"] as const).find((f) => f === fallo) ?? "red" };
  } catch {
    return { ok: false, fallo: "red" };
  }
}

function mensajeDeFallo(f: Fallo, accion: AccionIa, en: boolean): string {
  const limite = LIMITE_DIARIO[accion];
  switch (f) {
    case "limite": return en ? `You reached today's limit (${limite}). It resets tomorrow; meanwhile you can keep editing by hand.` : `Llegaste al límite de hoy (${limite}). Mañana se renueva; mientras, puede seguir editando a mano.`;
    case "no_disponible": return en ? "AI isn't available right now. You can keep editing by hand." : "La IA no está disponible en este momento. Puede seguir editando a mano.";
    case "respuesta": return en ? "The AI didn't return something we can use. Try again." : "La IA no dio un resultado que podamos usar. Pruebe de nuevo.";
    case "sesion": return en ? "Your session ended. Sign in again." : "Su sesión se cerró. Inicie sesión de nuevo.";
    case "invalido": return accion === "mejorar"
      ? (en ? "Write a bit more first: AI improves what you wrote." : "Escriba un poco más primero: la IA mejora lo que ya escribió.")
      : (en ? "Paste the whole job post (at least a few lines)." : "Pegue el anuncio completo (al menos unas líneas).");
    default: return en ? "No connection. Try again." : "Sin conexión. Pruebe de nuevo.";
  }
}

function Aviso({ texto, tono = "error" }: { texto: string; tono?: "error" | "info" }) {
  return <p role={tono === "error" ? "alert" : "status"} className={cn("rounded-xl px-3 py-2.5 text-[13px] font-semibold leading-5", tono === "error" ? "bg-[#fffaeb] text-[#93370d]" : "bg-[#eef8fd] text-[#075985]")}>{texto}</p>;
}

/** El nombre del CV nuevo sale de la empresa del anuncio (lib/cv/documento). */
export const empresaDeLaOferta = empresaDeLaVacante;

// ── ADAPTAR A UNA OFERTA ──────────────────────────────────────────────────
type Adaptacion = { sugerencias: Sugerencia[]; preguntas: string[]; descartadas: number };
type Estado = "pendiente" | "aceptada" | "descartada";

function Cambio({ s, en }: { s: Sugerencia; en: boolean }) {
  const lineas = (l: string[]) => <ul className="grid gap-1">{l.map((x, i) => <li key={i} className="flex gap-1.5"><span aria-hidden="true">•</span><span>{x}</span></li>)}</ul>;
  const antes = s.tipo === "logros" || s.tipo === "habilidades" ? (s.tipo === "logros" ? lineas(s.antes) : s.antes.join(", ")) : s.antes;
  const despues = s.tipo === "logros" ? lineas(s.despues) : s.tipo === "habilidades" ? s.despues.join(", ") : s.despues;
  return (
    <div className="grid min-w-0 gap-2 break-words @[560px]:grid-cols-2">
      <div className="min-w-0 rounded-lg bg-[#f6f8fa] p-2.5 text-[13px] leading-5 text-[#667085]">
        <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-[#98a2b3]">{en ? "Now" : "Ahora"}</p>
        {antes || <span className="italic">{en ? "(empty)" : "(vacío)"}</span>}
      </div>
      <div className="min-w-0 rounded-lg bg-[#ecfdf3] p-2.5 text-[13px] leading-5 text-[#14532d]">
        <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-[#067647]">{en ? "Suggested" : "Sugerido"}</p>
        {despues}
      </div>
    </div>
  );
}

const nombreDeSugerencia = (s: Sugerencia, en: boolean) =>
  s.tipo === "titular" ? (en ? "Professional title" : "Título profesional")
    : s.tipo === "resumen" ? (en ? "Summary" : "Resumen")
      : s.tipo === "habilidades" ? (en ? "Skills (order and choice)" : "Habilidades (cuáles y en qué orden)")
        : s.titulo;

export function AdaptarConIa({ cv, en, puedeCrear, alAplicar }: {
  cv: CvDocumento;
  en: boolean;
  /** false cuando ya hay el máximo de documentos: solo se puede cambiar este. */
  puedeCrear: boolean;
  alAplicar: (nuevo: CvDocumento, como: { nuevo: boolean; nombre: string }) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [oferta, setOferta] = useState("");
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState<Fallo | null>(null);
  const [resultado, setResultado] = useState<Adaptacion | null>(null);
  const [estados, setEstados] = useState<Estado[]>([]);
  const [comoNuevo, setComoNuevo] = useState(true);
  const [nombre, setNombre] = useState("");

  const aceptadas = useMemo(() => (resultado?.sugerencias ?? []).filter((_, i) => estados[i] === "aceptada"), [resultado, estados]);
  const antes = useMemo(() => (resultado ? palabrasClave(oferta, cv) : null), [resultado, oferta, cv]);
  const despues = useMemo(() => (resultado ? palabrasClave(oferta, aplicarSugerencias(cv, aceptadas)) : null), [resultado, oferta, cv, aceptadas]);

  const adaptar = async () => {
    setCargando(true); setFallo(null); setResultado(null);
    const r = await pedir<Adaptacion>("adaptar", { cv, oferta });
    setCargando(false);
    if (!r.ok) { setFallo(r.fallo); return; }
    setResultado(r.datos);
    setEstados(r.datos.sugerencias.map(() => "pendiente"));
    const empresa = empresaDeLaOferta(oferta);
    setNombre([cv.titular.trim() || (en ? "Resume" : "Currículum"), empresa].filter(Boolean).join(" — ") + (empresa ? "" : en ? " (tailored)" : " (adaptado)"));
    setComoNuevo(puedeCrear);
  };
  const aplicar = () => {
    if (!aceptadas.length) return;
    alAplicar(aplicarSugerencias(cv, aceptadas), { nuevo: comoNuevo && puedeCrear, nombre: nombre.trim() });
    setAbierto(false); setResultado(null); setOferta("");
  };
  const marcar = (i: number, e: Estado) => setEstados((l) => l.map((x, j) => (j === i ? e : x)));

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} data-testid="cv-ia-abrir"
        className="flex w-full items-center gap-3 rounded-2xl border border-[#cfe7f3] bg-gradient-to-r from-[#f2fafe] to-white p-3.5 text-left transition-colors hover:border-[#009FD9]">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#009FD9] text-white"><Sparkles className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-black text-[#162543]">{en ? "Tailor to a job post with AI" : "Adaptar a una oferta con IA"}</span>
          <span className="block text-[13px] leading-5 text-[#52627a]">{en ? "Paste the post. It rewrites what you already wrote; it never makes up data." : "Pegue el anuncio. Reescribe lo que ya escribió; nunca inventa datos."}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-[#98a2b3]" />
      </button>
    );
  }

  return (
    <section className="grid min-w-0 gap-3 rounded-2xl border border-[#cfe7f3] bg-white p-4 sm:p-5" data-testid="cv-ia-adaptar" aria-labelledby="cv-ia-titulo">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#009FD9] text-white"><Sparkles className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <h3 id="cv-ia-titulo" className="text-[15px] font-black text-[#162543]">{en ? "Tailor to a job post" : "Adaptar a una oferta"}</h3>
          <p className="text-[13px] leading-5 text-[#52627a]">{en ? "AI reorders and rewrites what's already in your resume for this job. It doesn't add companies, dates, titles or numbers: if something is missing, it asks you." : "La IA reordena y reescribe lo que ya tiene su CV para este puesto. No agrega empresas, fechas, títulos ni cifras: si falta algo, se lo pregunta."}</p>
        </div>
        <button type="button" onClick={() => { setAbierto(false); setResultado(null); setFallo(null); }} aria-label={en ? "Close" : "Cerrar"} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#52627a] hover:bg-[#f2f4f7]"><X className="h-4 w-4" /></button>
      </div>

      {!resultado && (
        <>
          <textarea rows={6} maxLength={MAX_OFERTA} value={oferta} onChange={(e) => setOferta(e.target.value)} disabled={cargando}
            aria-label={en ? "Job post" : "Anuncio de la oferta"} placeholder={en ? "Paste the full job post here: position, requirements and company." : "Pegue aquí el anuncio completo: puesto, requisitos y empresa."} className={campo} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-[#98a2b3]">{oferta.length}/{MAX_OFERTA}</span>
            <button type="button" disabled={cargando || oferta.trim().length < 80} onClick={() => void adaptar()} className={cn(pastilla, "bg-[#009FD9] text-white hover:bg-[#0089bb]")}>
              {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {cargando ? (en ? "Reading the post and your resume…" : "Leyendo la oferta y su CV…") : (en ? "Tailor my resume" : "Adaptar mi CV")}
            </button>
          </div>
          {oferta.trim().length > 0 && oferta.trim().length < 80 && <p className="text-[12px] text-[#667085]">{en ? "Paste the whole post, not just the title." : "Pegue el anuncio completo, no solo el título."}</p>}
          {fallo && <Aviso texto={mensajeDeFallo(fallo, "adaptar", en)} />}
        </>
      )}

      {resultado && antes && despues && (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#f6f9fb] px-3 py-2.5" role="status">
            <span className="text-[13px] font-semibold text-[#52627a]">{en ? "Keyword match" : "Coincidencia con la oferta"}</span>
            <span className="text-[15px] font-black text-[#162543]">{antes.puntaje} % → <span className="text-[#067647]">{despues.puntaje} %</span></span>
            <span className="text-[12px] text-[#667085]">{en ? "with what you accept" : "con lo que aceptes"}</span>
          </div>

          {resultado.sugerencias.length === 0 && <Aviso tono="info" texto={en ? "Your resume already fits this post well: there was nothing to change without making things up." : "Su CV ya calza bien con esta oferta: no había nada que cambiar sin inventar."} />}
          {resultado.sugerencias.length > 0 && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-black text-[#162543]">{en ? `${resultado.sugerencias.length} suggestions` : `${resultado.sugerencias.length} sugerencias`}</p>
              <button type="button" className={enlace} onClick={() => setEstados((l) => l.map((x) => (x === "descartada" ? x : "aceptada")))}><Check className="h-4 w-4" />{en ? "Accept all" : "Aceptar todo"}</button>
            </div>
          )}
          <ul className="grid min-w-0 gap-2.5">
            {resultado.sugerencias.map((s, i) => (
              <li key={i} className={cn("grid min-w-0 gap-2 rounded-xl border p-3 transition-colors", estados[i] === "aceptada" ? "border-[#abefc6] bg-[#f6fef9]" : estados[i] === "descartada" ? "border-[#eef2f6] opacity-60" : "border-[#e5e7eb]")} data-testid="cv-ia-sugerencia">
                {/* En el teléfono el nombre va arriba y los botones debajo, sin cortarse. */}
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 basis-[11rem] text-[13px] font-black leading-5 text-[#162543]">{nombreDeSugerencia(s, en)}</p>
                  {estados[i] === "pendiente" ? (
                    <span className="ml-auto flex gap-2">
                      <button type="button" onClick={() => marcar(i, "descartada")} className="inline-flex h-9 items-center gap-1 rounded-full border border-[#d7e1ea] px-3 text-[13px] font-bold text-[#52627a] hover:bg-[#f6f9fb]"><X className="h-3.5 w-3.5" />{en ? "Discard" : "Descartar"}</button>
                      <button type="button" onClick={() => marcar(i, "aceptada")} className="inline-flex h-9 items-center gap-1 rounded-full bg-[#162543] px-3 text-[13px] font-bold text-white hover:bg-[#0f1b33]"><Check className="h-3.5 w-3.5" />{en ? "Accept" : "Aceptar"}</button>
                    </span>
                  ) : (
                    <span className="ml-auto flex items-center gap-1">
                      <span className={cn("text-[12px] font-bold", estados[i] === "aceptada" ? "text-[#067647]" : "text-[#98a2b3]")}>{estados[i] === "aceptada" ? (en ? "Accepted" : "Aceptada") : (en ? "Discarded" : "Descartada")}</span>
                      <button type="button" onClick={() => marcar(i, "pendiente")} className={enlace} aria-label={en ? "Undo" : "Deshacer"}><Undo2 className="h-4 w-4" /></button>
                    </span>
                  )}
                </div>
                {estados[i] !== "descartada" && <Cambio s={s} en={en} />}
              </li>
            ))}
          </ul>

          {resultado.descartadas > 0 && <Aviso tono="info" texto={en ? `We removed ${resultado.descartadas} suggestion(s) that added data not in your resume.` : `Quitamos ${resultado.descartadas} ${resultado.descartadas === 1 ? "sugerencia que agregaba" : "sugerencias que agregaban"} datos que no están en su CV.`} />}

          {(resultado.preguntas.length > 0 || despues.faltan.length > 0) && (
            <div className="grid gap-2 rounded-xl border border-[#fedf89] bg-[#fffcf5] p-3">
              {resultado.preguntas.length > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 text-[13px] font-black text-[#93370d]"><HelpCircle className="h-4 w-4" />{en ? "To make it stronger, add this if it's true" : "Para hacerlo más fuerte, agregue esto si es cierto"}</p>
                  <ul className="mt-1.5 grid gap-1 text-[13px] leading-5 text-[#52627a]">{resultado.preguntas.map((p) => <li key={p} className="flex gap-1.5"><span aria-hidden="true">•</span>{p}</li>)}</ul>
                </div>
              )}
              {despues.faltan.length > 0 && (
                <div>
                  <p className="text-[12px] font-semibold text-[#93370d]">{en ? "Words from the post your resume doesn't have" : "Palabras de la oferta que su CV no tiene"}</p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">{despues.faltan.slice(0, 12).map((p) => <li key={p} className="rounded-full bg-[#fef0c7] px-2.5 py-1 text-[12px] font-semibold text-[#93370d]">{p}</li>)}</ul>
                </div>
              )}
            </div>
          )}

          {resultado.sugerencias.length > 0 && (
            <div className="grid gap-2.5 border-t border-[#eef2f6] pt-3">
              <fieldset className="grid gap-1.5">
                <legend className="sr-only">{en ? "Where to apply" : "Dónde aplicar"}</legend>
                <label className={cn("flex items-start gap-2 text-[13px] text-[#162543]", !puedeCrear && "opacity-50")}>
                  <input type="radio" name="cv-ia-como" className="mt-1 accent-[#009FD9]" checked={comoNuevo && puedeCrear} disabled={!puedeCrear} onChange={() => setComoNuevo(true)} />
                  <span>{en ? "Save as a new resume (this one stays as it is)" : "Guardar como un CV nuevo (este queda igual)"}{!puedeCrear && <span className="block text-[12px] text-[#667085]">{en ? "You have the maximum number of resumes." : "Ya tiene el máximo de currículums."}</span>}</span>
                </label>
                {comoNuevo && puedeCrear && <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} aria-label={en ? "Name of the new resume" : "Nombre del CV nuevo"} className={cn(campo, "ml-6 w-[calc(100%-1.5rem)] py-2 text-[14px]")} />}
                <label className="flex items-start gap-2 text-[13px] text-[#162543]">
                  <input type="radio" name="cv-ia-como" className="mt-1 accent-[#009FD9]" checked={!comoNuevo || !puedeCrear} onChange={() => setComoNuevo(false)} />
                  <span>{en ? "Change this resume" : "Cambiar este CV"}</span>
                </label>
              </fieldset>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => { setResultado(null); setFallo(null); }} className={cn(pastilla, "border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb]")}><RotateCcw className="h-4 w-4" />{en ? "Another post" : "Otra oferta"}</button>
                <button type="button" disabled={!aceptadas.length} onClick={aplicar} className={cn(pastilla, "bg-[#009FD9] text-white hover:bg-[#0089bb]")} data-testid="cv-ia-aplicar">
                  <Check className="h-4 w-4" />{aceptadas.length ? (en ? `Apply ${aceptadas.length} change${aceptadas.length === 1 ? "" : "s"}` : `Aplicar ${aceptadas.length} ${aceptadas.length === 1 ? "cambio" : "cambios"}`) : (en ? "Accept something to apply" : "Acepta algo para aplicar")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── MEJORAR UN TEXTO ──────────────────────────────────────────────────────
export function MejorarConIa({ texto, tipo, idioma, contexto, en, alElegir }: {
  texto: string;
  tipo: "resumen" | "logros";
  idioma: CvDocumento["idioma"];
  contexto: string;
  en: boolean;
  alElegir: (t: string) => void;
}) {
  const [cargando, setCargando] = useState(false);
  const [opciones, setOpciones] = useState<string[] | null>(null);
  const [fallo, setFallo] = useState<Fallo | null>(null);
  const corto = texto.trim().length < 15;

  const mejorar = async () => {
    setCargando(true); setFallo(null); setOpciones(null);
    const r = await pedir<{ opciones: string[]; descartadas: number }>("mejorar", { texto, tipo, idioma, contexto });
    setCargando(false);
    if (!r.ok) { setFallo(r.fallo); return; }
    if (!r.datos.opciones.length) { setFallo("respuesta"); return; }
    setOpciones(r.datos.opciones);
  };

  return (
    <div className="grid gap-2" data-testid="cv-ia-mejorar">
      <button type="button" disabled={cargando || corto} onClick={() => void mejorar()} className={cn(enlace, "justify-self-start")} title={corto ? (en ? "Write something first" : "Escriba algo primero") : undefined}>
        {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {cargando ? (en ? "Improving…" : "Mejorando…") : (en ? "Improve with AI" : "Mejorar con IA")}
      </button>
      {fallo && <Aviso texto={mensajeDeFallo(fallo, "mejorar", en)} />}
      {opciones && (
        <div className="grid gap-2 rounded-xl border border-[#cfe7f3] bg-[#f8fcfe] p-2.5">
          <p className="px-1 text-[12px] font-semibold text-[#52627a]">{en ? "Pick one, or keep yours. Same facts, better wording." : "Elija una o quédese con la suya. Los mismos datos, mejor dicho."}</p>
          {opciones.map((o, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-[#e5e7eb] bg-white p-2.5">
              {tipo === "logros"
                ? <ul className="grid gap-1 text-[13px] leading-5 text-[#162543]">{o.split("\n").map((l, j) => <li key={j} className="flex gap-1.5"><span aria-hidden="true">•</span>{l}</li>)}</ul>
                : <p className="text-[13px] leading-5 text-[#162543]">{o}</p>}
              <button type="button" onClick={() => { alElegir(o); setOpciones(null); }} className="inline-flex h-9 items-center gap-1 justify-self-end rounded-full bg-[#162543] px-3 text-[13px] font-bold text-white hover:bg-[#0f1b33]"><Check className="h-3.5 w-3.5" />{en ? "Use this one" : "Usar esta"}</button>
            </div>
          ))}
          <button type="button" onClick={() => setOpciones(null)} className={cn(enlace, "justify-self-end")}>{en ? "Keep mine" : "Quedarme con la mía"}</button>
        </div>
      )}
    </div>
  );
}

// ── LA CARTA ──────────────────────────────────────────────────────────────
export function CartaConIa({ cv, carta, en, alEscribir }: { cv: CvDocumento; carta: Carta; en: boolean; alEscribir: (p: CartaIa) => void }) {
  const [oferta, setOferta] = useState("");
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState<Fallo | null>(null);
  const [anterior, setAnterior] = useState<CartaIa | null>(null);

  const escribir = async () => {
    setCargando(true); setFallo(null);
    const r = await pedir<{ carta: CartaIa; descartadas: number }>("carta", { cv, oferta, puesto: carta.puesto, empresa: carta.empresa, destinatario: carta.destinatario });
    setCargando(false);
    if (!r.ok) { setFallo(r.fallo); return; }
    setAnterior({ apertura: carta.apertura, porQueEncajo: carta.porQueEncajo, porQueLaEmpresa: carta.porQueLaEmpresa, cierre: carta.cierre });
    alEscribir(r.datos.carta);
  };

  return (
    <section className="grid min-w-0 gap-3 rounded-2xl border border-[#cfe7f3] bg-white p-4 sm:p-5" data-testid="cv-ia-carta">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#009FD9] text-white"><Sparkles className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-black text-[#162543]">{en ? "Write it with AI" : "Escribir con IA"}</h3>
          <p className="text-[13px] leading-5 text-[#52627a]">{en ? "Paste the job post. AI writes the four paragraphs from your resume; what it doesn't know goes in [brackets] for you to fill in." : "Pegue el anuncio. La IA escribe los cuatro párrafos con lo que dice su CV; lo que no sabe queda entre [corchetes] para que usted lo complete."}</p>
        </div>
      </div>
      <textarea rows={5} maxLength={MAX_OFERTA} value={oferta} onChange={(e) => setOferta(e.target.value)} disabled={cargando} aria-label={en ? "Job post" : "Anuncio de la oferta"} placeholder={en ? "Paste the job post here" : "Pegue aquí el anuncio"} className={campo} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {anterior && !cargando && (
          <button type="button" onClick={() => { alEscribir(anterior); setAnterior(null); }} className={cn(pastilla, "border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb]")}><Undo2 className="h-4 w-4" />{en ? "Undo" : "Deshacer"}</button>
        )}
        <button type="button" disabled={cargando || oferta.trim().length < 80} onClick={() => void escribir()} className={cn(pastilla, "bg-[#009FD9] text-white hover:bg-[#0089bb]")} data-testid="cv-ia-escribir-carta">
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {cargando ? (en ? "Writing…" : "Escribiendo…") : anterior ? (en ? "Write again" : "Escribir de nuevo") : (en ? "Write my letter" : "Escribir mi carta")}
        </button>
      </div>
      {anterior && !cargando && <Aviso tono="info" texto={en ? "Done. Read it before sending and fill in anything in [brackets]." : "Listo. Léala antes de enviarla y complete lo que esté entre [corchetes]."} />}
      {fallo && <Aviso texto={mensajeDeFallo(fallo, "carta", en)} />}
    </section>
  );
}
