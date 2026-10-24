"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { VerificationDocuments, verificationActionButtonClass } from "./verification-documents";
import { useTranslations } from "next-intl";
import { Loader2, ShieldCheck } from "lucide-react";
import { CedulaInput } from "@/components/ui/cedula-input";
import { IdentityInfoBlock } from "@/components/ui/identity-info-block";
import { cleanId, detectIdType, isValidId } from "@/lib/cedula";
import { type VerificationStatus } from "@/lib/verification";
import { ResponsiveVerifiedName } from "@/components/professionals/responsive-verified-name";

function subscribePreview() { return () => {}; }
function readPreviewKind(): "person" | "company" | null {
  if (!/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) return null;
  const kind = new URLSearchParams(window.location.search).get("verificationPreview");
  return kind === "person" || kind === "company" ? kind : null;
}

interface Props {
  professionalId: string;
  status: VerificationStatus;
  reason?: string | null;
  currentCedula?: string | null;
  /** Nombre completo de la cuenta, para mostrarlo junto a la identificación guardada. */
  currentFullName?: string | null;
  /** No-CR-identification case (manual review; no padrón to check against). */
  noCrId?: boolean;
  onSaved?: () => void;
}

type CedulaCheck =
  | { status: "confirmed"; cedula: string; fullName: string; dob: string | null; taken: boolean }
  | { status: "review"; cedula: string; message: string; taken: boolean };

