'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useTranslations} from 'next-intl';
import type {Map as MapLibreMap,Marker} from 'maplibre-gl';
import {SELECT_CLASS,SELECT_STYLE} from './select-style';
import {PLACE_SECTIONS} from '@/lib/directory/place-verticals';
import {PROVINCES,getCantonsByProvince} from '@/lib/data/cr-geography';
import {DISTRICTS} from '@/lib/data/cr-districts';
import {createMap,loadMapLibre,supportsWebGL} from '@/lib/maps/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * LOCAL PRO ONLY (owner 2026-11-26, «los agregamos nosotros»): the ContrataCR team adds a place by hand (parqueos, lavacar,
 * hoteles, casas por días or any enabled section). POST /api/admin/directorio {kind:'place_create'} → dir_admin_place_create:
 * published at once with source `equipo`, its hours, and a row in the directory history. The actionId is kept until the
 * server answers, so a retry never creates the place twice. Photos are added afterwards from the place page.
 */
type Hours={open:boolean;opens:string;closes:string};
// Display order Monday → Sunday; weekday values as stored (0 = Sunday, like dir_search_open_at).
const WEEK=[1,2,3,4,5,6,0] as const;
const CR_CENTER:[number,number]=[-84.0907,9.9281];
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const field='min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-[#162543]';
const label='flex flex-col gap-1 text-sm font-semibold text-[#162543]';

function PinPicker({lat,lng,onPick,locale,hint,failed}:{lat:number|null;lng:number|null;onPick:(lat:number,lng:number)=>void;locale:string;hint:string;failed:string}){
 const box=useRef<HTMLDivElement>(null),map=useRef<MapLibreMap|null>(null),marker=useRef<Marker|null>(null),lib=useRef<typeof import('maplibre-gl')|null>(null);
 const pick=useRef(onPick);pick.current=onPick;
 const [error,setError]=useState(false);
 useEffect(()=>{
  let alive=true;
  loadMapLibre().then(m=>{
   if(!alive||!box.current)return;if(!supportsWebGL()){setError(true);return;}
   lib.current=m;
   const inst=createMap(m,box.current,{language:locale,center:CR_CENTER,zoom:8,cooperativeGestures:true});
   inst.addControl(new m.NavigationControl({showCompass:false}),'top-right');
   inst.on('click',e=>pick.current(Math.round(e.lngLat.lat*1e6)/1e6,Math.round(e.lngLat.lng*1e6)/1e6));
   map.current=inst;
  }).catch(()=>{if(alive)setError(true);});
  return ()=>{alive=false;map.current?.remove();map.current=null;};
 },[locale]);
 useEffect(()=>{
  const m=lib.current,inst=map.current;if(!m||!inst)return;
  if(lat==null||lng==null){marker.current?.remove();marker.current=null;return;}
  if(!marker.current)marker.current=new m.Marker({color:'#009FD9'}).setLngLat([lng,lat]).addTo(inst);else marker.current.setLngLat([lng,lat]);
 },[lat,lng]);
 return <div className="space-y-1">
  {error?<p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{failed}</p>
   :<div ref={box} data-admin-place-map className="h-56 w-full overflow-hidden rounded-xl border border-slate-300"/>}
  {!error&&<p className="text-xs text-slate-600">{hint}</p>}
 </div>;
}

