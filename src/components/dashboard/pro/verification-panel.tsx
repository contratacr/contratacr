"use client";

import { useState } from "react";
import { ShieldCheck, Clock, XCircle, AlertCircle, CheckCircle2, Send } from "lucide-react";
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const ref = caseRef(professionalId);
  const waMsg = encodeURIComponent(
    `Hola, quiero apelar la verificación de mi perfil en ContrataCR (Caso #${ref}).`
  );
  const waUrl = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${waMsg}`;

  async function submitAppeal() {
    setError(null);
    if (appeal.trim().length < 10) {
      setError("Contanos por qué deberíamos revisar de nuevo (mínimo 10 caracteres).");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: appeal.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      setSent(true);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar la apelación.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Status banner */}
      {status === "authorized" && (
        <Banner tone="green" icon={<ShieldCheck className="h-5 w-5" />} title="Sos Proveedor Autorizado">
          Verificamos tu identidad y documentos. La insignia aparece en tu perfil y en los resultados de búsqueda,
          dándote más visibilidad. Recordá: la insignia respalda la verificación de identidad y documentos; no
          garantiza el resultado de ningún trabajo.
        </Banner>
      )}
      {status === "pending" && (
        <Banner tone="gray" icon={<Clock className="h-5 w-5" />} title="Verificación pendiente">
          Tu perfil está en cola de revisión. Tu cuenta ya está activa y podés recibir clientes mientras tanto. Te
          avisaremos por correo y aquí cuando tengamos una decisión.
        </Banner>
      )}
      {status === "under_appeal" && (
        <Banner tone="amber" icon={<Clock className="h-5 w-5" />} title="Apelación en revisión">
          Recibimos tu apelación y la estamos revisando. Te notificaremos el resultado por correo y en tu panel.
        </Banner>
      )}
      {status === "rejected" && (
        <Banner tone="red" icon={<XCircle className="h-5 w-5" />} title="Tu verificación no fue aprobada">
          {reason ? (
            <>
              <span className="block">Motivo: <strong>{reason}</strong></span>
            </>
          ) : (
            "No se especificó un motivo."
          )}
          <span className="block mt-1">Tu cuenta sigue activa. Corregí lo indicado y apelá para una nueva revisión.</span>
        </Banner>
      )}

      <p className="text-sm text-[#6b7280]">
        ¿Querés saber cómo funciona?{" "}
        <Link href="/proveedores-autorizados" className="text-[#009FD9] font-medium hover:underline">
          ¿Qué es un Proveedor Autorizado?
        </Link>
      </p>

      {/* Appeal flow — only when rejected */}
      {status === "rejected" && !sent && (
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
          <h3 className="font-semibold text-[#111827] text-sm mb-1">Apelar esta decisión</h3>
          <p className="text-xs text-[#6b7280] mb-3">
            Esta es la vía principal y queda registrada en tu caso. También podés escribirnos por WhatsApp.
          </p>
          {error && (
            <div className="flex items-center gap-2 p-2.5 mb-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}
          <textarea
            value={appeal}
            onChange={(e) => setAppeal(e.target.value)}
            rows={4}
            placeholder="Explicá qué corregiste o por qué deberíamos revisar de nuevo…"
            className="w-full rounded-lg border border-[#e5e7eb] p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
          />
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={submitAppeal}
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold px-4 py-2.5 disabled:opacity-60"
            >
              <Send className="h-4 w-4" /> {sending ? "Enviando…" : "Enviar apelación"}
            </button>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#1eb456] text-white text-sm font-bold px-4 py-2.5"
            >
              <WhatsAppIcon className="h-4 w-4" /> Apelar por WhatsApp
            </a>
          </div>
        </div>
      )}

      {sent && (
        <Banner tone="green" icon={<CheckCircle2 className="h-5 w-5" />} title="Apelación enviada">
          Recibimos tu apelación. Nuestro equipo la revisará y te avisaremos el resultado.
        </Banner>
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
