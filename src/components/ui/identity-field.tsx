"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { IdCard, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CedulaInput } from "@/components/ui/cedula-input";
import { IdentityInfoBlock } from "@/components/ui/identity-info-block";
import { cleanId, isValidId } from "@/lib/cedula";
import { NAME_MAX_LENGTH, limitText } from "@/lib/text-limits";

// Identity field: cédula → padrón lookup → confirm the OFFICIAL info (no typing
// your own name for verification). Found → official name auto-filled + confirmed
// (identity will auto-verify); shows name + cédula (+ DOB/age when available) with
// a "¿No es tu información?" link. Not found → manual name + "pendiente de revisión".

export type IdentityStatus = "idle" | "loading" | "found" | "notfound" | "unavailable";
export type IdentityResult = { found: boolean; isAdult: boolean; dob: string | null };

interface Props {
  cedula: string;
  fullName: string;
  onCedulaChange: (cedula: string) => void;
  onFullNameChange: (fullName: string) => void;
  onStatusChange?: (status: IdentityStatus) => void;
  onResult?: (r: IdentityResult) => void;
  /** Fired when the user clicks "¿No es tu información?" — the padrón match must be
   *  DISCARDED and the case routed to manual admin review (never auto-verified). */
  onMismatch?: () => void;
  cedulaError?: string;
  nameError?: string;
  /** When true the cédula is locked (e.g. it was set at signup). */
  cedulaReadOnly?: boolean;
}

export function IdentityField({
  cedula,
  fullName,
  onCedulaChange,
  onFullNameChange,
  onStatusChange,
  onResult,
  cedulaError,
  nameError,
  cedulaReadOnly,
}: Props) {
  const t = useTranslations("identity");
  const [status, setStatus] = useState<IdentityStatus>("idle");
  const [officialName, setOfficialName] = useState<string>("");
  const [dob, setDob] = useState<string | null>(null);
  const [manualOverride, setManualOverride] = useState(false);
  const reqId = useRef(0);
  // The last name we AUTO-FILLED from the padrón. When the cédula changes we use it to
  // clear the stale auto-filled name (so a different/longer ID never keeps the prior
  // person's name); a name the user typed manually is never touched.
  const lastAutoName = useRef("");

  function setStatusBoth(s: IdentityStatus) {
    setStatus(s);
    onStatusChange?.(s);
  }

  // Debounced padrón lookup whenever a valid cédula is present.
  useEffect(() => {
    const clean = cleanId(cedula);
    const myReq = ++reqId.current;
    const hadAutoName = !!lastAutoName.current;
    // The cédula changed → if we had auto-filled a name from it, clear that stale name
    // (+ DOB) immediately so a different/longer ID never keeps the prior person's name.
    if (hadAutoName) {
      lastAutoName.current = "";
    }
    if (!clean || !isValidId(clean)) {
      queueMicrotask(() => {
        if (myReq !== reqId.current) return;
        if (hadAutoName) onFullNameChange("");
        setOfficialName("");
        setDob(null);
        setStatusBoth("idle");
      });
      return;
    }
    queueMicrotask(() => {
      if (myReq !== reqId.current) return;
      if (hadAutoName) {
        onFullNameChange("");
        setOfficialName("");
        setDob(null);
      }
      setStatusBoth("loading");
    });
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cedula/${clean}`);
        if (myReq !== reqId.current) return; // stale
        if (res.ok) {
          const { fullName: official, dob: d, isAdult } = await res.json();
          setOfficialName(official ?? "");
          setDob(d ?? null);
          setManualOverride(false);
          onFullNameChange(limitText(official ?? "", NAME_MAX_LENGTH));
          lastAutoName.current = official ?? "";
          onResult?.({ found: true, isAdult: !!isAdult, dob: d ?? null });
          setStatusBoth("found");
        } else {
          setOfficialName("");
          setDob(null);
          onResult?.({ found: false, isAdult: false, dob: null });
          setStatusBoth(res.status === 503 ? "unavailable" : "notfound");
        }
      } catch {
        if (myReq !== reqId.current) return;
        onResult?.({ found: false, isAdult: false, dob: null });
        setStatusBoth("unavailable");
      }
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cedula]);

  const showManualName = status === "notfound" || status === "idle" || manualOverride;

  return (
    <div className="flex flex-col gap-3">
      <CedulaInput
        required
        value={cedula}
        onChange={onCedulaChange}
        error={cedulaError}
        disabled={cedulaReadOnly}
      />

      {status === "loading" && (
        <div className="flex items-center gap-2 text-sm text-[#6b7280]">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("searching")}
        </div>
      )}

      {/* Found in the padrón → confirm the official info */}
      {/* Found in the padrón → confirm the official info. The "¿No es tu información?"
          mismatch override was removed: the cédula auto-fills the official identity and
          there is no "this isn't me" option (use your own cédula, or "No tengo cédula"). */}
      {status === "found" && !manualOverride && (
        <IdentityInfoBlock
          fullName={officialName}
          cedula={cedula}
          dob={dob}
        />
      )}

      {/* Not in the padrón → manual name + pending notice */}
      {status === "unavailable" && (
        <div role="status" aria-live="polite" className="rounded-2xl border border-[#bae6fd] bg-[#f0f9ff] px-4 py-3 text-sm shadow-sm">
          <div className="flex items-start gap-3">
            <IdCard className="mt-0.5 h-5 w-5 shrink-0 text-[#009FD9]" />
            <div className="min-w-0">
              <p className="font-semibold text-[#0f172a]">{t("unavailableTitle")}</p>
              <p className="mt-1 leading-5 text-[#475569]">{t("unavailableNotice")}</p>
            </div>
          </div>
        </div>
      )}

      {showManualName && status !== "loading" && (
        <>
          {status === "notfound" && cleanId(cedula) && isValidId(cleanId(cedula)) && (
            <div role="status" aria-live="polite" className="rounded-2xl border border-[#bae6fd] bg-[#f0f9ff] px-4 py-3 text-sm shadow-sm">
              <div className="flex items-start gap-3">
                <IdCard className="mt-0.5 h-5 w-5 shrink-0 text-[#009FD9]" />
                <div className="min-w-0">
                  <p className="font-semibold text-[#0f172a]">
                    {t(manualOverride ? "mismatchTitle" : "notFoundTitle")}
                  </p>
                  <p className="mt-1 leading-5 text-[#475569]">
                    {t.rich(manualOverride ? "mismatchNotice" : "notFoundNotice", { b: (c) => <strong className="font-semibold text-[#0f172a]">{c}</strong> })}
                  </p>
                </div>
              </div>
            </div>
          )}
          <Input
            label={<>{t("fullName")} <span className="text-red-500">*</span></>}
            placeholder={t("namePlaceholder")}
            value={fullName}
            maxLength={NAME_MAX_LENGTH}
            onChange={(e) => onFullNameChange(limitText(e.target.value, NAME_MAX_LENGTH))}
            error={nameError}
          />
        </>
      )}
    </div>
  );
}
