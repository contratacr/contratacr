"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { jsPDF as JsPdf } from "jspdf";
import type { Carta, CvDocumento } from "@/lib/cv/documento";
import { maquetar, type Maqueta, type Op } from "@/lib/cv/maquetar";
import { cn } from "@/lib/utils";

/**
 * LA VISTA PREVIA DEL CV Y LA CARTA (19-nov-2026): dibuja en SVG la misma
 * maqueta que el PDF (lib/cv/maquetar), página por página. Lo que se ve es lo
 * que se descarga: mismas letras, mismos saltos y la misma cantidad de páginas.
 */

let medidor: Promise<JsPdf> | null = null;
/** Un solo jsPDF para medir el texto; se carga la primera vez que hace falta. */
function conMedidor(): Promise<JsPdf> {
  medidor ??= import("jspdf").then(({ jsPDF }) => new jsPDF({ unit: "pt", format: "letter" }));
  return medidor;
}

/** Las maquetas de varios documentos (la hoja y las miniaturas de las plantillas). */
export function useMaquetas(docs: { cv: CvDocumento; carta?: Carta }[]): (Maqueta | null)[] {
  const clave = JSON.stringify(docs);
  const [doc, setDoc] = useState<JsPdf | null>(null);
  const [listas, setListas] = useState<{ clave: string; maquetas: Maqueta[] } | null>(null);
  useEffect(() => {
    let vivo = true;
    void conMedidor().then((d) => { if (vivo) setDoc(d); });
    return () => { vivo = false; };
  }, []);
  useEffect(() => {
    if (!doc) return;
    // Un respiro mientras se escribe: no se rehace la maqueta en cada tecla.
    const t = window.setTimeout(() => {
      const lista = JSON.parse(clave) as { cv: CvDocumento; carta?: Carta }[];
      setListas({ clave, maquetas: lista.map((x) => maquetar(doc, x.cv, x.carta)) });
    }, listas ? 120 : 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, clave]);
  return useMemo(() => docs.map((_, i) => listas?.maquetas[i] ?? null), [docs, listas]);
}

const FAMILIA = {
  helvetica: "Helvetica, Arial, sans-serif",
  times: "'Times New Roman', Times, serif",
  courier: "'Courier New', Courier, monospace",
} as const;
const color = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;

function Dibujo({ op }: { op: Op }) {
  switch (op.t) {
    case "caja": return <rect x={op.x} y={op.y} width={op.w} height={op.h} rx={op.radio} fill={color(op.color)} />;
    case "linea": return <line x1={op.x1} y1={op.y1} x2={op.x2} y2={op.y2} stroke={color(op.color)} strokeWidth={op.grosor} />;
    case "punto": return <circle cx={op.x} cy={op.y} r={op.r} fill={color(op.color)} />;
    case "texto": {
      const texto = (
        <text
          x={op.x} y={op.y} fontFamily={FAMILIA[op.fuente]} fontSize={op.tam} fontWeight={op.negrita ? 700 : 400} fill={color(op.color)}
          // Las letras del navegador miden casi lo mismo que las del PDF; esto lo hace exacto.
          textLength={op.ancho > 0 ? op.ancho : undefined} lengthAdjust="spacingAndGlyphs" style={{ whiteSpace: "pre" }}
          textDecoration={op.url ? "underline" : undefined}
        >
          {op.s}
        </text>
      );
      return op.url ? <a href={op.url} target="_blank" rel="noopener noreferrer">{texto}</a> : texto;
    }
  }
}

/** Una página: lo de cada sección va agrupado, para encontrarlo (y probarlo). */
function Pagina({ ops, ancho, alto, className }: { ops: Op[]; ancho: number; alto: number; className?: string }) {
  const grupos: { seccion?: string; ops: Op[] }[] = [];
  for (const op of ops) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.seccion === op.seccion) ultimo.ops.push(op);
    else grupos.push({ seccion: op.seccion, ops: [op] });
  }
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} xmlns="http://www.w3.org/2000/svg" className={cn("block h-auto bg-white", className)} preserveAspectRatio="xMidYMin meet">
      <rect width={ancho} height={alto} fill="#fff" />
      {grupos.map((g, i) => (
        <g key={i} data-seccion={g.seccion}>
          {g.ops.map((op, j) => <Dibujo key={j} op={op} />)}
        </g>
      ))}
    </svg>
  );
}

