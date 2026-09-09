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
  /** Código del enlace público: contratacr.com/cotizacion/<código>. */
  public_code: string;
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
  created_at: string;
  professional_name?: string | null;
};

/** El enlace público que se manda al cliente. */
export function enlaceCotizacion(code: string, baseUrl?: string): string {
  let base = (baseUrl || process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com").replace(/\/$/, "");
  if (/\.vercel\.app$/i.test(base.replace(/^https?:\/\//, "").split("/")[0])) base = "https://contratacr.com";
  return `${base}/cotizacion/${code}`;
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
