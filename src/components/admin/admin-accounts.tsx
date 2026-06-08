"use client";

import { useEffect, useState } from "react";
import { UserX } from "lucide-react";

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

  useEffect(() => {
    fetch("/api/admin/accounts")
      .then((r) => r.json())
      .then(({ accounts }) => setItems(accounts ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><div className="h-7 w-7 animate-spin rounded-full border-2 border-[#0f172a] border-t-transparent" /></div>;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-[#9ca3af]">
        <UserX className="h-10 w-10 mx-auto mb-2 text-[#cbd5e1]" />
        <p className="text-sm">No hay cuentas deshabilitadas.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-[#374151] mb-1">Cuentas deshabilitadas ({items.length})</p>
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
  );
}
