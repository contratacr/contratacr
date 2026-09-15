"use client";

import { useCallback, useEffect, useState } from "react";
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

type Respuesta = { dias: number; total: number; totalVistas: number; tasa: number; profesionales: Profesional[] };

const PERIODOS = [7, 30, 90, 365];

function fecha(valor: string) {
  return new Date(valor).toLocaleDateString("es-CR", { day: "numeric", month: "short" });
}

export function AdminContactos() {
  const [dias, setDias] = useState(30);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const respuesta = await fetch(`/api/admin/contactos?dias=${dias}`, { cache: "no-store" });
      setDatos(await respuesta.json());
    } finally {
      setCargando(false);
    }
  }, [dias]);

  useEffect(() => { void cargar(); }, [cargar]);
  useAdminAutoRefresh(cargar);

  if (cargando && !datos) {
    return <div className="grid min-h-[16rem] place-items-center text-[#64748b]"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-extrabold text-[#0f172a]">Contactos</h1>
        <p className="mt-1 text-sm text-[#64748b]">
          Cuánta gente está contactando profesionales, y a quiénes. Un mismo visitante cuenta una vez por profesional.
        </p>
      </header>

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
            {periodo === 365 ? "1 año" : `${periodo} días`}
          </button>
        ))}
      </div>

      {datos && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { rotulo: "Contactos", valor: datos.total },
            { rotulo: "Visitas a fichas", valor: datos.totalVistas },
            { rotulo: "Tasa de contacto", valor: `${datos.tasa}%` },
          ].map((dato) => (
            <div key={dato.rotulo} className="rounded-2xl border border-[#e2e8f0] bg-white p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#94a3b8]">{dato.rotulo}</p>
              <p className="mt-1 text-2xl font-extrabold text-[#0f172a]">{dato.valor}</p>
            </div>
          ))}
        </div>
      )}

      {datos && datos.profesionales.length === 0 ? (
        <p className="rounded-2xl border border-[#e2e8f0] bg-white px-4 py-8 text-center text-sm text-[#64748b]">
          Nadie contactó a un profesional en este período.
        </p>
      ) : (
        <ul className="space-y-2">
          {datos?.profesionales.map((pro) => (
            <li key={pro.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[#e2e8f0] bg-white px-4 py-3">
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
                  <Link href={`/profesionales/${pro.slug}`} target="_blank" className="inline-flex items-center gap-1 text-[#0b7fe8] hover:underline">
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
