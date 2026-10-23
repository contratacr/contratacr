'use client';
import { useState } from 'react';
import { exportWork, validateWork, type WorkItem, type Stage } from '@/lib/pro/workspace';
const stages: Record<Stage,string> = {new:'Nuevo contacto',quoting:'Cotizando',scheduled:'Agendado',completed:'Finalizado'};
const empty = {client:'',service:'',stage:'new' as Stage,start:'',end:''};
export function ProWorkspace() {
  const [items,setItems]=useState<WorkItem[]>([]);
  const [draft,setDraft]=useState(empty);
  const [error,setError]=useState('');
  function save(event: React.FormEvent) {
    event.preventDefault(); const item={...draft,id:crypto.randomUUID()};
    const problem=validateWork(item,items); if(problem){setError(problem);return;}
    setItems([...items,item]);setDraft(empty);setError('');
  }
  function download() {
    const url=URL.createObjectURL(new Blob([exportWork(items)],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='contratacr-trabajos.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <main className="mx-auto max-w-5xl space-y-6 p-6 text-[#172543]">
    <header><h1 className="text-3xl font-bold">ContrataCR Pro</h1><p>Organice sus clientes y sus próximos trabajos.</p></header>
    <p className="rounded-xl bg-amber-50 p-4">Prototipo local: use datos ficticios. Los datos se borran al recargar. No activa cobros, reservas públicas ni posiciones patrocinadas.</p>
    <div className="grid gap-3 sm:grid-cols-4">{Object.entries(stages).map(([key,label])=><div key={key} className="rounded-xl border p-4"><p>{label}</p><strong className="text-2xl">{items.filter(i=>i.stage===key).length}</strong></div>)}</div>
    <form onSubmit={save} className="grid gap-4 rounded-2xl border p-5 sm:grid-cols-2">
      <h2 className="text-xl font-semibold sm:col-span-2">Añadir trabajo o cita</h2>
      {(['client','service'] as const).map(key=><label key={key}>{key==='client'?'Cliente':'Servicio'}<input required maxLength={160} className="block w-full rounded-lg border p-3" value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}
      <label>Estado<select className="block w-full rounded-lg border p-3" value={draft.stage} onChange={e=>setDraft({...draft,stage:e.target.value as Stage})}>{Object.entries(stages).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <p className="self-center text-sm">Horarios en la zona horaria de este dispositivo.</p>
      {(['start','end'] as const).map(key=><label key={key}>{key==='start'?'Inicio':'Final'}<input type="datetime-local" className="block w-full rounded-lg border p-3" value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}
      {error&&<p role="alert" className="text-red-700 sm:col-span-2">{error}</p>}
      <button className="rounded-full bg-[#009fd9] p-3 font-semibold text-white">Guardar trabajo</button>
    </form>
    <section className="space-y-3"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">Mis trabajos</h2><button disabled={!items.length} onClick={download} className="rounded-full border px-4 py-2 disabled:opacity-40">Exportar CSV para Excel</button></div>
      {!items.length&&<p>Agregue su primer trabajo para comenzar.</p>}
      {items.map(item=><article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><h3 className="font-semibold">{item.client} · {item.service}</h3><p>{item.start?new Date(item.start).toLocaleString('es-CR'):'Sin fecha'}</p></div><span>{stages[item.stage]}</span></article>)}
    </section>
    <footer className="text-sm text-slate-600">El chat básico, WhatsApp, llamadas y verificación siguen siendo gratuitos. Las consultas de identificación requieren validar sus fuentes. La publicidad se identificará como Patrocinado.</footer>
  </main>;
}
