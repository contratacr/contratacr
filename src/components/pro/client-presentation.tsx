'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {accentTokens,presentationAccents,presentationClientSchema,presentationOwnerSchema,presentationResultSchema,weatherCities,weatherCityKeys,weatherLabel,weatherSchema,
 PRESENTATION_VIDEO_PATTERN,type PresentationAccent,type PresentationClient,type PresentationOwner,type Weather,type WeatherCity} from '@/lib/pro/client-presentation';

/**
 * Row 33: presentation of the customer view of a job. The customer (and the owner's read-only preview) sees the cover,
 * a video link and a weather widget; the owner edits them and hides individual documents. Hiding is presentation only:
 * it never revokes access. Nothing here sends a message.
 */
const api='/api/pro/client-presentation';
const COPY={
 es:{cover:'Portada',video:'Ver el video del proyecto',videoLabel:'Video del proyecto',weather:'Clima en',today:'Hoy',rain:'lluvia',noWeather:'El pronóstico no está disponible en este momento.',
  title:'Presentación para el cliente',intro:'Personalice cómo ve su cliente este trabajo: portada, video, clima y documentos. Ocultar un documento no le quita el acceso: solo no se muestra en su vista.',
  headline:'Título de la portada',subtitle:'Texto bajo el título',accent:'Color',accentNames:{cyan:'Celeste',navy:'Azul oscuro',green:'Verde',amber:'Ámbar',rose:'Rosa',slate:'Gris'} as Record<string,string>,
  videoUrl:'Enlace del video (YouTube o Vimeo)',videoHelp:'Pegue un enlace https de YouTube o Vimeo.',showWeather:'Mostrar el clima del lugar de la obra',city:'Provincia',choose:'Elija una provincia',
  save:'Guardar presentación',saved:'Presentación guardada.',failed:'No se pudo guardar. Reintente: no se duplicará.',changed:'La presentación cambió en otra pestaña. Se recargó.',loadFailed:'No se pudo cargar la presentación.',retry:'Reintentar',loading:'Cargando…',
  docs:'Documentos visibles para el cliente',docsEmpty:'Todavía no hay contratos, cotizaciones o archivos compartidos con el cliente.',hide:'Ocultar',show:'Mostrar',hiddenTag:'Oculto al cliente',
  kinds:{contract:'Contrato',quote:'Cotización',file:'Archivo'} as Record<string,string>,opens:'Aperturas del cliente',neverOpened:'El cliente todavía no ha abierto esta vista.',
  openedTimes:(n:number)=>n===1?'Abierta 1 vez':`Abierta ${n} veces`,firstOpen:'Primera apertura',lastOpen:'Última apertura',notLinked:'Cuando el cliente esté vinculado al trabajo verá esta presentación y aquí aparecerá cuándo la abre.',
  videoInvalid:'El enlace debe ser de YouTube o Vimeo (https).'},
 en:{cover:'Cover',video:'Watch the project video',videoLabel:'Project video',weather:'Weather in',today:'Today',rain:'rain',noWeather:'The forecast is not available right now.',
  title:'Presentation for the customer',intro:'Customize how your customer sees this job: cover, video, weather and documents. Hiding a document does not remove access: it is just not shown in their view.',
  headline:'Cover title',subtitle:'Text under the title',accent:'Color',accentNames:{cyan:'Cyan',navy:'Navy',green:'Green',amber:'Amber',rose:'Rose',slate:'Slate'} as Record<string,string>,
  videoUrl:'Video link (YouTube or Vimeo)',videoHelp:'Paste an https link from YouTube or Vimeo.',showWeather:'Show the weather at the job site',city:'Province',choose:'Choose a province',
  save:'Save presentation',saved:'Presentation saved.',failed:'Could not save. Try again: it will not be duplicated.',changed:'The presentation changed in another tab. It was reloaded.',loadFailed:'Could not load the presentation.',retry:'Retry',loading:'Loading…',
  docs:'Documents visible to the customer',docsEmpty:'No contracts, quotes or files have been shared with the customer yet.',hide:'Hide',show:'Show',hiddenTag:'Hidden from the customer',
  kinds:{contract:'Contract',quote:'Quote',file:'File'} as Record<string,string>,opens:'Customer openings',neverOpened:'The customer has not opened this view yet.',
  openedTimes:(n:number)=>n===1?'Opened once':`Opened ${n} times`,firstOpen:'First opened',lastOpen:'Last opened',notLinked:'When the customer is linked to the job they will see this presentation and you will see here when they open it.',
  videoInvalid:'The link must be from YouTube or Vimeo (https).'},
};
const useCopy=()=>{const l=useLocale()==='en'?'en':'es';return {c:COPY[l],en:l==='en',locale:l==='en'?'en-US':'es-CR'};};
const when=(v:string,locale:string)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(v));

