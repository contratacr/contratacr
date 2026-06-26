"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Clock3, Info, Send, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

export function VerificationPanel({
  professionalId,
  status,
  reason,
  noCrId = false,
  onSaved,
}: Props) {
  const t = useTranslations("verificationPanel");
  const rich = { strong: (c: React.ReactNode) => <strong>{c}</strong> };
  const [appeal, setAppeal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Add-cédula-later (no-ID pros who obtained a CR cédula).
  const [newCedula, setNewCedula] = useState("");
  const [cedulaBusy, setCedulaBusy] = useState(false);
  const [cedulaError, setCedulaError] = useState<string | null>(null);

  const ref = caseRef(professionalId);
  const waMsg = encodeURIComponent(t("waHelp", { ref }));
  const waUrl = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${waMsg}`;
  const summaryTone =
    status === "verified"
      ? "verified"
      : status === "under_appeal"
        ? "review"
        : status === "rejected"
          ? "rejected"
          : "pending";

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
      const res = await fetch(
        appealMode ? "/api/appeals" : "/api/verify-identity",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: appealMode
            ? JSON.stringify({ message: appeal.trim() })
            : undefined,
        },
      );
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
    setCedulaError(null);
    setNote(null);
    setCedulaBusy(true);
    try {
      const res = await fetch("/api/add-cedula", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula: newCedula }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCedulaError(json.error ?? t("processError"));
        return;
      }
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
        <VerificationSummary
          title={
            status === "rejected"
              ? t("rejectedTitle")
              : status === "under_appeal"
                ? t("underAppealTitle")
                : t("unverifiedTitle")
          }
          tone={summaryTone}
        >
          {status === "rejected" ? (
            <>
              {reason ? (
                <span className="block">{t("reason", { reason })}</span>
              ) : (
                t("noReason")
              )}
              <span className="block mt-1">{t("rejectedNoCrBody")}</span>
            </>
          ) : status === "under_appeal" ? (
            t("underAppealNoCrBody")
          ) : (
            t.rich("noCrUnverifiedBody", rich)
          )}
        </VerificationSummary>

        {note && (
          <Notice tone="info" title={t("resultTitle")}>
            {note}
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}

        {/* WhatsApp follow-up to track the case */}
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1eb456] text-white text-sm font-bold px-5 py-2.5"
        >
          <WhatsAppIcon className="h-4 w-4 shrink-0" />{" "}
          {t("waFollowUp", { ref })}
        </a>

        {/* Appeal → straight to support (no padrón re-run for no-ID cases) */}
        {status !== "under_appeal" && (
          <ActionPanel
            title={t("manualReviewTitle")}
            body={t("manualReviewBody")}
          >
            <textarea
              value={appeal}
              onChange={(e) => setAppeal(e.target.value)}
              rows={3}
              placeholder={t("manualReviewPlaceholder")}
              className="w-full rounded-xl border border-[#e5e7eb] p-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
            />
            <button
              onClick={() => runCheck(true)}
              disabled={busy}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold px-5 py-2.5 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />{" "}
              {busy ? t("sending") : t("sendToReview")}
            </button>
          </ActionPanel>
        )}

        {/* Add-cédula-later — runs the normal padrón verification automatically */}
        <ActionPanel title={t("hasCedulaTitle")} body={t("hasCedulaBody")}>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newCedula}
              onChange={(e) => {
                setNewCedula(e.target.value);
                setCedulaError(null);
              }}
              placeholder={t("cedulaPlaceholder")}
              aria-invalid={!!cedulaError}
              className="flex-1 min-w-[200px] h-11 px-4 rounded-xl border border-[#e5e7eb] text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all aria-[invalid=true]:border-red-300 aria-[invalid=true]:focus:ring-red-200"
            />
            <button
              onClick={addCedula}
              disabled={cedulaBusy || newCedula.replace(/\D/g, "").length < 9}
              className="inline-flex items-center gap-2 rounded-full bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold px-5 py-2.5 disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />{" "}
              {cedulaBusy ? t("verifying") : t("addAndVerify")}
            </button>
          </div>
          {cedulaError && (
            <Notice tone="error" className="mt-3">
              {cedulaError}
            </Notice>
          )}
        </ActionPanel>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <VerificationSummary
        title={
          status === "verified"
            ? t("verifiedTitle")
            : status === "under_appeal"
              ? t("underAppealTitle")
              : status === "rejected"
                ? t("rejectedTitle")
                : t("unverifiedTitle")
        }
        tone={summaryTone}
        badge={status === "verified" ? t("verifiedChip") : undefined}
      >
        {status === "verified" && t.rich("verifiedBody", rich)}
        {status === "pending" && t.rich("pendingBody", rich)}
        {status === "under_appeal" && t("underAppealBody")}
        {status === "rejected" && (
          <>
            {reason ? (
              <span className="block">{t("reason", { reason })}</span>
            ) : (
              t("noReason")
            )}
            <span className="block mt-1">{t("rejectedBody")}</span>
          </>
        )}
      </VerificationSummary>

      {note && (
        <Notice tone="info" title={t("resultTitle")}>
          {note}
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      {/* Pending no longer shows a separate "Verificar mi identidad ahora" (re-run the
          cédula on file) button — it was redundant with the "Verifica tu identidad con tu
          cédula" card below (sprint 332), which is the SINGLE coherent action: enter/confirm
          your cédula → it's stored + checked against the padrón → verified instantly (or
          left in review for DIMEX/NITE). That one card covers a pro correcting a cédula that
          didn't auto-verify, a sin-cédula/revoked pro adding one, and a re-check. */}

      {/* Rejected → appeal (re-runs automatically; if it still fails → support ticket) */}
      {status === "rejected" && (
        <ActionPanel title={t("appealTitle")} body={t("appealBody")}>
          <textarea
            value={appeal}
            onChange={(e) => setAppeal(e.target.value)}
            rows={4}
            placeholder={t("appealPlaceholder")}
            className="w-full rounded-xl border border-[#e5e7eb] p-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
          />
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={() => runCheck(true)}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold px-5 py-2.5 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />{" "}
              {busy ? t("sending") : t("appealReverify")}
            </button>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1eb456] text-white text-sm font-bold px-5 py-2.5"
            >
              <WhatsAppIcon className="h-4 w-4 shrink-0" />{" "}
              {t("supportWhatsapp")}
            </a>
          </div>
        </ActionPanel>
      )}

      {status === "under_appeal" && (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1eb456] text-white text-sm font-bold px-5 py-2.5"
        >
          <WhatsAppIcon className="h-4 w-4 shrink-0" />{" "}
          {t("supportWhatsappCase", { ref })}
        </a>
      )}

      {/* Enter (or replace) a cédula to verify — for ANY non-verified pro: a REVOKED
          account re-entering its cédula, a "sin cédula" account adding one later, or a
          pending/rejected pro correcting it. Calls /api/add-cedula → stores it + runs the
          padrón check: a valid NATIONAL cédula verifies instantly and overwrites the name
          from the padrón (profiles + Auth, in run-verification); DIMEX/NITE or not-found
          stays unverified; an invalid format errors out (no change). */}
      {status !== "verified" && (
        <ActionPanel title={t("enterCedulaTitle")} body={t("enterCedulaBody")}>
          <Link
            href="/proveedores-autorizados"
            className="mt-2 mb-4 inline-flex text-sm font-semibold text-[#009FD9] transition-colors hover:text-[#0089bb] hover:underline"
          >
            {t.rich("howItWorks", { link: (c) => <>{c}</> })}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newCedula}
              onChange={(e) => {
                setNewCedula(e.target.value);
                setCedulaError(null);
              }}
              inputMode="numeric"
              placeholder={t("cedulaPlaceholder")}
              aria-invalid={!!cedulaError}
              className="flex-1 min-w-[200px] h-11 px-4 rounded-xl border border-[#e5e7eb] text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all aria-[invalid=true]:border-red-300 aria-[invalid=true]:focus:ring-red-200"
            />
            <button
              onClick={addCedula}
              disabled={cedulaBusy || newCedula.replace(/\D/g, "").length < 9}
              className="inline-flex items-center gap-2 rounded-full bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold px-5 py-2.5 disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />{" "}
              {cedulaBusy ? t("verifying") : t("addAndVerify")}
            </button>
          </div>
          {cedulaError && (
            <Notice tone="error" className="mt-3">
              {cedulaError}
            </Notice>
          )}
        </ActionPanel>
      )}
    </div>
  );
}

function VerificationSummary({
  title,
  tone,
  badge,
  children,
}: {
  title: string;
  tone: "verified" | "pending" | "review" | "rejected";
  badge?: string;
  children: React.ReactNode;
}) {
  const Icon =
    tone === "verified"
      ? ShieldCheck
      : tone === "review"
        ? Clock3
        : tone === "rejected"
          ? XCircle
          : Info;
  const toneClass =
    tone === "verified"
      ? "border-[#bfe8f6] bg-[#f1fbfe] text-[#009FD9]"
      : tone === "review"
        ? "border-[#fde68a] bg-[#fffbeb] text-[#b45309]"
        : tone === "rejected"
          ? "border-[#fecaca] bg-[#fff1f2] text-[#dc2626]"
          : "border-[#dbe4ee] bg-[#f8fafc] text-[#64748b]";
  return (
    <section className="rounded-2xl border border-[#dbe4ee] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${toneClass}`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-bold leading-snug text-[#162543] sm:text-base">
              {title}
            </h3>
            {badge && (
              <Badge variant="verified" className="shrink-0">
                {badge}
              </Badge>
            )}
          </div>
          <div className="mt-1.5 text-sm leading-relaxed text-[#4b5563] [overflow-wrap:anywhere]">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function ActionPanel({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#dbe4ee] bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-[15px] font-bold text-[#162543]">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#6b7280]">
        {body}
      </p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Notice({
  tone,
  title,
  className = "",
  children,
}: {
  tone: "info" | "error";
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed [overflow-wrap:anywhere] ${tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-[#bfe8f6] bg-[#f1fbfe] text-[#0f6380]"} ${className}`}
    >
      {title && <p className="mb-0.5 font-bold text-[#162543]">{title}</p>}
      <div>{children}</div>
    </div>
  );
}
