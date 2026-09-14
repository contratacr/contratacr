"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, Loader2, Mail, MessageCircle, Phone } from "lucide-react";
import { useAdminAutoRefresh } from "@/hooks/use-admin-auto-refresh";

/**
 * Lo que está detenido y a quién le toca moverlo.
 *
 * Es la misma lista que mira el envío de recordatorios, con dos datos más que
 * solo sirven para decidir si hay que escribirle a alguien a mano: si el app ya
 * avisó (y si esa persona abrió el aviso) y si las dos partes ya se hablaron.
 * Nada aquí escribe: es una pantalla para decidir.
 */
type Pendiente = {
  tipo: string;
  titulo: string;
  detalle: string;
  dias: number;
  referencia: string;
  enlace: string | null;
  persona: { id: string; nombre: string | null; email: string | null; telefono: string | null };
  avisado: { cuando: string; leido: boolean; hito: number } | null;
  huboContacto: boolean;
};

const NOMBRE_DEL_TIPO: Record<string, string> = {
  project_proposals_waiting: "Propuestas sin revisar",
  booking_pending_reminder: "Solicitudes sin responder",
  project_in_progress_idle: "Proyecto detenido",
  project_confirmation_pending: "Falta confirmar el trabajo",
  booking_past_date_idle: "Cita sin cerrar",
  job_applications_waiting: "Postulaciones sin revisar",
  quote_awaiting_client: "Cotización sin responder",
};

function fecha(valor: string) {
  return new Date(valor).toLocaleString("es-CR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function AdminPendientes() {
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const respuesta = await fetch("/api/admin/pendientes", { cache: "no-store" });
      const datos = await respuesta.json().catch(() => ({}));
      setPendientes(Array.isArray(datos.pendientes) ? datos.pendientes : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);
  useAdminAutoRefresh(cargar);

  if (loading) {
    return (
      <div className="grid min-h-[16rem] place-items-center text-[#68778d]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-extrabold text-[#0f172a]">Pendientes</h1>
        <p className="mt-1 text-sm text-[#64748b]">
          Lo que lleva días detenido, con lo que hace falta para decidir si escribirle a alguien.
          Es la misma lista que dispara los recordatorios automáticos.
        </p>
      </header>

      {pendientes.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-[#d8e6d8] bg-[#f4fbf4] px-4 py-6 text-sm font-semibold text-[#2f6b39]">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          Nada detenido: todo lo abierto tiene menos de tres días.
        </div>
      ) : (
        <ul className="space-y-3">
          {pendientes.map((p) => (
            <li key={`${p.tipo}-${p.referencia}-${p.persona.id}`} className="rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[13px] font-extrabold text-[#0f172a]">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[#d97706]" />
                    {NOMBRE_DEL_TIPO[p.tipo] ?? p.tipo}
                  </p>
                  <p className="mt-1 text-sm text-[#334155]">{p.detalle}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#fff4e5] px-2.5 py-1 text-xs font-extrabold text-[#b45309]">
                  <Clock3 className="h-3.5 w-3.5" />{p.dias} días
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#eef2f6] pt-3 text-[13px]">
                <span className="font-bold text-[#0f172a]">{p.persona.nombre ?? "Sin nombre"}</span>
                {p.persona.email && (
                  <a href={`mailto:${p.persona.email}`} className="inline-flex items-center gap-1.5 font-semibold text-[#0b7fe8] hover:underline">
                    <Mail className="h-3.5 w-3.5" />{p.persona.email}
                  </a>
                )}
                {p.persona.telefono && (
                  <a
                    href={`https://wa.me/${p.persona.telefono.replace(/[^0-9]/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-semibold text-[#128c4a] hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" />WhatsApp
                  </a>
                )}
                {p.enlace && (
                  <a href={p.enlace} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-[#475569] hover:underline">
                    <ExternalLink className="h-3.5 w-3.5" />Ver en el app
                  </a>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-[12px] font-bold">
                {p.avisado ? (
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${p.avisado.leido ? "bg-[#eef7ee] text-[#2f6b39]" : "bg-[#eef3f8] text-[#475569]"}`}>
                    {p.avisado.leido ? "Avisado y leído" : "Avisado, sin abrir"} · {fecha(p.avisado.cuando)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fdeeee] px-2.5 py-1 text-[#b4232a]">
                    Todavía sin avisar
                  </span>
                )}
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${p.huboContacto ? "bg-[#eef7ee] text-[#2f6b39]" : "bg-[#eef3f8] text-[#475569]"}`}>
                  <MessageCircle className="h-3.5 w-3.5" />
                  {p.huboContacto ? "Ya se escribieron por el app" : "Sin mensajes entre las partes"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