// ------------------------------------------------------------------ customer side
export function ClientPresentation({requestId}:{requestId:string}){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <ClientPresentationSession key={user.id+':'+requestId} accountId={user.id} requestId={requestId}/>;
}
function ClientPresentationSession({accountId,requestId}:{accountId:string;requestId:string}){
 const {c,en,locale}=useCopy();const [view,setView]=useState<PresentationClient|null>(null),[weather,setWeather]=useState<Weather|null>(null);
 useEffect(()=>{let live=true;(async()=>{try{const r=await fetch(api+'?'+new URLSearchParams({requestId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)return;const v=presentationClientSchema.parse(await r.json());if(!live)return;setView(v);
   if(v.visible&&v.showWeather&&v.weatherCity){const w=await fetch(api+'/weather?'+new URLSearchParams({city:v.weatherCity}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(w.ok&&live)setWeather(weatherSchema.parse(await w.json()));}}catch{}})();return()=>{live=false;};},[accountId,requestId]);
 if(!view||!view.visible)return null;
 const tone=accentTokens[view.accent],hasCover=!!(view.headline||view.subtitle),video=view.videoUrl&&PRESENTATION_VIDEO_PATTERN.test(view.videoUrl)?view.videoUrl:null;
 if(!hasCover&&!video&&!(view.showWeather&&view.weatherCity))return null;
 return <section data-client-presentation aria-label={c.cover} className="min-w-0 space-y-3">
  {hasCover&&<div data-client-cover className="rounded-2xl px-5 py-6 sm:px-8 sm:py-8" style={{background:tone.bg,color:tone.ink}}>
   {view.headline&&<h2 className="break-words text-xl font-extrabold leading-tight sm:text-2xl">{view.headline}</h2>}
   {view.subtitle&&<p className="mt-1 max-w-prose break-words text-sm opacity-90 sm:text-base">{view.subtitle}</p>}</div>}
  {(video||(view.showWeather&&view.weatherCity))&&<div className="grid gap-3 sm:grid-cols-2">
   {video&&<a data-client-video href={video} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-[#d7e1ea] bg-white px-4 py-3 text-sm font-semibold text-[#162543] hover:border-[#009fd9]">
    <span className="min-w-0"><span className="block text-xs font-semibold uppercase tracking-wide text-[#68778d]">{c.videoLabel}</span><span className="block break-words">{c.video}</span></span><span aria-hidden>↗</span></a>}
   {view.showWeather&&view.weatherCity&&<div data-client-weather className="min-w-0 rounded-2xl border border-[#d7e1ea] bg-white px-4 py-3 text-sm text-[#162543]">
    <p className="text-xs font-semibold uppercase tracking-wide text-[#68778d]">{c.weather} {weatherCities[view.weatherCity][en?'en':'es']}</p>
    {weather?.available?<><p className="mt-1 text-lg font-bold">{weather.tempC!=null?Math.round(weather.tempC)+' °C':''} <span className="text-sm font-semibold text-[#52627a]">{weatherLabel(weather.code,en)}</span></p>
     <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#52627a]">{(weather.days??[]).map(d=><li key={d.date}>{new Intl.DateTimeFormat(locale,{weekday:'short',day:'numeric',timeZone:'UTC'}).format(new Date(d.date+'T12:00:00Z'))}: {d.maxC!=null?Math.round(d.maxC):'–'}°/{d.minC!=null?Math.round(d.minC):'–'}°{d.rainPct!=null?` · ${d.rainPct}% ${c.rain}`:''}</li>)}</ul></>
     :<p className="mt-1 text-xs text-[#52627a]">{c.noWeather}</p>}</div>}</div>}
 </section>;
}

// ------------------------------------------------------------------ owner side
export function ClientPresentationEditor({workId}:{workId:string}){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <EditorSession key={user.id+':'+workId} accountId={user.id} workId={workId}/>;
}
function EditorSession({accountId,workId}:{accountId:string;workId:string}){
 const {c,locale}=useCopy();
 const [data,setData]=useState<PresentationOwner|null>(null),[error,setError]=useState(false),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
 const [headline,setHeadline]=useState(''),[subtitle,setSubtitle]=useState(''),[accent,setAccent]=useState<PresentationAccent>('cyan'),[video,setVideo]=useState(''),[showWeather,setShowWeather]=useState(false),[city,setCity]=useState<WeatherCity|''>(''),[bad,setBad]=useState('');
 const pending=useRef<{key:string;actionId:string}|null>(null),seq=useRef(0);
 const load=useCallback(async()=>{const n=++seq.current;try{setError(false);const r=await fetch(api+'?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error(String(r.status));const d=presentationOwnerSchema.parse(await r.json());
  if(n===seq.current){setData(d);setHeadline(d.headline??'');setSubtitle(d.subtitle??'');setAccent(d.accent);setVideo(d.videoUrl??'');setShowWeather(d.showWeather);setCity(d.weatherCity??'');}}catch{if(n===seq.current)setError(true);}},[accountId,workId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function send(body:unknown){const r=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(body)});let json:Record<string,unknown>|null=null;try{json=await r.json();}catch{}return {status:r.status,ok:r.ok,json};}
 async function save(){if(!data||busy)return;const url=video.trim();setBad('');
  if(url&&!PRESENTATION_VIDEO_PATTERN.test(url)){setBad('video');setMsg('');return;}if(showWeather&&!city){setBad('city');setMsg('');return;}
  const body={action:'save',workId,revision:data.revision,headline:headline.trim()||null,subtitle:subtitle.trim()||null,accent,videoUrl:url||null,showWeather,weatherCity:showWeather?city:null},key=JSON.stringify(body);
  if(pending.current?.key!==key)pending.current={key,actionId:crypto.randomUUID()};
  setBusy(true);setMsg('');
  try{const r=await send({...body,actionId:pending.current.actionId});
   if(r.status===409){pending.current=null;setMsg(c.changed);await load();return;}
   if(r.status===400&&r.json?.reason==='pro_presentation_video'){pending.current=null;setBad('video');return;}
   if(!r.ok)throw Error();presentationResultSchema.parse(r.json);pending.current=null;setMsg(c.saved);await load();}
  catch{setMsg(c.failed);}finally{setBusy(false);}}
 async function toggle(kind:'contract'|'quote'|'file',id:string,hidden:boolean){if(busy)return;setBusy(true);setMsg('');
  try{const r=await send({action:'hide',actionId:crypto.randomUUID(),workId,kind,itemId:id,hidden});if(!r.ok)throw Error();await load();}catch{setMsg(c.failed);}finally{setBusy(false);}}
 const isHidden=(kind:string,id:string)=>!!data?.hidden.some(h=>h.kind===kind&&h.itemId===id);
 const field='mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3 text-base text-[#162543]';
 return <section data-client-presentation-editor aria-label={c.title} className="mt-4 min-w-0 space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <div><h3 className="text-base font-bold text-[#162543]">{c.title}</h3><p className="mt-0.5 max-w-prose text-xs text-[#52627a]">{c.intro}</p></div>
  {error&&<p role="alert" className="text-sm">{c.loadFailed} <Button size="sm" variant="outline" onClick={()=>void load()}>{c.retry}</Button></p>}
  {!data&&!error&&<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>}
  {msg&&<p role="status" data-client-presentation-notice className="text-sm text-[#1f6f43]">{msg}</p>}
  {data&&<>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className="block min-w-0 text-sm font-semibold text-[#162543]">{c.headline}<input data-presentation-headline className={field} maxLength={120} value={headline} disabled={busy} onChange={e=>setHeadline(e.target.value)}/></label>
    <label className="block min-w-0 text-sm font-semibold text-[#162543]">{c.subtitle}<input data-presentation-subtitle className={field} maxLength={240} value={subtitle} disabled={busy} onChange={e=>setSubtitle(e.target.value)}/></label></div>
   <div role="radiogroup" aria-label={c.accent} className="flex flex-wrap gap-2">{presentationAccents.map(k=><button key={k} type="button" role="radio" aria-checked={accent===k} disabled={busy} data-presentation-accent={k} onClick={()=>setAccent(k)}
    className={'inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-semibold '+(accent===k?'border-[#162543] bg-[#f1f5f9]':'border-[#d7e1ea] bg-white')}><span aria-hidden className="h-4 w-4 rounded-full" style={{background:accentTokens[k].bg}}/>{c.accentNames[k]}</button>)}</div>
   <label className="block min-w-0 text-sm font-semibold text-[#162543]">{c.videoUrl}<input data-presentation-video aria-invalid={bad==='video'} className={field+(bad==='video'?' border-red-500':'')} type="url" inputMode="url" maxLength={300} value={video} disabled={busy} onChange={e=>{setVideo(e.target.value);if(bad==='video')setBad('');}}/>
    <span className="mt-1 block text-xs font-normal text-[#52627a]">{bad==='video'?c.videoInvalid:c.videoHelp}</span></label>
   <div className="space-y-2"><label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-[#162543]"><input data-presentation-weather type="checkbox" className="h-5 w-5" checked={showWeather} disabled={busy} onChange={e=>{setShowWeather(e.target.checked);setBad('');}}/>{c.showWeather}</label>
    {showWeather&&<label className="block max-w-xs text-sm font-semibold text-[#162543]">{c.city}<select data-presentation-city aria-invalid={bad==='city'} className={field+(bad==='city'?' border-red-500':'')} value={city} disabled={busy} onChange={e=>{setCity(e.target.value as WeatherCity);setBad('');}}>
     <option value="">{c.choose}</option>{weatherCityKeys.map(k=><option key={k} value={k}>{weatherCities[k][locale==='en-US'?'en':'es']}</option>)}</select></label>}</div>
   <Button type="button" data-pro-write="work.write" data-presentation-save disabled={busy} onClick={()=>void save()}>{c.save}</Button>
   <div><h4 className="text-sm font-bold text-[#162543]">{c.docs}</h4>
    {data.documents.length===0?<p className="mt-1 text-sm text-[#52627a]">{data.linked?c.docsEmpty:c.notLinked}</p>
     :<ul className="mt-2 space-y-2">{data.documents.map(d=>{const hid=isHidden(d.kind,d.id);return <li key={d.kind+d.id} data-presentation-doc={d.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f7f9fc] px-3 py-2 text-sm">
      <span className="min-w-0 break-words"><span className="text-xs font-semibold uppercase tracking-wide text-[#68778d]">{c.kinds[d.kind]}</span> {d.title||d.id}{hid&&<span className="ml-2 rounded-full bg-[#eef2f6] px-2 py-0.5 text-xs text-[#52627a]">{c.hiddenTag}</span>}</span>
      <Button type="button" size="sm" variant="outline" data-pro-write="work.write" data-presentation-toggle={d.id} disabled={busy} onClick={()=>void toggle(d.kind,d.id,!hid)}>{hid?c.show:c.hide}</Button></li>;})}</ul>}</div>
   <div data-presentation-opens><h4 className="text-sm font-bold text-[#162543]">{c.opens}</h4>
    {data.opens.count===0?<p className="mt-1 text-sm text-[#52627a]">{c.neverOpened}</p>
     :<p className="mt-1 text-sm text-[#162543]">{c.openedTimes(data.opens.count)}{data.opens.firstAt&&` · ${c.firstOpen}: ${when(data.opens.firstAt,locale)}`}{data.opens.lastAt&&` · ${c.lastOpen}: ${when(data.opens.lastAt,locale)}`}</p>}</div>
  </>}
 </section>;
}
