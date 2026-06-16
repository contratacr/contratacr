"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X, Flag, AlertCircle, ShieldAlert } from "lucide-react";
import { SuccessIcon } from "@/components/ui/success-icon";
import { createClient } from "@/lib/supabase/client";

interface ReportProfileModalProps {
  professionalName: string;
  professionalSlug: string;
  onClose: () => void;
}

// "Suplantación de identidad" is the real-world protection layer against an
// impostor who entered a real cédula+name (the padrón cannot prove physical
// identity). It routes to a HIGH-PRIORITY admin moderation ticket (item 10a).
// `reason` state holds the KEY; `es` is the canonical Spanish sent to the API so
// the (Spanish-only) admin record stays consistent regardless of UI locale.
const IMPERSONATION = "impersonation";
const REASON_DEFS: { key: string; es: string }[] = [
  { key: "impersonation", es: "Suplantación de identidad (se hace pasar por otra persona)" },
  { key: "falseInfo", es: "Información falsa o engañosa" },
  { key: "scam", es: "Estafa o fraude" },
  { key: "inappropriate", es: "Contenido inapropiado" },
  { key: "notReal", es: "No es un profesional real" },
  { key: "other", es: "Otro" },
];

export function ReportProfileModal({ professionalName, professionalSlug, onClose }: ReportProfileModalProps) {
  const t = useTranslations("report");
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  async function handleSubmit() {
    if (!reason) { setError(t("errNoReason")); return; }
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // Send the canonical Spanish reason to the admin record (locale-independent).
      const reasonEs = REASON_DEFS.find((r) => r.key === reason)?.es ?? reason;
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalName,
          professionalSlug,
          reason: `${reasonEs}${detail.trim() ? ` — ${detail.trim()}` : ""}`,
          reporterEmail: user?.email ?? null,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? t("errSend"));
        return;
      }
      setSent(true);
    } catch {
      setError(t("errConnection"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div
        className="relative w-full max-w-[440px] rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#f3f4f6]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50">
              <Flag className="h-4 w-4 text-red-500" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#111827]">{t("title")}</h2>
              <p className="text-xs text-[#6b7280]">{professionalName}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#374151] transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <SuccessIcon size={56} />
            <p className="text-lg font-semibold text-[#111827]">{t("sentTitle")}</p>
            <p className="text-sm text-[#6b7280]">
              {t("sentBody")}
            </p>
            <button
              onClick={onClose}
              className="mt-2 rounded-xl bg-[#009FD9] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0089bb] transition-colors"
            >
              {t("ok")}
            </button>
          </div>
        ) : (
          <div className="px-6 py-5 flex flex-col gap-4">
            <div className="flex items-start gap-2 rounded-xl bg-[#f4f7fa] border border-[#e5e7eb] px-3.5 py-3">
              <ShieldAlert className="h-4 w-4 text-[#009FD9] shrink-0 mt-0.5" />
              <p className="text-xs text-[#6b7280]">
                {t("confidential")}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-[#374151] mb-2">{t("reasonLabel")}</p>
              <div className="flex flex-col gap-1.5">
                {REASON_DEFS.map((r) => (
                  <label key={r.key} className="flex items-center gap-2.5 cursor-pointer text-sm text-[#374151]">
                    <input
                      type="radio"
                      name="report-reason"
                      checked={reason === r.key}
                      onChange={() => { setReason(r.key); setError(null); }}
                      className="accent-[#009FD9] h-4 w-4"
                    />
                    {t(`reasons.${r.key}` as Parameters<typeof t>[0])}
                  </label>
                ))}
              </div>
            </div>

            {reason === IMPERSONATION && (
              <div className="flex items-start gap-2 rounded-xl bg-[#fffbeb] border border-[#fde68a] px-3.5 py-3 text-xs text-[#92400e]">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  {t.rich("impersonationWarning", { b: (c) => <strong>{c}</strong> })}
                </span>
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-[#374151] block mb-1.5">
                {t("detail")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
              </label>
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={t("detailPlaceholder")}
                className="w-full resize-none rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:border-[#009FD9] focus:outline-none focus:ring-2 focus:ring-[#009FD9]/20 transition"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-xl bg-red-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-60"
            >
              {submitting ? t("sending") : t("submit")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
