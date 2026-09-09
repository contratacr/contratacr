"use client";

import { formatColones } from "@/lib/pricing";
import { desgloseQuote, type Quote } from "@/lib/quotes";

/**
 * La cotización como imagen (1080 px de ancho, alto según los renglones): banda
 * marino con la marca, quién cotiza y a quién, los renglones, el total, las
 * notas y el enlace con su QR. Es lo que se manda por WhatsApp: se ve dentro
 * del chat sin abrir nada.
 */
const W = 1080;
const M = 72;

type Textos = {
  titulo: string; cliente: string; vigente: string; subtotal: string; iva: string; total: string;
  totalNota: string; pie: string; deQuien: string; nota: string;
};

/** Datos del cliente que van bajo su nombre, si el profesional los puso. */
function datosCliente(quote: Quote): string[] {
  const filas: string[] = [];
  if (quote.client_cedula) filas.push(`Cédula ${quote.client_cedula}`);
  if (quote.client_phone) filas.push(quote.client_phone.replace(/^506/, "").replace(/(\d{4})(\d{4})/, "$1-$2"));
  if (quote.client_email) filas.push(quote.client_email);
  return filas;
}

/** Dónde quedó el enlace dentro del lienzo, para volverlo clicable en el PDF. */
export type Dibujo = { canvas: HTMLCanvasElement; enlace: { x: number; y: number; w: number; h: number; url: string } };

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src;
  });
}

function partirLineas(ctx: CanvasRenderingContext2D, texto: string, maxW: number): string[] {
  const palabras = texto.split(/\s+/); const lineas: string[] = []; let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width <= maxW || !actual) actual = prueba;
    else { lineas.push(actual); actual = p; }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** Corta por caracteres: una dirección web no tiene espacios donde partir. */
