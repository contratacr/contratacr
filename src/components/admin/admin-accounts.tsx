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
};

export function AdminAccounts() {
  const [items, setItems] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    fetch("/api/admin/accounts")
      .then((r) => r.json())
      .then(({ accounts }) => setItems(accounts ?? []))
      .finally(() => { if (!silent) setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);
  useAdminAutoRefresh(() => load(true), [load]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <UserX className="h-5 w-5 text-[#009FD9]" />
        <h1 className="text-xl font-bold text-[#111827]">Cuentas deshabilitadas</h1>
        {!loading && items.length > 0 && <span className="text-sm text-[#9ca3af]">({items.length})</span>}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-[#9ca3af]">
          <UserX className="h-10 w-10 mx-auto mb-2 text-[#cbd5e1]" />
          <p className="text-sm">No hay cuentas deshabilitadas.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border border-[#e5e7eb] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#111827] truncate">{a.full_name || a.email || a.id}</p>
                  <p className="text-xs text-[#9ca3af]">{a.email} · {a.role ?? "—"}</p>
                </div>
                <span className="text-xs text-[#9ca3af] shrink-0">{a.disabled_at ? new Date(a.disabled_at).toLocaleDateString("es-CR") : ""}</span>
              </div>
              {a.disabled_reason && (
                <p className="text-xs text-[#374151] mt-1.5 bg-[#f9fafb] rounded-lg px-2.5 py-1.5">Motivo: {a.disabled_reason}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
