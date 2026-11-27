'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,MapPin,Search,Store} from 'lucide-react';
import {Navbar} from '@/components/layout/navbar';
import {FooterSoloWeb} from '@/components/landing/footer-solo-web';
import {useSiteFeatures} from '@/components/site-features';
import {SELECT_CLASS,SELECT_STYLE} from './select-style';
import {PLACE_SECTIONS} from '@/lib/directory/place-verticals';
import {PROVINCES,getCantonsByProvince} from '@/lib/data/cr-geography';

/**
 * «Empresa o local» at sign-up (owner 2026-11-27, directory on only): «Agregar o reclamar mi empresa».
 * 1. Search the directory by name (/api/negocio/buscar, every place section): a found business is claimed through
 *    the existing claim page (/lugar/<slug>/reclamar).
 * 2. Not found: a short request (section, name, zone, contact) → POST /api/negocio/solicitud, a draft place that the
 *    team reviews in /admin/directorio «Lugares nuevos». Sending needs an account (create one or sign in, then back here).
 */
type Hit={slug:string;name:string;section:string;area:string};
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const field='min-h-12 w-full rounded-xl border border-[#d7e1ea] bg-white px-3.5 text-base text-[#162543] placeholder:text-[#94a3b8] focus:border-[#009FD9] focus:outline-none';
const label='flex flex-col gap-1.5 text-sm font-semibold text-[#162543]';

