"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ContactSegment } from "@/lib/analytics/contact-segments";
import { Link } from "@/i18n/navigation";
import { ExternalLink, Loader2, MessageCircle, Phone, Mail } from "lucide-react";
import { useAdminAutoRefresh } from "@/hooks/use-admin-auto-refresh";

/**
 * A quién están contactando, y a quién no.
 *
 * Es la medida de si la plataforma le entrega trabajo a la oferta. Sale de los
 * eventos que ya se registraban desde julio, así que trae historial de verdad,
 * no desde que se hizo esta pantalla.
 *
 * Una ráfaga del mismo visitante cuenta UNA vez: once toques en un minuto no
 * son once clientes, y esa confusión ya nos hizo leer mal el embudo una vez.
 */
type Profesional = {
  id: string;
  nombre: string;
  slug: string | null;
  contactos: number;
  vistas: number;
  ultimo: string;
  canales: Record<string, number>;
  conCuenta: number;
};

type Respuesta = { dias: number | "all"; total: number; totalVistas: number; profesionales: Profesional[] };

const PERIODOS = [7, 30, "all"] as const;

function fecha(valor: string) {
  return new Date(valor).toLocaleDateString("es-CR", { day: "numeric", month: "short" });
}

export function AdminContactos() {
  const [segmento, setSegmento] = useState<ContactSegment>("services");
  const [dias, setDias] = useState<number | "all">(30);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const requestVersion = useRef(0);
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const token = ++requestVersion.current;
    try {
      const respuesta = await fetch(`/api/admin/contactos?dias=${dias}&segmento=${segmento}`, { cache: "no-store" });
      if (!respuesta.ok) throw new Error("contacts-unavailable");
      const next = await respuesta.json() as Respuesta;
      if (!Array.isArray(next.profesionales) || typeof next.total !== "number") throw new Error("invalid-contacts");
      if (token === requestVersion.current) {setDatos(next);setError(false);}
    } catch {
      if (token === requestVersion.current) setError(true);
    } finally {
      if (token === requestVersion.current) setCargando(false);
    }
  }, [dias, segmento]);

  const invalidateRequests = useCallback(() => { requestVersion.current++; }, []);
  useEffect(() => {
    let canceled = false;
    queueMicrotask(() => { if (!canceled) void cargar(); });
    return () => { canceled = true; invalidateRequests(); };
  }, [cargar, invalidateRequests]);
  useAdminAutoRefresh(cargar);

  if (cargando && !datos) {
    return <div className="grid min-h-[16rem] place-items-center text-[#64748b]"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-extrabold text-[#0f172a]">Contactos por actividad</h1>
        <p className="mt-1 text-sm text-[#64748b]">
          Cuánta gente está contactando profesionales, y a quiénes. Una misma cuenta o identificador de visita cuenta una vez por destinatario. Un clic no demuestra una contratación.
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5" aria-label="Tipo de contacto">
        {([['services','Servicios'],['jobs','Empleos'],['unknown','Sin clasificar']] as const).map(([key,label]) => <button key={key} type="button" aria-pressed={segmento === key} onClick={() => {setSegmento(key);setDatos(null);setCargando(true);}} className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold ${segmento === key ? 'bg-[#0f172a] text-white' : 'bg-[#eef2f6] text-[#475569]'}`}>{label}</button>)}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PERIODOS.map((periodo) => (
          <button
            key={periodo}
            type="button"
            onClick={() => { setDias(periodo); setCargando(true); }}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors ${
              periodo === dias ? "bg-[#0f172a] text-white" : "bg-[#eef2f6] text-[#475569] hover:bg-[#e2e8f0]"
            }`}
          >
            {periodo === "all" ? "Desde el inicio" : `${periodo} días`}
          </button>
        ))}
      </div>

      {error && <div role="alert" className="rounded-xl border border-[#e5e7eb] p-4 text-sm"><p>No se pudieron cargar los contactos.</p><button type="button" className="mt-2 font-bold text-[#008ce0]" onClick={() => {setCargando(true);void cargar();}}>Reintentar</button></div>}
      {datos && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { rotulo: "Contactos", valor: datos.total },
            { rotulo: segmento === "jobs" ? "Visitas a empleos" : "Visitas a fichas", valor: datos.totalVistas },
            { rotulo: "Destinatarios", valor: datos.profesionales.length },
          ].map((dato) => (
            <div key={dato.rotulo} className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#94a3b8]">{dato.rotulo}</p>
              <p className="mt-1 text-2xl font-extrabold text-[#0f172a]">{dato.valor}</p>
            </div>
          ))}
        </div>
      )}

      {datos && datos.profesionales.length === 0 ? (
        <p className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-8 text-center text-sm text-[#64748b]">
          Nadie contactó a un profesional en este período.
        </p>
      ) : (
        <ul className="space-y-2">
          {datos?.profesionales.map((pro) => (
            <li key={pro.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eff6ff] text-[13px] font-extrabold text-[#1d4ed8]">
                {pro.contactos}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-[#0f172a]">{pro.nombre}</p>
                <p className="mt-0.5 text-[12px] text-[#64748b]">
                  {pro.vistas} visitas · último {fecha(pro.ultimo)}
                  {pro.conCuenta > 0 ? ` · ${pro.conCuenta} con cuenta` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-[12px] font-semibold text-[#475569]">
                {pro.canales.whatsapp ? <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{pro.canales.whatsapp}</span> : null}
                {pro.canales.telefono ? <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{pro.canales.telefono}</span> : null}
                {pro.canales.correo ? <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{pro.canales.correo}</span> : null}
                {pro.slug && (
                  <Link href={`/profesionales/${pro.slug}`} className="inline-flex items-center gap-1 text-[#0b7fe8] hover:underline">
                    <ExternalLink className="h-3.5 w-3.5" />Ficha
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