export function VerificationPanel({
  status: storedStatus,
  reason,
  currentCedula = null,
  currentFullName = null,
  onSaved,
}: Props) {
  const previewKind = useSyncExternalStore(subscribePreview, readPreviewKind, () => null);
  const t = useTranslations("verificationPanel");
  const ti = useTranslations("identity");
  const cedulaReqId = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [verifiedCedula, setVerifiedCedula] = useState<string | null>(null);
  const [changeCedulaOpen, setChangeCedulaOpen] = useState(false);

  // Add-cédula-later (no-ID pros who obtained a CR cédula).
  const [newCedula, setNewCedula] = useState("");
  const [cedulaCheck, setCedulaCheck] = useState<CedulaCheck | null>(null);
  const [cedulaBusy, setCedulaBusy] = useState(false);
  const [cedulaSaving, setCedulaSaving] = useState(false);
  const [cedulaError, setCedulaError] = useState<string | null>(null);

  // Keep the acknowledged save on screen while the two dashboard reads settle.
  // Otherwise the editor closes onto the previous ID/status for one render.
  const [savedIdentity, setSavedIdentity] = useState<{ cedula: string; fullName: string | null; verified: boolean } | null>(null);
  const status = savedIdentity ? (savedIdentity.verified ? "verified" : storedStatus === "verified" ? "pending" : storedStatus) : storedStatus;
  const displayedFullName = savedIdentity?.fullName ?? currentFullName;
  const cleanCurrentCedula = savedIdentity?.cedula ?? cleanId(currentCedula ?? "");
  useEffect(() => {
    if (!savedIdentity || cleanId(currentCedula ?? "") !== savedIdentity.cedula ||
      (storedStatus === "verified") !== savedIdentity.verified ||
      (savedIdentity.fullName && currentFullName !== savedIdentity.fullName)) return;
    queueMicrotask(() => setSavedIdentity(current => current === savedIdentity ? null : current));
  }, [savedIdentity, currentCedula, currentFullName, storedStatus]);
  const hasCurrentCedula = !!cleanCurrentCedula;
  const currentIdType = detectIdType(cleanCurrentCedula);
  const currentIdTypeLabel =
    currentIdType === "cedula"
      ? t("idTypeCedula")
      : currentIdType === "juridica"
        ? t("idTypeJuridica")
        : currentIdType === "dimex"
          ? t("idTypeDimex")
          : currentIdType === "nite"
            ? t("idTypeNite")
            : null;
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

    // La misma que ya está guardada y verificada: no hay nada que cambiar. Se
    // dice de una vez y no se consulta nada.
    if (status === "verified" && cedula === cleanId(currentCedula ?? "")) {
      queueMicrotask(() => {
        if (reqId !== cedulaReqId.current) return;
        setCedulaBusy(false);
        setCedulaCheck(null);
        setCedulaError(t("cedulaSame"));
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
  }, [newCedula, t, status, currentCedula]);

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
        setSavedIdentity({ cedula: nextCedula || cedula, fullName: nextName || null, verified: true });
        setVerifiedName(nextName || null);
        setVerifiedCedula(nextCedula || null);
        setNote(t("cedulaVerified"));
        window.dispatchEvent(new CustomEvent("ccr:identity-updated", {
          detail: { fullName: nextName || null, cedula: nextCedula || null, verified: true },
        }));
      } else {
        setSavedIdentity({ cedula, fullName: null, verified: false });
        setNote(t(json.outcome === "ticket" ? "cedulaManualPending" : json.outcome === "skipped" ? "cedulaCheckPending" : "cedulaSaved"));
        window.dispatchEvent(new CustomEvent("ccr:identity-updated", {
          detail: { fullName: null, cedula, verified: false },
        }));
      }
      setNewCedula("");
      setCedulaCheck(null);
      setChangeCedulaOpen(false);
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
        <p className="mb-3 text-xs leading-5 text-[#52627a]">{ti("lookupNotice")}</p>
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
            <p className="mb-2 text-xs leading-5 text-[#52627a]">{t("cedulaFound")}</p>
            <IdentityInfoBlock
              verified={false}
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

        {/* SIN "Cancelar". Acá no hay nada que descartar: mientras no se pulse
            "Agregar" no se ha guardado nada, así que cancelar solo cerraría el
            formulario —y eso ya lo hace el botón "Cambiar identificación" de
            arriba, que es un interruptor—. Además el botón de guardar solo
            aparece cuando la identificación ya se comprobó, o sea que al abrir
            el formulario el pie quedaba con "Cancelar" como ÚNICO botón: un
            formulario cuya única acción es no hacer nada. */}
        {currentCheck && !currentCheck.taken && (
          <div className="mt-4 flex justify-end">
              <button
                onClick={addCedula}
                disabled={cedulaSaving || !canAddCedula}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#009FD9] px-5 text-sm font-bold text-white transition-colors hover:bg-[#0089bb] disabled:opacity-50 sm:w-auto sm:min-w-[132px]"
              >
                <ShieldCheck className="h-4 w-4" />{" "}
                {cedulaSaving ? t("savingCedula") : t("addCedula")}
              </button>
          </div>
        )}

      </>
    );
  }

  if (previewKind) return <VerificationDocuments legal={previewKind === "company"} preview />;

  // Manual review needs identity evidence, never photographs of completed work.
  if (status !== "verified") return (
    <div className="space-y-5">
      {status === "rejected" && <p className="text-sm font-semibold text-red-700">{t("rejectedTitle")}</p>}
      {status === "rejected" && reason && <p className="text-sm text-[#52627a]">{t("rejectedBody")}</p>}
      {!hasCurrentCedula && <p className="text-sm text-[#52627a]">{t("missingIdNextStep")}</p>}
      <CurrentIdentificationPanel title={t("currentIdTitle")} emptyLabel={t("currentIdEmpty")}
        value={hasCurrentCedula ? cleanCurrentCedula : null} typeLabel={currentIdTypeLabel}
        fullName={hasCurrentCedula ? displayedFullName : null} changeLabel={t("changeId")} addLabel={t("addId")}
        changeOpen={changeCedulaOpen} onChangeClick={() => setChangeCedulaOpen(open => !open)} />
      {changeCedulaOpen && <ActionPanel title={t("changeIdTitle")} body={t("changeIdBody")}>{renderCedulaVerifier()}</ActionPanel>}
      {hasCurrentCedula && <VerificationDocuments key={cleanCurrentCedula} legal={currentIdType === "juridica"} onVerified={onSaved} />}
    </div>
  );

  return (
    <div className="space-y-4">
      <CurrentIdentificationPanel
        title={t("currentIdTitle")}
        emptyLabel={t("currentIdEmpty")}
        value={hasCurrentCedula ? cleanCurrentCedula : null}
        typeLabel={currentIdTypeLabel}
        fullName={hasCurrentCedula ? displayedFullName : null}
        statusLabel={status === "verified" ? t("verifiedChip") : undefined}
        changeLabel={t("changeId")}
        addLabel={t("addId")}
        changeOpen={changeCedulaOpen}
        onChangeClick={() => setChangeCedulaOpen((abierto) => {
          // Cerrar descarta el borrador: si no, al reabrir volvía a salir el
          // número a medio escribir de la vez anterior.
          if (abierto) { setNewCedula(""); setCedulaCheck(null); setCedulaError(null); }
          return !abierto;
        })}
      />

      {note && status === "verified" && <Notice tone="info">{note}</Notice>}
      {note && status !== "verified" && (
        <VerificationResultNotice note={note} title={t("resultTitle")} verifiedName={verifiedName} verifiedCedula={verifiedCedula} />
      )}
      {error && <Notice tone="error">{error}</Notice>}

      {status === "verified" && changeCedulaOpen && (
        <ActionPanel title={t("changeIdTitle")} body={t("changeIdBody")}>
          {renderCedulaVerifier()}
        </ActionPanel>
      )}


    </div>
  );
}

