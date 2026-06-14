"use client";

import { useEffect, useState, useCallback } from "react";
import { CreditCard, Loader2, Check } from "lucide-react";

// Admin-only subscription management for ONE professional. Visible now (admin
// panel is admin-only) so the manual SINPE/transfer flow can be tested before the
// public feature is switched on. Spanish-only (admin panel is never translated).

type Subscription = {
  plan: string; status: string; billing_cycle: string | null;
  current_period_end: string | null; payment_method: string | null; price_paid: number | null;
} | null;
type Payment = {
  id: string; amount: number; method: string; status: string; billing_cycle: string | null;
  paid_at: string; reference: string | null; note: string | null;
};

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" }) : "—";
const colones = (n?: number | null) => (n == null ? "—" : `₡${n.toLocaleString("es-CR")}`);

export function AdminSubscription({ professionalId }: { professionalId: string }) {
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<Subscription>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/subscriptions?professionalId=${professionalId}`)
      .then((r) => r.json())
      .then((d) => { setSub(d.subscription ?? null); setPayments(d.payments ?? []); })
      .finally(() => setLoading(false));
  }, [professionalId]);

  useEffect(() => { load(); }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    await fetch("/api/admin/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ professionalId, action, ...extra }),
    });
    setBusy(false);
    setReference(""); setNote("");
    load();
  }

  const active = sub?.status === "active" && !!sub?.current_period_end && new Date(sub.current_period_end).getTime() > Date.now();

  return (
    <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#f3f4f6] flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-[#009FD9]" />
        <h2 className="text-sm font-semibold text-[#111827]">Suscripción</h2>
        {sub && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
            {active ? "Premium activo" : (sub.status ?? "—")}
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[#009FD9]" /></div>
      ) : (
        <div className="p-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-[#374151]">
            <p>Plan: <strong>{sub?.plan ?? "free"}</strong></p>
            <p>Estado: <strong>{sub?.status ?? "inactive"}</strong></p>
            <p>Ciclo: <strong>{sub?.billing_cycle ?? "—"}</strong></p>
            <p>Renueva/expira: <strong>{fmt(sub?.current_period_end)}</strong></p>
            <p>Método: <strong>{sub?.payment_method ?? "—"}</strong></p>
            <p>Último monto: <strong>{colones(sub?.price_paid)}</strong></p>
          </div>

          {/* Manual SINPE/transfer activation */}
          <div className="rounded-lg border border-[#e5e7eb] p-3 flex flex-col gap-2.5 bg-[#f9fafb]">
            <p className="text-xs font-semibold text-[#111827]">Registrar pago manual (SINPE / transferencia)</p>
            <div className="flex flex-wrap items-center gap-2">
              <select value={cycle} onChange={(e) => setCycle(e.target.value as "monthly" | "annual")} className="h-9 rounded-lg border border-[#e5e7eb] bg-white px-2 text-sm">
                <option value="monthly">Mensual · ₡3.000</option>
                <option value="annual">Anual · ₡30.000</option>
              </select>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Referencia SINPE" className="h-9 flex-1 min-w-[140px] rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm" />
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" className="h-9 rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm" />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => act("activate", { cycle, method: "sinpe", reference, note, extend: active })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f172a] text-white text-xs font-semibold px-3 py-2 hover:bg-[#1e293b] disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" /> {active ? "Extender suscripción" : "Marcar pago recibido y activar"}
              </button>
              {active && (
                <button type="button" disabled={busy} onClick={() => act("deactivate")} className="rounded-lg border border-[#e5e7eb] text-[#374151] text-xs font-semibold px-3 py-2 hover:border-red-300 hover:text-red-600 disabled:opacity-50">
                  Desactivar
                </button>
              )}
              {sub && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { if (confirm("¿Eliminar la suscripción y todo su historial de pagos? Esto deja al profesional sin ningún registro (acceso libre).")) act("reset"); }}
                  className="rounded-lg border border-[#e5e7eb] text-[#9ca3af] text-xs font-semibold px-3 py-2 hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                  title="Borra la fila de suscripción y su historial — útil para no dejar datos de prueba"
                >
                  Eliminar / reset
                </button>
              )}
            </div>
          </div>

          {/* Payment history */}
          <div>
            <p className="text-xs font-semibold text-[#111827] mb-1.5">Historial de pagos ({payments.length})</p>
            {payments.length === 0 ? (
              <p className="text-sm text-[#9ca3af]">Sin pagos registrados.</p>
            ) : (
              <ul className="divide-y divide-[#f3f4f6] border border-[#f3f4f6] rounded-lg">
                {payments.map((p) => (
                  <li key={p.id} className="px-3 py-2 text-sm flex items-center justify-between gap-3">
                    <span className="text-[#374151] min-w-0">
                      {fmt(p.paid_at)} · {p.method.toUpperCase()}{p.billing_cycle ? ` · ${p.billing_cycle}` : ""}
                      {p.reference ? <span className="text-[#9ca3af]"> · ref {p.reference}</span> : ""}
                    </span>
                    <span className="font-semibold text-[#111827] shrink-0">{colones(p.amount)}</span>
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
