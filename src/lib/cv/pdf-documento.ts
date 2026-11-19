import type { jsPDF as JsPdf } from "jspdf";
import { bloquesDelCv, cuerpoDeLaCarta, encabezadoDeEntrada, fechasAts, lineasDeReferencia, type Bloque, type Carta, type CvDocumento } from "./documento";
import { lineasRicas, tieneFormato, type Trozo } from "./texto-rico";

/**
 * EL PDF DEL CV Y DE LA CARTA. Texto de verdad (seleccionable) con Helvetica,
 * una sola columna, sin tablas ni imágenes: lo que un filtro automático lee de
 * arriba abajo sin perderse. Un solo diseño (18-nov-2026): «Moderna» solo
 * cambiaba un color y se quitó.
 */

const MARGEN = 54; // 0,75 pulgadas
const TINTA: [number, number, number] = [22, 37, 67];
const GRIS: [number, number, number] = [82, 98, 122];

type Lienzo = { doc: JsPdf; y: number; ancho: number; alto: number };

function asegurar(l: Lienzo, alto: number) {
  if (l.y + alto <= l.alto - MARGEN) return;
  l.doc.addPage();
  l.y = MARGEN;
}

function parrafo(l: Lienzo, texto: string, opciones: { tam?: number; negrita?: boolean; color?: [number, number, number]; sangria?: number; interlineado?: number } = {}) {
  const tam = opciones.tam ?? 10.5;
  const sangria = opciones.sangria ?? 0;
  l.doc.setFont("helvetica", opciones.negrita ? "bold" : "normal");
  l.doc.setFontSize(tam);
  l.doc.setTextColor(...(opciones.color ?? TINTA));
  const alto = tam * (opciones.interlineado ?? 1.35);
  for (const linea of l.doc.splitTextToSize(texto, l.ancho - sangria) as string[]) {
    asegurar(l, alto);
    l.doc.text(linea, MARGEN + sangria, l.y + tam);
    l.y += alto;
  }
}

const ENLACE: [number, number, number] = [0, 111, 156];

/**
 * Un párrafo con negrita o enlaces: se arma palabra por palabra, midiendo cada
 * una con su letra, y los enlaces quedan para tocar en el PDF. Sin formato se
 * usa `parrafo`, igual que siempre.
 */
function parrafoRico(l: Lienzo, partes: Trozo[], opciones: { tam?: number; sangria?: number } = {}) {
  if (!tieneFormato(partes)) { parrafo(l, partes.map((t) => t.texto).join(""), opciones); return; }
  const tam = opciones.tam ?? 10.5;
  const sangria = opciones.sangria ?? 0;
  const alto = tam * 1.35;
  const ancho = l.ancho - sangria;
  l.doc.setFontSize(tam);
  const medir = (texto: string, negrita?: boolean) => { l.doc.setFont("helvetica", negrita ? "bold" : "normal"); return l.doc.getTextWidth(texto); };
  type Palabra = { texto: string; negrita?: boolean; url?: string; espacio: boolean };
  const palabras: Palabra[] = [];
  for (const t of partes) {
    t.texto.split(/(\s+)/).forEach((p) => {
      if (!p) return;
      if (/^\s+$/.test(p)) { if (palabras.length) palabras[palabras.length - 1].espacio = true; return; }
      palabras.push({ texto: p, negrita: t.negrita, url: t.url, espacio: false });
    });
  }
  const espacio = medir(" ");
  let linea: { p: Palabra; w: number }[] = [];
  let usado = 0;
  const dibujar = () => {
    asegurar(l, alto);
    let x = MARGEN + sangria;
    for (const { p, w } of linea) {
      l.doc.setFont("helvetica", p.negrita ? "bold" : "normal");
      l.doc.setTextColor(...(p.url ? ENLACE : TINTA));
      if (p.url) l.doc.textWithLink(p.texto, x, l.y + tam, { url: p.url });
      else l.doc.text(p.texto, x, l.y + tam);
      x += w + (p.espacio ? espacio : 0);
    }
    l.y += alto;
    linea = []; usado = 0;
  };
  for (const p of palabras) {
    const w = medir(p.texto, p.negrita);
    const antes = linea.length ? (linea[linea.length - 1].p.espacio ? espacio : 0) : 0;
    if (linea.length && usado + antes + w > ancho) dibujar();
    usado += (linea.length ? antes : 0) + w;
    linea.push({ p, w });
  }
  if (linea.length) dibujar();
  l.doc.setTextColor(...TINTA);
}

