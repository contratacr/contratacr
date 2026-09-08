"use client";

import { useEffect, useState } from "react";
import { Megaphone, Send, Loader2 } from "lucide-react";
import { useAppDialog } from "@/hooks/use-app-dialog";

/** Plantillas de temporada: el texto se puede editar antes de enviar. */
const PLANTILLAS = [
  {
    id: "lluvias",
    nombre: "Antes de las lluvias",
    subject: "Antes de que llueva fuerte: revisa canoas, techo y electricidad",
    body: "Hola,\n\nSe viene la época de lluvias y es el mejor momento para adelantarse: limpiar canoas, revisar goteras en el techo y asegurarse de que la instalación eléctrica esté en orden.\n\nEn ContrataCR encuentras profesionales verificados con cédula, con reseñas y contacto directo por WhatsApp. Elige el tuyo o publica lo que necesitas y recibe hasta 3 cotizaciones sin compromiso.",
    ctaLabel: "Ver profesionales",
    ctaPath: "/es/servicios/electricidad",
  },
  {
    id: "fin-de-ano",
    nombre: "Fin de año",
    subject: "Deja la casa lista para diciembre",
    body: "Hola,\n\nDiciembre llega con visitas, reuniones y poco tiempo. Pintura, limpieza profunda, jardinería o esa reparación pendiente: en ContrataCR lo resuelves con profesionales verificados de tu zona.\n\nPublica lo que necesitas y recibe hasta 3 cotizaciones sin compromiso.",
    ctaLabel: "Publicar lo que necesito",
    ctaPath: "/es/dashboard/profesional?tab=sent_projects&openPublish=1",
  },
  {
    id: "verano",
    nombre: "Verano",
    subject: "Verano: aire acondicionado, piscina y pintura exterior",
    body: "Hola,\n\nCon el calor llegan los mantenimientos de verano: aire acondicionado, limpieza de piscina y pintura exterior. En ContrataCR encuentras profesionales verificados con cédula y reseñas reales.\n\nElige el tuyo o cuéntanos qué necesitas y recibe hasta 3 cotizaciones.",
    ctaLabel: "Ver profesionales",
    ctaPath: "/es/servicios/aire_acondicionado",
  },
];

