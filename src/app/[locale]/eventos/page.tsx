import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {createAdminClient} from '@/lib/supabase/admin';
import {DirectoryShell} from '@/components/directory/directory-shell';
import {EventCard} from '@/components/directory/place-events';
import {SELECT_CLASS,SELECT_STYLE} from '@/components/directory/select-style';
import {PLACE_SECTIONS} from '@/lib/directory/place-verticals';
import type {PublicEventsPage} from '@/lib/directory/place-features';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// LOCAL PRO ONLY (place features round, development only like /lugar): /eventos and /en/eventos. Events published by
// claimed places (staff can hide them in /admin/directorio). Plain GET filters: ?desde=YYYY-MM-DD (from that day,
// default today in Costa Rica), ?provincia=<province>, ?seccion=<vertical id>, ?pagina=N (30 per page). Order = start
// date/time then id — never payment or popularity.
export const dynamic='force-dynamic';
type SP=Record<string,string|string[]|undefined>;
const PROVINCES=['San José','Alajuela','Cartago','Heredia','Guanacaste','Puntarenas','Limón'];
const one=(v:string|string[]|undefined)=>typeof v==='string'?v:undefined;
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
 if(!DIR_ENABLED)return {};
 const {locale}=await params,en=locale==='en',path='/eventos';
 const title=en?'Local events in Costa Rica':'Eventos locales en Costa Rica';
 const description=en?'Events published by businesses on ContrataCR: music, markets, workshops and more, by date and province.':'Eventos que publican los negocios en ContrataCR: música, ferias, talleres y más, por fecha y provincia.';
 return {title,description,alternates:{canonical:(en?'/en':'')+path,languages:{es:path,en:'/en'+path}},robots:{index:false,follow:true},openGraph:{title,description,type:'website'}};
}
export default async function EventsRoute({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<SP>}){
 if(!DIR_ENABLED)notFound();
 const {locale}=await params,sp=await searchParams,en=locale==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const from=one(sp.desde),province=one(sp.provincia),section=one(sp.seccion),page=Math.max(1,Math.min(100,Number(one(sp.pagina))||1));
 const validFrom=from&&/^\d{4}-\d{2}-\d{2}$/.test(from)&&!Number.isNaN(Date.parse(from))?from:null;
 const validProvince=province&&PROVINCES.includes(province)?province:null;
 const validSection=section&&PLACE_SECTIONS.some(s=>s.id===section)?section:null;
 const r=await createAdminClient().rpc('dir_events_public',{p_from:validFrom,p_province:validProvince,p_vertical:validSection,p_limit:30,p_offset:(page-1)*30});
 const data=r.error?null:r.data as PublicEventsPage;
 const qs=(n:number)=>{const q=new URLSearchParams();if(validFrom)q.set('desde',validFrom);if(validProvince)q.set('provincia',validProvince);if(validSection)q.set('seccion',validSection);if(n>1)q.set('pagina',String(n));const s=q.toString();return s?'?'+s:'';};
 const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
 return <DirectoryShell><main id="contenido" data-events-page className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-[#162543] sm:py-12">
  <header className="space-y-2">
   <h1 className="text-3xl font-extrabold sm:text-4xl">{t('Eventos locales','Local events')}</h1>
   <p className="text-slate-700">{t('Lo que publican los negocios de la comunidad. Ordenados por fecha; nada aquí depende de pagos.','What community businesses publish. Ordered by date; nothing here depends on payment.')}</p>
  </header>
  <form method="get" className="grid gap-3 rounded-2xl border border-[#d7e1ea] p-4 sm:grid-cols-4" data-events-filters>
   <label className="space-y-1 text-sm font-semibold">{t('Desde','From')}
    <input type="date" name="desde" defaultValue={validFrom??data?.from??''} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base"/></label>
   <label className="space-y-1 text-sm font-semibold">{t('Provincia','Province')}
    <select name="provincia" defaultValue={validProvince??''} className={`min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base ${SELECT_CLASS}`} style={SELECT_STYLE} data-events-province>
     <option value="">{t('Todas','All')}</option>{PROVINCES.map(p=><option key={p} value={p}>{p}</option>)}</select></label>
   <label className="space-y-1 text-sm font-semibold">{t('Sección','Section')}
    <select name="seccion" defaultValue={validSection??''} className={`min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base ${SELECT_CLASS}`} style={SELECT_STYLE}>
     <option value="">{t('Todas','All')}</option>{PLACE_SECTIONS.filter(s=>s.id!=='banking').map(s=><option key={s.id} value={s.id}>{en?s.nameEn:s.nameEs}</option>)}</select></label>
   <div className="flex items-end"><button type="submit" className={`inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#162543] px-5 font-semibold text-white ${ring}`}>{t('Filtrar','Filter')}</button></div>
  </form>
  {!data?<p role="alert">{t('No se pudieron cargar los eventos. Intente de nuevo.','Could not load the events. Please try again.')}</p>
   :data.items.length===0?<p data-events-empty className="rounded-2xl bg-slate-50 p-5 text-slate-700">{t('No hay eventos con esos filtros. Pruebe otra fecha o provincia.','No events match those filters. Try another date or province.')}</p>
   :<>
    <p className="text-sm text-slate-700" data-events-total={data.total}>{data.total} {t(data.total===1?'evento':'eventos',data.total===1?'event':'events')}</p>
    <ul className="grid gap-3 sm:grid-cols-2">{data.items.map(e=><li key={e.id}><EventCard event={e} en={en} place={e.place}/></li>)}</ul>
    {data.total>30&&<nav aria-label={t('Páginas','Pages')} className="flex justify-between">
     {page>1?<a className={`underline ${ring}`} href={`${prefix}/eventos${qs(page-1)}`}>{t('Anteriores','Previous')}</a>:<span/>}
     {page*30<data.total&&<a className={`underline ${ring}`} href={`${prefix}/eventos${qs(page+1)}`}>{t('Siguientes','Next')}</a>}</nav>}
   </>}
  <p className="text-sm text-slate-700">{PRO_ENABLED?t('¿Tiene un negocio? Reclame su ficha gratis y publique sus eventos desde ContrataCR Pro.','Own a business? Claim your page for free and publish your events from ContrataCR Pro.'):t('¿Tiene un negocio? Reclame su ficha gratis desde la página de su negocio.','Own a business? Claim your page for free from your business page.')}</p>
 </main></DirectoryShell>;
}
