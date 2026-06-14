"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CreditCard, Loader2, Smartphone, ShieldCheck, Star, Upload, X, Clock } from "lucide-react";
import {
  PRICES, SINPE_PAYMENT, formatColones, type BillingCycle,
} from "@/lib/payments/config";

// Professional-facing subscription plans page (modern SaaS pricing style: plan
// cards → payment-method step). Rendered ONLY when PAYMENTS_ENABLED is on, or by an
// admin from /admin/suscripciones (preview) — never visible to regular users while
// the flag is off. Spanish-only by design (internal/pending surface).

type Subscription = {
  plan: "free" | "premium"; status: string; billing_cycle: BillingCycle | null;
  current_period_end: string | null; payment_method: string | null;
} | null;
type Payment = {
  id: string; amount: number; method: string; status: string;
  billing_cycle: string | null; paid_at: string; reference: string | null;
};

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric" }) : "";

// The subscription is what keeps a professional ACTIVE and able to receive
// clients — NOT cosmetic extras. No featured placement (search is filter-based)
// and no extra badge (the only badge is "Verificado"). Honest, model-accurate list.
const BENEFITS = [
  "Tu perfil aparece en las búsquedas y los clientes pueden encontrarte",
  "Recibe solicitudes de servicio de tus clientes",
  "Recibe y responde proyectos publicados por clientes",
  "Mantén tu perfil profesional activo para seguir recibiendo clientes",
];