export function AdminCampaigns() {
  const { dialogNode, showMessage, confirm } = useAppDialog();
  const [clientes, setClientes] = useState<number | null>(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [plantilla, setPlantilla] = useState(PLANTILLAS[0]);
  const [subject, setSubject] = useState(PLANTILLAS[0].subject);
  const [body, setBody] = useState(PLANTILLAS[0].body);
  const [ctaLabel, setCtaLabel] = useState(PLANTILLAS[0].ctaLabel);
  const [ctaPath, setCtaPath] = useState(PLANTILLAS[0].ctaPath);
  const [enviando, setEnviando] = useState<"test" | "all" | "precios" | null>(null);
  const [sinPrecio, setSinPrecio] = useState<number | null>(null);

  useEffect(() => {
    void fetch("/api/admin/campanas").then((r) => r.json()).then((d) => { setClientes(Number(d.clients ?? 0)); setAdminEmail(String(d.adminEmail ?? "")); }).catch(() => setClientes(0));
    void fetch("/api/admin/campanas/precios").then((r) => r.json()).then((d) => setSinPrecio(Number(d.sinPrecio ?? 0))).catch(() => setSinPrecio(0));
  }, []);

  function usarPlantilla(id: string) {
    const p = PLANTILLAS.find((x) => x.id === id) ?? PLANTILLAS[0];
    setPlantilla(p); setSubject(p.subject); setBody(p.body); setCtaLabel(p.ctaLabel); setCtaPath(p.ctaPath);
  }

  async function enviar(mode: "test" | "all") {
    if (mode === "all") {
      const { confirmed, value } = await confirm({
        title: `¿Enviar a ${clientes ?? 0} clientes?`,
        description: "Se envía de inmediato a todas las cuentas de cliente activas con correo. No se puede deshacer.",
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
      else await showMessage({ title: "Campaña enviada", description: `Enviados ${d.sent} · fallidos ${d.failed} · omitidos ${d.skipped} de ${d.total}.`, tone: "success" });
    } finally {
      setEnviando(null);
    }
  }

  async function avisarPrecios() {
    const { confirmed } = await confirm({
      title: `¿Avisar a ${sinPrecio ?? 0} profesionales sin precio?`,
      description: "Reciben un aviso en el app (y push) que los lleva a poner su precio de entrada. A quien ya se le avisó en los últimos 30 días no se le repite.",
      confirmLabel: "Enviar avisos",
    });
    if (!confirmed) return;
    setEnviando("precios");
    try {
      const res = await fetch("/api/admin/campanas/precios", { method: "POST" });
      const d = await res.json();
      if (!res.ok) { await showMessage({ title: "No se pudo enviar", description: d.error ?? "Intenta de nuevo.", tone: "danger" }); return; }
      await showMessage({ title: "Avisos enviados", description: `Enviados ${d.enviados} · ya avisados ${d.omitidos} · fallidos ${d.fallidos} de ${d.total}.`, tone: "success" });
    } finally { setEnviando(null); }
  }

  const campo = "w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5 text-sm text-[#162543] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009FD9]";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-[#162543]"><Megaphone className="h-6 w-6 text-[#009FD9]" />Campañas por correo</h1>
        <p className="mt-1 text-sm text-[#68778d]">Avisos de temporada a los clientes registrados. {clientes === null ? "Contando…" : `${clientes} clientes con correo.`}</p>
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
            <button type="button" disabled={!!enviando} onClick={() => void enviar("test")} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border-[1.5px] border-[#009FD9] bg-white px-5 text-sm font-bold text-[#009FD9] transition hover:bg-[#EBF5FB] disabled:opacity-60">
              {enviando === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviarme una prueba{adminEmail ? ` (${adminEmail})` : ""}
            </button>
            <button type="button" disabled={!!enviando || !clientes} onClick={() => void enviar("all")} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#009FD9] px-5 text-sm font-bold text-white transition hover:bg-[#0089bb] disabled:opacity-60">
              {enviando === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}Enviar a {clientes ?? 0} clientes
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-[#e5e7eb] bg-[#f4f7fa] p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[#68778d]">Vista previa</p>
          <div className="rounded-xl border border-[#e5eaf0] bg-white p-4">
            <p className="text-[15px] font-extrabold text-[#162543]">{subject || "—"}</p>
            <div className="mt-3 space-y-3 text-[14px] leading-6 text-[#162543]">
              {body.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
            </div>
            {ctaLabel && ctaPath && <span className="mt-4 inline-flex h-10 items-center rounded-full bg-[#009FD9] px-5 text-sm font-bold text-white">{ctaLabel}</span>}
            <p className="mt-5 text-[11px] leading-5 text-[#68778d]">Recibes este correo porque tienes una cuenta en ContrataCR. Si no quieres recibir avisos de temporada, responde con la palabra BAJA.</p>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
        <h2 className="text-lg font-extrabold text-[#162543]">Profesionales sin precio</h2>
        <p className="mt-1 text-sm text-[#68778d]">{sinPrecio === null ? "Contando…" : `${sinPrecio} profesionales no publican ningún precio.`} Un aviso en el app los lleva directo a poner su precio de entrada.</p>
        <button type="button" disabled={!!enviando || !sinPrecio} onClick={() => void avisarPrecios()} className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-full border-[1.5px] border-[#009FD9] bg-white px-5 text-sm font-bold text-[#009FD9] transition hover:bg-[#EBF5FB] disabled:opacity-60">
          {enviando === "precios" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Avisar a {sinPrecio ?? 0} profesionales
        </button>
      </div>
      {dialogNode}
    </div>
  );
}