function titulo(l: Lienzo, texto: string) {
  l.y += 10;
  asegurar(l, 30);
  l.doc.setFont("helvetica", "bold");
  l.doc.setFontSize(11);
  l.doc.setTextColor(...TINTA);
  l.doc.text(texto.toUpperCase(), MARGEN, l.y + 11);
  l.y += 16;
  l.doc.setDrawColor(...GRIS);
  l.doc.setLineWidth(0.5);
  l.doc.line(MARGEN, l.y, MARGEN + l.ancho, l.y);
  l.y += 8;
}

async function lienzo(): Promise<Lienzo> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const ancho = doc.internal.pageSize.getWidth() - MARGEN * 2;
  return { doc, y: MARGEN, ancho, alto: doc.internal.pageSize.getHeight() };
}

function encabezado(l: Lienzo, cv: CvDocumento) {
  parrafo(l, cv.nombre || " ", { tam: 22, negrita: true, interlineado: 1.15 });
  if (cv.titular.trim()) parrafo(l, cv.titular, { tam: 12, color: GRIS });
  const contacto = [cv.correo, cv.telefono, cv.ubicacion, cv.enlace].filter((v) => v.trim()).join("  |  ");
  if (contacto) { l.y += 2; parrafo(l, contacto, { tam: 9.5, color: GRIS }); }
}

async function dibujarCv(cv: CvDocumento): Promise<JsPdf> {
  const l = await lienzo();
  l.doc.setProperties({ title: `${cv.nombre} — ${cv.idioma === "en" ? "Resume" : "CV"}`, author: cv.nombre, subject: cv.titular, creator: "ContrataCR" });
  encabezado(l, cv);
  const vineta = (partes: Trozo[]) => {
    asegurar(l, 14);
    l.doc.setFont("helvetica", "normal"); l.doc.setFontSize(10.5); l.doc.setTextColor(...TINTA);
    l.doc.text("•", MARGEN + 2, l.y + 10.5);
    parrafoRico(l, partes, { sangria: 12 });
  };
  const texto = (t: string) => lineasRicas(t).forEach((x) => (x.vineta ? vineta(x.trozos) : parrafoRico(l, x.trozos)));
  const dibujar = (b: Bloque) => {
    titulo(l, b.titulo);
    switch (b.tipo) {
      case "texto": texto(b.texto); break;
      case "entradas":
        b.entradas.forEach((e, i) => {
          if (i) l.y += 6;
          asegurar(l, 34);
          parrafo(l, encabezadoDeEntrada(e), { negrita: true, tam: 10.5 });
          if (e.period.trim()) parrafo(l, fechasAts(e.period, cv.idioma), { tam: 9.5, color: GRIS });
          for (const x of lineasRicas(e.description, true)) vineta(x.trozos);
        });
        break;
      case "lineas": b.lineas.forEach((c) => parrafo(l, c)); break;
      case "comas": parrafo(l, b.items.join(", ")); break;
      case "referencias":
        b.referencias.forEach((r, i) => {
          if (i) l.y += 6;
          const [primera, ...resto] = lineasDeReferencia(r);
          parrafo(l, primera, { negrita: true });
          resto.forEach((x) => parrafo(l, x, { tam: 9.5, color: GRIS }));
        });
        break;
      case "declaracion":
        texto(b.texto);
        l.y += 10;
        if (b.lugarFecha) parrafo(l, b.lugarFecha, { tam: 9.5, color: GRIS });
        if (cv.nombre.trim()) parrafo(l, cv.nombre, { negrita: true });
        break;
    }
  };
  bloquesDelCv(cv).forEach(dibujar);
  return l.doc;
}

export async function pdfDelCv(cv: CvDocumento): Promise<Blob> {
  return (await dibujarCv(cv)).output("blob");
}

/** Lo mismo en bytes, para el servidor (contratacr.com/<perfil>/cv). */
export async function pdfDelCvEnBytes(cv: CvDocumento): Promise<ArrayBuffer> {
  return (await dibujarCv(cv)).output("arraybuffer");
}

export async function pdfDeLaCarta(cv: CvDocumento, carta: Carta): Promise<Blob> {
  const l = await lienzo();
  l.doc.setProperties({ title: `${cv.nombre} — ${cv.idioma === "en" ? "Cover letter" : "Carta de presentación"}`, author: cv.nombre, creator: "ContrataCR" });
  encabezado(l, cv);
  l.y += 18;
  // El cuerpo es exactamente el texto que se copia: una sola fuente de verdad.
  for (const bloque of cuerpoDeLaCarta(cv, carta).split("\n")) {
    if (!bloque.trim()) { l.y += 8; continue; }
    parrafo(l, bloque, { tam: 11, interlineado: 1.45 });
  }
  return l.doc.output("blob");
}
