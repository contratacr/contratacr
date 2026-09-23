"use client";

import { useEffect, useState } from "react";
import { Megaphone, Send, Loader2 } from "lucide-react";
import { useAppDialog } from "@/hooks/use-app-dialog";

/**
 * UNA sola plantilla, la de la temporada que corre, y con el camino MÁS CORTO.
 *
 * Antes el botón decía «Publicar lo que necesito» y llevaba al formulario de
 * proyecto: exige sesión, cuatro campos y un WhatsApp. Es el camino de más
 * fricción del app, y a un correo se llega de paso, con poca paciencia. Buscar
 * no pide nada: se abre la lista de electricistas verificados de la zona y cada
 * tarjeta ya trae su botón de WhatsApp. Del correo a la conversación, dos toques.
 *
 * Y se aterriza en ELECTRICIDAD porque es donde hay oferta de verdad (45
 * profesionales, contra 8 en techos y 6 en impermeabilización): mandar a un
 * oficio vacío es peor que no mandar el correo. Publicar queda mencionado para
 * quien prefiera que lo busquen a él.
 */
const PLANTILLAS = [
  {
    id: "lluvias",
    nombre: "Antes de las lluvias fuertes",
    subject: "¿Necesitas un electricista?",
    body: "Hola,\n\nYa empezaron los meses más lluviosos del año.\n\nSi necesitas un electricista, en ContrataCR están los de tu zona: verificados, con reseñas y su WhatsApp a mano.",
    ctaLabel: "Ver electricistas cerca de mí",
    ctaPath: "/es/buscar?categoria=electricidad",
  },
];

