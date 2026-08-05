"use client";

import { useEffect, useState } from "react";
import { Check, CreditCard, Loader2, ShieldCheck, Star } from "lucide-react";
import { PRICES, formatColones, type BillingCycle } from "@/lib/payments/config";

// Professional-facing subscription plans page. Rendered ONLY when PAYMENTS_ENABLED
// is on, or by an admin from /admin/suscripciones (preview). Planned launch:
// card-only automatic recurring billing, no SINPE/manual comprobantes.

type Subscription = {
  plan: "free" | "premium";
  status: string;
  billing_cycle: BillingCycle | null;
  current_period_end: string | null;
  payment_method: string | null;
} | null;

type Payment = {
  id: string;
  amount: number;
  method: string;
  status: string;
  billing_cycle: string | null;
  paid_at: string;
  reference: string | null;
};

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric" }) : "";

const BENEFITS = [
  "Tu perfil aparece en las búsquedas y los clientes pueden encontrarte",
  "Recibe solicitudes de servicio de tus clientes",
  "Revisa proyectos de clientes y envía propuestas",
  "Mantén tu perfil profesional activo para seguir recibiendo clientes",
];

export function SubscriptionPanel() {
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<Subscription>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [gatewayReady, setGatewayReady] = useState(false);
  const [cycle, setCycle] = useState<BillingCycle>("annual");
  const [cardMsg, setCardMsg] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const reload = () =>
    fetch("/api/payments/subscription")
      .then((r) => r.json())
      .then((d) => {
        setSub(d.subscription ?? null);
        setPayments(d.payments ?? []);
        setGatewayReady(!!d.gatewayReady);
      });

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const active =
    sub?.status === "active" &&
    !!sub?.current_period_end &&
    new Date(sub.current_period_end).getTime() > now;

  async function payCard() {
    setCardMsg(null);
    const res = await fetch("/api/payments/subscription", { method: "POST" });
    if (res.ok) {
      const { url } = await res.json();
      if (url) {
        window.location.href = url;
        return;
      }
    }
    setCardMsg("El pago automático con tarjeta estará disponible cuando activemos las suscripciones.");
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#009FD9]" /></div>;
  }

  if (active) {
    return (
      <div className="flex flex-col gap-5">
        <div className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-5">
          <div className="flex items-center gap-2 text-[#15803d]">
            <ShieldCheck className="h-5 w-5" />
            <p className="font-bold">Plan profesional activo</p>
          </div>
          <p className="mt-1 text-sm text-[#166534]">
            Renueva el {fmtDate(sub?.current_period_end)}
            {sub?.billing_cycle ? ` · plan ${sub.billing_cycle === "annual" ? "anual" : "mensual"}` : ""}.
          </p>
        </div>
        <PaymentHistory payments={payments} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-lg font-bold text-[#111827]">Mantén tu perfil profesional activo</h3>
        <p className="mt-0.5 text-sm text-[#6b7280]">La suscripción mantiene tu perfil activo para aparecer en las búsquedas y recibir clientes.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["annual", "monthly"] as BillingCycle[]).map((c) => {
          const selected = cycle === c;
          const annual = c === "annual";
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              className={`relative rounded-2xl border-2 p-4 text-left transition-all ${selected ? "border-[#009FD9] bg-[#EBF5FB] shadow-sm" : "border-[#e5e7eb] hover:border-[#009FD9]/40"}`}
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
              <p className="mt-0.5 text-[11px] text-[#6b7280]">
                {annual ? `Pagas 10 meses y ahorras 2` : "Facturación mensual"}
              </p>
            </button>
          );
        })}
      </div>

      <ul className="flex flex-col gap-2">
        {BENEFITS.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm text-[#374151]">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#15803d]" /> {b}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-[#111827]">Pago automático</p>
        <button
          type="button"
          onClick={payCard}
          className="flex items-center justify-between gap-3 rounded-xl bg-[#009FD9] px-4 py-3.5 text-white transition-colors hover:bg-[#0089bb]"
        >
          <span className="flex items-center gap-2 text-sm font-semibold"><CreditCard className="h-5 w-5" /> Pagar con tarjeta</span>
          <span className="text-xs opacity-90">{formatColones(PRICES[cycle])}{cycle === "annual" ? "/año" : "/mes"}</span>
        </button>
        {!gatewayReady && <p className="-mt-1 text-[11px] text-[#9ca3af]">Cobro automático y recurrente. Disponible cuando se conecte la pasarela de pago.</p>}
        {cardMsg && <p className="text-xs text-[#b45309]">{cardMsg}</p>}
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
      <p className="mb-2 text-sm font-semibold text-[#111827]">Historial de pagos</p>
      <ul className="divide-y divide-[#f3f4f6] rounded-xl border border-[#e5e7eb]">
        {real.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="min-w-0 text-[#374151]">
              {fmtDate(p.paid_at)} · {p.method === "card" ? "Tarjeta" : "Cortesia"}{p.billing_cycle ? ` · ${p.billing_cycle === "annual" ? "anual" : "mensual"}` : ""}
            </span>
            <span className="shrink-0 font-semibold text-[#111827]">{formatColones(p.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