function partirSeguido(ctx: CanvasRenderingContext2D, texto: string, maxW: number): string[] {
  const lineas: string[] = []; let actual = "";
  for (const caracter of texto) {
    const prueba = actual + caracter;
    if (ctx.measureText(prueba).width <= maxW || !actual) actual = prueba;
    else { lineas.push(actual); actual = caracter; }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

const FUENTE = "Inter, -apple-system, \"Segoe UI\", Roboto, sans-serif";

async function dibujar(quote: Quote, proName: string, textos: Textos, fechaVigencia: string | null, perfilUrl: string): Promise<Dibujo | null> {
  const url = perfilUrl;
  const ancho = W - M * 2;
  // Todo se mide primero con un canvas de trabajo; el alto sale de ahí.
  const medidor = document.createElement("canvas").getContext("2d");
  if (!medidor) return null;
  medidor.font = `800 36px ${FUENTE}`;
  const lineasTitulo = quote.title ? partirLineas(medidor, quote.title, ancho).slice(0, 2) : [];
  medidor.font = `500 30px ${FUENTE}`;
  const filas = quote.items.map((it) => {
    const cola = `  × ${it.quantity}`;
    const lineas = partirLineas(medidor, it.description, ancho - 260);
    return { lineas, cola, it, alto: lineas.length * 38 + 28 };
  });
  medidor.font = `400 28px ${FUENTE}`;
  const lineasNotas = quote.notes ? partirLineas(medidor, quote.notes, ancho) : [];

  // Alturas de cada bloque, de arriba abajo.
  const altoBanda = 200;
  const altoQuien = 60 + 44 + Math.max(0, datosCliente(quote).length * 32 - 10) + 30;
  const altoTitulo = (lineasTitulo.length ? lineasTitulo.length * 44 + 12 : 0) + (fechaVigencia ? 40 : 0) + (lineasTitulo.length || fechaVigencia ? 30 : 0);
  const altoRenglones = filas.reduce((acc, f) => acc + f.alto, 0) + 20;
  const altoTotales = (quote.tax_mode !== "exento" ? 190 : 130) + 40;
  const altoNotas = lineasNotas.length ? lineasNotas.length * 36 + 70 : 0;
  const altoPie = 200;
  const H = altoBanda + altoQuien + altoTitulo + altoRenglones + altoTotales + altoNotas + altoPie;

  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d"); if (!ctx) return null;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);

  // Banda marino con la marca y el rótulo.
  ctx.fillStyle = "#162543"; ctx.fillRect(0, 0, W, altoBanda);
  const marca = await loadImage("/logo-mark-dark.png");
  if (marca) ctx.drawImage(marca, M, 56, 88, 88);
  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.font = `800 52px ${FUENTE}`;
  const x0 = M + (marca ? 108 : 0);
  ctx.fillStyle = "#ffffff"; ctx.fillText("Contrata", x0, 100);
  ctx.fillStyle = "#009FD9"; ctx.fillText("CR", x0 + ctx.measureText("Contrata").width, 100);
  ctx.textAlign = "right"; ctx.font = `800 30px ${FUENTE}`; ctx.fillStyle = "#9fc9e8";
  ctx.fillText(textos.titulo, W - M, 100);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";

  // Quién cotiza a la izquierda y el cliente a la derecha, como en cualquier
  // factura: bajo el nombre del cliente van sus datos, si los hay.
  const datos = datosCliente(quote);
  let y = altoBanda + 60;
  ctx.font = `700 22px ${FUENTE}`; ctx.fillStyle = "#68778d"; ctx.fillText(textos.deQuien.toUpperCase(), M, y);
  ctx.font = `800 38px ${FUENTE}`; ctx.fillStyle = "#162543"; ctx.fillText(proName, M, y + 44);
  if (quote.client_name) {
    ctx.textAlign = "right";
    ctx.font = `700 22px ${FUENTE}`; ctx.fillStyle = "#68778d"; ctx.fillText(textos.cliente.toUpperCase(), W - M, y);
    ctx.font = `700 30px ${FUENTE}`; ctx.fillStyle = "#162543"; ctx.fillText(quote.client_name, W - M, y + 42);
    ctx.font = `500 24px ${FUENTE}`; ctx.fillStyle = "#68778d";
    datos.forEach((linea, i) => ctx.fillText(linea, W - M, y + 78 + i * 32));
    ctx.textAlign = "left";
  }
  y += 44 + Math.max(0, datos.length * 32 - 10) + 30;

  // Título y vigencia, en su propio bloque.
  if (lineasTitulo.length) {
    ctx.font = `800 36px ${FUENTE}`; ctx.fillStyle = "#162543";
    lineasTitulo.forEach((l) => { y += 44; ctx.fillText(l, M, y); });
    y += 12;
  }
  if (fechaVigencia) { y += 30; ctx.font = `500 26px ${FUENTE}`; ctx.fillStyle = "#68778d"; ctx.fillText(textos.vigente, M, y); y += 10; }
  if (lineasTitulo.length || fechaVigencia) y += 30;

  // Renglones: descripción (con la cantidad al final) y precio a la derecha.
  ctx.strokeStyle = "#e5eaf0"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke();
  for (const f of filas) {
    const yy = y + 42;
    ctx.font = `500 30px ${FUENTE}`; ctx.fillStyle = "#162543";
    f.lineas.forEach((l, i) => {
      ctx.fillText(l, M, yy + i * 38);
      if (i === f.lineas.length - 1) {
        const w = ctx.measureText(l).width;
        ctx.font = `500 24px ${FUENTE}`; ctx.fillStyle = "#68778d"; ctx.fillText(f.cola, M + w, yy + i * 38);
        ctx.font = `500 30px ${FUENTE}`; ctx.fillStyle = "#162543";
      }
    });
    ctx.textAlign = "right"; ctx.font = `700 30px ${FUENTE}`; ctx.fillStyle = "#162543";
    ctx.fillText(formatColones(Math.round(f.it.quantity * f.it.unit_price)), W - M, yy);
    ctx.textAlign = "left";
    y += f.alto;
    ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke();
  }
  y += 20;

  // Totales: base + IVA = total, siempre. Con el IVA dentro del precio, el
  // subtotal es la base; antes salía igual al total y parecía un error.
  const montos = desgloseQuote(quote);
  const conIva = quote.tax_mode !== "exento";
  const altoCuadro = conIva ? 190 : 130;
  ctx.fillStyle = "#f4f7fa"; roundRect(ctx, M, y, ancho, altoCuadro, 24); ctx.fill();
  const fila = (etq: string, val: string, yy: number, fuerte = false) => {
    ctx.font = `${fuerte ? 800 : 500} ${fuerte ? 36 : 28}px ${FUENTE}`; ctx.fillStyle = fuerte ? "#162543" : "#52627a";
    ctx.textAlign = "left"; ctx.fillText(etq, M + 32, yy);
    ctx.textAlign = "right"; ctx.fillText(val, W - M - 32, yy); ctx.textAlign = "left";
  };
  fila(textos.subtotal, formatColones(montos.base), y + 48);
  if (conIva) fila(textos.iva, formatColones(montos.iva), y + 88);
  fila(textos.total, formatColones(montos.total), y + altoCuadro - 58, true);
  ctx.textAlign = "right"; ctx.font = `600 24px ${FUENTE}`; ctx.fillStyle = "#68778d";
  ctx.fillText(textos.totalNota, W - M - 32, y + altoCuadro - 24); ctx.textAlign = "left";
  y += altoCuadro + 40;

  if (lineasNotas.length) {
    ctx.font = `700 22px ${FUENTE}`; ctx.fillStyle = "#68778d"; ctx.fillText(textos.nota.toUpperCase(), M, y + 4);
    ctx.font = `400 28px ${FUENTE}`; ctx.fillStyle = "#52627a";
    lineasNotas.forEach((l, i) => ctx.fillText(l, M, y + 44 + i * 36));
    y += altoNotas;
  }

  // Pie: el perfil de quien cotiza. El enlace de la cotización no va: quien
  // tiene el PDF ya la tiene delante, y una dirección larga solo estorbaba.
  const pieY = H - altoPie + 40;
  ctx.fillStyle = "#e5eaf0"; ctx.fillRect(M, pieY - 30, ancho, 2);
  ctx.font = `600 26px ${FUENTE}`; ctx.fillStyle = "#68778d";
  partirLineas(ctx, textos.pie, ancho).forEach((l, i) => ctx.fillText(l, M, pieY + 34 + i * 34));
  const visible = url ? url.replace(/^https?:\/\//, "") : "";
  ctx.font = `700 24px ${FUENTE}`; ctx.fillStyle = "#009FD9";
  const enlaceY = pieY + 90;
  const lineasEnlace = visible ? partirSeguido(ctx, visible, ancho) : [];
  lineasEnlace.forEach((l, i) => ctx.fillText(l, M, enlaceY + i * 32));
  const anchoEnlace = lineasEnlace.length ? Math.max(...lineasEnlace.map((l) => ctx.measureText(l).width)) : 0;

  return { canvas, enlace: { x: M, y: enlaceY - 26, w: anchoEnlace, h: 32 * lineasEnlace.length + 8, url } };
}

/** La cotización como PNG (para el estado de WhatsApp o guardarla). */
export async function renderQuoteImage(quote: Quote, proName: string, textos: Textos, fechaVigencia: string | null, perfilUrl = ""): Promise<Blob | null> {
  const dibujo = await dibujar(quote, proName, textos, fechaVigencia, perfilUrl);
  if (!dibujo) return null;
  return new Promise((resolve) => dibujo.canvas.toBlob((b) => resolve(b), "image/png"));
}

/**
 * La cotización como PDF de una página. Es el formato que la gente espera de
 * una cotización y el que se puede adjuntar en WhatsApp o en un correo. La
 * hoja tiene el ancho de una carta y el alto del contenido, así nada se corta
 * ni queda media hoja en blanco. jsPDF se carga solo aquí (import dinámico),
 * para que no pese en el resto del app.
 */
export async function renderQuotePdf(quote: Quote, proName: string, textos: Textos, fechaVigencia: string | null, perfilUrl = ""): Promise<Blob | null> {
  const dibujo = await dibujar(quote, proName, textos, fechaVigencia, perfilUrl);
  if (!dibujo) return null;
  const { canvas, enlace } = dibujo;
  const { jsPDF } = await import("jspdf");
  const anchoMm = 210;
  const escala = anchoMm / canvas.width;
  const altoMm = Math.round(canvas.height * escala);
  const doc = new jsPDF({ orientation: altoMm > anchoMm ? "portrait" : "landscape", unit: "mm", format: [anchoMm, Math.max(altoMm, 150)] });
  doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, anchoMm, altoMm);
  // El enlace y el QR, clicables: en el PDF el texto es parte de la imagen, así
  // que se pone encima una zona que abre la dirección.
  if (enlace.url && enlace.w > 0) doc.link(enlace.x * escala, enlace.y * escala, enlace.w * escala, enlace.h * escala, { url: enlace.url });
  return doc.output("blob");
}
