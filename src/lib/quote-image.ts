"use client";

import QRCode from "qrcode";
import { formatColones } from "@/lib/pricing";
import { enlaceCotizacion, type Quote } from "@/lib/quotes";

/**
 * La cotización como imagen (1080 px de ancho, alto según los renglones): banda
 * marino con la marca, quién cotiza y a quién, los renglones, el total, las
 * notas y el enlace con su QR. Es lo que se manda por WhatsApp: se ve dentro
 * del chat sin abrir nada.
 */
const W = 1080;
const M = 72;

type Textos = { titulo: string; cliente: string; vigente: string; subtotal: string; iva: string; total: string; ivai: string; pie: string; deQuien: string };

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

const FUENTE = "Inter, -apple-system, \"Segoe UI\", Roboto, sans-serif";

async function dibujar(quote: Quote, proName: string, textos: Textos, fechaVigencia: string | null): Promise<HTMLCanvasElement | null> {
  const url = enlaceCotizacion(quote.public_code);
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
  const altoQuien = 60 + 56 + (quote.client_name ? 34 + 44 : 0) + 24;
  const altoTitulo = (lineasTitulo.length ? lineasTitulo.length * 44 + 12 : 0) + (fechaVigencia ? 40 : 0) + (lineasTitulo.length || fechaVigencia ? 30 : 0);
  const altoRenglones = filas.reduce((acc, f) => acc + f.alto, 0) + 20;
  const altoTotales = (quote.tax_mode !== "exento" ? 170 : 130) + 40;
  const altoNotas = lineasNotas.length ? lineasNotas.length * 36 + 30 : 0;
  const altoPie = 260;
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

  // Quién cotiza y para quién.
  let y = altoBanda + 60;
  ctx.font = `700 22px ${FUENTE}`; ctx.fillStyle = "#68778d"; ctx.fillText(textos.deQuien.toUpperCase(), M, y);
  y += 46; ctx.font = `800 42px ${FUENTE}`; ctx.fillStyle = "#162543"; ctx.fillText(proName, M, y);
  if (quote.client_name) {
    y += 44; ctx.font = `700 22px ${FUENTE}`; ctx.fillStyle = "#68778d"; ctx.fillText(textos.cliente.toUpperCase(), M, y);
    y += 40; ctx.font = `700 32px ${FUENTE}`; ctx.fillStyle = "#162543"; ctx.fillText(quote.client_name, M, y);
  }
  y += 24;

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

  // Totales en un cuadro suave.
  const altoCuadro = quote.tax_mode !== "exento" ? 170 : 130;
  ctx.fillStyle = "#f4f7fa"; roundRect(ctx, M, y, ancho, altoCuadro, 24); ctx.fill();
  const fila = (etq: string, val: string, yy: number, fuerte = false) => {
    ctx.font = `${fuerte ? 800 : 500} ${fuerte ? 36 : 28}px ${FUENTE}`; ctx.fillStyle = fuerte ? "#162543" : "#52627a";
    ctx.textAlign = "left"; ctx.fillText(etq, M + 32, yy);
    ctx.textAlign = "right"; ctx.fillText(val, W - M - 32, yy); ctx.textAlign = "left";
  };
  fila(textos.subtotal, formatColones(quote.subtotal), y + 46);
  if (quote.tax_mode !== "exento") fila(textos.iva, formatColones(quote.tax_amount), y + 86);
  fila(textos.total, `${formatColones(quote.total)}  ${textos.ivai}`, y + altoCuadro - 30, true);
  y += altoCuadro + 40;

  if (lineasNotas.length) {
    ctx.font = `400 28px ${FUENTE}`; ctx.fillStyle = "#52627a";
    lineasNotas.forEach((l, i) => ctx.fillText(l, M, y + 8 + i * 36));
    y += altoNotas;
  }

  // Pie: enlace y QR.
  const qrSize = 180;
  const qrData = await QRCode.toDataURL(url, { margin: 1, width: qrSize, color: { dark: "#162543", light: "#ffffff" } });
  const qr = await loadImage(qrData);
  const pieY = H - 230;
  ctx.fillStyle = "#e5eaf0"; ctx.fillRect(M, pieY - 30, ancho, 2);
  if (qr) ctx.drawImage(qr, W - M - qrSize, pieY, qrSize, qrSize);
  ctx.font = `600 26px ${FUENTE}`; ctx.fillStyle = "#68778d";
  partirLineas(ctx, textos.pie, ancho - qrSize - 40).forEach((l, i) => ctx.fillText(l, M, pieY + 40 + i * 34));
  ctx.font = `700 28px ${FUENTE}`; ctx.fillStyle = "#009FD9";
  ctx.fillText(url.replace(/^https?:\/\//, ""), M, pieY + 130);

  return canvas;
}

/** La cotización como PNG (para el estado de WhatsApp o guardarla). */
export async function renderQuoteImage(quote: Quote, proName: string, textos: Textos, fechaVigencia: string | null): Promise<Blob | null> {
  const canvas = await dibujar(quote, proName, textos, fechaVigencia);
  if (!canvas) return null;
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/**
 * La cotización como PDF de una página. Es el formato que la gente espera de
 * una cotización y el que se puede adjuntar en WhatsApp o en un correo. La
 * hoja tiene el ancho de una carta y el alto del contenido, así nada se corta
 * ni queda media hoja en blanco. jsPDF se carga solo aquí (import dinámico),
 * para que no pese en el resto del app.
 */
export async function renderQuotePdf(quote: Quote, proName: string, textos: Textos, fechaVigencia: string | null): Promise<Blob | null> {
  const canvas = await dibujar(quote, proName, textos, fechaVigencia);
  if (!canvas) return null;
  const { jsPDF } = await import("jspdf");
  const anchoMm = 210;
  const altoMm = Math.round((canvas.height / canvas.width) * anchoMm);
  const doc = new jsPDF({ orientation: altoMm > anchoMm ? "portrait" : "landscape", unit: "mm", format: [anchoMm, Math.max(altoMm, 150)] });
  doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, anchoMm, altoMm, undefined, "FAST");
  return doc.output("blob");
}
