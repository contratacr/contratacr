"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CedulaInput } from "@/components/ui/cedula-input";
import { IdentityInfoBlock } from "@/components/ui/identity-info-block";
import { cleanId, isValidId } from "@/lib/cedula";

// Identity field: cédula → padrón lookup → confirm the OFFICIAL info (no typing
// your own name for verification). Found → official name auto-filled + confirmed
// (identity will auto-verify); shows name + cédula (+ DOB/age when available) with
// a "¿No es tu información?" link. Not found → manual name + "pendiente de revisión".

export type IdentityStatus = "idle" | "loading" | "found" | "notfound";
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

  function setStatusBoth(s: IdentityStatus) {
    setStatus(s);
    onStatusChange?.(s);
  }

  // Debounced padrón lookup whenever a valid cédula is present.
  useEffect(() => {
    const clean = cleanId(cedula);
    if (!clean || !isValidId(clean)) {
      setStatusBoth("idle");
      setOfficialName("");
      return;
    }
    const myReq = ++reqId.current;
    setStatusBoth("loading");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cedula/${clean}`);
        if (myReq !== reqId.current) return; // stale
        if (res.ok) {
          const { fullName: official, dob: d, isAdult } = await res.json();
          setOfficialName(official ?? "");
          setDob(d ?? null);
          setManualOverride(false);
          onFullNameChange(official ?? "");
          onResult?.({ found: true, isAdult: !!isAdult, dob: d ?? null });
          setStatusBoth("found");
        } else {
          setOfficialName("");
          setDob(null);
          onResult?.({ found: false, isAdult: false, dob: null });
          setStatusBoth("notfound");
        }
      } catch {
        if (myReq !== reqId.current) return;
        onResult?.({ found: false, isAdult: false, dob: null });
        setStatusBoth("notfound");
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
      {showManualName && status !== "loading" && (
        <>
          {status === "notfound" && cleanId(cedula) && isValidId(cleanId(cedula)) && (
            <div className="flex items-start gap-2 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3 text-xs text-[#92400e]">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                {t.rich(manualOverride ? "mismatchNotice" : "notFoundNotice", { b: (c) => <strong>{c}</strong> })}
              </span>
            </div>
          )}
          <Input
            label={<>{t("fullName")} <span className="text-red-500">*</span></>}
            placeholder={t("namePlaceholder")}
            hint={t("nameHint")}
            value={fullName}
            onChange={(e) => onFullNameChange(e.target.value)}
            error={nameError}
          />
        </>
      )}
    </div>
  );
}
