'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { useLocale,useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
export function PagedSelect<T extends {id:string}>({url,value,label,placeholder,searchLabel,moreLabel,name,required,disabled,selected,optionLabel,onChange,onRows,parse,detailUrl}:{
 url:string;value:string;label:string;placeholder:string;searchLabel:string;moreLabel:string;name?:string;required?:boolean;disabled?:boolean;selected?:T;
 optionLabel:(row:T)=>string;onChange:(row:T|undefined)=>void;onRows?:(rows:T[])=>void;parse:(body:unknown)=>T[];detailUrl?:(id:string)=>string;
}){
 const en=useLocale()==='en',copy=useTranslations('ProControlsUX');
 const [rows,setRows]=useState<T[]>([]),[search,setSearch]=useState(''),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[chosen,setChosen]=useState<T|undefined>(selected);
 const [detailRetry,setDetailRetry]=useState(0);
 // A successful list refresh must not hide an unresolved selected-record failure.
 const [detailError,setDetailError]=useState<{value:string;message:string}|null>(null);
 const sequence=useRef(0),busy=useRef(false),latest=useRef({parse,onRows,detailUrl});
 useEffect(()=>{latest.current={parse,onRows,detailUrl};},[parse,onRows,detailUrl]);
 async function load(after=''){
 if(busy.current&&after)return;busy.current=true;const request=++sequence.current;setLoading(true);setError('');
 try{
 const r=await fetch(url+'&'+new URLSearchParams({q:search,after}),{cache:'no-store'});const body=await r.json();if(!r.ok)throw Error();
 if(sequence.current!==request)return;
 const next=latest.current.parse(body);setRows(old=>after?[...old.filter(r=>!next.some(n=>n.id===r.id)),...next]:next);setCursor(body.nextCursor);latest.current.onRows?.(next);
 }catch{if(sequence.current===request)setError(en?'Could not load options. Retry.':'No se pudieron cargar las opciones. Reintente.');}
 finally{if(sequence.current===request){busy.current=false;setLoading(false);}}
 }
 const invalidate=useCallback(()=>{sequence.current++;busy.current=false;},[]);
 const loadRef=useRef(load);useEffect(()=>{loadRef.current=load;});
 useEffect(()=>{invalidate();const timer=setTimeout(()=>void loadRef.current(),200);return()=>{clearTimeout(timer);invalidate();};},[url,search,invalidate]);
 useEffect(()=>{
 if(!value||selected?.id===value||!latest.current.detailUrl)return;
 let alive=true;
 fetch(latest.current.detailUrl(value),{cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok)throw Error();if(!alive)return;const item=latest.current.parse(b)[0];if(item){setChosen(item);setDetailError(null);latest.current.onRows?.([item]);}else setDetailError({value,message:en?'Selected record is unavailable.':'El registro seleccionado no está disponible.'});}).catch(()=>{if(alive)setDetailError({value,message:en?'Selected record is unavailable.':'El registro seleccionado no está disponible.'});});
 return()=>{alive=false;};
 },[value,selected?.id,en,detailRetry]);
 const visibleError=[error,detailError?.value===value?detailError.message:''].filter(Boolean).join(' ');
 const fallback=selected?.id===value?selected:chosen?.id===value?chosen:undefined;
 const options=fallback&&!rows.some(r=>r.id===value)?[fallback,...rows]:rows;
 return <div className="space-y-2" aria-busy={loading}>
 <label className="block text-[13px] font-bold text-[#162543]">{label}<select aria-label={label} name={name} value={value} required={required} disabled={disabled||loading&&!options.length&&!value} onChange={e=>{const row=options.find(r=>r.id===e.target.value);setChosen(row);onChange(row);}} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-[15px]"><option value="">{placeholder}</option>{value&&!options.some(r=>r.id===value)&&<option value={value}>{en?"Selected record…":"Registro seleccionado…"}</option>}{options.map(row=><option key={row.id} value={row.id}>{optionLabel(row)}</option>)}</select></label>
 <input aria-label={searchLabel} placeholder={searchLabel} value={search} maxLength={160} disabled={disabled} onChange={e=>{sequence.current++;busy.current=false;setLoading(true);setRows([]);setCursor(null);setSearch(e.target.value);}} className="min-h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm"/>
 {!visibleError&&(loading||!rows.length)&&<p role="status" className="text-xs text-[#68778d]">{loading?copy('loading'):search.trim()?copy('empty'):copy('emptyAll')}</p>}
 {cursor&&<Button type="button" variant="secondary" disabled={disabled||loading} onClick={()=>void load(cursor)}>{moreLabel}</Button>}
 {visibleError&&<p role="alert" className="text-sm text-red-700">{visibleError} <Button type="button" variant="secondary" onClick={()=>{void load();setDetailRetry(value=>value+1);}}>{en?'Retry':'Reintentar'}</Button></p>}
 </div>;
}
