"use client";

import { useState } from "react";
import { ShieldCheck, Clock, XCircle, AlertCircle, CheckCircle2, Send, RefreshCw } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Link } from "@/i18n/navigation";
import { SUPPORT_WHATSAPP_NUMBER } from "@/lib/constants";
import { caseRef, type VerificationStatus } from "@/lib/verification";

interface Props {
  professionalId: string;
  status: VerificationStatus;
  reason?: string | null;
  onSaved?: () => void;
}

export function VerificationPanel({ professionalId, status, reason, onSaved }: Props) {
  const [appeal, setAppeal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const ref = caseRef(professionalId);
  const waMsg = encodeURIComponent(`Hola, necesito ayuda con mi verificación de identidad en ContrataCR (Caso #${ref}).`);
  const waUrl = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${waMsg}`;

  // Re-run automatic verification against the padrón (also used by the appeal).
  async function runCheck(appealMode: boolean) {
    setError(null);
    setNote(null);
    if (appealMode && appeal.trim().length < 10) {
      setError("Contanos qué corregiste (mínimo 10 caracteres).");
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
      if (json.outcome === "verified") setNote("¡Listo! Tu identidad fue verificada.");
      else if (json.outcome === "ticket") setNote("No pudimos confirmarla automáticamente. Abrimos un caso de soporte para revisión manual.");
      else setNote("No pudimos confirmarla automáticamente. Tu caso quedó en revisión.");
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar. Intentá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Status banner */}
      {status === "verified" && (
        <Banner tone="green" icon={<ShieldCheck className="h-5 w-5" />} title="Tu identidad está verificada">
          Confirmamos que tu cédula es real y coincide con los registros oficiales. La insignia
          <strong> Identidad verificada</strong> aparece en tu perfil y en /buscar. Recordá: verificamos tu identidad,
          no la calidad ni el resultado de los trabajos.
        </Banner>
      )}
      {status === "pending" && (
        <Banner tone="gray" icon={<Clock className="h-5 w-5" />} title="Verificación pendiente">
          No pudimos confirmar tu identidad automáticamente (cédula no encontrada o el nombre no coincide). Verificá
          que tu nombre coincida con tu cédula y volvé a intentar. Tu cuenta sigue activa.
        </Banner>
      )}
      {status === "under_appeal" && (
        <Banner tone="amber" icon={<Clock className="h-5 w-5" />} title="Caso en revisión manual">
          Tu apelación se volvió a verificar automáticamente y aún no coincidió, así que abrimos un caso de soporte.
          Te avisaremos el resultado por correo y aquí.
        </Banner>
      )}
      {status === "rejected" && (
        <Banner tone="red" icon={<XCircle className="h-5 w-5" />} title="Tu verificación no fue aprobada">
          {reason ? <span className="block">Motivo: <strong>{reason}</strong></span> : "No se especificó un motivo."}
          <span className="block mt-1">Tu cuenta sigue activa. Corregí lo indicado y apelá para una nueva revisión.</span>
        </Banner>
      )}

      {note && (
        <Banner tone="green" icon={<CheckCircle2 className="h-5 w-5" />} title="Resultado">{note}</Banner>
      )}
      {error && (
        <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      )}

      <p className="text-sm text-[#6b7280]">
        ¿Querés saber cómo funciona?{" "}
        <Link href="/proveedores-autorizados" className="text-[#009FD9] font-medium hover:underline">
          ¿Qué es la verificación de identidad?
        </Link>
      </p>

      {/* Pending → re-run automatic check */}
      {status === "pending" && (
        <button
          onClick={() => runCheck(false)}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold px-4 py-2.5 disabled:opacity-60"
        >
          <RefreshCw className="h-4 w-4" /> {busy ? "Verificando…" : "Verificar mi identidad ahora"}
        </button>
      )}

      {/* Rejected → appeal (re-runs automatically; if it still fails → support ticket) */}
      {status === "rejected" && (
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
          <h3 className="font-semibold text-[#111827] text-sm mb-1">Apelar esta decisión</h3>
          <p className="text-xs text-[#6b7280] mb-3">
            Al apelar, volvemos a verificar tu identidad automáticamente. Si aún no coincide, abrimos un caso de soporte
            (queda registrado). También podés escribirnos por WhatsApp.
          </p>
          <textarea
            value={appeal}
            onChange={(e) => setAppeal(e.target.value)}
            rows={4}
            placeholder="Explicá qué corregiste o por qué deberíamos revisar de nuevo…"
            className="w-full rounded-lg border border-[#e5e7eb] p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
          />
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={() => runCheck(true)}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold px-4 py-2.5 disabled:opacity-60"
            >
              <Send className="h-4 w-4" /> {busy ? "Enviando…" : "Apelar y reverificar"}
            </button>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#1eb456] text-white text-sm font-bold px-4 py-2.5"
            >
              <WhatsAppIcon className="h-4 w-4" /> Soporte por WhatsApp
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
          <WhatsAppIcon className="h-4 w-4" /> Soporte por WhatsApp (Caso #{ref})
        </a>
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
