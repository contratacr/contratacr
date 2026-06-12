"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// "Cerrar cuenta / Deshabilitar cuenta" — soft-disable with a required reason.
// Recoverable (the user can reactivate by logging back in). The reason is stored
// and surfaced to admins.
export function CloseAccountSection({ initialDisabled = false }: { initialDisabled?: boolean }) {
  const t = useTranslations("closeAccount");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(initialDisabled);

  // Load the real disabled state (so a previously-disabled user sees "Reactivar").
  useEffect(() => {
    fetch("/api/account/disable").then((r) => r.json()).then((j) => setDisabled(!!j.disabled)).catch(() => {});
  }, []);

  async function disableAccount() {
    if (!reason.trim()) { setError(t("reasonRequired")); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disable", reason: reason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? t("processError")); return; }
      // Sign out — the account is now hidden; logging back in reactivates options.
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.assign("/es");
    } catch {
      setError(t("connError"));
    } finally {
      setBusy(false);
    }
  }

  async function reactivate() {
    setBusy(true);
    try {
      await fetch("/api/account/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reactivate" }),
      });
      setDisabled(false);
    } finally { setBusy(false); }
  }

  if (disabled) {
    return (
      <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] p-4">
        <p className="text-sm font-semibold text-[#92400e]">{t("disabledTitle")}</p>
        <p className="text-xs text-[#92400e] mt-0.5">{t("disabledBody")}</p>
        <button onClick={reactivate} disabled={busy} className="mt-3 rounded-lg bg-[#009FD9] text-white text-sm font-semibold px-4 py-2 hover:bg-[#0089bb] disabled:opacity-60">
          {busy ? t("reactivating") : t("reactivate")}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-[#b91c1c] shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#b91c1c]">{t("closeTitle")}</p>
          <p className="text-xs text-[#7f1d1d] mt-0.5">{t("closeBody")}</p>
          {!open ? (
            <button onClick={() => setOpen(true)} className="mt-3 rounded-lg border border-[#b91c1c] text-[#b91c1c] text-sm font-semibold px-4 py-2 hover:bg-red-50">
              {t("closeCta")}
            </button>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              <label className="text-sm font-medium text-[#374151]">{t("reason")} <span className="text-red-500">*</span></label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder={t("reasonPlaceholder")}
                className="w-full rounded-lg border border-[#e5e7eb] p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9]/30"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button onClick={disableAccount} disabled={busy} className="rounded-lg bg-[#b91c1c] text-white text-sm font-semibold px-4 py-2 hover:bg-[#991b1b] disabled:opacity-60">
                  {busy ? t("closing") : t("confirmClose")}
                </button>
                <button onClick={() => { setOpen(false); setError(null); }} className="rounded-lg text-sm text-[#6b7280] px-3 py-2 hover:text-[#374151]">{t("cancel")}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
