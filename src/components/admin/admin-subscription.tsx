"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CreditCard, Gift, Loader2 } from "lucide-react";
import { LAUNCH_BENEFITS, PRICES, formatColones } from "@/lib/payments/config";

// Admin-only subscription management for one professional. Public launch is
// planned as card-only automatic billing; admin manual actions are limited to
// promotional founder/collaborator grants and operational status changes.

type Subscription = {
  plan: string;
  status: string;
  billing_cycle: string | null;
  current_period_end: string | null;
  payment_method: string | null;
  price_paid: number | null;
} | null;

type Payment = {
  id: string;
  amount: number;
  method: string;
  status: string;
  billing_cycle: string | null;
  paid_at: string;
  reference: string | null;
  note: string | null;
};

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" }) : "-";
const colones = (n?: number | null) => (n == null ? "-" : formatColones(n));

export function AdminSubscription({ professionalId }: { professionalId: string }) {
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<Subscription>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/subscriptions?professionalId=${professionalId}`)
      .then((r) => r.json())
      .then((d) => {
        setSub(d.subscription ?? null);
        setPayments(d.payments ?? []);
        setNow(Date.now());
      })
      .finally(() => setLoading(false));
  }, [professionalId]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    await fetch("/api/admin/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ professionalId, action, ...extra }),
    });
    setBusy(false);
    load();
  }

  const active =
    sub?.status === "active" &&
    !!sub?.current_period_end &&
    new Date(sub.current_period_end).getTime() > now;

  return (
    <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
      <div className="flex items-center gap-2 border-b border-[#f3f4f6] px-4 py-3">
        <CreditCard className="h-4 w-4 text-[#009FD9]" />
        <h2 className="text-sm font-semibold text-[#111827]">Suscripción</h2>
        {sub && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
            {active ? "Premium activo" : (sub.status ?? "-")}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#009FD9]" /></div>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-[#374151]">
            <p>Plan: <strong>{sub?.plan ?? "free"}</strong></p>
            <p>Estado: <strong>{sub?.status ?? "inactive"}</strong></p>
            <p>Ciclo: <strong>{sub?.billing_cycle ?? "-"}</strong></p>
            <p>Renueva/expira: <strong>{fmt(sub?.current_period_end)}</strong></p>
            <p>Método: <strong>{sub?.payment_method ?? "-"}</strong></p>
            <p>Ultimo monto: <strong>{colones(sub?.price_paid)}</strong></p>
          </div>

          <div className="flex flex-col gap-2.5 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-3">
            <div>
              <p className="text-xs font-semibold text-[#111827]">Beneficios de lanzamiento</p>
              <p className="mt-0.5 text-xs text-[#6b7280]">
                Plan futuro: tarjeta automática. Precios: {formatColones(PRICES.monthly)}/mes o {formatColones(PRICES.annual)}/año.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => act("grant", { months: LAUNCH_BENEFITS.existingUsersFreeMonths, note: "Beneficio fundador: 2 meses gratis", extend: true })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f172a] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1e293b] disabled:opacity-50"
              >
                <Gift className="h-3.5 w-3.5" /> Dar 2 meses fundador
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => act("grant", { months: LAUNCH_BENEFITS.earlyCollaboratorsFreeMonths, note: "Colaborador inicial: 1 año gratis", extend: true })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#009FD9] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0089bb] disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" /> Dar 1 ano colaborador
              </button>
              {active && (
                <button type="button" disabled={busy} onClick={() => act("deactivate")} className="rounded-lg border border-[#e5e7eb] px-3 py-2 text-xs font-semibold text-[#374151] hover:border-red-300 hover:text-red-600 disabled:opacity-50">
                  Desactivar
                </button>
              )}
              {sub && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { if (confirm("¿Eliminar la suscripción y todo su historial de pagos? Esto deja al profesional sin registro de suscripción.")) act("reset"); }}
                  className="rounded-lg border border-[#e5e7eb] px-3 py-2 text-xs font-semibold text-[#9ca3af] hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                >
                  Eliminar / reset
                </button>
              )}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-[#111827]">Historial ({payments.length})</p>
            {payments.length === 0 ? (
              <p className="text-sm text-[#9ca3af]">Sin pagos registrados.</p>
            ) : (
              <ul className="divide-y divide-[#f3f4f6] rounded-lg border border-[#f3f4f6]">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 text-[#374151]">
                      {fmt(p.paid_at)} · {p.method === "card" ? "Tarjeta" : "Cortesía"}{p.billing_cycle ? ` · ${p.billing_cycle}` : ""}
                      {p.reference ? <span className="text-[#9ca3af]"> · {p.reference}</span> : null}
                    </span>
                    <span className="shrink-0 font-semibold text-[#111827]">{colones(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
