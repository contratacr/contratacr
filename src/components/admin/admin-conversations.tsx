"use client";

import { useEffect, useRef, useState } from "react";

type Row = { id: string; client_name: string; professional_name: string; waiting_for: string; since: string; last_message_at: string };
type Message = { id: string; from_client: boolean; created_at: string; body: string | null; deleted: boolean; edited_at: string | null };
const fecha = (s: string) => new Date(s).toLocaleString("es-CR", { timeZone: "America/Costa_Rica" });
const control = "rounded-xl border border-slate-300 bg-white p-3 text-sm";

export function AdminConversations() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [side, setSide] = useState("all");
  const [hours, setHours] = useState("0");
  const [canReview, setCanReview] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkedAt,setCheckedAt]=useState<number|null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [ticket, setTicket] = useState("");
  const [caseType,setCaseType]=useState("support");
  const [reason, setReason] = useState("");
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [messageOffset, setMessageOffset] = useState(0);
  const [auditId, setAuditId] = useState("");
  const [accessHistory,setAccessHistory]=useState<Array<{id:string;actor_name:string;actor_id:string;accessed_at:string;reason:string;support_ticket_id:string|null;report_id:string|null;page_offset:number}>>([]);
  async function loadAccessHistory(){if(!selected)return;setReviewError("");try{const r=await fetch(`/api/admin/conversaciones?history=1&conversation=${selected.id}`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error);setAccessHistory(d.rows);}catch(e){setReviewError(e instanceof Error?e.message:"No se pudo consultar el registro.");}}
  const [reviewError, setReviewError] = useState("");
  const [busy, setBusy] = useState(false);
  const reviewRequest = useRef<AbortController | null>(null);
  function changingList(){setLoading(true);setRows([]);setError("");}

  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/admin/conversaciones?offset=${offset}&side=${side}&hours=${hours}`, { cache: "no-store", signal: abort.signal })
      .then(async r => { if (!r.ok) throw new Error("No se pudo cargar el seguimiento. Intenta de nuevo."); return r.json(); })
      .then(d => { setRows(d.rows); setTotal(d.total); setCanReview(d.canReview);setCheckedAt(Date.now());setError(""); })
      .catch(e => { if (!abort.signal.aborted) setError(e.message); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [offset, side, hours]);

  useEffect(() => () => reviewRequest.current?.abort(), []);
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search),conversation=params.get("conversation"),report=params.get("report");
    if(!conversation||!report)return;
    const abort=new AbortController();
    fetch(`/api/admin/conversaciones?conversation=${encodeURIComponent(conversation)}&report=${encodeURIComponent(report)}`,{cache:"no-store",signal:abort.signal})
      .then(async r=>{if(!r.ok)throw Error("No se pudo abrir el caso vinculado.");return r.json();})
      .then(d=>{setSelected(d);setCanReview(d.canReview);setCaseType("report");setTicket(report);})
      .catch(e=>{if(!abort.signal.aborted)setError(e.message);});
    return ()=>abort.abort();
  },[]);

  function closeReview() {
    reviewRequest.current?.abort(); setSelected(null); setMessages(null); setAuditId("");
    setReason(""); setTicket(""); setReviewError(""); setBusy(false); setMessageOffset(0);setAccessHistory([]);
  }
  async function openContent(nextOffset: number) {
    if (!selected) return;
    reviewRequest.current?.abort();
    const abort = new AbortController(); reviewRequest.current = abort;
    setBusy(true); setMessages(null); setReviewError(""); setAuditId("");
    try {
      const r = await fetch("/api/admin/conversaciones", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: abort.signal,
        body: JSON.stringify({ conversation: selected.id, ticket:caseType==="support"?ticket:null,report:caseType==="report"?ticket:null, reason, offset: nextOffset }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudo abrir la conversación.");
      if (!abort.signal.aborted) { setMessages(d.messages); setAuditId(d.auditId); setMessageOffset(nextOffset); }
    } catch (e) { if (!abort.signal.aborted) setReviewError(e instanceof Error ? e.message : "No se pudo abrir la conversación."); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }

  return <div className="space-y-4">
    <h1 className="text-xl font-extrabold">Conversaciones por responder</h1>
    <p className="text-sm text-slate-600">Chat interno entre cuentas registradas. Se muestra quién aún no envió un mensaje posterior, desde el primero del turno pendiente. Leer no equivale a responder; esto no demuestra incumplimiento. WhatsApp, llamadas y correo quedan fuera.</p>
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">Esperando al <select className={control} value={side} onChange={e => { changingList();setSide(e.target.value); setOffset(0); }}><option value="all">Cliente o profesional</option><option value="professional">Profesional</option><option value="client">Cliente</option></select></label>
      <label className="text-sm">Tiempo <select className={control} value={hours} onChange={e => { changingList();setHours(e.target.value); setOffset(0); }}><option value="0">Cualquiera</option><option value="24">Más de 24 horas</option><option value="48">Más de 48 horas</option></select></label>
    </div>
    {loading ? <p role="status">Cargando conversaciones…</p> : error ? <p role="alert">{error}</p> : <>
      <p className="text-sm">{total} conversaciones abiertas con un turno pendiente.</p>
      {rows.map(row => <article key={row.id} className="space-y-2 rounded-xl border border-slate-200 p-4">
        <p><strong>Profesional:</strong> {row.professional_name || "Cuenta sin nombre"}</p>
        <p><strong>Cliente:</strong> {row.client_name || "Cuenta sin nombre"}</p>
        <p className="text-sm">Espera respuesta del {row.waiting_for === "professional" ? "profesional" : "cliente"} desde {fecha(row.since)}{checkedAt!==null?` (${Math.max(0,Math.floor((checkedAt-Date.parse(row.since))/3600000))} h al consultar)`:""}.</p>
        {canReview && <button className={control} onClick={() => { closeReview(); setSelected(row); }}>Revisar por un caso de soporte</button>}
      </article>)}
      <div className="flex gap-3"><button className={control} disabled={offset === 0} onClick={() => {changingList();setOffset(offset-50);}}>Anterior</button><button className={control} disabled={offset+50 >= total} onClick={() => {changingList();setOffset(offset+50);}}>Siguiente</button></div>
    </>}
    {!canReview && <p className="text-sm text-slate-600">El contenido requiere un permiso de revisión adicional al rol administrador.</p>}
    {selected && <section role="region" aria-label="Revisión restringida" className="space-y-3 rounded-xl border-2 border-slate-400 p-4">
      <h2 className="font-bold">Revisión restringida · {selected.professional_name} / {selected.client_name}</h2>
      <p className="text-sm">Solo para atender soporte abierto de un participante o un reporte vinculado a esta conversación. Limita la consulta a lo necesario para ese caso. Cada página queda registrada con tu cuenta, fecha, caso y motivo. Los adjuntos quedan excluidos.</p>
      <label className="block text-sm">Tipo de caso <select className={control} disabled={busy} value={caseType} onChange={e=>{setCaseType(e.target.value);setMessages(null);}}><option value="support">Soporte de un participante</option><option value="report">Reporte de esta conversación</option></select></label>
      <label className="block text-sm">ID del caso <input className={`${control} block w-full`} disabled={busy} value={ticket} onChange={e => { setTicket(e.target.value); setMessages(null); }} autoComplete="off" /></label>
      <label className="block text-sm">Motivo de consulta <textarea className={`${control} block w-full`} disabled={busy} value={reason} minLength={15} maxLength={500} onChange={e => { setReason(e.target.value); setMessages(null); }} /></label>
      <div className="flex flex-wrap gap-2"><button className={control} disabled={busy || reason.trim().length < 15 || !ticket} onClick={() => void openContent(0)}>{busy ? "Abriendo…" : "Registrar consulta y abrir mensajes"}</button><button className={control} onClick={closeReview}>Cerrar y ocultar contenido</button></div>
      {reviewError && <p role="alert">{reviewError}</p>}
      <button className={control} onClick={()=>void loadAccessHistory()}>Consultar registro de accesos</button>
      {accessHistory.map(h=><p key={h.id} className="break-words text-xs">{fecha(h.accessed_at)} · {h.actor_name||h.actor_id} · Caso {h.report_id||h.support_ticket_id} · Desde mensaje {h.page_offset+1} · {h.reason}</p>)}
      {messages && <><p className="break-all text-xs">Consulta registrada: {auditId}</p>{messages.map(m => <div key={m.id} className="rounded-lg bg-slate-50 p-3"><p className="text-xs">{m.from_client ? "Cliente" : "Profesional"} · {fecha(m.created_at)}{m.edited_at ? " · Editado" : ""}</p><p className="whitespace-pre-wrap break-words">{m.deleted ? "Mensaje eliminado" : m.body || "Mensaje con adjunto (contenido no incluido)"}</p></div>)}<div className="flex gap-2"><button className={control} disabled={busy || messageOffset === 0} onClick={() => void openContent(messageOffset-50)}>Mensajes anteriores</button><button className={control} disabled={busy || messages.length < 50} onClick={() => void openContent(messageOffset+50)}>Mensajes siguientes</button></div></>}
    </section>}
  </div>;
}
