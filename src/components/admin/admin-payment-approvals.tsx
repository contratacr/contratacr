"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Check, X, FileText, ExternalLink, Inbox } from "lucide-react";
import { useAdminAutoRefresh } from "@/hooks/use-admin-auto-refresh";
import { useAppDialog } from "@/hooks/use-app-dialog";

// Admin queue of SINPE/transfer payments submitted with a comprobante, awaiting
// review. Approve → activates the pro's paid period automatically (status active +
// expiry). Reject → kept in history with a reason. Admin-only (admin panel).

type Pending = {
  id: string; amount: number; billing_cycle: string | null; reference: string | null;
  receipt_url: string | null; paid_at: string; method: string;
  professional: { id: string; slug: string | null; fullName: string | null; email: string | null } | null;
};

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("es-CR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const colones = (n: number) => `₡${n.toLocaleString("es-CR")}`;

export function AdminPaymentApprovals() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Pending[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { dialogNode, confirm } = useAppDialog();

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    fetch("/api/admin/subscriptions?pending=1")
      .then((r) => r.json())
      .then((d) => setItems(d.pending ?? []))
      .finally(() => { if (!silent) setLoading(false); });
  }, []);

  useEffect(() => { queueMicrotask(() => load()); }, [load]);
  useAdminAutoRefresh(() => {
    if (busyId) return;
    load(true);
  }, [busyId, load]);

  async function review(paymentId: string, action: "approve" | "reject") {
    let note: string | undefined;
    if (action === "reject") {
      const result = await confirm({
        title: "Rechazar pago",
        description: "El profesional no recibirá el plan con este pago.",
        detail: "El motivo queda guardado en el historial para revisión interna.",
        confirmLabel: "Rechazar pago",
        cancelLabel: "Cancelar",
        tone: "danger",
        input: { label: "Motivo del rechazo", placeholder: "Ejemplo: comprobante ilegible, monto incorrecto..." },
      });
      if (!result.confirmed) return;
      note = result.value || undefined;
    }
    setBusyId(paymentId);
    await fetch("/api/admin/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, action, note }),
    });
    setBusyId(null);
    load();
  }

  return (
    <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#f3f4f6] flex items-center gap-2">
        <Inbox className="h-4 w-4 text-[#009FD9]" />
        <h2 className="text-sm font-semibold text-[#111827]">Pagos por revisar (SINPE / transferencia)</h2>
        {items.length > 0 && <span className="text-xs font-semibold text-white bg-[#009FD9] rounded-full px-2 py-0.5">{items.length}</span>}
      </div>

      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[#009FD9]" /></div>
      ) : items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[#9ca3af]">No hay pagos pendientes de revisión.</p>
      ) : (
        <ul className="divide-y divide-[#f3f4f6]">
          {items.map((p) => (
            <li key={p.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#111827] truncate">
                  {p.professional?.fullName ?? "Profesional"} · {colones(p.amount)} <span className="text-[#6b7280] font-normal">({p.billing_cycle === "annual" ? "anual" : "mensual"})</span>
                </p>
                <p className="text-xs text-[#9ca3af]">
                  {fmt(p.paid_at)}{p.reference ? ` · ref ${p.reference}` : ""}{p.professional?.email ? ` · ${p.professional.email}` : ""}
                </p>
                {p.receipt_url ? (
                  <a href={p.receipt_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#009FD9] hover:underline">
                    <FileText className="h-3.5 w-3.5" /> Ver comprobante <ExternalLink className="h-3 w-3" />
                  </a>
                ) : <span className="text-xs text-[#b45309]">Sin comprobante</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => review(p.id, "approve")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#16a34a] text-white text-xs font-semibold px-3 py-2 hover:bg-[#15803d] disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> Aprobar y activar
                </button>
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => review(p.id, "reject")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] text-[#374151] text-xs font-semibold px-3 py-2 hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Rechazar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {dialogNode}
    </div>
  );
}
