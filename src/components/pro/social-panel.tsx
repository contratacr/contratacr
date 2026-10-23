'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Local preview uses a full navigation to reload browser-backed records. */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { businessSchema, emptyBusiness, type Business } from '@/lib/pro/business';
import { requestSocial, reviewSocial, socialLabels, socialMonth } from '@/lib/pro/social';
const key = 'ccr:pro:local-preview:v1';
const field = 'mt-1 block w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white p-3';
export function SocialPanel({ admin = false, server = false }: { admin?: boolean; server?: boolean }) {
  const [data, setData] = useState<Business>(emptyBusiness);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [page,setPage]=useState(0);const [total,setTotal]=useState(0);const [busy,setBusy]=useState(false);
  async function loadServer(){const response=await fetch(admin?`/api/admin/pro?page=${page}`:'/api/pro/social',{cache:'no-store'});const body=await response.json();if(!response.ok)throw Error(body.error);setData({...emptyBusiness(),social:body.requests.map((r:Record<string,unknown>)=>({id:r.id,title:r.title,month:r.month,link:r.link,description:r.description,status:r.status,note:r.note,publishedUrl:r.published_url,createdAt:r.created_at,updatedAt:r.updated_at}))});setTotal(body.total||0);setReady(true);}
  useEffect(() => {
    function load() { try { setData(businessSchema.parse(JSON.parse(localStorage.getItem(key) || JSON.stringify(emptyBusiness())))); setReady(true); } catch { setError('No se pudieron leer los datos locales.'); setReady(false); } }
    if(server){void Promise.resolve().then(loadServer).catch(e=>setError(e.message));return;}
    load(); window.addEventListener('storage', load); return () => window.removeEventListener('storage', load);
  // Pagination reloads the server queue.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server,admin,page]);
  function save(change: (current: Business) => Business) {
    try {
      const current = businessSchema.parse(JSON.parse(localStorage.getItem(key) || JSON.stringify(emptyBusiness())));
      const next = businessSchema.parse(change(current)); localStorage.setItem(key, JSON.stringify(next)); setData(next); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); }
  }
  async function send(body:Record<string,unknown>){setBusy(true);try{const response=await fetch(admin?'/api/admin/pro':'/api/pro/social',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw Error(result.error);await loadServer();setError('');}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');}finally{setBusy(false);}}
  const used = data.social.some(r => r.month === socialMonth(new Date()) && r.status !== 'rejected');
  return <section className="space-y-5 rounded-2xl border border-[#e5e7eb] bg-white p-4 text-[#162543] shadow-sm sm:p-6">
    <h2 className="text-xl font-bold">{admin ? 'Revisión de difusión' : 'Destaca en nuestras redes'}</h2>
    <p className="text-sm text-[#68778d]">Una difusión orgánica por mes calendario, en horario de Costa Rica, sujeta a revisión. No incluye anuncios pagados ni garantiza alcance o contrataciones. Los cupos no se acumulan.</p>
    <p className="text-sm">{admin ? (server?'Revise cada solicitud antes de aprobar. Registrar una publicación no envía contenido a redes.':'Simulación administrativa local: no publica en redes ni acredita permisos de administrador.') : 'La solicitud reserva su cupo del mes. Si se rechaza, puede enviar una nueva solicitud.'}</p>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
    {!admin && <>{!server&&<a className="text-[#009fca] underline" href="/pro-preview/admin">Abrir revisión administrativa local</a>}<p>{used ? 'Cupo del mes reservado o utilizado.' : 'Tiene una difusión disponible este mes.'}</p>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget);if(server){void send({id:crypto.randomUUID(),title:String(f.get('title')),link:String(f.get('link')),description:String(f.get('description'))});return;} save(current => ({ ...current, social: requestSocial(current.social, { id: crypto.randomUUID(), title: String(f.get('title')), link: String(f.get('link')), description: String(f.get('description')) }) })); }}>
        <label className="block">Título<input name="title" required maxLength={160} className={field}/></label>
        <label className="block">Enlace a su perfil o publicación<input name="link" type="url" required className={field}/></label>
        <label className="block">Qué desea destacar<textarea name="description" required maxLength={1500} className={field}/></label>
        <Button disabled={!ready || used || busy}>Solicitar difusión</Button>
      </form></>}
    {admin && !server && <a href="/pro-preview" className="text-[#009fca] underline">Volver a Pro</a>}
    {server&&admin&&<div className="flex gap-3"><Button variant="secondary" disabled={page===0||busy} onClick={()=>setPage(page-1)}>Anterior</Button><span>{total} solicitudes</span><Button variant="secondary" disabled={(page+1)*20>=total||busy} onClick={()=>setPage(page+1)}>Siguiente</Button></div>}
    {data.social.length === 0 && <p>No hay solicitudes de difusión.</p>}
    {[...data.social].reverse().map(r => <article key={r.id} className="space-y-3 rounded-2xl border border-[#e5e7eb] p-4">
      <h3 className="break-words font-bold">{r.title}</h3><p>{socialLabels[r.status]} · Cupo {r.month}</p><p className="break-words">{r.description}</p>
      <a href={r.link} target="_blank" rel="noopener noreferrer" className="text-[#009fca] underline">Ver contenido solicitado</a>
      {r.note && <p className="break-words">Revisión: {r.note}</p>}
      {r.publishedUrl && <a href={r.publishedUrl} target="_blank" rel="noopener noreferrer" className="block text-[#009fca] underline">Ver publicación registrada</a>}
      {admin && (r.status === 'pending' || r.status === 'approved') && <form className="space-y-3" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const status = String(f.get('decision')) as 'approved' | 'rejected' | 'published'; if(server){void send({action:'review',id:r.id,status,note:String(f.get('note')||''),publishedUrl:String(f.get('publishedUrl')||'')});return;} save(current => ({ ...current, social: reviewSocial(current.social, r.id, status, String(f.get('note') || ''), String(f.get('publishedUrl') || '')) })); }}>
        {r.status === 'pending' ? <label>Decisión<select name="decision" className={field}><option value="approved">Aprobar</option><option value="rejected">Rechazar</option></select></label> : <><input type="hidden" name="decision" value="published"/><label>Enlace de publicación realizada<input name="publishedUrl" required type="url" className={field}/></label></>}
        <label className="block">Nota de revisión<textarea name="note" maxLength={1000} className={field}/></label>
        <Button disabled={!ready||busy}>{r.status === 'pending' ? 'Guardar revisión' : 'Registrar como publicada'}</Button>
      </form>}
    </article>)}
  </section>;
}
