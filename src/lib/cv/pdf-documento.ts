import type { jsPDF as JsPdf } from "jspdf";
import type { Carta, CvDocumento } from "./documento";
import { maquetar, nuevoDocumento, type Maqueta } from "./maquetar";

/**
 * EL PDF DEL CV Y DE LA CARTA. Texto de verdad (seleccionable), sin imágenes.
 * Desde el 19-nov-2026 sigue el diseño elegido (lib/cv/diseno): se dibuja la
 * misma maqueta que muestra la vista previa (lib/cv/maquetar), así que el
 * archivo tiene las mismas páginas y los mismos saltos que se ven en pantalla.
 * Con una columna (la plantilla «Clásica» y las aptas para ATS) se lee de
 * arriba abajo sin perderse.
 */

function dibujar(doc: JsPdf, m: Maqueta) {
  m.paginas.forEach((ops, i) => {
    if (i) doc.addPage([m.ancho, m.alto], "portrait");
    for (const op of ops) {
      switch (op.t) {
        case "caja":
          doc.setFillColor(...op.color);
          if (op.radio > 0) doc.roundedRect(op.x, op.y, op.w, op.h, op.radio, op.radio, "F");
          else doc.rect(op.x, op.y, op.w, op.h, "F");
          break;
        case "linea":
          doc.setDrawColor(...op.color);
          doc.setLineWidth(op.grosor);
          doc.line(op.x1, op.y1, op.x2, op.y2);
          break;
        case "punto":
          doc.setFillColor(...op.color);
          doc.circle(op.x, op.y, op.r, "F");
          break;
        case "imagen":
          // La firma: PNG con fondo transparente, del mismo tamaño que en pantalla.
          doc.addImage(op.src, "PNG", op.x, op.y, op.w, op.h, undefined, "FAST");
          break;
        case "texto":
          doc.setFont(op.fuente, op.negrita ? "bold" : "normal");
          doc.setFontSize(op.tam);
          doc.setTextColor(...op.color);
          if (op.url) doc.textWithLink(op.s, op.x, op.y, { url: op.url });
          else doc.text(op.s, op.x, op.y);
          break;
      }
    }
  });
}

async function armar(cv: CvDocumento, carta?: Carta): Promise<JsPdf> {
  const doc = await nuevoDocumento(cv);
  const en = cv.idioma === "en";
  doc.setProperties(carta
    ? { title: `${cv.nombre} — ${en ? "Cover letter" : "Carta de presentación"}`, author: cv.nombre, creator: "ContrataCR" }
    : { title: `${cv.nombre} — ${en ? "Resume" : "CV"}`, author: cv.nombre, subject: cv.titular, creator: "ContrataCR" });
  dibujar(doc, maquetar(doc, cv, carta));
  return doc;
}

export async function pdfDelCv(cv: CvDocumento): Promise<Blob> {
  return (await armar(cv)).output("blob");
}

/** Lo mismo en bytes, para el servidor (contratacr.com/<perfil>/cv). */
export async function pdfDelCvEnBytes(cv: CvDocumento): Promise<ArrayBuffer> {
  return (await armar(cv)).output("arraybuffer");
}

export async function pdfDeLaCarta(cv: CvDocumento, carta: Carta): Promise<Blob> {
  return (await armar(cv, carta)).output("blob");
}
