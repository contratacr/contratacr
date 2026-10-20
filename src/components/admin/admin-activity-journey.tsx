"use client";
import { useEffect, useState } from "react";
type Row = { key: string; created_at: string; viewer_user_id: string | null; visitor_hash: string; name: string | null; runtime: string; event: string; page: string; details: Record<string,unknown> };
const labels: Record<string,string> = { screen:"Pantalla",access:"Acceso",first_use:"Primer uso",navigation:"Navegación",button:"Botón",filter:"Filtro",form_start:"Formulario iniciado",form_submit:"Intento de envío",form_abandon:"Formulario sin enviar",form_error:"Validación del formulario",scroll:"Lectura",client_error:"Error del navegador",search_performed:"Búsqueda",profile_view:"Perfil visto",whatsapp_click:"WhatsApp",internal_message_sent:"Mensaje enviado",project_published:"Proyecto publicado" };
export function AdminActivityJourney() {
  const [runtime,setRuntime] = useState(""),[days,setDays] = useState("7"),[actor,setActor] = useState("");
  const [rows,setRows] = useState<Row[]>([]),[more,setMore] = useState(false),[busy,setBusy] = useState(true),[error,setError] = useState("");
  const [delivery,setDelivery] = useState<Record<string,number> | null>(null);
  const [cursor,setCursor] = useState<Row | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(()=>{ if (!controller.signal.aborted) { setBusy(true); setError(""); } });
    const params = new URLSearchParams({ runtime, days, actor });
    if (cursor) { params.set("before",cursor.created_at); params.set("key",cursor.key); }
    fetch(`/api/admin/analytics/activity?${params}`,{ signal: controller.signal, cache:"no-store" }).then(async response=>{
      if (!response.ok) throw Error("No se pudo cargar la actividad.");
      const data = await response.json(); if (controller.signal.aborted) return; setRows(old=>cursor ? [...old,...data.events] : data.events);setMore(data.more);if (!cursor) setDelivery(data.delivery ?? null);
    }).catch(e=>{ if (e.name!=="AbortError") setError("No se pudo cargar la actividad."); }).finally(()=>{ if (!controller.signal.aborted) setBusy(false); });
    return ()=>controller.abort();
  },[runtime,days,actor,cursor]);
  function reset() { setBusy(true);setError("");setRows([]);setCursor(null); }
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <h2 className="text-sm font-bold text-slate-900">Recorridos y actividad</h2>
    <p className="mt-1 text-xs text-slate-500">Cuentas y visitantes sin sesión. No incluye contenido de mensajes ni campos de formularios.</p>
    <div className="my-4 flex flex-wrap gap-3">
      <select aria-label="Plataforma de actividad" className="rounded-lg border p-2 text-sm" value={runtime} onChange={e=>{reset();setRuntime(e.target.value);}}>{[["","Todos los ambientes"],["web_desktop","Web PC"],["web_mobile","Web móvil"],["android","Android"],["ios","iOS"]].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
      <select aria-label="Periodo de actividad" className="rounded-lg border p-2 text-sm" value={days} onChange={e=>{reset();setDays(e.target.value);}}>{[1,7,30,90].map(n=><option key={n} value={n}>{n} días</option>)}</select>
      {actor && <button className="text-sm text-cyan-700" onClick={()=>{reset();setActor("");}}>Ver todos los visitantes</button>}
    </div>
    {!actor && !runtime && delivery && <div className="mb-4 rounded-xl bg-slate-50 p-3">
      <h3 className="text-xs font-semibold text-slate-800">Conversiones de negocio para Meta</h3>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">{[["sent","Recibidas por Meta (web)"],["pending","Pendientes"],["sending","Enviando"],["browser_only","App: entrega sin confirmar"],["suppressed","Sin envío publicitario"],["expired","Expiradas"]].map(([key,label])=><span key={key}>{label}: <strong>{delivery[key] ?? 0}</strong></span>)}</div>
      <p className="mt-2 text-xs text-slate-500">Los informes agregados de Apple se consultan en Meta. Esta sección no confirma instalaciones atribuidas a anuncios.</p>
    </div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b text-slate-500">{["Fecha","Cuenta o visitante","Ambiente","Acción","Sección / detalle"].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(row=><tr className="border-b border-slate-100" key={row.key}>
      <td className="whitespace-nowrap p-2">{new Date(row.created_at).toLocaleString("es-CR")}</td>
      <td className="p-2"><button className="text-cyan-700 hover:underline" onClick={()=>{const next=row.viewer_user_id || row.visitor_hash;if(next===actor)return;reset();setActor(next);}}>{row.name || `Visitante ${row.visitor_hash.slice(0,8)}`}</button></td>
      <td className="p-2">{row.runtime}</td><td className="p-2">{labels[row.event] || row.event.replaceAll("_"," ")}</td>
      <td className="max-w-xs break-words p-2">{row.page}{Object.entries(row.details).filter(([,v])=>v!==null && v!=="").map(([k,v])=><span className="ml-2 text-slate-500" key={k}>{({target:"Destino",value:"Avance",q:"Búsqueda",provincia:"Provincia",canton:"Cantón",results:"Resultados",tab:"Pestaña"} as Record<string,string>)[k] || k}: {String(v)}</span>)}</td>
    </tr>)}</tbody></table></div>
    {busy && <p role="status" className="mt-3 text-sm text-slate-500">Cargando actividad…</p>}
    {!busy && !rows.length && !error && <p className="mt-3 text-sm text-slate-500">Sin actividad en este periodo.</p>}
    {more && <button disabled={busy} onClick={()=>setCursor(rows[rows.length-1])} className="mt-4 text-sm font-semibold text-cyan-700">Cargar más</button>}
  </section>;
}