export function AdminPlaceCreate({locale,sections}:{locale:string;sections:readonly string[]}){
 const t=useTranslations('adminPlaceCreate');
 const en=locale==='en';
 const options=useMemo(()=>PLACE_SECTIONS.filter(s=>sections.includes(s.section)),[sections]);
 const [vertical,setVertical]=useState<string>(()=>options.find(s=>s.id==='parking')?.id??options[0]?.id??'');
 const section=options.find(s=>s.id===vertical);
 const [kind,setKind]=useState(''),[name,setName]=useState(''),[province,setProvince]=useState(''),[canton,setCanton]=useState(''),[district,setDistrict]=useState('');
 const [address,setAddress]=useState(''),[lat,setLat]=useState(''),[lng,setLng]=useState(''),[phone,setPhone]=useState(''),[whatsapp,setWhatsapp]=useState(''),[website,setWebsite]=useState('');
 const [hours,setHours]=useState<Record<number,Hours>>(()=>Object.fromEntries(WEEK.map(d=>[d,{open:false,opens:'08:00',closes:'17:00'}])));
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState<{ok:boolean;text:string;slug?:string}|null>(null);
 const action=useRef<string|null>(null);
 const provinceObj=PROVINCES.find(p=>p.name===province);
 const cantons=provinceObj?getCantonsByProvince(provinceObj.id):[];
 const cantonObj=cantons.find(c=>c.name===canton);
 const districts=cantonObj?[cantonObj.name,...DISTRICTS.filter(d=>d.cantonId===cantonObj.id).map(d=>d.name)]:[];
 const latN=lat.trim()===''?null:Number(lat),lngN=lng.trim()===''?null:Number(lng);
 const dirty=()=>{action.current=null;};
 const setDay=(d:number,patch:Partial<Hours>)=>{dirty();setHours(h=>({...h,[d]:{...h[d]!,...patch}}));};
 const copyMonday=()=>{dirty();setHours(h=>Object.fromEntries(WEEK.map(d=>[d,{...h[1]!}])));};

 async function submit(e:React.FormEvent){
  e.preventDefault();setNotice(null);
  if(name.trim().length<2){setNotice({ok:false,text:t('errors.name')});return;}
  if((latN==null)!==(lngN==null)||(latN!=null&&(!Number.isFinite(latN)||!Number.isFinite(lngN!)))){setNotice({ok:false,text:t('errors.lat')});return;}
  action.current??=crypto.randomUUID();setBusy(true);
  const body={kind:'place_create',actionId:action.current,place:{vertical,name,...(kind?{kind}:{}),adminArea1:province||undefined,adminArea2:canton||undefined,
   adminArea3:district&&district!==canton?district:undefined,addressLine:address||undefined,lat:latN,lng:lngN,phone:phone||undefined,whatsapp:whatsapp||undefined,website:website||undefined},
   hours:WEEK.filter(d=>hours[d]!.open).map(d=>({weekday:d,opens:hours[d]!.opens,closes:hours[d]!.closes}))};
  try{
   const r=await fetch('/api/admin/directorio',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
   const j=await r.json().catch(()=>({})) as {slug?:string;reason?:string};
   if(r.ok&&j.slug){action.current=null;setNotice({ok:true,text:t('saved'),slug:j.slug});setName('');setAddress('');setLat('');setLng('');setPhone('');setWhatsapp('');setWebsite('');}
   else{const key=(j.reason??'').replace(/^invalid_/,'');
    setNotice({ok:false,text:['name','phone','whatsapp','website','lat','lng','hours','kind','vertical'].includes(key)?t(`errors.${key==='lng'?'lat':key}`):t('errors.generic')});
    if(r.status===400)action.current=null;}
  }catch{setNotice({ok:false,text:t('errors.generic')});}
  finally{setBusy(false);}
 }
 const prefix=en?'/en':'';
 return <form onSubmit={submit} data-admin-place-create className="space-y-5 rounded-2xl border border-[#d7e1ea] bg-white p-4 text-[#162543] sm:p-6" noValidate>
  <div><h2 className="text-xl font-extrabold">{t('title')}</h2><p className="mt-1 text-sm text-slate-600">{t('lead')}</p></div>
  <div className="grid gap-4 sm:grid-cols-2">
   <label className={label}>{t('section')}
    <select name="vertical" className={`${field} ${SELECT_CLASS}`} style={SELECT_STYLE} value={vertical} onChange={e=>{dirty();setVertical(e.target.value);setKind('');}}>
     {options.map(s=><option key={s.id} value={s.id}>{en?s.nameEn:s.nameEs}</option>)}
    </select></label>
   {section&&section.kinds.length>0&&<label className={label}>{t('kind')}
    <select name="kind" className={`${field} ${SELECT_CLASS}`} style={SELECT_STYLE} value={kind} onChange={e=>{dirty();setKind(e.target.value);}}>
     <option value="">{t('kindNone')}</option>
     {section.kinds.map(k=><option key={k.value} value={k.value}>{en?k.en:k.es}</option>)}
    </select></label>}
   <label className={`${label} sm:col-span-2`}>{t('name')}
    <input name="name" className={field} value={name} maxLength={160} required onChange={e=>{dirty();setName(e.target.value);}} autoComplete="off"/></label>
   <label className={label}>{t('province')}
    <select name="province" className={`${field} ${SELECT_CLASS}`} style={SELECT_STYLE} value={province} onChange={e=>{dirty();setProvince(e.target.value);setCanton('');setDistrict('');}}>
     <option value="">{t('choose')}</option>{PROVINCES.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
    </select></label>
   <label className={label}>{t('canton')}
    <select name="canton" className={`${field} ${SELECT_CLASS}`} style={SELECT_STYLE} value={canton} disabled={!cantons.length} onChange={e=>{dirty();setCanton(e.target.value);setDistrict('');}}>
     <option value="">{t('choose')}</option>{cantons.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
    </select></label>
   <label className={label}>{t('district')}
    <select name="district" className={`${field} ${SELECT_CLASS}`} style={SELECT_STYLE} value={district} disabled={!districts.length} onChange={e=>{dirty();setDistrict(e.target.value);}}>
     <option value="">{t('choose')}</option>{districts.map(d=><option key={d} value={d}>{d}</option>)}
    </select></label>
   <label className={`${label} sm:col-span-2`}>{t('address')}
    <textarea name="address" className={`${field} min-h-20 py-2`} maxLength={300} value={address} placeholder={t('addressHint')} onChange={e=>{dirty();setAddress(e.target.value);}}/></label>
  </div>
  <fieldset className="space-y-2"><legend className="text-sm font-semibold">{t('pin')}</legend>
   <PinPicker lat={latN} lng={lngN} locale={locale} hint={t('pinHint')} failed={t('pinFailed')} onPick={(a,b)=>{dirty();setLat(String(a));setLng(String(b));}}/>
   <div className="grid grid-cols-2 gap-3">
    <label className={label}>{t('lat')}<input name="lat" inputMode="decimal" className={field} value={lat} onChange={e=>{dirty();setLat(e.target.value);}}/></label>
    <label className={label}>{t('lng')}<input name="lng" inputMode="decimal" className={field} value={lng} onChange={e=>{dirty();setLng(e.target.value);}}/></label>
   </div>
  </fieldset>
  <div className="grid gap-4 sm:grid-cols-3">
   <label className={label}>{t('phone')}<input name="phone" type="tel" className={field} value={phone} placeholder="2222-3333" onChange={e=>{dirty();setPhone(e.target.value);}}/></label>
   <label className={label}>{t('whatsapp')}<input name="whatsapp" type="tel" className={field} value={whatsapp} placeholder="8888-7777" onChange={e=>{dirty();setWhatsapp(e.target.value);}}/></label>
   <label className={label}>{t('website')}<input name="website" type="url" className={field} value={website} placeholder="https://" onChange={e=>{dirty();setWebsite(e.target.value);}}/></label>
  </div>
  <fieldset className="space-y-2" data-admin-place-hours><legend className="text-sm font-semibold">{t('hours')}</legend>
   <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
    {WEEK.map(d=>{const h=hours[d]!;return <li key={d} className="flex flex-wrap items-center gap-2 px-3 py-2">
     <label className="flex min-h-11 w-32 items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-5 w-5" checked={h.open} onChange={e=>setDay(d,{open:e.target.checked})}/>{t(`days.d${d}`)}</label>
     {h.open?<><input aria-label={`${t(`days.d${d}`)} ${t('opens')}`} type="time" className={`${field} w-28`} value={h.opens} onChange={e=>setDay(d,{opens:e.target.value})}/>
      <span aria-hidden="true">–</span>
      <input aria-label={`${t(`days.d${d}`)} ${t('closes')}`} type="time" className={`${field} w-28`} value={h.closes} onChange={e=>setDay(d,{closes:e.target.value})}/></>
      :<span className="text-sm text-slate-500">{t('closed')}</span>}
    </li>;})}
   </ul>
   <button type="button" onClick={copyMonday} className={`min-h-11 rounded-full border border-slate-300 px-4 text-sm font-semibold ${ring}`}>{t('copyMonday')}</button>
  </fieldset>
  <p className="rounded-xl bg-[#F7FAFC] p-3 text-sm text-slate-700">{t('photosNote')}</p>
  {notice&&<p role="status" data-admin-place-notice={notice.ok?'ok':'error'} className={`rounded-xl p-3 text-sm ${notice.ok?'bg-emerald-50 text-emerald-900':'bg-red-50 text-red-900'}`}>
   {notice.text}{notice.slug&&<> <a data-admin-place-link href={`${prefix}/lugar/${notice.slug}`} className="font-semibold underline">{`${prefix}/lugar/${notice.slug}`}</a></>}</p>}
  <button type="submit" disabled={busy||!vertical} className={`inline-flex min-h-11 items-center justify-center rounded-full bg-[#162543] px-6 text-sm font-semibold text-white disabled:opacity-50 ${ring}`}>{busy?t('saving'):t('submit')}</button>
 </form>;
}
