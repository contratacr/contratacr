"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock3, Headset, Info, Loader2, RotateCcw, Send, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CedulaInput } from "@/components/ui/cedula-input";
import { IdentityInfoBlock } from "@/components/ui/identity-info-block";
import { Link } from "@/i18n/navigation";
import { SupportLink } from "@/components/support/support-link";
import { cleanId, isValidId } from "@/lib/cedula";
import { caseRef, type VerificationStatus } from "@/lib/verification";

interface Props {
  professionalId: string;
  status: VerificationStatus;
  reason?: string | null;
  /** No-CR-identification case (manual review; no padrón to check against). */
  noCrId?: boolean;
  onSaved?: () => void;
}

type CedulaCheck =
  | { status: "confirmed"; cedula: string; fullName: string; dob: string | null; taken: boolean }
  | { status: "review"; cedula: string; message: string; taken: boolean };

export function VerificationPanel({
  professionalId,
  status,
  reason,
  noCrId = false,
  onSaved,
}: Props) {
  const t = useTranslations("verificationPanel");
  const ti = useTranslations("identity");
  const rich = { strong: (c: React.ReactNode) => <strong>{c}</strong> };
  const cedulaReqId = useRef(0);
  const [appeal, setAppeal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [verifiedCedula, setVerifiedCedula] = useState<string | null>(null);

  // Add-cédula-later (no-ID pros who obtained a CR cédula).
  const [newCedula, setNewCedula] = useState("");
  const [cedulaCheck, setCedulaCheck] = useState<CedulaCheck | null>(null);
  const [cedulaBusy, setCedulaBusy] = useState(false);
  const [cedulaSaving, setCedulaSaving] = useState(false);
  const [cedulaError, setCedulaError] = useState<string | null>(null);

  const ref = caseRef(professionalId);
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
    setVerifiedName(null);
    setVerifiedCedula(null);
    setCedulaCheck(null);
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

  useEffect(() => {
    const reqId = ++cedulaReqId.current;
    const cedula = cleanId(newCedula);
    if (!isValidId(cedula)) {
      queueMicrotask(() => {
        if (reqId !== cedulaReqId.current) return;
        setCedulaBusy(false);
        setCedulaCheck(null);
        setCedulaError(null);
      });
      return undefined;
    }

    queueMicrotask(() => {
      if (reqId !== cedulaReqId.current) return;
      setCedulaBusy(true);
      setCedulaCheck(null);
      setCedulaError(null);
      setNote(null);
      setVerifiedName(null);
      setVerifiedCedula(null);
    });

    const timer = window.setTimeout(async () => {
      try {
        const [availableRes, lookupRes] = await Promise.all([
          fetch(`/api/cedula-available?cedula=${encodeURIComponent(cedula)}`),
          fetch(`/api/cedula/${cedula}`),
        ]);
        if (reqId !== cedulaReqId.current) return;

        const availableJson = await availableRes.json().catch(() => ({}));
        const lookupJson = await lookupRes.json().catch(() => ({}));
        const taken = !!availableJson.taken;
        setCedulaError(taken ? t("cedulaTaken") : null);

        if (lookupRes.ok && lookupJson.found && typeof lookupJson.fullName === "string") {
          setCedulaCheck({
            status: "confirmed",
            cedula,
            fullName: lookupJson.fullName,
            dob: typeof lookupJson.dob === "string" ? lookupJson.dob : null,
            taken,
          });
          return;
        }
        if (lookupRes.status === 404) {
          setCedulaCheck({ status: "review", cedula, message: t("cedulaReviewReady"), taken });
          return;
        }
        setCedulaError(lookupJson.error ?? t("processError"));
      } catch (e) {
        if (reqId !== cedulaReqId.current) return;
        setCedulaError(e instanceof Error ? e.message : t("processError"));
      } finally {
        if (reqId === cedulaReqId.current) setCedulaBusy(false);
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [newCedula, t]);

  async function addCedula() {
    setError(null);
    setCedulaError(null);
    setNote(null);
    setVerifiedName(null);
    setVerifiedCedula(null);
    const cedula = cleanId(newCedula);
    if (!cedulaCheck || cedulaCheck.cedula !== cedula) {
      setCedulaError(t("checkCedulaFirst"));
      return;
    }
    setCedulaSaving(true);
    try {
      const res = await fetch("/api/add-cedula", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCedulaError(json.error ?? t("processError"));
        return;
      }
      if (json.outcome === "verified") {
        const fallbackName = cedulaCheck.status === "confirmed" ? cedulaCheck.fullName : "";
        const nextName = typeof json.fullName === "string" ? json.fullName.trim() : fallbackName;
        const nextCedula = typeof json.cedula === "string" ? json.cedula.trim() : cedula;
        setVerifiedName(nextName || null);
        setVerifiedCedula(nextCedula || null);
        setNote(t("cedulaVerified"));
      } else {
        setNote(t("cedulaSaved"));
      }
      setNewCedula("");
      setCedulaCheck(null);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("processError"));
    } finally {
      setCedulaSaving(false);
    }
  }

  function handleCedulaInput(value: string) {
    setNewCedula(value);
    setCedulaError(null);
    setCedulaCheck(null);
    setNote(null);
    setVerifiedName(null);
    setVerifiedCedula(null);
  }

  function renderCedulaVerifier() {
    const cleanCedula = cleanId(newCedula);
    const currentCheck = cedulaCheck?.cedula === cleanCedula ? cedulaCheck : null;
    const canAddCedula = !!currentCheck && !currentCheck.taken && !cedulaBusy;

    return (
      <>
        <div className="grid gap-3">
          <CedulaInput
            required
            value={newCedula}
            onChange={handleCedulaInput}
            error={cedulaError ?? undefined}
          />
        </div>

        {cedulaBusy && (
          <div className="mt-3 flex items-center gap-2 text-sm text-[#6b7280]">
            <Loader2 className="h-4 w-4 animate-spin" /> {ti("searching")}
          </div>
        )}

        {currentCheck?.status === "confirmed" && (
          <div className="mt-3">
            <IdentityInfoBlock
              fullName={currentCheck.fullName}
              cedula={currentCheck.cedula}
              dob={currentCheck.dob}
            />
          </div>
        )}

        {currentCheck?.status === "review" && (
          <Notice tone="info" className="mt-3">
            {currentCheck.message}
          </Notice>
        )}

        {currentCheck && !currentCheck.taken && (
          <button
            onClick={addCedula}
            disabled={cedulaSaving || !canAddCedula}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#009FD9] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#0089bb] disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" />{" "}
            {cedulaSaving ? t("savingCedula") : t("addCedula")}
          </button>
        )}

      </>
    );
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
          <VerificationResultNotice
            note={note}
            title={t("resultTitle")}
            verifiedName={verifiedName}
            verifiedCedula={verifiedCedula}
          />
        )}
        {error && <Notice tone="error">{error}</Notice>}

        {/* In-app support follow-up to track the case. */}
        <SupportLink
          className="inline-flex items-center gap-2 rounded-lg border border-[#dbe4ee] bg-white px-5 py-2.5 text-sm font-bold text-[#162543] transition-colors hover:border-[#009FD9]/40 hover:bg-[#f1fbfe] hover:text-[#0089bb]"
        >
          <Headset className="h-4 w-4 shrink-0" /> {t("supportFollowUp", { ref })}
        </SupportLink>

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
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold px-5 py-2.5 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />{" "}
              {busy ? t("sending") : t("sendToReview")}
            </button>
          </ActionPanel>
        )}

        {/* Add-cédula-later — runs the normal padrón verification automatically */}
        <ActionPanel title={t("hasCedulaTitle")} body={t("hasCedulaBody")}>
          {renderCedulaVerifier()}
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
        {status === "pending" && (
          <>
            {reason && <span className="block">{t("reason", { reason })}</span>}
            <span className={reason ? "mt-1 block" : undefined}>{t.rich("pendingBody", rich)}</span>
          </>
        )}
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
        <VerificationResultNotice
          note={note}
          title={t("resultTitle")}
          verifiedName={verifiedName}
          verifiedCedula={verifiedCedula}
        />
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
              className="inline-flex items-center gap-2 rounded-lg bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold px-5 py-2.5 disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" />{" "}
              {busy ? t("sending") : t("appealReverify")}
            </button>
            <SupportLink
              className="inline-flex items-center gap-2 rounded-lg border border-[#dbe4ee] bg-white px-5 py-2.5 text-sm font-bold text-[#162543] transition-colors hover:border-[#009FD9]/40 hover:bg-[#f1fbfe] hover:text-[#0089bb]"
            >
              <Headset className="h-4 w-4 shrink-0" /> {t("supportApp")}
            </SupportLink>
          </div>
        </ActionPanel>
      )}

      {status === "under_appeal" && (
        <SupportLink
          className="inline-flex items-center gap-2 rounded-lg border border-[#dbe4ee] bg-white px-5 py-2.5 text-sm font-bold text-[#162543] transition-colors hover:border-[#009FD9]/40 hover:bg-[#f1fbfe] hover:text-[#0089bb]"
        >
          <Headset className="h-4 w-4 shrink-0" /> {t("supportAppCase", { ref })}
        </SupportLink>
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
          {renderCedulaVerifier()}
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
  return (
    <section className="rounded-2xl border border-[#dbe4ee] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#ccecf8] bg-[#EAF7FD] text-[#0089bb] shadow-[0_8px_20px_-18px_rgba(0,159,217,0.9)]">
          <Icon className="h-[18px] w-[18px]" />
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

function VerificationResultNotice({
  note,
  title,
  verifiedName,
  verifiedCedula,
}: {
  note: string;
  title: string;
  verifiedName: string | null;
  verifiedCedula: string | null;
}) {
  return (
    <Notice tone="info" title={title}>
      <p>{note}</p>
      {verifiedName && (
        <div className="mt-3">
          <IdentityInfoBlock fullName={verifiedName} cedula={verifiedCedula ?? undefined} />
        </div>
      )}
    </Notice>
  );
}
