"use client";

import { useEffect, useState } from "react";
import { Megaphone, Send, Loader2, Star, History } from "lucide-react";
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
// La plantilla anterior («¿Necesitas un electricista?», colgada de que
// empezaban las lluvias) se retiró por dos motivos que se discutieron con
// Isaac y que valen para cualquier campaña futura:
//
//  · El motivo era INVENTADO. Aquí llueve medio año y nadie piensa «está
//    lloviendo, voy a buscar un electricista»; cuando se va la luz es del ICE.
//  · El asunto era una pregunta de sí o no, y quien contesta «no» —casi
//    todos— borra el correo sin abrirlo.
//
// Esta dice algo CIERTO que el destinatario no sabe: que esto no es un solo
// oficio. Mucha gente se registró por una cosa puntual y no tiene idea de la
// amplitud. Las cifras salen de producción (288 profesionales, 263
// verificados contra el padrón) y hay que revisarlas antes de mandar.
const PLANTILLAS = [
  {
    id: "recordatorio",
    nombre: "Recordatorio de lo que hay",
    subject: "263 profesionales verificados, en un solo lugar",
    body: "Hola,\n\nPor si no lo tenías presente: en ContrataCR hay electricistas, construcción, remodelación, abogados, mecánicos, contadores, desarrollo web y bastante más.\n\nTodos con identidad verificada contra el padrón, con reseñas, y les escribís por WhatsApp directo — sin formularios ni esperas.",
    ctaLabel: "Ver todos los servicios",
    ctaPath: "/es/servicios",
  },
];

