'use client';
import {useEffect,useRef,useState,type CSSProperties,type FormEvent} from 'react';
import {ContrataCRLogo} from '@/components/brand/brand-logo';
import {siteConsentText,siteThemeTokens,type PublicSite,type SiteSection} from '@/lib/pro/site';
import {readUtm} from '@/lib/pro/ads-tracking';

/**
 * Round 6D (row 69): the professional's website. Same component for the public page (/sitio/<slug>, published
 * version only) and the owner's preview (draft; the form is disabled there). Mobile-first, one h1, landmarks,
 * labelled fields, visible focus, colours from the theme presets (contrast checked for text on each surface).
 */
type Section<T extends SiteSection['type']>=Extract<SiteSection,{type:T}>;
const stars=(n:number)=>'★★★★★'.slice(0,Math.round(n))+'☆☆☆☆☆'.slice(0,5-Math.round(n));
export function SitePage({site,preview=false}:{site:PublicSite;preview?:boolean}){
 const en=site.content.language==='en',t=(es:string,english:string)=>en?english:es,tk=siteThemeTokens[site.theme];
 const style={'--site-bg':tk.bg,'--site-surface':tk.surface,'--site-ink':tk.ink,'--site-muted':tk.muted,'--site-accent':tk.accent,'--site-accent-ink':tk.accentInk,'--site-border':tk.border,background:tk.bg,color:tk.ink} as CSSProperties;
 const enabled=site.content.sections.filter(s=>s.enabled),get=<T extends SiteSection['type']>(type:T)=>enabled.find(s=>s.type===type) as Section<T>|undefined;
 const hero=get('hero'),contact=get('contact'),business=site.business??site.content.title;
 return <div data-site-page={site.slug} data-site-theme={site.theme} data-site-version={site.version??'draft'} lang={en?'en':'es'} style={style} className="min-h-screen">
  <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-[#162543]">{t('Saltar al contenido','Skip to content')}</a>
  <header className="border-b" style={{borderColor:tk.border,background:tk.surface}}>
   <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
    <p className="min-w-0 truncate text-base font-bold">{business}</p>
    {contact&&<a href="#contacto" className="inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{background:tk.accent,color:tk.accentInk,outlineColor:tk.accent}}>{hero?.cta||t('Pedir cotización','Request a quote')}</a>}
   </div>
  </header>
  <main id="contenido" className="mx-auto max-w-5xl space-y-10 px-4 py-8 sm:py-12">
   {hero&&<section aria-labelledby="site-hero" data-site-section="hero" className="rounded-3xl px-5 py-10 sm:px-10 sm:py-14" style={{background:tk.heroBg,color:tk.heroInk}}>
    <h1 id="site-hero" className="text-3xl font-extrabold leading-tight sm:text-5xl">{hero.heading}</h1>
    {hero.subheading&&<p className="mt-3 max-w-2xl text-base sm:text-lg" style={{opacity:0.92}}>{hero.subheading}</p>}
    {contact&&<a href="#contacto" className="mt-6 inline-flex min-h-12 items-center rounded-full px-6 text-base font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{background:tk.accent,color:tk.accentInk,outlineColor:tk.heroInk}}>{hero.cta}</a>}
   </section>}
   {!hero&&<h1 className="text-3xl font-extrabold">{business}</h1>}
   {enabled.filter(s=>s.type!=='hero'&&s.type!=='contact').map(section=><SiteSectionView key={section.type} section={section} site={site} en={en}/>)}
   {contact&&<section id="contacto" aria-labelledby="site-contact" data-site-section="contact" className="scroll-mt-4 rounded-3xl border p-5 sm:p-8" style={{borderColor:tk.border,background:tk.surface}}>
    <h2 id="site-contact" className="text-2xl font-bold">{contact.heading}</h2>{contact.text&&<p className="mt-1 text-sm" style={{color:tk.muted}}>{contact.text}</p>}
    <SiteRequestForm site={site} preview={preview} en={en}/>
   </section>}
  </main>
  <footer className="border-t" style={{borderColor:tk.border}}>
   <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm" style={{color:tk.muted}}>
    <p>© {new Date().getFullYear()} {business}</p>
    <div className="flex items-center gap-2"><span>{t('Sitio creado con','Website made with')}</span><span className="inline-flex rounded-lg bg-white px-2 py-1"><ContrataCRLogo/></span></div>
   </div>
  </footer>
 </div>;
}
function SiteSectionView({section,site,en}:{section:SiteSection;site:PublicSite;en:boolean}){
 const tk=siteThemeTokens[site.theme],t=(es:string,english:string)=>en?english:es,card={borderColor:tk.border,background:tk.surface};
 const heading=<h2 id={'site-'+section.type} className="text-2xl font-bold">{section.heading}</h2>;
 if(section.type==='services')return <section aria-labelledby="site-services" data-site-section="services" className="space-y-4">{heading}
  <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{section.items.map((item,i)=><li key={i} className="rounded-2xl border p-4" style={card}><h3 className="font-bold">{item.name}</h3>{item.description&&<p className="mt-1 text-sm" style={{color:tk.muted}}>{item.description}</p>}</li>)}</ul></section>;
 if(section.type==='portfolio')return section.photos.length?<section aria-labelledby="site-portfolio" data-site-section="portfolio" className="space-y-4">{heading}
  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">{section.photos.map((url,i)=><li key={url} className="overflow-hidden rounded-2xl border" style={card}>
   {/* eslint-disable-next-line @next/next/no-img-element -- photos from the professional's public ContrataCR profile */}
   <img src={url} alt={t(`Trabajo ${i+1} de ${site.business??''}`,`Project ${i+1} by ${site.business??''}`)} loading="lazy" decoding="async" className="aspect-[4/3] h-full w-full object-cover"/></li>)}</ul></section>:null;
 if(section.type==='reviews')return site.reviews.length?<section aria-labelledby="site-reviews" data-site-section="reviews" className="space-y-4">{heading}
  {site.rating.count?<p className="text-sm" style={{color:tk.muted}}><span aria-hidden="true">{stars(Number(site.rating.average??0))}</span> {t(`${Number(site.rating.average??0).toLocaleString('es-CR',{maximumFractionDigits:1})} de 5 · ${site.rating.count===1?'1 reseña':site.rating.count+' reseñas'} en ContrataCR`,`${Number(site.rating.average??0).toLocaleString('en-US',{maximumFractionDigits:1})} out of 5 · ${site.rating.count===1?'1 review':site.rating.count+' reviews'} on ContrataCR`)}</p>:null}
  <ul className="grid gap-3 sm:grid-cols-2">{site.reviews.map((review,i)=><li key={i} className="rounded-2xl border p-4" style={card}><p aria-label={t(`${review.rating} de 5 estrellas`,`${review.rating} out of 5 stars`)} style={{color:tk.accent}}>{stars(review.rating)}</p><blockquote className="mt-1 text-sm">«{review.comment}»</blockquote><p className="mt-2 text-xs font-semibold" style={{color:tk.muted}}>{review.name} · {review.date}</p></li>)}</ul>
  {site.profileSlug&&<p className="text-sm"><a className="font-semibold underline" style={{color:tk.accent}} href={(en?'/en':'')+'/profesionales/'+site.profileSlug}>{t('Ver todas las reseñas en ContrataCR','See all reviews on ContrataCR')}</a></p>}</section>:null;
 if(section.type==='area')return section.text?<section aria-labelledby="site-area" data-site-section="area" className="space-y-2">{heading}<p style={{color:tk.muted}}>{section.text}</p></section>:null;
 return null;
}
function SiteRequestForm({site,preview,en}:{site:PublicSite;preview:boolean;en:boolean}){
 const t=(es:string,english:string)=>en?english:es,tk=siteThemeTokens[site.theme];
 const [state,setState]=useState<'idle'|'sending'|'sent'|'error'>('idle'),[error,setError]=useState(''),submission=useRef<string|null>(null),tracking=useRef<{utm:Record<string,string>;code:string|null}>({utm:{},code:null});
 useEffect(()=>{
  if(preview)return;const read=readUtm(new URLSearchParams(window.location.search));
  try{const saved=sessionStorage.getItem('ccr:site-utm:'+site.slug);if(read.code||Object.keys(read.utm).length)sessionStorage.setItem('ccr:site-utm:'+site.slug,JSON.stringify(read));else if(saved){const parsed=JSON.parse(saved);tracking.current={utm:parsed.utm??{},code:parsed.code??null};return;}}catch{/* storage optional */}
  tracking.current=read;
  if(read.code&&site.campaigns.includes(read.code)){let counted=false;try{counted=sessionStorage.getItem('ccr:site-visit:'+read.code)==='1';sessionStorage.setItem('ccr:site-visit:'+read.code,'1');}catch{/* optional */}
   if(!counted)void fetch('/api/pro/site-public',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'visit',slug:site.slug,code:read.code}),keepalive:true}).catch(()=>{});}
 },[preview,site.slug,site.campaigns]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(preview||state==='sending')return;const form=new FormData(event.currentTarget);
  submission.current??=crypto.randomUUID();setState('sending');setError('');
  const body={action:'submit',slug:site.slug,submissionId:submission.current,name:String(form.get('name')??''),email:String(form.get('email')??''),phone:String(form.get('phone')??''),message:String(form.get('message')??''),service:String(form.get('service')??''),area:String(form.get('area')??''),
   marketingConsent:form.get('marketing')==='on',language:en?'en':'es',code:tracking.current.code,utm:tracking.current.utm,website:String(form.get('website')??'')};
  try{const response=await fetch('/api/pro/site-public',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   if(response.ok){setState('sent');return;}
   setState('error');setError(response.status===400?t('Revise los datos: nombre, correo válido y un mensaje de al menos 5 caracteres.','Check the details: name, a valid email and a message of at least 5 characters.'):t('No se pudo enviar. Reintente: no se enviará dos veces.','Could not send. Retry: it will not be sent twice.'));
  }catch{setState('error');setError(t('No se pudo enviar. Reintente: no se enviará dos veces.','Could not send. Retry: it will not be sent twice.'));}
 }
 if(state==='sent')return <p role="status" data-site-form-sent className="mt-4 rounded-2xl border p-4 font-semibold" style={{borderColor:tk.border}}>{t(`¡Gracias! ${site.business??''} recibió su solicitud y le responderá pronto.`,`Thank you! ${site.business??''} received your request and will reply soon.`)}</p>;
 const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border bg-white px-3 text-base text-[#162543] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1';
 const fieldStyle={borderColor:tk.border,outlineColor:tk.accent};
 return <form data-site-form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2" aria-describedby="site-form-privacy">
  {preview&&<p role="note" className="rounded-xl bg-[#fff6e5] p-3 text-sm text-[#8a5300] sm:col-span-2">{t('Vista previa: el formulario no envía nada.','Preview: the form does not send anything.')}</p>}
  <label className="block text-sm font-semibold">{t('Nombre','Name')}<input name="name" required minLength={2} maxLength={120} autoComplete="name" className={field} style={fieldStyle}/></label>
  <label className="block text-sm font-semibold">{t('Correo','Email')}<input name="email" type="email" required maxLength={254} autoComplete="email" className={field} style={fieldStyle}/></label>
  <label className="block text-sm font-semibold">{t('Teléfono (opcional)','Phone (optional)')}<input name="phone" type="tel" maxLength={30} pattern="[0-9 +()\-]*" autoComplete="tel" className={field} style={fieldStyle}/></label>
  <label className="block text-sm font-semibold">{t('Servicio (opcional)','Service (optional)')}<input name="service" maxLength={120} className={field} style={fieldStyle}/></label>
  <label className="block text-sm font-semibold sm:col-span-2">{t('Zona o dirección (opcional)','Area or address (optional)')}<input name="area" maxLength={200} autoComplete="address-level2" className={field} style={fieldStyle}/></label>
  <label className="block text-sm font-semibold sm:col-span-2">{t('Cuéntenos su proyecto','Tell us about your project')}<textarea name="message" required minLength={5} maxLength={2000} rows={4} className={field+' py-2'} style={fieldStyle}/></label>
  <label className="sr-only" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" defaultValue=""/></label>
  <label className="flex min-h-11 items-start gap-3 text-sm sm:col-span-2"><input type="checkbox" name="marketing" data-site-marketing className="mt-1 h-5 w-5 shrink-0" style={{accentColor:tk.accent}}/><span>{siteConsentText(site.business??site.content.title,en)} <span style={{color:tk.muted}}>{t('(Opcional: su solicitud se envía igual sin marcarlo.)','(Optional: your request is sent the same without it.)')}</span></span></label>
  <p id="site-form-privacy" className="text-xs sm:col-span-2" style={{color:tk.muted}}>{t(`Sus datos se usan solo para responder esta solicitud y los recibe ${site.business??''} a través de ContrataCR (Ley 8968).`,`Your details are only used to answer this request and are received by ${site.business??''} through ContrataCR (Costa Rica Law 8968).`)}</p>
  {error&&<p role="alert" className="text-sm font-semibold text-red-700 sm:col-span-2" style={{background:'#fff',borderRadius:8,padding:'4px 8px'}}>{error}</p>}
  <div className="sm:col-span-2"><button type="submit" disabled={preview||state==='sending'} className="inline-flex min-h-12 items-center rounded-full px-6 font-bold disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{background:tk.accent,color:tk.accentInk,outlineColor:tk.accent}}>{state==='sending'?t('Enviando…','Sending…'):t('Enviar solicitud','Send request')}</button></div>
 </form>;
}
