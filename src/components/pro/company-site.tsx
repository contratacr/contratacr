'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {siteContentSchema,siteSlugSchema,siteThemeTokens,siteThemes,type PublicSite,type SiteContent,type SiteProfile,type SiteSection,type SiteTheme} from '@/lib/pro/site';
import {ProModal} from './modal';
import {SitePage} from './site-page';

/**
 * Round 6D (row 69): Company › Marketing › Website. Sections built from the professional's own ContrataCR data
 * (services, profile photos, published reviews, service area) + request form that creates a lead. Draft saved
 * with CAS; «Publicar» freezes an immutable version served at /sitio/<slug> (local only). Preview = same page
 * component with the draft (form disabled). Custom domain: documented adapter, not active.
 */
type Read={site:{slug:string;theme:SiteTheme;draft:SiteContent;customDomain:string|null;revision:number;publishedVersion:number|null;publishedAt:string|null;draftChanged:boolean}|null;
 versions:{version:number;publishedAt:string;theme:string}[];profile:SiteProfile;submissions:number;preview:PublicSite|null;defaults:{slug:string;content:SiteContent};domainMode:string};
const card='min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-5',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
const sectionNames:Record<SiteSection['type'],[string,string]>={hero:['Portada','Hero'],services:['Servicios','Services'],portfolio:['Trabajos (fotos de su perfil)','Portfolio (your profile photos)'],reviews:['Reseñas de ContrataCR','ContrataCR reviews'],area:['Zona de servicio','Service area'],contact:['Formulario de solicitud','Request form']};
export function CompanySite(){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]),{confirm,dialogNode}=useAppDialog();
 const [data,setData]=useState<Read|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [slug,setSlug]=useState(''),[theme,setTheme]=useState<SiteTheme>('contratacr'),[content,setContent]=useState<SiteContent|null>(null),[dirty,setDirty]=useState(false),[preview,setPreview]=useState(false),[domain,setDomain]=useState('');
 const seq=useRef(0);
 const load=useCallback(async(keep=false)=>{const n=++seq.current;setFailed(false);
  try{const response=await fetch('/api/pro/site?'+new URLSearchParams({lang:en?'en':'es'}),{cache:'no-store'});if(!response.ok)throw Error();const body=await response.json() as Read;if(n!==seq.current)return;setData(body);
   if(!keep){setSlug(body.site?.slug??body.defaults.slug);setTheme(body.site?.theme??'contratacr');setContent(body.site?.draft??body.defaults.content);setDomain(body.site?.customDomain??'');setDirty(false);}}
  catch{if(n===seq.current)setFailed(true);}},[en]);
 useEffect(()=>{const counter=seq,timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);counter.current++;};},[load]);
 async function post(payload:Record<string,unknown>,done:string){
  setBusy(true);setError('');setNotice('');
  try{const response=await fetch('/api/pro/site',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({actionId:crypto.randomUUID(),revision:data?.site?.revision??0,...payload})});const json=await response.json().catch(()=>({}));
   if(!response.ok){setError(json.reason==='slug_taken'?t('Esa dirección ya está en uso. Elija otra.','That address is already in use. Choose another.'):json.reason==='foreign_photo'?t('Las fotos deben venir de su perfil de ContrataCR.','Photos must come from your ContrataCR profile.'):response.status===409?t('El sitio cambió en otra pestaña. Se recargó.','The site changed in another tab. It was reloaded.'):response.status===400?t('Revise los campos del sitio.','Check the site fields.'):t('No se pudo guardar. Reintente.','Could not save. Retry.'));if(response.status===409)await load(true);return false;}
   setNotice(done);await load(payload.action!=='save');if(payload.action==='save')setDirty(false);return true;
  }catch{setError(t('No se pudo guardar. Reintente.','Could not save. Retry.'));return false;}finally{setBusy(false);}
 }
 if(failed)return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{t('No se pudo cargar el sitio.','Could not load the website.')}</span><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!data||!content)return <p role="status" aria-busy="true" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>;
 const site=data.site,valid=siteContentSchema.safeParse(content).success&&siteSlugSchema.safeParse(slug).success;
 const update=(next:SiteContent)=>{setContent(next);setDirty(true);};
 const setSection=(type:SiteSection['type'],patch:Partial<SiteSection>)=>update({...content,sections:content.sections.map(s=>s.type===type?{...s,...patch} as SiteSection:s)});
 const publicPath=(en?'/en':'')+'/sitio/'+(site?.slug??slug);
 const previewSite:PublicSite={slug,theme,version:null,publishedAt:null,content,business:data.profile.businessName,profileSlug:data.profile.profileSlug,rating:data.profile.rating,reviews:data.preview?.reviews??[],campaigns:[]};
 return <div data-company-site={site?.publishedVersion?'published':site?'draft':'new'} className="min-w-0 space-y-4">{dialogNode}
  <section className={card} aria-labelledby="site-status">
   <div className="flex flex-wrap items-center gap-2"><h3 id="site-status" className="font-bold">{t('Estado','Status')}</h3>
    <span data-site-status className={'rounded-lg px-2 py-0.5 text-xs font-semibold '+(site?.publishedVersion?'bg-[#e6f6ee] text-[#175b42]':'bg-[#fff6e5] text-[#8a5300]')}>{site?.publishedVersion?t(`Publicado · versión ${site.publishedVersion}`,`Published · version ${site.publishedVersion}`):site?t('Borrador sin publicar','Unpublished draft'):t('Sin guardar','Not saved yet')}</span>
    {site?.publishedVersion&&site.draftChanged&&<span data-site-draft-changed className="rounded-lg bg-[#eef2ff] px-2 py-0.5 text-xs font-semibold text-[#3b3b98]">{t('El borrador tiene cambios sin publicar','The draft has unpublished changes')}</span>}</div>
   <p className="text-sm text-[#52627a]">{t('Su sitio usa sus datos de ContrataCR: servicios, fotos del perfil, reseñas publicadas y zona. El formulario crea una solicitud en Solicitudes con origen «Sitio web».','Your site uses your ContrataCR data: services, profile photos, published reviews and area. The form creates a lead in Leads with origin “Website”.')}</p>
   <div className="flex flex-wrap gap-2">
    <Button type="button" data-site-save disabled={busy||!valid||!dirty&&!!site} onClick={()=>void post({action:'save',slug,theme,content},t('Borrador guardado. Todavía no es público.','Draft saved. It is not public yet.'))}>{t('Guardar borrador','Save draft')}</Button>
    <Button type="button" variant="secondary" data-site-preview disabled={!valid} onClick={()=>setPreview(true)}>{t('Vista previa','Preview')}</Button>
    <Button type="button" variant="secondary" data-site-publish disabled={busy||!site||dirty} onClick={()=>void (async()=>{if(!(await confirm({title:t('¿Publicar el sitio?','Publish the website?'),description:t(`Se publicará una versión nueva en ${publicPath}. Las versiones anteriores se conservan.`,`A new version will be published at ${publicPath}. Earlier versions are kept.`),confirmLabel:t('Publicar','Publish'),cancelLabel:t('Cancelar','Cancel')})).confirmed)return;await post({action:'publish'},t('Sitio publicado.','Website published.'));})()}>{t('Publicar','Publish')}</Button>
    {site?.publishedVersion&&<Button type="button" variant="ghost" data-site-unpublish disabled={busy} onClick={()=>void (async()=>{if(!(await confirm({title:t('¿Despublicar?','Unpublish?'),description:t('El sitio deja de estar visible. Las versiones se conservan.','The site stops being visible. Versions are kept.'),confirmLabel:t('Despublicar','Unpublish'),cancelLabel:t('Cancelar','Cancel')})).confirmed)return;await post({action:'unpublish'},t('Sitio despublicado.','Website unpublished.'));})()}>{t('Despublicar','Unpublish')}</Button>}
    {site?.publishedVersion&&<a data-site-open href={publicPath} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-full border border-[#d7e1ea] px-5 text-sm font-semibold text-[#007aa0] hover:bg-[#f3f8fb]">{t('Abrir sitio publicado','Open published site')}<span className="sr-only">{t(' (se abre en otra pestaña)',' (opens in a new tab)')}</span></a>}
   </div>
   {dirty&&site&&<p className="text-xs text-[#8a5300]">{t('Guarde el borrador antes de publicar.','Save the draft before publishing.')}</p>}
   {notice&&<p role="status" data-site-notice className="text-sm text-[#175b42]">{notice}</p>}{error&&<p role="alert" data-site-error className="text-sm text-red-700">{error}</p>}
   <p className="text-xs text-[#52627a]">{t(`Solicitudes recibidas por el sitio: ${data.submissions}.`,`Requests received through the site: ${data.submissions}.`)}</p>
  </section>
  <div className="grid min-w-0 gap-4 lg:grid-cols-2">
   <section className={card} aria-labelledby="site-settings"><h3 id="site-settings" className="font-bold">{t('Dirección, diseño y buscadores','Address, design and search engines')}</h3>
    <label className="block text-sm font-medium">{t('Dirección del sitio','Site address')}<span className="mt-1 flex min-w-0 items-center gap-1"><span className="shrink-0 text-sm text-[#52627a]">/sitio/</span><input data-site-field="slug" className={field+' mt-0'} value={slug} maxLength={48} onChange={e=>{setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''));setDirty(true);}} aria-invalid={!siteSlugSchema.safeParse(slug).success}/></span></label>
    <label className="block text-sm font-medium">{t('Estilo','Style')}<select data-site-field="theme" className={field} value={theme} onChange={e=>{setTheme(e.target.value as SiteTheme);setDirty(true);}}>{siteThemes.map(id=><option key={id} value={id}>{en?siteThemeTokens[id].label.en:siteThemeTokens[id].label.es}</option>)}</select></label>
    <label className="block text-sm font-medium">{t('Idioma del sitio','Site language')}<select data-site-field="language" className={field} value={content.language} onChange={e=>update({...content,language:e.target.value as 'es'|'en'})}><option value="es">Español</option><option value="en">English</option></select></label>
    <label className="block text-sm font-medium">{t('Título para buscadores (máx. 70)','Search title (max. 70)')}<input data-site-field="title" className={field} value={content.title} maxLength={70} onChange={e=>update({...content,title:e.target.value})}/></label>
    <label className="block text-sm font-medium">{t('Descripción para buscadores (máx. 170)','Search description (max. 170)')}<textarea data-site-field="description" className={field+' py-2'} rows={3} value={content.description} maxLength={170} onChange={e=>update({...content,description:e.target.value})}/></label>
    <p className="text-xs text-[#52627a]">{t('El sitio publicado aparece en el mapa del sitio local (/api/pro/site-public?sitemap=1).','The published site is listed in the local sitemap (/api/pro/site-public?sitemap=1).')}</p>
   </section>
   <section className={card} aria-labelledby="site-domain"><div className="flex flex-wrap items-center gap-2"><h3 id="site-domain" className="font-bold">{t('Dominio propio','Custom domain')}</h3><span className="rounded-lg bg-[#fff6e5] px-2 py-0.5 text-xs font-semibold text-[#8a5300]">{t('No activo','Not active')}</span></div>
    <p className="text-sm text-[#52627a]">{t('Puede anotar el dominio que desea usar (por ejemplo, www.suempresa.cr). Conectarlo requiere el proveedor de dominios (Cloudflare for SaaS), que todavía no está activo; mientras tanto su sitio se sirve en ContrataCR.','You can note the domain you want (for example, www.yourcompany.cr). Connecting it needs the domain provider (Cloudflare for SaaS), which is not active yet; meanwhile your site is served on ContrataCR.')}</p>
    <label className="block text-sm font-medium">{t('Dominio','Domain')}<input data-site-field="domain" className={field} value={domain} maxLength={120} placeholder="www.suempresa.cr" onChange={e=>setDomain(e.target.value.trim().toLowerCase())}/></label>
    <Button type="button" variant="secondary" disabled={busy||!site} onClick={()=>void post({action:'domain',customDomain:domain},t('Dominio anotado (no conectado).','Domain noted (not connected).'))}>{t('Guardar dominio','Save domain')}</Button>
    {data.versions.length>0&&<div><h4 className="mt-2 text-sm font-bold">{t('Versiones publicadas','Published versions')}</h4><ul data-site-versions className="mt-1 space-y-1 text-sm">{data.versions.map(v=><li key={v.version}>{t('Versión','Version')} {v.version} · {new Date(v.publishedAt).toLocaleString(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'})}</li>)}</ul></div>}
   </section>
  </div>
  <section className={card} aria-labelledby="site-sections"><h3 id="site-sections" className="font-bold">{t('Secciones','Sections')}</h3>
   <ol className="space-y-3">{content.sections.map(section=><li key={section.type} data-site-section-editor={section.type} className="rounded-xl border border-[#e3eaf0] p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{en?sectionNames[section.type][1]:sectionNames[section.type][0]}</span>
     <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" data-site-enable={section.type} className="h-5 w-5 accent-[#0089bb]" checked={section.enabled} onChange={e=>setSection(section.type,{enabled:e.target.checked})}/>{t('Mostrar','Show')}</label></div>
    {section.enabled&&<SectionFields section={section} profile={data.profile} en={en} onChange={patch=>setSection(section.type,patch)}/>}
   </li>)}</ol>
  </section>
  {preview&&<ProModal open title={t('Vista previa del borrador','Draft preview')} size="xl" mobilePresentation="fullscreen" onClose={()=>setPreview(false)}><div data-site-preview-frame className="overflow-hidden rounded-xl border border-[#d7e1ea]"><SitePage site={previewSite} preview/></div></ProModal>}
 </div>;
}
function SectionFields({section,profile,en,onChange}:{section:SiteSection;profile:SiteProfile;en:boolean;onChange:(patch:Partial<SiteSection>)=>void}){
 const t=(es:string,english:string)=>en?english:es;
 const heading=<label className="block text-sm font-medium">{t('Título','Heading')}<input data-site-input={section.type+'-heading'} className={field} maxLength={80} value={section.heading} onChange={e=>onChange({heading:e.target.value})}/></label>;
 if(section.type==='hero')return <div className="mt-2 grid gap-2 sm:grid-cols-2">{heading}<label className="block text-sm font-medium">{t('Botón','Button')}<input className={field} maxLength={40} value={section.cta} onChange={e=>onChange({cta:e.target.value})}/></label><label className="block text-sm font-medium sm:col-span-2">{t('Texto','Text')}<textarea className={field+' py-2'} rows={2} maxLength={200} value={section.subheading} onChange={e=>onChange({subheading:e.target.value})}/></label></div>;
 if(section.type==='services')return <div className="mt-2 space-y-2">{heading}
  {section.items.map((item,i)=><div key={i} className="grid gap-2 rounded-lg bg-[#f7fafc] p-2 sm:grid-cols-[1fr_2fr_auto]"><input aria-label={t(`Servicio ${i+1}`,`Service ${i+1}`)} className={field+' mt-0'} maxLength={120} value={item.name} onChange={e=>onChange({items:section.items.map((x,j)=>j===i?{...x,name:e.target.value}:x)})}/><input aria-label={t(`Descripción ${i+1}`,`Description ${i+1}`)} className={field+' mt-0'} maxLength={400} value={item.description} onChange={e=>onChange({items:section.items.map((x,j)=>j===i?{...x,description:e.target.value}:x)})}/><Button type="button" variant="ghost" onClick={()=>onChange({items:section.items.filter((_,j)=>j!==i)})}>{t('Quitar','Remove')}</Button></div>)}
  {section.items.length<12&&<Button type="button" variant="secondary" data-site-add-service onClick={()=>onChange({items:[...section.items,{name:t('Servicio nuevo','New service'),description:''}]})}>{t('Agregar servicio','Add service')}</Button>}</div>;
 if(section.type==='portfolio')return <div className="mt-2 space-y-2">{heading}
  {profile.photos.length?<ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">{profile.photos.map((url,i)=>{const on=section.photos.includes(url);return <li key={url}><label className={'block cursor-pointer overflow-hidden rounded-lg border-2 '+(on?'border-[#008bb5]':'border-transparent')}>
   {/* eslint-disable-next-line @next/next/no-img-element -- the professional's own public profile photo */}
   <img src={url} alt={t(`Foto ${i+1} de su perfil`,`Profile photo ${i+1}`)} className="aspect-square w-full object-cover"/><span className="flex min-h-11 items-center gap-2 px-1 text-xs"><input type="checkbox" data-site-photo={i} className="h-5 w-5 accent-[#0089bb]" checked={on} disabled={!on&&section.photos.length>=12} onChange={e=>onChange({photos:e.target.checked?[...section.photos,url]:section.photos.filter(p=>p!==url)})}/>{on?t('Incluida','Included'):t('Incluir','Include')}</span></label></li>;})}</ul>
  :<p className="text-sm text-[#52627a]">{t('Su perfil no tiene fotos todavía. Agréguelas en su perfil de ContrataCR.','Your profile has no photos yet. Add them to your ContrataCR profile.')}</p>}</div>;
 if(section.type==='reviews')return <div className="mt-2 grid gap-2 sm:grid-cols-2">{heading}<label className="block text-sm font-medium">{t('Cuántas mostrar','How many to show')}<select className={field} value={section.max} onChange={e=>onChange({max:Number(e.target.value)})}>{[3,6,9,12].map(n=><option key={n} value={n}>{n}</option>)}</select></label><p className="text-xs text-[#52627a] sm:col-span-2">{t(`Se muestran sus reseñas publicadas de ContrataCR (${profile.rating.count??0}). No se pueden editar desde aquí.`,`Your published ContrataCR reviews are shown (${profile.rating.count??0}). They cannot be edited here.`)}</p></div>;
 return <div className="mt-2 space-y-2">{heading}<label className="block text-sm font-medium">{t('Texto','Text')}<textarea data-site-input={section.type+'-text'} className={field+' py-2'} rows={2} maxLength={section.type==='area'?400:300} value={section.text} onChange={e=>onChange({text:e.target.value})}/></label></div>;
}
