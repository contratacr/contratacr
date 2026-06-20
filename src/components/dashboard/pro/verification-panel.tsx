"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck, Clock, XCircle, AlertCircle, CheckCircle2, Send, RefreshCw } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Link } from "@/i18n/navigation";
import { SUPPORT_WHATSAPP_NUMBER } from "@/lib/constants";
import { caseRef, type VerificationStatus } from "@/lib/verification";

interface Props {
  professionalId: string;
  status: VerificationStatus;
  reason?: string | null;
  /** No-CR-identification case (manual review; no padrón to check against). */
  noCrId?: boolean;
  onSaved?: () => void;
}

export function VerificationPanel({ professionalId, status, reason, noCrId = false, onSaved }: Props) {
  const t = useTranslations("verificationPanel");
  const rich = { strong: (c: React.ReactNode) => <strong>{c}</strong> };
  const [appeal, setAppeal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Add-cédula-later (no-ID pros who obtained a CR cédula).
  const [newCedula, setNewCedula] = useState("");
  const [cedulaBusy, setCedulaBusy] = useState(false);

  const ref = caseRef(professionalId);
  const waMsg = encodeURIComponent(t("waHelp", { ref }));
  const waUrl = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${waMsg}`;

  // Re-run automatic verification against the padrón (also used by the appeal).
  async function runCheck(appealMode: boolean) {
    setError(null);
    setNote(null);
    if (appealMode && appeal.trim().length < 10) {
      setError(t("appealMinError"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(appealMode ? "/api/appeals" : "/api/verify-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: appealMode ? JSON.stringify({ message: appeal.trim() }) : undefined,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      if (json.outcome === "verified") setNote(t("noteVerified"));
      else if (json.outcome === "ticket") setNote(t("noteTicket"));
      else setNote(t("noteReview"));
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("processError"));
    } finally {
      setBusy(false);
    }
  }

  async function addCedula() {
    setError(null);
    setNote(null);
    setCedulaBusy(true);
    try {
      const res = await fetch("/api/add-cedula", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula: newCedula }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      if (json.outcome === "verified") setNote(t("cedulaVerified"));
      else setNote(t("cedulaSaved"));
      setNewCedula("");
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("processError"));
    } finally {
      setCedulaBusy(false);
    }
  }

  // ── No-CR-identification flow (manual review; no padrón check) ──────────────
  if (noCrId && status !== "verified") {
    return (
      <div className="space-y-5">
        {status === "rejected" ? (
          <Banner tone="red" icon={<XCircle className="h-5 w-5" />} title={t("rejectedTitle")}>
            {reason ? <span className="block">{t("reason", { reason })}</span> : t("noReason")}
            <span className="block mt-1">{t("rejectedNoCrBody")}</span>
          </Banner>
        ) : status === "under_appeal" ? (
          <Banner tone="amber" icon={<Clock className="h-5 w-5" />} title={t("underAppealTitle")}>
            {t("underAppealNoCrBody")}
          </Banner>
        ) : (
          <Banner tone="amber" icon={<AlertCircle className="h-5 w-5" />} title={t("unverifiedTitle")}>
            {t.rich("noCrUnverifiedBody", rich)}
          </Banner>
        )}

        {note && <Banner tone="green" icon={<CheckCircle2 className="h-5 w-5" />} title={t("resultTitle")}>{note}</Banner>}
        {error && (
          <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
          </div>
        )}

        {/* WhatsApp follow-up to track the case */}
        <a href={waUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#1eb456] text-white text-sm font-bold px-4 py-2.5">
          <WhatsAppIcon className="h-4 w-4" /> {t("waFollowUp", { ref })}
        </a>

        {/* Appeal → straight to support (no padrón re-run for no-ID cases) */}
        {status !== "under_appeal" && (
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
            <h3 className="font-semibold text-[#111827] text-sm mb-1">{t("manualReviewTitle")}</h3>
            <p className="text-xs text-[#6b7280] mb-3">{t("manualReviewBody")}</p>
            <textarea
              value={appeal}
              onChange={(e) => setAppeal(e.target.value)}
              rows={3}
              placeholder={t("manualReviewPlaceholder")}
              className="w-full rounded-lg border border-[#e5e7eb] p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
            />
            <button onClick={() => runCheck(true)} disabled={busy} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold px-4 py-2.5 disabled:opacity-60">
              <Send className="h-4 w-4" /> {busy ? t("sending") : t("sendToReview")}
            </button>
          </div>
        )}

        {/* Add-cédula-later — runs the normal padrón verification automatically */}
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
          <h3 className="font-semibold text-[#111827] text-sm mb-1">{t("hasCedulaTitle")}</h3>
          <p className="text-xs text-[#6b7280] mb-3">{t("hasCedulaBody")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newCedula}
              onChange={(e) => setNewCedula(e.target.value)}
              placeholder={t("cedulaPlaceholder")}
              className="flex-1 min-w-[200px] h-10 px-3 rounded-lg border border-[#e5e7eb] text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
            />
            <button onClick={addCedula} disabled={cedulaBusy || newCedula.replace(/\D/g, "").length < 9} className="inline-flex items-center gap-2 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold px-4 py-2.5 disabled:opacity-50">
              <ShieldCheck className="h-4 w-4" /> {cedulaBusy ? t("verifying") : t("addAndVerify")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Status banner */}
      {status === "verified" && (
        <Banner tone="green" icon={<ShieldCheck className="h-5 w-5" />} title={t("verifiedTitle")}>
          {t.rich("verifiedBody", rich)}
        </Banner>
      )}
      {status === "pending" && (
        <Banner tone="amber" icon={<AlertCircle className="h-5 w-5" />} title={t("unverifiedTitle")}>
          {t.rich("pendingBody", rich)}
        </Banner>
      )}
      {status === "under_appeal" && (
        <Banner tone="amber" icon={<Clock className="h-5 w-5" />} title={t("underAppealTitle")}>
          {t("underAppealBody")}
        </Banner>
      )}
      {status === "rejected" && (
        <Banner tone="red" icon={<XCircle className="h-5 w-5" />} title={t("rejectedTitle")}>
          {reason ? <span className="block">{t("reason", { reason })}</span> : t("noReason")}
          <span className="block mt-1">{t("rejectedBody")}</span>
        </Banner>
      )}

      {note && (
        <Banner tone="green" icon={<CheckCircle2 className="h-5 w-5" />} title={t("resultTitle")}>{note}</Banner>
      )}
      {error && (
        <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      )}

      <p className="text-sm text-[#6b7280]">
        {t.rich("howItWorks", { link: (c) => <Link href="/proveedores-autorizados" className="text-[#009FD9] font-medium hover:underline">{c}</Link> })}
      </p>

      {/* Pending → re-run automatic check */}
      {status === "pending" && (
        <button
          onClick={() => runCheck(false)}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold px-4 py-2.5 disabled:opacity-60"
        >
          <RefreshCw className="h-4 w-4" /> {busy ? t("verifying") : t("verifyNow")}
        </button>
      )}

      {/* Rejected → appeal (re-runs automatically; if it still fails → support ticket) */}
      {status === "rejected" && (
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
          <h3 className="font-semibold text-[#111827] text-sm mb-1">{t("appealTitle")}</h3>
          <p className="text-xs text-[#6b7280] mb-3">
            {t("appealBody")}
          </p>
          <textarea
            value={appeal}
            onChange={(e) => setAppeal(e.target.value)}
            rows={4}
            placeholder={t("appealPlaceholder")}
            className="w-full rounded-lg border border-[#e5e7eb] p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
          />
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={() => runCheck(true)}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold px-4 py-2.5 disabled:opacity-60"
            >
              <Send className="h-4 w-4" /> {busy ? t("sending") : t("appealReverify")}
            </button>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#1eb456] text-white text-sm font-bold px-4 py-2.5"
            >
              <WhatsAppIcon className="h-4 w-4" /> {t("supportWhatsapp")}
            </a>
          </div>
        </div>
      )}

      {status === "under_appeal" && (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#1eb456] text-white text-sm font-bold px-4 py-2.5"
        >
          <WhatsAppIcon className="h-4 w-4" /> {t("supportWhatsappCase", { ref })}
        </a>
      )}

      {/* Enter (or replace) a cédula to verify — for ANY non-verified pro: a REVOKED
          account re-entering its cédula, a "sin cédula" account adding one later, or a
          pending/rejected pro correcting it. Calls /api/add-cedula → stores it + runs the
          padrón check: a valid NATIONAL cédula verifies instantly and overwrites the name
          from the padrón (profiles + Auth, in run-verification); DIMEX/NITE or not-found
          stays unverified; an invalid format errors out (no change). */}
      {status !== "verified" && (
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
          <h3 className="font-semibold text-[#111827] text-sm mb-1">{t("enterCedulaTitle")}</h3>
          <p className="text-xs text-[#6b7280] mb-3">{t("enterCedulaBody")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newCedula}
              onChange={(e) => setNewCedula(e.target.value)}
              inputMode="numeric"
              placeholder={t("cedulaPlaceholder")}
              className="flex-1 min-w-[200px] h-10 px-3 rounded-lg border border-[#e5e7eb] text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
            />
            <button
              onClick={addCedula}
              disabled={cedulaBusy || newCedula.replace(/\D/g, "").length < 9}
              className="inline-flex items-center gap-2 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold px-4 py-2.5 disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" /> {cedulaBusy ? t("verifying") : t("addAndVerify")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Banner({
  tone,
  icon,
  title,
  children,
}: {
  tone: "green" | "gray" | "amber" | "red";
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    green: "bg-[#f0fdf4] border-[#bbf7d0] text-[#15803d]",
    gray: "bg-[#f9fafb] border-[#e5e7eb] text-[#374151]",
    amber: "bg-[#fffbeb] border-[#fde68a] text-[#92400e]",
    red: "bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]",
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 font-semibold">
        {icon} {title}
      </div>
      <div className="text-sm mt-1.5 leading-relaxed">{children}</div>
    </div>
  );
}
