import type { jsPDF as JsPdf } from "jspdf";
import { TITULOS, cuerpoDeLaCarta, fechasAts, type Carta, type CvDocumento } from "./documento";

/**
 * EL PDF DEL CV Y DE LA CARTA. Texto de verdad (seleccionable) con Helvetica,
 * una sola columna, sin tablas ni imágenes: lo que un filtro automático lee de
 * arriba abajo sin perderse. Las dos plantillas cambian solo tipografía de
 * títulos y un color de acento; el orden y la estructura son los mismos.
 */

const MARGEN = 54; // 0,75 pulgadas
const TINTA: [number, number, number] = [22, 37, 67];
const GRIS: [number, number, number] = [82, 98, 122];
const ACENTO: [number, number, number] = [0, 127, 174];

type Lienzo = { doc: JsPdf; y: number; ancho: number; alto: number; moderna: boolean };

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

function titulo(l: Lienzo, texto: string) {
  l.y += 10;
  asegurar(l, 30);
  l.doc.setFont("helvetica", "bold");
  l.doc.setFontSize(11);
  l.doc.setTextColor(...(l.moderna ? ACENTO : TINTA));
  l.doc.text(l.moderna ? texto : texto.toUpperCase(), MARGEN, l.y + 11);
  l.y += 16;
  l.doc.setDrawColor(...(l.moderna ? ACENTO : GRIS));
  l.doc.setLineWidth(l.moderna ? 1.2 : 0.5);
  l.doc.line(MARGEN, l.y, l.moderna ? MARGEN + 36 : MARGEN + l.ancho, l.y);
  l.y += 8;
}

async function lienzo(moderna: boolean): Promise<Lienzo> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const ancho = doc.internal.pageSize.getWidth() - MARGEN * 2;
  return { doc, y: MARGEN, ancho, alto: doc.internal.pageSize.getHeight(), moderna };
}

function encabezado(l: Lienzo, cv: CvDocumento) {
  parrafo(l, cv.nombre || " ", { tam: 22, negrita: true, interlineado: 1.15 });
  if (cv.titular.trim()) parrafo(l, cv.titular, { tam: 12, color: l.moderna ? ACENTO : GRIS });
  const contacto = [cv.correo, cv.telefono, cv.ubicacion, cv.enlace].filter((v) => v.trim()).join("  |  ");
  if (contacto) { l.y += 2; parrafo(l, contacto, { tam: 9.5, color: GRIS }); }
}

export async function pdfDelCv(cv: CvDocumento): Promise<Blob> {
  const l = await lienzo(cv.plantilla === "moderna");
  const t = TITULOS[cv.idioma];
  l.doc.setProperties({ title: `${cv.nombre} — ${cv.idioma === "en" ? "Resume" : "CV"}`, author: cv.nombre, subject: cv.titular, creator: "ContrataCR" });
  encabezado(l, cv);
  if (cv.resumen.trim()) { titulo(l, t.resumen); parrafo(l, cv.resumen.trim()); }
  const entradas = (nombre: string, lista: CvDocumento["experiencia"]) => {
    if (!lista.length) return;
    titulo(l, nombre);
    lista.forEach((e, i) => {
      if (i) l.y += 6;
      asegurar(l, 34);
      parrafo(l, [e.title, e.organization].filter(Boolean).join(" — "), { negrita: true, tam: 10.5 });
      if (e.period.trim()) parrafo(l, fechasAts(e.period, cv.idioma), { tam: 9.5, color: GRIS });
      for (const linea of e.description.split("\n").map((x) => x.trim().replace(/^[•\-–]\s*/, "")).filter(Boolean)) {
        asegurar(l, 14);
        l.doc.setFont("helvetica", "normal"); l.doc.setFontSize(10.5); l.doc.setTextColor(...TINTA);
        l.doc.text("•", MARGEN + 2, l.y + 10.5);
        parrafo(l, linea, { sangria: 12 });
      }
    });
  };
  entradas(t.experiencia, cv.experiencia);
  entradas(t.educacion, cv.educacion);
  if (cv.certificaciones.length) { titulo(l, t.certificaciones); cv.certificaciones.forEach((c) => parrafo(l, c)); }
  if (cv.habilidades.length) { titulo(l, t.habilidades); parrafo(l, cv.habilidades.join(", ")); }
  if (cv.idiomas.length) { titulo(l, t.idiomas); parrafo(l, cv.idiomas.join(", ")); }
  return l.doc.output("blob");
}

export async function pdfDeLaCarta(cv: CvDocumento, carta: Carta): Promise<Blob> {
  const l = await lienzo(cv.plantilla === "moderna");
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
