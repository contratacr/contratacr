/** Cotizaciones: tipos y cálculo compartidos entre la API y la interfaz. */
export type QuoteItem = { description: string; quantity: number; unit_price: number };
export type QuoteTaxMode = "incluido" | "mas_iva" | "exento";
export type QuoteStatus = "sent" | "accepted" | "declined" | "withdrawn";

export type Quote = {
  id: string;
  professional_id: string;
  /** Null cuando la cotización va a alguien sin cuenta (nombre y WhatsApp). */
  client_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_cedula: string | null;
  client_email: string | null;
  /** Código del enlace público: contratacr.com/cotizacion/<código>. */
  public_code: string;
  /** Consecutivo del profesional (1, 2, 3…): sale en el documento y en el nombre del archivo. */
  quote_number: number | null;
  booking_id: string | null;
  project_id: string | null;
  proposal_id: string | null;
  title: string | null;
  items: QuoteItem[];
  tax_mode: QuoteTaxMode;
  subtotal: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  valid_until: string | null;
  status: QuoteStatus;
  accepted_at: string | null;
  declined_at: string | null;
  deleted_at?: string | null;
  created_at: string;
  professional_name?: string | null;
};

/**
 * El enlace público: contratacr.com/c/k7m2xq9a. El código al azar es la llave —
 * sin él nadie puede abrir una cotización ajena, y por eso no se adivina—, así
 * que es lo único que el enlace necesita llevar. La forma larga que se envió
 * antes (…/cotizacion/sg-solutions-0003-k7m2xq9a) sigue abriendo lo mismo.
 *
 * La base es el sitio donde la cotización EXISTE: en test, test.contratacr.com;
 * en producción, contratacr.com. Solo las vistas previas de Vercel se mandan al
 * dominio de verdad, porque esa dirección no se comparte con nadie.
 */
export function enlaceCotizacion(quote: Pick<Quote, "public_code" | "quote_number">, _proName = "", baseUrl?: string): string {
  const origen = baseUrl || (typeof window !== "undefined" ? window.location.origin : "") || process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";
  let base = origen.replace(/\/$/, "");
  if (/\.vercel\.app$/i.test(base.replace(/^https?:\/\//, "").split("/")[0])) base = "https://contratacr.com";
  // Corto y sin ruido: el código es la llave y lo único que hace falta.
  // Los enlaces largos que ya se enviaron siguen abriendo la misma cotización.
  return `${base}/c/${quote.public_code}`;
}

/** De "sg-solutions-0003-k7m2xq9a" saca "k7m2xq9a": el código es lo último. */
export function codigoDeEnlace(tramo: string): string {
  const partes = String(tramo || "").toLowerCase().split("-").filter(Boolean);
  return partes[partes.length - 1] ?? "";
}

/** "0007" — el consecutivo como se lee en el documento. */
export function numeroCotizacion(quote: Pick<Quote, "quote_number">): string {
  return String(quote.quote_number ?? 0).padStart(4, "0");
}

/**
 * El nombre del archivo que le llega al cliente: "Cotizacion-SG-Solutions-0007.pdf".
 * Se reconoce en la lista de descargas sin abrirlo, que es de lo que se trata.
 */
export function nombreArchivoCotizacion(quote: Pick<Quote, "quote_number" | "public_code">, proName: string): string {
  const marca = (proName || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const numero = quote.quote_number ? numeroCotizacion(quote) : quote.public_code.slice(0, 6);
  return ["Cotizacion", marca, numero].filter(Boolean).join("-");
}

/**
 * Los tres montos como se leen: con el IVA ya dentro del precio, el subtotal es
 * la base (total menos IVA) para que las tres líneas SUMEN. Antes se mostraba
 * subtotal = total y parecía un error.
 */
export function desgloseQuote(quote: Pick<Quote, "subtotal" | "tax_amount" | "total" | "tax_mode">) {
  if (quote.tax_mode === "incluido") return { base: quote.total - quote.tax_amount, iva: quote.tax_amount, total: quote.total };
  if (quote.tax_mode === "mas_iva") return { base: quote.subtotal, iva: quote.tax_amount, total: quote.total };
  return { base: quote.subtotal, iva: 0, total: quote.total };
}

/** Solo dígitos, con el 506 de Costa Rica si viene sin código de país. */
export function whatsappDigits(phone: string | null | undefined): string {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length === 8 ? `506${d}` : d;
}

export const IVA_RATE = 0.13;
export const QUOTE_MAX_ITEMS = 20;
export const QUOTE_MAX_AMOUNT = 222_222_222;

export function quoteTotals(items: QuoteItem[], taxMode: QuoteTaxMode) {
  const subtotal = Math.round(items.reduce((acc, it) => acc + Math.max(0, it.quantity) * Math.max(0, it.unit_price), 0));
  if (taxMode === "mas_iva") {
    const tax = Math.round(subtotal * IVA_RATE);
    return { subtotal, tax_amount: tax, total: subtotal + tax };
  }
  if (taxMode === "incluido") {
    const tax = Math.round(subtotal - subtotal / (1 + IVA_RATE));
    return { subtotal, tax_amount: tax, total: subtotal };
  }
  return { subtotal, tax_amount: 0, total: subtotal };
}

/** Deja solo renglones válidos: texto, cantidad > 0 y precio entero >= 0. */
export function sanitizeQuoteItems(raw: unknown): QuoteItem[] {
  if (!Array.isArray(raw)) return [];
  const out: QuoteItem[] = [];
  for (const it of raw.slice(0, QUOTE_MAX_ITEMS)) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const description = String(r.description ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
    const quantity = Math.min(9999, Math.max(0, Number(r.quantity)));
    const unit_price = Math.min(QUOTE_MAX_AMOUNT, Math.max(0, Math.round(Number(r.unit_price))));
    if (!description || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unit_price)) continue;
    out.push({ description, quantity: Math.round(quantity * 100) / 100, unit_price });
  }
  return out;
}

export function isQuoteExpired(q: Pick<Quote, "valid_until" | "status">) {
  if (q.status !== "sent" || !q.valid_until) return false;
  const [y, m, d] = q.valid_until.split("-").map(Number);
  const limite = new Date(y, m - 1, d, 23, 59, 59);
  return limite.getTime() < Date.now();
}