export function AdminCampaigns() {
  const { dialogNode, showMessage, confirm } = useAppDialog();
  const [clientes, setClientes] = useState<number | null>(null);
  // Cuántos faltan de ESTA campaña y cuándo se puede mandar la próxima tanda.
  const [tanda, setTanda] = useState({ porTanda: 200, enviados: 0, restantes: 0, horasParaLaProxima: 0 });
  const [adminEmail, setAdminEmail] = useState("");
  const [plantilla, setPlantilla] = useState(PLANTILLAS[0]);
  const [subject, setSubject] = useState(PLANTILLAS[0].subject);
  const [body, setBody] = useState(PLANTILLAS[0].body);
  const [ctaLabel, setCtaLabel] = useState(PLANTILLAS[0].ctaLabel);
  const [ctaPath, setCtaPath] = useState(PLANTILLAS[0].ctaPath);
  const [enviando, setEnviando] = useState<"test" | "all" | null>(null);

  async function cargarEstado() {
    try {
      const d = await (await fetch(`/api/admin/campanas?asunto=${encodeURIComponent(subject)}`)).json();
      setClientes(Number(d.clients ?? 0));
      setAdminEmail(String(d.adminEmail ?? ""));
      setTanda({
        porTanda: Number(d.porTanda ?? 200),
        enviados: Number(d.enviados ?? 0),
        restantes: Number(d.restantes ?? d.clients ?? 0),
        horasParaLaProxima: Number(d.horasParaLaProxima ?? 0),
      });
    } catch { setClientes(0); }
  }
  // El estado se pide en el cuadro siguiente: llamarlo derecho dentro del
  // efecto encadena renders (lo marca el linter), y aquí no corre prisa.
  useEffect(() => {
    const id = requestAnimationFrame(() => { void cargarEstado(); });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);



  function usarPlantilla(id: string) {
    const p = PLANTILLAS.find((x) => x.id === id) ?? PLANTILLAS[0];
    setPlantilla(p); setSubject(p.subject); setBody(p.body); setCtaLabel(p.ctaLabel); setCtaPath(p.ctaPath);
  }

  async function enviar(mode: "test" | "all") {
    if (mode === "all") {
      const { confirmed, value } = await confirm({
        title: `¿Enviar a ${Math.min(tanda.porTanda, tanda.restantes)} cuentas?`,
        description: `Sale ahora a las primeras ${tanda.porTanda} que faltan (quedan ${tanda.restantes} de ${clientes ?? 0}). El resto se manda mañana: el proveedor solo deja 300 correos por día y esos mismos los usa el soporte del app. No se puede deshacer.`,
        confirmLabel: "Enviar ahora",
        tone: "danger",
        input: { label: "Escribe ENVIAR para confirmar", placeholder: "ENVIAR" },
      });
      if (!confirmed || value !== "ENVIAR") return;
    }
    setEnviando(mode);
    try {
      const res = await fetch("/api/admin/campanas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, body, ctaLabel, ctaPath, mode, confirm: mode === "all" ? "ENVIAR" : undefined }) });
      const d = await res.json();
      if (!res.ok) { await showMessage({ title: "No se pudo enviar", description: d.error ?? "Intenta de nuevo.", tone: "danger" }); return; }
      if (mode === "test") await showMessage({ title: d.ok ? "Prueba enviada" : "La prueba no salió", description: d.ok ? `Revisa ${d.to}.` : String(d.detail ?? ""), tone: d.ok ? "success" : "danger" });
      else {
        await showMessage({
          title: d.completa ? "Campaña completa" : "Tanda enviada",
          description: `Enviados ${d.sent} · fallidos ${d.failed} · omitidos ${d.skipped}. ${d.completa ? "No queda nadie por recibirla." : `Quedan ${d.restantes}: la próxima tanda se puede mandar en 24 horas.`}`,
          tone: "success",
        });
        await cargarEstado();
      }
    } finally {
      setEnviando(null);
    }
  }

  const campo = "w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5 text-sm text-[#162543] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009FD9]";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-[#162543]"><Megaphone className="h-6 w-6 text-[#009FD9]" />Campañas por correo</h1>
        <p className="mt-1 text-sm text-[#68778d]">Avisos de temporada a todas las cuentas registradas, clientes y profesionales: un profesional también contrata. {clientes === null ? "Contando…" : `${clientes} cuentas con correo.`}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4 rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <div className="flex flex-wrap gap-2">
            {PLANTILLAS.map((p) => (
              <button key={p.id} type="button" onClick={() => usarPlantilla(p.id)} className={`inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-bold transition-colors ${plantilla.id === p.id ? "border-[#009FD9] bg-[#009FD9] text-white" : "border-[#d7e1ea] bg-white text-[#162543] hover:border-[#009FD9]"}`}>{p.nombre}</button>
            ))}
          </div>
          <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#68778d]">Asunto</span><input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} className={campo} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#68778d]">Texto (párrafos separados por una línea en blanco)</span><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} maxLength={4000} className={`${campo} resize-y`} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#68778d]">Botón</span><input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} maxLength={60} className={campo} /></label>
            <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#68778d]">Ruta del botón</span><input value={ctaPath} onChange={(e) => setCtaPath(e.target.value)} placeholder="/es/servicios/electricidad" className={campo} /></label>
          </div>
          <div className="flex flex-col gap-2 border-t border-[#eef2f6] pt-4 sm:flex-row">
            <button type="button" disabled={!!enviando} onClick={() => void enviar("test")} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#d7e1ea] bg-white px-5 text-sm font-bold text-[#162543] transition hover:border-[#b9c8d6] hover:bg-[#f6f9fb] disabled:opacity-60">
              {enviando === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviarme una prueba{adminEmail ? ` (${adminEmail})` : ""}
            </button>
            <button type="button" disabled={!!enviando || !clientes || tanda.restantes === 0 || tanda.horasParaLaProxima > 0} onClick={() => void enviar("all")} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#009FD9] px-5 text-sm font-bold text-white transition hover:bg-[#0089bb] disabled:opacity-60">
              {enviando === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}{tanda.horasParaLaProxima > 0 ? `Disponible en ${tanda.horasParaLaProxima} h` : tanda.restantes === 0 ? "Ya la recibieron todos" : `Enviar a ${Math.min(tanda.porTanda, tanda.restantes)} (quedan ${tanda.restantes})`}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-[#e5e7eb] bg-[#f4f7fa] p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[#68778d]">Vista previa</p>
          <div className="rounded-xl border border-[#e5e7eb] bg-white p-4">
            <p className="text-[15px] font-extrabold text-[#162543]">{subject || "—"}</p>
            <div className="mt-3 space-y-3 text-[14px] leading-6 text-[#162543]">
              {body.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
            </div>
            {ctaLabel && ctaPath && <span className="mt-4 inline-flex h-10 items-center rounded-full bg-[#009FD9] px-5 text-sm font-bold text-white">{ctaLabel}</span>}
            <p className="mt-5 text-[11px] leading-5 text-[#68778d]">Recibes este correo porque tienes una cuenta en ContrataCR. Si no quieres recibir avisos de temporada, responde con la palabra BAJA.</p>
          </div>
        </div>
      </div>
      {dialogNode}
    </div>
  );
}
