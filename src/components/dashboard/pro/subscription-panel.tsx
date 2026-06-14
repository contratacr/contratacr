"use client";

import { useEffect, useState } from "react";
import { Check, CreditCard, Loader2, Smartphone } from "lucide-react";
import {
  PRICES, SINPE_PAYMENT, formatColones, type BillingCycle,
} from "@/lib/payments/config";

// Professional-facing subscription UI. This component is rendered ONLY when the
// PAYMENTS_ENABLED flag is on (the dashboard never mounts it otherwise), so it is
// invisible/inaccessible to regular users today. Spanish-only by design (it's an
// internal/pending surface; full i18n happens when the feature is activated).

type Subscription = {
  plan: "free" | "premium";
  status: string;
  billing_cycle: BillingCycle | null;
  current_period_end: string | null;
  payment_method: string | null;
} | null;

type Payment = {
  id: string; amount: number; method: string; status: string;
  billing_cycle: string | null; paid_at: string; reference: string | null;
};

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric" }) : "";

export function SubscriptionPanel() {
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<Subscription>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [gatewayReady, setGatewayReady] = useState(false);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [showSinpe, setShowSinpe] = useState(false);
  const [cardMsg, setCardMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/payments/subscription")
      .then((r) => r.json())
      .then((d) => { setSub(d.subscription ?? null); setPayments(d.payments ?? []); setGatewayReady(!!d.gatewayReady); })
      .finally(() => setLoading(false));
  }, []);

  const active = sub?.status === "active" && !!sub?.current_period_end && new Date(sub.current_period_end).getTime() > Date.now();

  async function payCard() {
    setCardMsg(null);
    const res = await fetch("/api/payments/subscription", { method: "POST" });
    if (res.ok) {
      const { url } = await res.json();
      if (url) { window.location.href = url; return; }
    }
    // Gateway not wired yet → guide the pro to the SINPE flow.
    setCardMsg("El pago con tarjeta estará disponible pronto. Mientras tanto, puedes pagar por SINPE Móvil.");
    setShowSinpe(true);
  }

  if (loading) {
    return <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#009FD9]" /></div>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Current status */}
      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">Tu plan</p>
        {active ? (
          <p className="mt-1 text-sm text-[#111827]">
            <span className="font-semibold text-[#15803d]">Premium activo</span> · renueva el {fmtDate(sub?.current_period_end)}
            {sub?.billing_cycle ? ` · ${sub.billing_cycle === "annual" ? "anual" : "mensual"}` : ""}
          </p>
        ) : (
          <p className="mt-1 text-sm text-[#111827]"><span className="font-semibold">Plan gratis</span> · sin suscripción activa</p>
        )}
      </div>

      {/* Plan chooser */}
      <div>
        <p className="text-sm font-semibold text-[#111827] mb-2">Elige tu plan</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(["monthly", "annual"] as BillingCycle[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              className={`text-left rounded-2xl border-2 p-4 transition-colors ${cycle === c ? "border-[#009FD9] bg-[#EBF5FB]" : "border-[#e5e7eb] hover:border-[#009FD9]/40"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#111827]">{c === "monthly" ? "Mensual" : "Anual"}</span>
                {cycle === c && <Check className="h-4 w-4 text-[#009FD9]" />}
              </div>
              <p className="mt-1 text-lg font-bold text-[#111827]">{formatColones(PRICES[c])}<span className="text-xs font-medium text-[#6b7280]">{c === "monthly" ? "/mes" : "/año"}</span></p>
              {c === "annual" && <p className="text-[11px] font-medium text-[#15803d] mt-0.5">2 meses gratis</p>}
            </button>
          ))}
        </div>
      </div>

      {/* Payment methods */}
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={payCard}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#009FD9] text-white text-sm font-semibold py-3 hover:bg-[#0089bb] transition-colors"
        >
          <CreditCard className="h-4 w-4" /> Pagar con tarjeta ({formatColones(PRICES[cycle])})
        </button>
        {!gatewayReady && <p className="-mt-1 text-[11px] text-[#9ca3af]">El pago automático con tarjeta se habilitará pronto.</p>}
        {cardMsg && <p className="text-xs text-[#b45309]">{cardMsg}</p>}

        <button
          type="button"
          onClick={() => setShowSinpe((v) => !v)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#e5e7eb] text-[#374151] text-sm font-semibold py-3 hover:border-[#009FD9] hover:text-[#009FD9] transition-colors"
        >
          <Smartphone className="h-4 w-4" /> Pagar por SINPE Móvil
        </button>
        {showSinpe && (
          <div className="rounded-xl border border-[#bfdbfe] bg-[#EBF5FB] p-3.5 text-sm text-[#0f172a]">
            <p>Envía <strong>{formatColones(PRICES[cycle])}</strong> por SINPE Móvil al número <strong>{SINPE_PAYMENT.number}</strong> ({SINPE_PAYMENT.holder}).</p>
            <p className="mt-1 text-xs text-[#374151]">En el detalle incluye tu nombre. Un agente confirma el pago y activa tu plan (normalmente en pocas horas).</p>
          </div>
        )}
      </div>

      {/* Payment history */}
      {payments.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-[#111827] mb-2">Historial de pagos</p>
          <ul className="divide-y divide-[#f3f4f6] rounded-2xl border border-[#e5e7eb] overflow-hidden">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="text-[#374151]">{fmtDate(p.paid_at)} · {p.method.toUpperCase()}{p.billing_cycle ? ` · ${p.billing_cycle === "annual" ? "anual" : "mensual"}` : ""}</span>
                <span className="font-semibold text-[#111827]">{formatColones(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
