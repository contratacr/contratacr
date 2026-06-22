"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared, on-brand REPORT modal (sprint 445) — same clean treatment as the cancel /
 * delete modals. Preset reason chips (a reason is REQUIRED so the report is meaningful,
 * but it's one tap = low friction) + an optional free-text details field. Used for both
 * "reportar cliente" (pro side) and "reportar profesional" (client side).
 */
export function ReportModal({
  title, body, reasons, detailsPlaceholder, backLabel, submitLabel, onClose, onSubmit,
}: {
  title: string;
  body: string;
  reasons: string[];
  detailsPlaceholder: string;
  backLabel: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!reason || submitting) return;
    setSubmitting(true);
    const composed = details.trim() ? `${reason} — ${details.trim()}` : reason;
    try {
      await onSubmit(composed);
    } finally {
      setSubmitting(false);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => !submitting && onClose()} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-base font-bold text-[#111827]">{title}</h2>
        <p className="mt-1 text-sm text-[#6b7280]">{body}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {reasons.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                reason === r
                  ? "border-[#009FD9] bg-[#EBF5FB] text-[#0089bb]"
                  : "border-[#e5e7eb] bg-white text-[#374151] hover:bg-[#f3f4f6]",
              )}
            >
              {r}
            </button>
          ))}
        </div>

        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={300}
          rows={2}
          placeholder={detailsPlaceholder}
          className="mt-3 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#111827] placeholder:text-[#9ca3af] break-words focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent resize-none"
        />

        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 rounded-full" onClick={onClose} disabled={submitting}>{backLabel}</Button>
          <Button size="sm" className="flex-1 rounded-full bg-red-600 hover:bg-red-700" onClick={submit} disabled={!reason || submitting} loading={submitting}>{submitLabel}</Button>
        </div>
      </div>
    </div>
  );
}