function CurrentIdentificationPanel({
  title,
  emptyLabel,
  value,
  typeLabel,
  fullName,
  statusLabel,
  changeLabel,
  addLabel,
  changeOpen = false,
  onChangeClick,
}: {
  title: string;
  emptyLabel: string;
  value: string | null;
  typeLabel?: string | null;
  fullName?: string | null;
  statusLabel?: string;
  changeLabel: string;
  /** Sin identificación no hay nada que «cambiar»: se agrega. */
  addLabel: string;
  changeOpen?: boolean;
  onChangeClick: () => void;
}) {
  return (
    // Un bloque, no una tarjeta: esto ya vive DENTRO de la tarjeta blanca del
    // editor de perfil, y una tarjeta blanca con borde dentro de otra tarjeta
    // blanca solo agrega ruido. Se separa con espacio, igual que las
    // demás secciones del editor.
    <section data-current-identification className="pt-6 first:pt-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {/* Sin ícono (4-oct-2026): un escudo con visto junto a «no hay
              identificación» decía lo contrario; el título ya dice qué es. */}
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#64748b]">{title}</p>
            {/* El número va en monoespaciada y recortado si no cabe; la frase de
                "no hay ninguna" NO: en monoespaciada y con recorte se leía
                "No hay una identifi…". Y el distintivo solo acompaña a un
                número real —"Verificado" junto a "no hay identificación" se
                contradecía. */}
            <div className="mt-2 inline-flex max-w-full items-center gap-1">
              {value ? (
                <>
                  <p className="min-w-0 truncate font-mono text-base font-extrabold tracking-wide text-[#162543]">{value}</p>
                </>
              ) : (
                <p className="min-w-0 text-sm font-semibold leading-snug text-[#64748b]">{emptyLabel}</p>
              )}
            </div>
            {/* De quién es: el número solo no le dice a nadie si es el suyo. */}
            {value && fullName ? (
              <p data-nombre-identificacion className="mt-0.5 text-sm font-bold leading-snug text-[#162543]"><ResponsiveVerifiedName wrap name={fullName} verified={!!statusLabel} verifiedLabel={statusLabel ?? ""} /></p>
            ) : null}
            {value && typeLabel ? (
              <p className="mt-0.5 text-xs font-semibold text-[#64748b]">{typeLabel}</p>
            ) : null}
          </div>
        </div>
        {/* Mismo rótulo siempre: abrir el formulario no convierte este botón en
            otra cosa. Que está abierto lo dice su estado, no su texto. */}
        <button
          type="button"
          onClick={onChangeClick}
          aria-expanded={changeOpen}
          className={`${verificationActionButtonClass} ${
            changeOpen
              ? "border-[#009FD9] bg-[#f1fbfe] text-[#0089bb]"
              : "border-[#e5e7eb] bg-white text-[#162543] hover:border-[#009FD9]/50 hover:bg-[#f1fbfe] hover:text-[#0089bb]"
          }`}
        >
          {value ? changeLabel : addLabel}
        </button>
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
    <section className="pt-4 first:pt-0">
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

