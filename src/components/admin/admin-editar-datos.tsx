"use client";

import { useEffect, useState } from "react";
import { History, KeyRound, Loader2, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";

// «Editar datos» de la ficha de usuario del admin. Nombre, teléfonos y correo se
// cambian directo; la contraseña nunca: se le manda a la persona el correo de
// «olvidé mi contraseña». Todo queda en el historial de abajo (quién y cuándo).

type Datos = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
};
type DatosPro = {
  business_name: string | null;
  whatsapp: string | null;
  call_phone: string | null;
} | null;

type Entrada = {
  id: string;
  fecha: string;
  accion: string;
  quien: string;
  antes: Record<string, string | null>;
  despues: Record<string, string | null>;
  detalle: Record<string, unknown>;
};

const NOMBRES: Record<string, string> = {
  nombre: "Nombre",
  nombre_comercial: "Nombre comercial",
  whatsapp: "WhatsApp",
  telefono_llamadas: "Teléfono de llamadas",
  correo: "Correo",
};

function fecha(valor: string) {
  return new Date(valor).toLocaleString("es-CR", { dateStyle: "medium", timeStyle: "short" });
}

// Igual que en la ficha: los números de Costa Rica como 7000-9911.
function telefono(valor: string | null | undefined) {
  const d = String(valor ?? "").replace(/\D/g, "");
  const local = d.length === 11 && d.startsWith("506") ? d.slice(3) : d.length === 8 ? d : "";
  return local ? `${local.slice(0, 4)}-${local.slice(4)}` : valor || "—";
}

function valorDeCampo(campo: string, valor: string | null | undefined) {
  if (!valor) return "—";
  return campo === "whatsapp" || campo === "telefono_llamadas" ? telefono(valor) : valor;
}

function soloDigitos(valor: string | null | undefined) {
  const d = String(valor ?? "").replace(/\D/g, "");
  return d.length === 8 ? `506${d}` : d;
}