export function BusinessSignup({locale,signedIn,redirect}:{locale:string;signedIn:boolean;redirect:string|null}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const {directorySections}=useSiteFeatures();
 const sections=useMemo(()=>PLACE_SECTIONS.filter(s=>directorySections.includes(s.section)),[directorySections]);
 const here=`${prefix}/registro/empresa${redirect?`?redirect=${encodeURIComponent(redirect)}`:''}`;
 const back=`${prefix}/registro?paso=profesional${redirect?`&redirect=${encodeURIComponent(redirect)}`:''}`;

 const [q,setQ]=useState(''),[hits,setHits]=useState<Hit[]|null>(null),[searching,setSearching]=useState(false);
 useEffect(()=>{
  const term=q.trim();
  if(term.length<2)return;
  const ctrl=new AbortController();
  const timer=window.setTimeout(()=>{
   setSearching(true);
   fetch(`/api/negocio/buscar?locale=${en?'en':'es'}&q=${encodeURIComponent(term)}`,{signal:ctrl.signal})
    .then(r=>r.ok?r.json():{items:[]}).then((j:{items?:Hit[]})=>{
     setHits(j.items??[]);
    }).catch(()=>{}).finally(()=>setSearching(false));
  },300);
  return ()=>{window.clearTimeout(timer);ctrl.abort();};
 },[q,en]);

 const [asking,setAsking]=useState(false);
 return <div className="ccr-account-page flex min-h-dvh flex-col bg-white" data-business-signup>
  <Navbar mobileSearch={false}/>
  <main id="contenido" className="mx-auto w-full max-w-2xl flex-1 px-4 pb-14 pt-6 text-[#162543] lg:pt-12">
   <a href={back} className={`inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[#009FD9] hover:underline ${ring}`}><ChevronLeft aria-hidden className="h-4 w-4"/>{t('Volver','Back')}</a>
   <h1 className="mt-2 text-[1.6rem] font-extrabold leading-tight tracking-tight sm:text-4xl">{t('Agregar o reclamar mi empresa','Add or claim my business')}</h1>
   <p className="mt-2 text-[15px] leading-relaxed text-[#526277]">{t('Busque su negocio por nombre. Si ya aparece en ContrataCR, reclámelo gratis; si no aparece, solicite que lo agreguemos.','Search for your business by name. If it is already on ContrataCR, claim it for free; if not, ask us to add it.')}</p>

   <label className="relative mt-6 block">
    <span className="sr-only">{t('Nombre del negocio','Business name')}</span>
    <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#64748b]"/>
    <input type="search" value={q} onChange={e=>setQ(e.target.value)} maxLength={80} autoComplete="off" data-business-search
     placeholder={t('Ejemplo: Soda La Esquina','Example: Soda La Esquina')} className={`${field} pl-11`}/>
   </label>

   {hits&&q.trim().length>=2&&<div className="mt-4" aria-live="polite">
    {hits.length>0
     ?<ul className="divide-y divide-[#eef2f6] overflow-hidden rounded-2xl border border-[#e5e9ee]" data-business-results>
      {hits.map(h=><li key={h.slug}>
       <a href={`${prefix}/lugar/${h.slug}/reclamar`} data-business-claim={h.slug} className={`flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-[#f7fafc] ${ring}`}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#eaf7fd] text-[#0083b0]"><Store aria-hidden className="h-5 w-5"/></span>
        <span className="min-w-0 flex-1">
         <span className="block truncate text-[15px] font-bold">{h.name}</span>
         <span className="flex items-center gap-1 truncate text-[13px] text-[#68778d]">{h.section}{h.area&&<><span aria-hidden>·</span><MapPin aria-hidden className="h-3.5 w-3.5 shrink-0"/>{h.area}</>}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-bold text-[#007fae]">{t('Reclamar','Claim')}<ChevronRight aria-hidden className="h-4 w-4"/></span>
       </a></li>)}
     </ul>
     :!searching&&<p className="rounded-2xl bg-[#f7fafc] px-4 py-3 text-sm text-[#526277]" data-business-no-results>{t('No encontramos un negocio con ese nombre.','We did not find a business with that name.')}</p>}
   </div>}

   <div className="mt-8 border-t border-[#eef2f6] pt-6">
    {!asking
     ?<div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
       <div><p className="text-[16px] font-bold">{t('¿No aparece su negocio?','Is your business not listed?')}</p>
        <p className="text-sm text-[#526277]">{t('Envíenos sus datos y el equipo de ContrataCR lo revisará.','Send us its details and the ContrataCR team will review them.')}</p></div>
       <button type="button" onClick={()=>setAsking(true)} data-business-request-open className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-[#d7e1ea] bg-white px-5 text-sm font-bold text-[#162543] hover:border-[#9fd3ea] ${ring}`}>{t('Solicitar que lo agreguemos','Ask us to add it')}</button>
      </div>
     :<RequestForm en={en} t={t} sections={sections} signedIn={signedIn} here={here} prefix={prefix} initialName={q.trim()}/>}
   </div>
  </main>
  <FooterSoloWeb soloEscritorio/>
 </div>;
}

function RequestForm({en,t,sections,signedIn,here,prefix,initialName}:{en:boolean;t:(es:string,english:string)=>string;sections:typeof PLACE_SECTIONS[number][];signedIn:boolean;here:string;prefix:string;initialName:string}){
 const [vertical,setVertical]=useState(''),[name,setName]=useState(initialName),[province,setProvince]=useState(''),[canton,setCanton]=useState('');
 const [address,setAddress]=useState(''),[phone,setPhone]=useState(''),[whatsapp,setWhatsapp]=useState(''),[website,setWebsite]=useState('');
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState<{ok:boolean;text:string}|null>(null);
 const action=useRef<string|null>(null);
 const dirty=()=>{action.current=null;setNotice(n=>n?.ok?n:null);};
 const provinceObj=PROVINCES.find(p=>p.name===province),cantons=provinceObj?getCantonsByProvince(provinceObj.id):[];
 const reasons:Record<string,string>={name:t('Escriba el nombre del negocio.','Enter the business name.'),phone:t('Revise el teléfono.','Check the phone number.'),whatsapp:t('Revise el número de WhatsApp.','Check the WhatsApp number.'),
  website:t('Use una dirección web que empiece con https://.','Use a web address that starts with https://.'),vertical:t('Elija la sección.','Choose the section.')};
 async function submit(e:React.FormEvent){
  e.preventDefault();setNotice(null);
  if(!vertical){setNotice({ok:false,text:reasons.vertical!});return;}
  if(name.trim().length<2){setNotice({ok:false,text:reasons.name!});return;}
  action.current??=crypto.randomUUID();setBusy(true);
  const place={vertical,name:name.trim(),adminArea1:province||undefined,adminArea2:canton||undefined,addressLine:address.trim()||undefined,
   phone:phone.trim()||undefined,whatsapp:whatsapp.trim()||undefined,website:website.trim()||undefined};
  try{
   const r=await fetch('/api/negocio/solicitud',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({actionId:action.current,place})});
   const j=await r.json().catch(()=>({})) as {reason?:string;error?:string};
   if(r.ok){action.current=null;setNotice({ok:true,text:t('Recibimos su solicitud. El equipo de ContrataCR la revisará; cuando su negocio esté publicado, podrá reclamarlo desde su ficha.','We received your request. The ContrataCR team will review it; once your business is published, you can claim it from its page.')});return;}
   if(r.status===400)action.current=null;
   const key=(j.reason??'').replace(/^invalid_/,'');
   setNotice({ok:false,text:reasons[key]??(r.status===429?(j.error??t('Espere un momento antes de enviar otra solicitud.','Wait a moment before sending another request.')):t('No se pudo enviar la solicitud. Intente de nuevo.','The request could not be sent. Try again.'))});
  }catch{setNotice({ok:false,text:t('Problema de conexión. Intente de nuevo.','Connection problem. Try again.')});}
  finally{setBusy(false);}
 }
 // Without an account the form is not shown yet: it would be lost on the way to sign-up.
 if(!signedIn)return <div className="rounded-2xl bg-[#f7fafc] p-4" data-business-request-login>
     <p className="text-sm text-[#334155]">{t('Para solicitar que agreguemos su negocio necesita una cuenta. Al terminar volverá a esta página.','You need an account to ask us to add your business. You will come back to this page afterwards.')}</p>
     <div className="mt-3 flex flex-wrap gap-2">
      <a href={`${prefix}/registro/cliente?redirect=${encodeURIComponent(here)}`} className={`inline-flex min-h-11 items-center justify-center rounded-full bg-[#009FD9] px-5 text-sm font-bold text-white hover:bg-[#0089bb] ${ring}`}>{t('Crear cuenta','Create account')}</a>
      <a href={`${prefix}/login?redirect=${encodeURIComponent(here)}`} className={`inline-flex min-h-11 items-center justify-center rounded-full border border-[#d7e1ea] bg-white px-5 text-sm font-bold text-[#162543] ${ring}`}>{t('Iniciar sesión','Sign in')}</a>
     </div>
    </div>;
 if(notice?.ok)return <p role="status" data-business-request-sent className="rounded-2xl bg-emerald-50 p-4 text-[15px] font-semibold leading-relaxed text-emerald-900">{notice.text}</p>;
 return <form onSubmit={submit} noValidate data-business-request className="space-y-4">
  <div><h2 className="text-[18px] font-extrabold">{t('Solicitar que agreguemos su negocio','Ask us to add your business')}</h2>
   <p className="mt-1 text-sm text-[#526277]">{t('No se publica hasta que el equipo lo revise.','It is not published until the team reviews it.')}</p></div>
  <div className="grid gap-4 sm:grid-cols-2">
   <label className={`${label} sm:col-span-2`}>{t('Nombre del negocio','Business name')}
    <input name="name" className={field} value={name} maxLength={160} required autoComplete="organization" onChange={e=>{dirty();setName(e.target.value);}}/></label>
   <label className={`${label} sm:col-span-2`}>{t('Sección','Section')}
    <select name="vertical" className={`${field} ${SELECT_CLASS}`} style={SELECT_STYLE} value={vertical} onChange={e=>{dirty();setVertical(e.target.value);}}>
     <option value="">{t('Elija una sección','Choose a section')}</option>
     {sections.map(s=><option key={s.id} value={s.id}>{en?s.nameEn:s.nameEs}</option>)}
    </select></label>
   <label className={label}>{t('Provincia','Province')}
    <select name="province" className={`${field} ${SELECT_CLASS}`} style={SELECT_STYLE} value={province} onChange={e=>{dirty();setProvince(e.target.value);setCanton('');}}>
     <option value="">{t('Elija','Choose')}</option>{PROVINCES.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
    </select></label>
   <label className={label}>{t('Cantón','Canton')}
    <select name="canton" className={`${field} ${SELECT_CLASS}`} style={SELECT_STYLE} value={canton} disabled={!cantons.length} onChange={e=>{dirty();setCanton(e.target.value);}}>
     <option value="">{t('Elija','Choose')}</option>{cantons.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
    </select></label>
   <label className={`${label} sm:col-span-2`}>{t('Dirección (opcional)','Address (optional)')}
    <input name="address" className={field} value={address} maxLength={300} onChange={e=>{dirty();setAddress(e.target.value);}}/></label>
   <label className={label}>{t('Teléfono (opcional)','Phone (optional)')}<input name="phone" type="tel" className={field} value={phone} placeholder="2222-3333" onChange={e=>{dirty();setPhone(e.target.value);}}/></label>
   <label className={label}>{t('WhatsApp (opcional)','WhatsApp (optional)')}<input name="whatsapp" type="tel" className={field} value={whatsapp} placeholder="8888-7777" onChange={e=>{dirty();setWhatsapp(e.target.value);}}/></label>
   <label className={`${label} sm:col-span-2`}>{t('Sitio web (opcional)','Website (optional)')}<input name="website" type="url" className={field} value={website} placeholder="https://" onChange={e=>{dirty();setWebsite(e.target.value);}}/></label>
  </div>
  {notice&&<p role="alert" data-business-request-error className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{notice.text}</p>}
  <button type="submit" disabled={busy} data-business-request-submit className={`inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#009FD9] px-6 text-[15px] font-bold text-white hover:bg-[#0089bb] disabled:opacity-60 sm:w-auto ${ring}`}>{busy?t('Enviando…','Sending…'):t('Enviar solicitud','Send request')}</button>
 </form>;
}