export function SubscriptionPanel() {
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<Subscription>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [gatewayReady, setGatewayReady] = useState(false);
  const [cycle, setCycle] = useState<BillingCycle>("annual");
  const [method, setMethod] = useState<"card" | "sinpe" | null>(null);

  // SINPE submission state
  const fileRef = useRef<HTMLInputElement>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [reference, setReference] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardMsg, setCardMsg] = useState<string | null>(null);

  const reload = () =>
    fetch("/api/payments/subscription")
      .then((r) => r.json())
      .then((d) => { setSub(d.subscription ?? null); setPayments(d.payments ?? []); setGatewayReady(!!d.gatewayReady); });

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  const active = sub?.status === "active" && !!sub?.current_period_end && new Date(sub.current_period_end).getTime() > Date.now();
  const pendingReview = payments.some((p) => p.status === "pending");

  async function payCard() {
    setCardMsg(null);
    const res = await fetch("/api/payments/subscription", { method: "POST" });
    if (res.ok) { const { url } = await res.json(); if (url) { window.location.href = url; return; } }
    setCardMsg("El pago automático con tarjeta estará disponible muy pronto. Por ahora puedes pagar por SINPE Móvil o transferencia.");
    setMethod("sinpe");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/payments/receipt", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "No se pudo subir el comprobante"); return; }
      setReceiptUrl(d.url); setFileName(file.name);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submitSinpe() {
    if (!receiptUrl) { setError("Adjunta el comprobante primero."); return; }
    setSubmitting(true); setError(null);
    const res = await fetch("/api/payments/subscription/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cycle, reference, receiptUrl }),
    });
    setSubmitting(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "No se pudo enviar"); return; }
    setReceiptUrl(null); setFileName(""); setReference(""); setMethod(null);
    setLoading(true); reload().finally(() => setLoading(false));
  }

  if (loading) {
    return <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#009FD9]" /></div>;
  }

  // ── Active premium → status summary ──
  if (active) {
    return (
      <div className="flex flex-col gap-5">
        <div className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-5">
          <div className="flex items-center gap-2 text-[#15803d]">
            <ShieldCheck className="h-5 w-5" />
            <p className="font-bold">Plan profesional activo</p>
          </div>
          <p className="mt-1 text-sm text-[#166534]">
            Renueva el {fmtDate(sub?.current_period_end)}{sub?.billing_cycle ? ` · plan ${sub.billing_cycle === "annual" ? "anual" : "mensual"}` : ""}.
          </p>
        </div>
        <PaymentHistory payments={payments} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {pendingReview && (
        <div className="flex items-start gap-2 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]">
          <Clock className="h-4 w-4 shrink-0 mt-0.5" />
          <p>Recibimos tu comprobante. Tu pago está <strong>en revisión</strong>; activaremos tu plan apenas lo confirmemos (normalmente en pocas horas).</p>
        </div>
      )}

      {/* Hero */}
      <div>
        <h3 className="text-lg font-bold text-[#111827]">Mantén tu perfil profesional activo</h3>
        <p className="text-sm text-[#6b7280] mt-0.5">La suscripción mantiene tu perfil activo para aparecer en las búsquedas y recibir clientes.</p>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(["annual", "monthly"] as BillingCycle[]).map((c) => {
          const selected = cycle === c;
          const annual = c === "annual";
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              className={`relative text-left rounded-2xl border-2 p-4 transition-all ${selected ? "border-[#009FD9] bg-[#EBF5FB] shadow-sm" : "border-[#e5e7eb] hover:border-[#009FD9]/40"}`}
            >
              {annual && (
                <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full bg-[#009FD9] px-2 py-0.5 text-[10px] font-bold text-white">
                  <Star className="h-3 w-3 fill-white" /> 2 meses gratis
                </span>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#111827]">{annual ? "Anual" : "Mensual"}</span>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${selected ? "border-[#009FD9] bg-[#009FD9]" : "border-[#d1d5db]"}`}>
                  {selected && <Check className="h-3 w-3 text-white" />}
                </span>
              </div>
              <p className="mt-1 text-2xl font-extrabold text-[#111827]">
                {formatColones(PRICES[c])}
                <span className="text-xs font-medium text-[#6b7280]">{annual ? "/año" : "/mes"}</span>
              </p>
              <p className="text-[11px] text-[#6b7280] mt-0.5">{annual ? `Equivale a ${formatColones(Math.round(PRICES.annual / 12))}/mes` : "Facturación mensual"}</p>
            </button>
          );
        })}
      </div>

      {/* Benefits */}
      <ul className="flex flex-col gap-2">
        {BENEFITS.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm text-[#374151]">
            <Check className="h-4 w-4 text-[#15803d] shrink-0 mt-0.5" /> {b}
          </li>
        ))}
      </ul>

      {/* Payment method step */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-[#111827]">Elige cómo pagar</p>

        {/* OPTION 1 — Card (primary) */}
        <button
          type="button"
          onClick={() => { setMethod("card"); payCard(); }}
          className="flex items-center justify-between gap-3 rounded-xl bg-[#009FD9] px-4 py-3.5 text-white hover:bg-[#0089bb] transition-colors"
        >
          <span className="flex items-center gap-2 font-semibold text-sm"><CreditCard className="h-5 w-5" /> Pagar con tarjeta</span>
          <span className="text-xs opacity-90">{formatColones(PRICES[cycle])}{cycle === "annual" ? "/año" : "/mes"}</span>
        </button>
        {!gatewayReady && <p className="-mt-1 text-[11px] text-[#9ca3af]">Pago automático y recurrente. Disponible muy pronto.</p>}
        {cardMsg && <p className="text-xs text-[#b45309]">{cardMsg}</p>}

        {/* OPTION 2 — SINPE / transfer (manual) */}
        <button
          type="button"
          onClick={() => setMethod(method === "sinpe" ? null : "sinpe")}
          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 transition-colors ${method === "sinpe" ? "border-[#009FD9] bg-[#EBF5FB] text-[#0089bb]" : "border-[#e5e7eb] text-[#374151] hover:border-[#009FD9]"}`}
        >
          <span className="flex items-center gap-2 font-semibold text-sm"><Smartphone className="h-5 w-5" /> SINPE Móvil o transferencia</span>
          <span className="text-xs opacity-70">Manual</span>
        </button>

        {method === "sinpe" && (
          <div className="rounded-xl border border-[#e5e7eb] p-4 flex flex-col gap-3">
            <div className="rounded-lg bg-[#EBF5FB] p-3 text-sm text-[#0f172a]">
              <p>1. Envía <strong>{formatColones(PRICES[cycle])}</strong> por SINPE Móvil al número <strong>{SINPE_PAYMENT.number}</strong> ({SINPE_PAYMENT.holder}).</p>
              <p className="mt-1">2. Adjunta el comprobante abajo y envíalo. Un agente lo revisa y activa tu plan.</p>
            </div>

            <div>
              <label className="text-xs font-medium text-[#374151] block mb-1.5">Referencia o número de comprobante <span className="text-[#9ca3af]">(opcional)</span></label>
              <input value={reference} onChange={(e) => setReference(e.target.value)} className="w-full h-10 rounded-xl border border-[#e5e7eb] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9]" />
            </div>

            {/* Comprobante upload (image or PDF) */}
            <div>
              <label className="text-xs font-medium text-[#374151] block mb-1.5">Comprobante <span className="text-red-500">*</span></label>
              {receiptUrl ? (
                <div className="flex items-center gap-2 rounded-xl bg-[#f0fdf4] border border-[#bbf7d0] px-3 py-2 text-sm text-[#15803d]">
                  <Check className="h-4 w-4 shrink-0" />
                  <span className="truncate flex-1">{fileName || "Comprobante adjunto"}</span>
                  <button type="button" onClick={() => { setReceiptUrl(null); setFileName(""); }} className="text-[#9ca3af] hover:text-red-500"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#009FD9]/40 px-4 py-3 text-sm text-[#009FD9] hover:bg-[#EBF5FB] disabled:opacity-60"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? "Subiendo…" : "Adjuntar imagen o PDF"}
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              type="button"
              onClick={submitSinpe}
              disabled={submitting || !receiptUrl}
              className="h-11 rounded-xl bg-[#009FD9] text-white text-sm font-semibold hover:bg-[#0089bb] disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar comprobante para revisión
            </button>
          </div>
        )}
      </div>

      <PaymentHistory payments={payments} />
    </div>
  );
}

function PaymentHistory({ payments }: { payments: Payment[] }) {
  const real = payments.filter((p) => p.status !== "pending");
  if (real.length === 0) return null;
  return (
    <div>
      <p className="text-sm font-semibold text-[#111827] mb-2">Historial de pagos</p>
      <ul className="divide-y divide-[#f3f4f6] rounded-2xl border border-[#e5e7eb] overflow-hidden">
        {real.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="text-[#374151]">
              {fmtDate(p.paid_at)} · {p.method.toUpperCase()}{p.billing_cycle ? ` · ${p.billing_cycle === "annual" ? "anual" : "mensual"}` : ""}
              {p.status === "rejected" ? " · rechazado" : ""}
            </span>
            <span className="font-semibold text-[#111827]">{formatColones(p.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