export function AdminEditarDatos({
  userId,
  perfil,
  pro,
  alGuardar,
}: {
  userId: string;
  perfil: Datos;
  pro: DatosPro;
  alGuardar: () => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [negocio, setNegocio] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [llamadas, setLlamadas] = useState("");
  const [correo, setCorreo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviandoEnlace, setEnviandoEnlace] = useState(false);
  const [historial, setHistorial] = useState<Entrada[] | null>(null);

  const waActual = soloDigitos(pro?.whatsapp || perfil.phone);

  function abrir() {
    setNombre(perfil.full_name ?? "");
    setNegocio(pro?.business_name ?? "");
    setWhatsapp(waActual);
    setLlamadas(soloDigitos(pro?.call_phone));
    setCorreo(perfil.email ?? "");
    setError(null);
    setAviso(null);
    setAbierto(true);
  }

  async function cargarHistorial() {
    const res = await fetch(`/api/admin/users/${userId}/datos`);
    const json = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(json.historial)) setHistorial(json.historial);
  }

  useEffect(() => {
    let vivo = true;
    fetch(`/api/admin/users/${userId}/datos`)
      .then((r) => r.json())
      .then((json) => { if (vivo && Array.isArray(json.historial)) setHistorial(json.historial); })
      .catch(() => undefined);
    return () => { vivo = false; };
  }, [userId]);

  async function guardar() {
    // Solo viaja lo que cambió; el servidor vuelve a comprobarlo.
    const cambios: Record<string, string> = {};
    if (nombre.trim() !== (perfil.full_name ?? "")) cambios.full_name = nombre;
    if (pro && negocio.trim() !== (pro.business_name ?? "")) cambios.business_name = negocio;
    if (soloDigitos(whatsapp) !== waActual) cambios.whatsapp = whatsapp;
    if (pro && soloDigitos(llamadas) !== soloDigitos(pro.call_phone)) cambios.call_phone = llamadas;
    if (correo.trim().toLowerCase() !== (perfil.email ?? "").toLowerCase()) cambios.email = correo;
    if (!Object.keys(cambios).length) { setAbierto(false); return; }

    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/datos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error ?? "No se pudieron guardar los datos.");
      const extra = [
        json.empleos ? `${json.empleos} empleo${json.empleos === 1 ? "" : "s"}` : "",
        json.promociones ? `${json.promociones} promoci${json.promociones === 1 ? "ón" : "ones"}` : "",
      ].filter(Boolean).join(" y ");
      setAviso(`Datos guardados.${extra ? ` El WhatsApp nuevo también quedó en ${extra}.` : ""}`);
      setAbierto(false);
      await Promise.all([alGuardar(), cargarHistorial()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar los datos.");
    } finally {
      setGuardando(false);
    }
  }

  async function mandarEnlace() {
    if (!perfil.email) return;
    if (!window.confirm(`Se le enviará a ${perfil.email} un correo para que elija una contraseña nueva. ¿Continuar?`)) return;
    setEnviandoEnlace(true);
    setError(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/datos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "enlace_contrasena" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error ?? "No se pudo mandar el enlace.");
      setAviso(`Enlace enviado a ${json.correo}.`);
      await cargarHistorial();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo mandar el enlace.");
    } finally {
      setEnviandoEnlace(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {!abierto && (
          <button type="button" onClick={abrir} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] px-3 py-2 text-xs font-semibold text-[#374151] hover:bg-[#f9fafb]">
            <Pencil className="h-3.5 w-3.5" /> Editar datos
          </button>
        )}
        {perfil.email && (
          <button type="button" onClick={() => void mandarEnlace()} disabled={enviandoEnlace} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] px-3 py-2 text-xs font-semibold text-[#374151] hover:bg-[#f9fafb] disabled:opacity-60">
            {enviandoEnlace ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />} Enviar enlace para cambiar contraseña
          </button>
        )}
      </div>

      {aviso && <p className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-xs font-medium text-[#15803d]" role="status">{aviso}</p>}
      {error && <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700" role="alert">{error}</p>}

      {abierto && (
        <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4" data-editar-datos>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
            <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            {pro && <Input label="Nombre comercial" value={negocio} onChange={(e) => setNegocio(e.target.value)} />}
            <PhoneInput id="admin-datos-whatsapp" label={pro ? "WhatsApp" : "Teléfono / WhatsApp"} value={whatsapp} onChange={setWhatsapp} />
            {pro && <PhoneInput id="admin-datos-llamadas" label="Teléfono para llamadas" optional value={llamadas} onChange={setLlamadas} />}
            <Input label="Correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
          </div>
          <p className="mt-3 text-xs text-[#68778d]">
            Si cambias el WhatsApp, también se cambia en sus empleos y promociones que tenían el número anterior, y en el teléfono de llamadas si era el mismo número. Con el correo nuevo la persona entra igual que antes, con su misma contraseña.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void guardar()} disabled={guardando} className="inline-flex items-center gap-1.5 rounded-lg bg-[#009FD9] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0089bb] disabled:opacity-60">
              {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar cambios
            </button>
            <button type="button" onClick={() => setAbierto(false)} disabled={guardando} className="rounded-lg border border-[#d7e1ea] bg-white px-4 py-2 text-xs font-semibold text-[#374151] hover:bg-[#f3f4f6]">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {historial && historial.length > 0 && (
        <details className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-xs text-[#374151]">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-[#162543]">
            <History className="h-3.5 w-3.5" /> Historial de cambios ({historial.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-2.5">
            {historial.map((h) => (
              <li key={h.id} className="border-t border-[#f1f5f9] pt-2.5 first:border-t-0 first:pt-0">
                <p className="text-[#68778d]">{fecha(h.fecha)} · {h.quien}</p>
                {h.accion === "admin_password_reset_link" ? (
                  <p className="mt-0.5">Envió el enlace para cambiar la contraseña a {String(h.despues.enlace_enviado_a ?? "su correo")}.</p>
                ) : (
                  Object.keys(h.despues).map((campo) => (
                    <p key={campo} className="mt-0.5 break-words">
                      <strong>{NOMBRES[campo] ?? campo}:</strong> {valorDeCampo(campo, h.antes[campo])} → {valorDeCampo(campo, h.despues[campo])}
                    </p>
                  ))
                )}
                {(Number(h.detalle.empleos_actualizados) > 0 || Number(h.detalle.promociones_actualizadas) > 0) && (
                  <p className="mt-0.5 text-[#68778d]">También en {Number(h.detalle.empleos_actualizados) || 0} empleo(s) y {Number(h.detalle.promociones_actualizadas) || 0} promoción(es).</p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
