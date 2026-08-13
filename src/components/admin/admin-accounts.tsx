"use client";

import { useCallback, useEffect, useState } from "react";
import { UserX, Loader2 } from "lucide-react";
import { useAdminAutoRefresh } from "@/hooks/use-admin-auto-refresh";

type Account = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
  disabled_reason?: string | null;
  disabled_at?: string | null;
  deletion?: {
    id: string;
    status: "pending" | "processing" | "failed";
    attempts: number;
    last_error?: string | null;
  } | null;
};

export function AdminAccounts() {
  const [items, setItems] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    fetch("/api/admin/accounts")
      .then((response) => response.json())
      .then(({ accounts }) => setItems(accounts ?? []))
      .finally(() => { if (!silent) setLoading(false); });
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  useAdminAutoRefresh(() => load(true), [load]);

  async function retry(requestId: string) {
    setRetrying(requestId);
    await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId }),
    }).catch(() => null);
    await load(true);
    setRetrying(null);
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        <UserX className="h-5 w-5 text-[#009FD9]" />
        <h1 className="text-xl font-bold text-[#111827]">Cuentas deshabilitadas</h1>
        {!loading && items.length > 0 && <span className="text-sm text-[#9ca3af]">({items.length})</span>}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" /></div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-[#9ca3af]">
          <UserX className="mx-auto mb-2 h-10 w-10 text-[#cbd5e1]" />
          <p className="text-sm">No hay cuentas deshabilitadas.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((account) => (
            <div key={account.id} className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#111827]">{account.full_name || account.email || account.id}</p>
                  <p className="text-xs text-[#9ca3af]">{account.email} · {account.role ?? "—"}</p>
                </div>
                <span className="shrink-0 text-xs text-[#9ca3af]">{account.disabled_at ? new Date(account.disabled_at).toLocaleDateString("es-CR") : ""}</span>
              </div>
              {account.disabled_reason && (
                <p className="mt-1.5 rounded-lg bg-[#f9fafb] px-2.5 py-1.5 text-xs text-[#374151]">Motivo: {account.disabled_reason}</p>
              )}
              {account.deletion && (
                <div className="mt-2 rounded-lg border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-xs text-[#9a3412]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold">
                      Eliminación: {account.deletion.status === "failed" ? "requiere atención" : account.deletion.status === "processing" ? "procesando" : "pendiente"}
                    </span>
                    <button
                      type="button"
                      disabled={retrying === account.deletion.id}
                      onClick={() => retry(account.deletion!.id)}
                      className="rounded-md border border-[#fdba74] bg-white px-2.5 py-1 font-bold disabled:opacity-60"
                    >
                      {retrying === account.deletion.id ? "Reintentando…" : "Reintentar"}
                    </button>
                  </div>
                  {account.deletion.last_error && <p className="mt-1 break-words text-[#b45309]">Último error: {account.deletion.last_error}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