/** Las páginas, una debajo de otra. `real` = tamaño real (100 %); si no, al ancho disponible. */
export function Paginas({ maqueta, real = false, soloPrimera = false, etiquetaPagina }: { maqueta: Maqueta; real?: boolean; soloPrimera?: boolean; etiquetaPagina?: (n: number, total: number) => string }) {
  const paginas = soloPrimera ? maqueta.paginas.slice(0, 1) : maqueta.paginas;
  const anchoReal = Math.round(maqueta.ancho * (4 / 3));
  return (
    <div className="grid gap-4">
      {paginas.map((ops, i) => (
        <figure key={i} className="m-0 grid justify-items-center gap-1.5" data-pagina={i + 1}>
          <div
            className={cn("overflow-hidden rounded-[3px] bg-white shadow-[0_12px_40px_-18px_rgba(22,37,67,0.45)] ring-1 ring-[#e5e7eb]", !real && "w-full")}
            style={real ? { width: anchoReal } : undefined}
          >
            <Pagina ops={ops} ancho={maqueta.ancho} alto={maqueta.alto} className="w-full" />
          </div>
          {etiquetaPagina && <figcaption className="text-[11px] font-semibold text-[#667085]">{etiquetaPagina(i + 1, maqueta.paginas.length)}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

/** Mientras carga la letra del PDF: una hoja en blanco del mismo tamaño. */
export function HojaCargando({ className }: { className?: string }) {
  return <div aria-hidden className={cn("aspect-[612/792] w-full animate-pulse rounded-[3px] bg-white ring-1 ring-[#e5e7eb]", className)} />;
}

/**
 * La vista previa con su barrita: cuántas páginas y el zoom (al ancho o 100 %).
 * `pie` va debajo (p. ej. el botón de descargar en el teléfono).
 */
export function VistaPrevia({ cv, carta, en, pie, className }: { cv: CvDocumento; carta?: Carta; en: boolean; pie?: ReactNode; className?: string }) {
  const [maqueta] = useMaquetas(useMemo(() => [{ cv, carta }], [cv, carta]));
  const [real, setReal] = useState(false);
  const total = maqueta?.paginas.length ?? 0;
  return (
    <div className={cn("grid min-w-0 gap-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-[#52627a]" aria-live="polite">
          {total ? (en ? `${total} ${total === 1 ? "page" : "pages"}` : `${total} ${total === 1 ? "página" : "páginas"}`) : " "}
        </p>
        <div role="radiogroup" aria-label={en ? "Zoom" : "Tamaño de la vista previa"} className="inline-flex rounded-full bg-[#eef3f7] p-1">
          {([[false, en ? "Fit" : "Ajustar"], [true, "100 %"]] as const).map(([valor, texto]) => (
            <button key={texto} type="button" role="radio" aria-checked={real === valor} onClick={() => setReal(valor)}
              className={cn("h-8 rounded-full px-3 text-[12px] font-bold transition-colors", real === valor ? "bg-white text-[#162543] shadow-sm" : "text-[#52627a] hover:text-[#162543]")}>
              {texto}
            </button>
          ))}
        </div>
      </div>
      <div className={cn("min-w-0 rounded-2xl bg-[#eef2f6] p-2 sm:p-4", real && "overflow-x-auto")} data-testid="cv-hoja">
        {maqueta
          ? <Paginas maqueta={maqueta} real={real} etiquetaPagina={total > 1 ? (n, t) => (en ? `Page ${n} of ${t}` : `Página ${n} de ${t}`) : undefined} />
          : <HojaCargando />}
      </div>
      {pie}
    </div>
  );
}