export function AdminCampaigns() {
  const { dialogNode, showMessage, confirm } = useAppDialog();
  const [clientes, setClientes] = useState<number | null>(null);
  // Cuántos faltan de ESTA campaña y cuándo se puede mandar la próxima tanda.
  const [tanda, setTanda] = useState({ porTanda: 200, enviados: 0, restantes: 0, horasParaLaProxima: 0, abiertos: 0, clics: 0, rebotes: 0, midiendo: false });
  const [adminEmail, setAdminEmail] = useState("");
  // Cuánto correo queda HOY. Los 300 diarios del plan gratuito los comparten
  // esta campaña con los correos que el app necesita mandar (crear cuenta,
  // recuperar contraseña, soporte). Este número es el que dice si vale la pena
  // pagar el plan o esperar a mañana.
  const [cuota, setCuota] = useState<{ enviados: number; tope: number; restantes: number; margenMasivo: number } | null>(null);
  const [resena, setResena] = useState<{ cuentas: number; yaTenian: number } | null>(null);
  const [invitando, setInvitando] = useState(false);
  const [rescatando, setRescatando] = useState(false);
  const [rescate, setRescate] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/invitar-resena")
      .then((r) => r.json())
      .then((d) => setResena({ cuentas: Number(d.cuentas ?? 0), yaTenian: Number(d.yaTienen ?? 0) }))
      .catch(() => setResena(null));
  }, []);

  async function invitarResenas() {
    setInvitando(true);
    try {
      const r = await fetch("/api/admin/invitar-resena", { method: "POST" });
      const d = await r.json();
      await showMessage({
        title: r.ok ? "Aviso enviado" : "No se pudo enviar",
        description: r.ok ? `Le llegó a ${d.enviadas} cuenta(s). ${d.yaTenian} ya lo tenían.` : String(d.error ?? ""),
        tone: r.ok ? "success" : "danger",
      });
      setResena({ cuentas: Number(d.cuentas ?? 0), yaTenian: Number(d.yaTenian ?? 0) + Number(d.enviadas ?? 0) });
    } finally {
      setInvitando(false);
    }
  }
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
        abiertos: Number(d.abiertos ?? 0),
        clics: Number(d.clics ?? 0),
        rebotes: Number(d.rebotes ?? 0),
        midiendo: Boolean(d.midiendo),
      });
    } catch { setClientes(0); }
    try {
      const c = await (await fetch("/api/admin/correo")).json();
      if (typeof c?.enviados === "number") {
        setCuota({
          enviados: c.enviados,
          tope: c.tope,
          restantes: c.restantes,
          margenMasivo: c.margenPorNivel?.masivo ?? 0,
        });
      }
    } catch { /* el contador es informativo: si falla, la pantalla sigue */ }
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

      {cuota && (
        <div className={`rounded-2xl border p-4 ${cuota.margenMasivo > 0 ? "border-[#d7e1ea] bg-white" : "border-amber-200 bg-amber-50"}`}>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#8a94a6]">Correo de hoy</p>
          <p className="mt-1 text-[15px] font-bold text-[#162543]">
            {cuota.enviados} de {cuota.tope} enviados · quedan {cuota.margenMasivo} para campañas
          </p>
          <p className="mt-1 text-[13px] leading-snug text-[#68778d]">
            {cuota.margenMasivo > 0
              ? `Los ${cuota.tope} del día se comparten con los correos que el app necesita mandar. Una campaña deja de salir cuando quedan 100 libres, para que nadie se quede sin su código de cuenta ni sin respuesta de soporte.`
              : `Hoy ya no salen campañas: quedan ${cuota.restantes} correos y están reservados para crear cuentas, recuperar contraseñas y soporte. Vuelve mañana o sube de plan.`}
          </p>
        </div>
      )}

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

          {/* «Se enviaron 200» es trabajo hecho, no resultado. Lo que decide si
              vale la pena mandar la siguiente es cuántos la abrieron y cuántos
              tocaron el botón. */}
          {tanda.enviados > 0 && (
            <div className="mt-5 border-t border-[#e5e7eb] pt-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[#68778d]">Resultado de esta campaña</p>
              {tanda.midiendo ? (
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { etiqueta: "Enviados", valor: tanda.enviados, de: null },
                    { etiqueta: "La abrieron", valor: tanda.abiertos, de: tanda.enviados },
                    { etiqueta: "Tocaron el botón", valor: tanda.clics, de: tanda.enviados },
                    { etiqueta: "No llegaron", valor: tanda.rebotes, de: tanda.enviados },
                  ].map((m) => (
                    <div key={m.etiqueta} className="rounded-xl bg-[#f4f7fa] px-4 py-3">
                      <dt className="text-[12px] font-bold uppercase tracking-wide text-[#68778d]">{m.etiqueta}</dt>
                      <dd className="mt-1 text-[19px] font-extrabold text-[#162543]">{m.valor}</dd>
                      {m.de ? <dd className="text-[12px] font-semibold text-[#007fae]">{Math.round((m.valor / m.de) * 100)}% de {m.de}</dd> : null}
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-[13px] leading-6 text-[#52627a]">
                  Salieron {tanda.enviados} correos. Todavía no se sabe cuántos los abrieron: falta conectar el aviso de Brevo
                  (webhook a <span className="font-semibold">/api/webhooks/brevo</span> con la clave del entorno).
                </p>
              )}

              {/* Las tandas que salieron antes del webhook no están perdidas:
                  Brevo guarda 30 días de eventos con el asunto, y el asunto es
                  de donde sale el nombre de la campaña. */}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={rescatando}
                  onClick={async () => {
                    setRescatando(true);
                    setRescate(null);
                    try {
                      const r = await (await fetch("/api/admin/campanas/recuperar", { method: "POST" })).json();
                      setRescate(r.error ? `No se pudo: ${r.error}` : `Se revisaron ${r.revisados} eventos y se anotaron ${r.anotados}.`);
                      await cargarEstado();
                    } catch { setRescate("No se pudo consultar a Brevo."); }
                    setRescatando(false);
                  }}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#d7e1ea] bg-white px-4 text-[13px] font-bold text-[#162543] transition hover:border-[#b9c8d6] hover:bg-[#f6f9fb] disabled:opacity-60"
                >
                  {rescatando ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
                  Traer resultados de lo ya enviado
                </button>
                {rescate && <span className="text-[12px] font-semibold text-[#52627a]">{rescate}</span>}
              </div>
            </div>
          )}
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

      {/* LA INVITACIÓN A RESEÑAR EN GOOGLE. Va al FINAL y separada por una
          línea, no entre las tarjetas de correo: no es una campaña ni gasta
          cupo: es un aviso de la campanita. Metida arriba se leía como otro
          bloque de correo y no se entendía de qué era. */}
      <div className="border-t border-[#e5e7eb] pt-6">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#162543]">
          <Star className="h-5 w-5 text-[#009FD9]" />Pedir reseñas en Google
        </h2>
        <p className="mt-1 text-sm text-[#68778d]">
          Un aviso en la campanita del app, no un correo: no gasta del cupo diario. Invita a dejar una reseña del negocio en Google.
        </p>
        <div className="mt-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
          <p className="text-[15px] font-bold text-[#162543]">
            {resena
              ? resena.yaTenian >= resena.cuentas
                ? `Ya lo tienen las ${resena.cuentas} cuentas`
                : `Le falta a ${resena.cuentas - resena.yaTenian} de ${resena.cuentas} cuentas`
              : "Cargando…"}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-[#68778d]">
            Quien ya lo recibió no lo vuelve a recibir, así que se puede pulsar cuantas veces haga falta: sirve para alcanzar a quien se registró después. A las cuentas nuevas les llega solo.
          </p>
          <button
            type="button"
            disabled={invitando || (!!resena && resena.yaTenian >= resena.cuentas)}
            onClick={() => void invitarResenas()}
            className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-[#009FD9] px-4 text-sm font-bold text-white hover:bg-[#0089bb] disabled:opacity-60"
          >
            {invitando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
            {invitando
              ? "Enviando…"
              : resena && resena.yaTenian >= resena.cuentas
                ? "Ya lo tienen todas"
                : `Pedir reseña a ${resena ? resena.cuentas - resena.yaTenian : ""} cuenta(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
