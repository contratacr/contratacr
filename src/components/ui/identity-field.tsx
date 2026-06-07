"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CedulaInput } from "@/components/ui/cedula-input";
import { cleanId, isValidId } from "@/lib/cedula";

// Identity field: cédula → padrón lookup → confirm the OFFICIAL name (no typing
// your own name for verification). Found → official name auto-filled + confirmed
// (identity will auto-verify). Not found → manual name + "pendiente de revisión".
//
// Reports state upward via onChange so the parent can submit { cedula, fullName }
// and know whether it came from the padrón.

export type IdentityStatus = "idle" | "loading" | "found" | "notfound";

interface Props {
  cedula: string;
  fullName: string;
  onCedulaChange: (cedula: string) => void;
  onFullNameChange: (fullName: string) => void;
  onStatusChange?: (status: IdentityStatus) => void;
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
  cedulaError,
  nameError,
  cedulaReadOnly,
}: Props) {
  const [status, setStatus] = useState<IdentityStatus>("idle");
  const [officialName, setOfficialName] = useState<string>("");
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
          const { fullName: official } = await res.json();
          setOfficialName(official ?? "");
          setManualOverride(false);
          onFullNameChange(official ?? "");
          setStatusBoth("found");
        } else {
          setOfficialName("");
          setStatusBoth("notfound");
        }
      } catch {
        if (myReq !== reqId.current) return;
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
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando en el padrón…
        </div>
      )}

      {/* Found in the padrón → confirm the official name */}
      {status === "found" && !manualOverride && (
        <div className="rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-[#15803d] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#15803d]">Encontramos tu cédula en el padrón</p>
              <p className="text-base font-bold text-[#111827] mt-0.5">{officialName}</p>
              <p className="text-xs text-[#15803d] mt-1">
                Confirmamos tu identidad con este nombre oficial. Aparecerá así en tu perfil.
              </p>
              <button
                type="button"
                onClick={() => { setManualOverride(true); setStatusBoth("notfound"); }}
                className="text-xs text-[#6b7280] underline mt-2 hover:text-[#374151]"
              >
                ¿No sos vos? Ingresar el nombre manualmente
              </button>
            </div>
            <CheckCircle2 className="h-5 w-5 text-[#15803d] shrink-0" />
          </div>
        </div>
      )}

      {/* Not in the padrón → manual name + pending notice */}
      {showManualName && status !== "loading" && (
        <>
          {status === "notfound" && cleanId(cedula) && isValidId(cleanId(cedula)) && (
            <div className="flex items-start gap-2 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3 text-xs text-[#92400e]">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                No encontramos tu cédula en el padrón (puede ser DIMEX/NITE, extranjero o recién emitida).
                Ingresá tu nombre completo: tu identidad quedará <strong>pendiente de revisión</strong> y la
                confirmaremos manualmente.
              </span>
            </div>
          )}
          <Input
            label={<>Nombre completo <span className="text-red-500">*</span></>}
            placeholder="Juan Pérez González"
            hint="tal como aparece en tu documento"
            value={fullName}
            onChange={(e) => onFullNameChange(e.target.value)}
            error={nameError}
          />
        </>
      )}
    </div>
  );
}
