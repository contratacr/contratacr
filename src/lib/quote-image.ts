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

export async function renderQuoteImage(quote: Quote, proName: string, textos: Textos, fechaVigencia: string | null): Promise<Blob | null> {
  const url = enlaceCotizacion(quote.public_code);
  // Alto: se mide primero con un canvas de trabajo y luego se dibuja.
  const medidor = document.createElement("canvas").getContext("2d");
  if (!medidor) return null;
  medidor.font = `500 30px ${FUENTE}`;
  const filas = quote.items.map((it) => ({ lineas: partirLineas(medidor, it.description, W - M * 2 - 300), it }));
  const altoRenglones = filas.reduce((acc, f) => acc + Math.max(1, f.lineas.length) * 38 + 30, 0);
  medidor.font = `400 28px ${FUENTE}`;
  const lineasNotas = quote.notes ? partirLineas(medidor, quote.notes, W - M * 2) : [];
  const altoNotas = lineasNotas.length ? lineasNotas.length * 36 + 40 : 0;
  const H = 200 + 250 + altoRenglones + 40 + 190 + altoNotas + 260;

  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d"); if (!ctx) return null;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);

  // Banda marino con la marca y el rótulo.
  ctx.fillStyle = "#162543"; ctx.fillRect(0, 0, W, 200);
  const marca = await loadImage("/logo-mark-dark.png");
  if (marca) ctx.drawImage(marca, M, 56, 88, 88);
  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.font = `800 52px ${FUENTE}`;
  const x0 = M + (marca ? 108 : 0);
  ctx.fillStyle = "#ffffff"; ctx.fillText("Contrata", x0, 100);
  ctx.fillStyle = "#009FD9"; ctx.fillText("CR", x0 + ctx.measureText("Contrata").width, 100);
  ctx.textAlign = "right"; ctx.font = `800 30px ${FUENTE}`; ctx.fillStyle = "#9fc9e8";
  ctx.fillText(textos.titulo, W - M, 100);

  // De quién, para quién, vigencia.
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  let y = 270;
  ctx.font = `600 24px ${FUENTE}`; ctx.fillStyle = "#68778d"; ctx.fillText(textos.deQuien.toUpperCase(), M, y);
  y += 46; ctx.font = `800 42px ${FUENTE}`; ctx.fillStyle = "#162543"; ctx.fillText(proName, M, y);
  if (quote.client_name) {
    y += 54; ctx.font = `600 24px ${FUENTE}`; ctx.fillStyle = "#68778d"; ctx.fillText(textos.cliente.toUpperCase(), M, y);
    y += 40; ctx.font = `700 32px ${FUENTE}`; ctx.fillStyle = "#162543"; ctx.fillText(quote.client_name, M, y);
  }
  if (quote.title) {
    ctx.textAlign = "right"; ctx.font = `700 30px ${FUENTE}`; ctx.fillStyle = "#162543";
    ctx.fillText(quote.title.slice(0, 48), W - M, 316);
    ctx.textAlign = "left";
  }
  if (fechaVigencia) {
    ctx.textAlign = "right"; ctx.font = `500 26px ${FUENTE}`; ctx.fillStyle = "#68778d";
    ctx.fillText(textos.vigente, W - M, quote.title ? 356 : 316);
    ctx.textAlign = "left";
  }
  y = 200 + 250;

  // Renglones.
  ctx.strokeStyle = "#e5eaf0"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(M, y - 10); ctx.lineTo(W - M, y - 10); ctx.stroke();
  for (const f of filas) {
    const alto = Math.max(1, f.lineas.length) * 38 + 30;
    ctx.font = `500 30px ${FUENTE}`; ctx.fillStyle = "#162543";
    f.lineas.forEach((l, i) => ctx.fillText(l, M, y + 34 + i * 38));
    ctx.font = `500 24px ${FUENTE}`; ctx.fillStyle = "#68778d";
    ctx.fillText(`× ${f.it.quantity}`, M, y + 34 + Math.max(1, f.lineas.length) * 38 - 4);
    ctx.textAlign = "right"; ctx.font = `700 30px ${FUENTE}`; ctx.fillStyle = "#162543";
    ctx.fillText(formatColones(Math.round(f.it.quantity * f.it.unit_price)), W - M, y + 34);
    ctx.textAlign = "left";
    y += alto;
    ctx.beginPath(); ctx.moveTo(M, y - 6); ctx.lineTo(W - M, y - 6); ctx.stroke();
  }

  // Totales en un cuadro suave.
  y += 34;
  ctx.fillStyle = "#f4f7fa"; roundRect(ctx, M, y, W - M * 2, 170, 24); ctx.fill();
  const fila = (etq: string, val: string, yy: number, fuerte = false) => {
    ctx.font = `${fuerte ? 800 : 500} ${fuerte ? 36 : 28}px ${FUENTE}`; ctx.fillStyle = fuerte ? "#162543" : "#52627a";
    ctx.textAlign = "left"; ctx.fillText(etq, M + 32, yy);
    ctx.textAlign = "right"; ctx.fillText(val, W - M - 32, yy); ctx.textAlign = "left";
  };
  fila(textos.subtotal, formatColones(quote.subtotal), y + 46);
  if (quote.tax_mode !== "exento") fila(textos.iva, formatColones(quote.tax_amount), y + 86);
  fila(`${textos.total}`, `${formatColones(quote.total)}  ${textos.ivai}`, y + 140, true);
  y += 170 + 40;

  if (lineasNotas.length) {
    ctx.font = `400 28px ${FUENTE}`; ctx.fillStyle = "#52627a";
    lineasNotas.forEach((l, i) => ctx.fillText(l, M, y + i * 36));
    y += altoNotas;
  }

  // Pie: enlace y QR.
  const qrSize = 180;
  const qrData = await QRCode.toDataURL(url, { margin: 1, width: qrSize, color: { dark: "#162543", light: "#ffffff" } });
  const qr = await loadImage(qrData);
  const pieY = H - 230;
  ctx.fillStyle = "#e5eaf0"; ctx.fillRect(M, pieY - 30, W - M * 2, 2);
  if (qr) ctx.drawImage(qr, W - M - qrSize, pieY, qrSize, qrSize);
  ctx.font = `600 26px ${FUENTE}`; ctx.fillStyle = "#68778d";
  partirLineas(ctx, textos.pie, W - M * 2 - qrSize - 40).forEach((l, i) => ctx.fillText(l, M, pieY + 40 + i * 34));
  ctx.font = `700 28px ${FUENTE}`; ctx.fillStyle = "#009FD9";
  ctx.fillText(url.replace(/^https?:\/\//, ""), M, pieY + 130);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
