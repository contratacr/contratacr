"use client";
import { useCallback,useEffect,useState } from "react";
import { Link } from "@/i18n/navigation";
type Report={id:string;subject_name:string;subject_user_id:string|null;professional_id:string|null;target_type:string|null;target_id:string|null;conversation_id:string|null;reason:string;reporter_name:string|null;status:"open"|"resolved";priority:"normal"|"high"|"urgent";assigned_name:string|null;created_at:string;decision_reason:string|null;appeal_reason:string|null};
const box="rounded-xl border border-slate-300 bg-white p-3 text-sm";
const kindLabel:Record<string,string>={project:"Proyecto",job:"Empleo",offer:"Promoción",professional:"Profesional",review:"Reseña",account:"Cuenta"};
export function AdminReports(){
 const [rows,setRows]=useState<Report[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 const [status,setStatus]=useState("open"),[priority,setPriority]=useState(""),[offset,setOffset]=useState(0),[total,setTotal]=useState(0),[busy,setBusy]=useState(false);
 const [selected,setSelected]=useState<Report|null>(null),[reason,setReason]=useState(""),[action,setAction]=useState("hide"),[targetKind,setTargetKind]=useState("professional"),[targetId,setTargetId]=useState(""),[reportId,setReportId]=useState(""),[days,setDays]=useState(7);
 const [history,setHistory]=useState<Array<{id:string;actor_id:string;action:string;reason:string;created_at:string}>>([]);
 const [path,setPath]=useState("");
 const [photo,setPhoto]=useState("");
 useEffect(()=>{const q=new URLSearchParams(window.location.search),kind=q.get("targetType"),id=q.get("targetId");if(kind&&id&&kind in kindLabel)queueMicrotask(()=>{setTargetKind(kind);setTargetId(id);});},[]);
 const [signals,setSignals]=useState<Array<{kind:string;id:string;reason:string;total:number}>>([]);
 async function loadSignals(){try{const r=await fetch("/api/admin/moderacion?signals=1",{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error);setSignals(d.rows);}catch(e){setError(e instanceof Error?e.message:"No se pudieron cargar señales.");}}
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{const r=await fetch(`/api/admin/reports?status=${status}&priority=${priority}&offset=${offset}`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error);setRows(d.reports);setTotal(d.total);}
  catch(e){setError(e instanceof Error?e.message:"No se pudo cargar la cola.");}
  finally{setLoading(false);}
 },[status,priority,offset]);
 useEffect(()=>{let alive=true;queueMicrotask(()=>{if(alive)void load();});return ()=>{alive=false;};},[load]);
 async function request(url:string,method:string,body:unknown){
  setBusy(true);setError("");
  try{const r=await fetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||"No se pudo guardar.");await load();return true;}
  catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");return false;}
  finally{setBusy(false);}
 }
 async function inspect(r:Report){
  setSelected(r);setReportId(r.id);setReason("");setHistory([]);setPath("");
  setTargetKind(r.target_type|| (r.professional_id?"professional":"account"));setTargetId(r.target_id||r.professional_id||r.subject_user_id||"");setAction("hide");
  const response=await fetch(`/api/admin/moderacion?id=${encodeURIComponent(r.target_id||r.professional_id||r.subject_user_id||r.id)}`,{cache:"no-store"});
  if(response.ok)setHistory((await response.json()).rows);
 }
 return <div className="space-y-4">
  <h1 className="text-xl font-extrabold">Reportes y moderación</h1>
  <p className="text-sm text-slate-600">Prioriza riesgos, verifica evidencia y registra una decisión proporcional. Reportar, recibir varios reportes o tardar en contestar no demuestran una infracción. No copies mensajes privados en los motivos.</p>
  <div className="flex flex-wrap gap-3">
   <label>Estado <select className={box} value={status} onChange={e=>{setStatus(e.target.value);setOffset(0);}}><option value="open">Abiertos</option><option value="resolved">Resueltos</option><option value="all">Todos</option></select></label>
   <label>Prioridad <select className={box} value={priority} onChange={e=>{setPriority(e.target.value);setOffset(0);}}><option value="">Todas</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="normal">Normal</option></select></label>
   <button className={box} onClick={()=>void load()}>Actualizar</button>
  </div>
  {error&&<p role="alert">{error}</p>}
  <button className={box} onClick={()=>void loadSignals()}>Consultar señales de spam o reincidencia</button>
  {signals.map(s=><article className="rounded-xl border p-3 text-sm" key={`${s.kind}-${s.id}`}><p>{s.reason} · {s.total} registros. Es una señal para revisar, no una prueba de abuso.</p><button className={box} onClick={()=>{setSelected(null);setTargetKind(s.kind);setTargetId(s.id);setReportId("");setReason("");setHistory([]);}}>Revisar contenido identificado</button></article>)}
  {loading?<p role="status">Cargando casos…</p>:<><p>{total} casos · ordenados del más antiguo al más reciente</p>{!rows.length&&<p>No hay casos en esta vista.</p>}{rows.map(r=><article key={r.id} className="space-y-2 rounded-xl border p-4">
   <h2 className="font-bold">{r.subject_name} · {kindLabel[r.target_type||""]||"Cuenta o contenido"}</h2>
   <p className="text-sm">{r.priority==="urgent"?"Urgente":r.priority==="high"?"Alta":"Normal"} · {r.status==="open"?"Abierto":"Resuelto"} · {new Date(r.created_at).toLocaleString("es-CR")} · Responsable: {r.assigned_name||"Sin asignar"}</p>
   <p className="whitespace-pre-wrap break-words text-sm">{r.reason}</p>
   <p className="text-xs">Reportado por: {r.reporter_name||"Visitante o registro anterior"} · Caso {r.id}</p>
   {r.decision_reason&&<p className="text-sm">Última decisión: {r.decision_reason}</p>}
   {r.appeal_reason&&<p className="text-sm">Solicitud de revisión: {r.appeal_reason}</p>}
   {r.target_type&&r.target_id&&["project","job","offer","professional"].includes(r.target_type)&&<Link className="text-sm underline" href={`${({project:"/proyectos/",job:"/empleos/",offer:"/promociones/",professional:"/admin/proveedores/"} as Record<string,string>)[r.target_type]}${r.target_id}`}>Abrir contenido</Link>}
   {r.conversation_id&&<Link className="ml-3 text-sm underline" href={`/admin/conversaciones?conversation=${r.conversation_id}&report=${r.id}`}>Revisión restringida del chat</Link>}
   <button className={box} onClick={()=>void inspect(r)}>Atender y ver historial</button>
  </article>)}
  <div className="flex gap-3"><button className={box} disabled={offset===0} onClick={()=>setOffset(offset-50)}>Anterior</button><button className={box} disabled={offset+50>=total} onClick={()=>setOffset(offset+50)}>Siguiente</button></div></>}
  <section className="space-y-3 rounded-xl border-2 p-4">
   <h2 className="font-bold">{selected?"Atender caso seleccionado":"Acción sobre contenido identificado"}</h2>
   <p className="text-sm">Retirar oculta la publicación y permite restaurarla. Una restricción de cuenta impide nuevas publicaciones y mensajes por el plazo elegido; no elimina la cuenta. Una advertencia se registra en el expediente.</p>
   <label className="block">Tipo <select className={box} value={targetKind} onChange={e=>setTargetKind(e.target.value)}>{Object.entries(kindLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <label className="block">ID del contenido o cuenta <input className={`${box} block w-full`} value={targetId} onChange={e=>setTargetId(e.target.value)}/></label>
   <button className={box} disabled={!targetId} onClick={async()=>{const r=await fetch(`/api/admin/moderacion?id=${encodeURIComponent(targetId)}`,{cache:"no-store"});if(r.ok)setHistory((await r.json()).rows);else setError("No se pudo leer el historial.");}}>Consultar historial de este contenido</button>
   <label className="block">ID del reporte relacionado (opcional) <input className={`${box} block w-full`} value={reportId} onChange={e=>setReportId(e.target.value)}/></label>
   <label className="block">Motivo (visible al afectado si se registra como decisión) <textarea className={`${box} block w-full`} minLength={5} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   <div className="flex flex-wrap gap-3"><select aria-label="Acción de moderación" className={box} value={action} onChange={e=>setAction(e.target.value)}><option value="hide">Retirar de publicación</option><option value="restore">Restaurar</option><option value="warn">Registrar advertencia</option><option value="restrict">Restringir cuenta temporalmente</option><option value="unrestrict">Quitar restricción de cuenta</option></select>
   {action==="restrict"&&<label>Días <input className={box} type="number" min={1} max={30} value={days} onChange={e=>setDays(Number(e.target.value))}/></label>}
   <button className={box} disabled={busy||reason.trim().length<5||!targetId} onClick={()=>void request("/api/admin/moderacion","POST",{kind:targetKind,id:targetId,action,reason,report:reportId||null,days})}>Guardar acción y auditoría</button></div>
   {selected&&<div className="flex flex-wrap gap-2"><button className={box} disabled={busy||reason.trim().length<5} onClick={()=>void request("/api/admin/reports","PATCH",{id:selected.id,status:"open",priority:selected.priority,reason,assign:true})}>Asignarme el caso</button>
   {(["normal","high","urgent"] as const).map(p=><button key={p} className={box} disabled={busy||reason.trim().length<5} onClick={()=>void request("/api/admin/reports","PATCH",{id:selected.id,status:"open",priority:p,reason,assign:false})}>Prioridad {p==="normal"?"normal":p==="high"?"alta":"urgente"}</button>)}
   <button className={box} disabled={busy||reason.trim().length<5} onClick={()=>void request("/api/admin/reports","PATCH",{id:selected.id,status:selected.status==="open"?"resolved":"open",priority:selected.priority,reason,assign:false})}>{selected.status==="open"?"Resolver con motivo":"Reabrir con motivo"}</button>
   {selected.subject_user_id&&<button className={box} onClick={()=>{setTargetKind("account");setTargetId(selected.subject_user_id!);}}>Actuar sobre la cuenta</button>}</div>}
   {targetKind==="professional"&&<div className="space-y-2"><label>URL pública de la foto del portafolio <input className={`${box} block w-full`} value={photo} onChange={e=>setPhoto(e.target.value)}/></label>{[false,true].map(restore=><button key={String(restore)} className={box} disabled={busy||!photo||!targetId||reason.trim().length<5} onClick={()=>void request(`/api/admin/providers/${encodeURIComponent(targetId)}/moderate`,"POST",{action:restore?"restore_photo":"remove_photo",url:photo,reason})}>{restore?"Restaurar foto del portafolio":"Retirar foto del portafolio"}</button>)}</div>}
   {selected?.conversation_id&&<div className="space-y-2"><label>Ruta del adjunto denunciado <input className={`${box} block w-full`} value={path} onChange={e=>setPath(e.target.value)}/></label><button className={box} disabled={busy||!path||reason.trim().length<5} onClick={()=>void request("/api/admin/moderacion/archivos","POST",{report:selected.id,path,action:"quarantine",reason})}>Poner adjunto en cuarentena</button><button className={box} disabled={busy||!path||reason.trim().length<5} onClick={()=>void request("/api/admin/moderacion/archivos","POST",{report:selected.id,path,action:"release",reason})}>Liberar adjunto tras revisión</button></div>}
   {history.length>0&&<><h3 className="font-bold">Historial del contenido</h3>{history.map(h=><p key={h.id} className="text-sm">{new Date(h.created_at).toLocaleString("es-CR")} · {h.action} · {h.reason} · Administrador {h.actor_id}</p>)}</>}
  </section>
 </div>;
}
