'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {ImageIcon} from 'lucide-react';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {proFileSize} from '@/lib/pro/file-size';
import {comparisonClientSchema,type ComparisonClient} from '@/lib/pro/file-comparisons';
import {BeforeAfterSlider,type SliderLabels} from './before-after-slider';

/**
 * Row 33, customer side: before/after comparisons the professional marked «Visible para el cliente» (only while «Archivos y
 * fotos» is on and neither photo is hidden or in the trash). Read only: each image is fetched from the reauthorized API (never a
 * public URL) and checked against the list. The owner's «as customer» preview renders this same component.
 */
const api='/api/pro/work-file-comparisons';
export const comparisonLabels=(en:boolean):SliderLabels=>({before:en?'Before':'Antes',after:en?'After':'Después',control:en?'Comparison slider: move to reveal the before and after photos':'Control deslizante: muévalo para ver las fotos de antes y después',
 valueText:p=>en?`${p}% of the before photo shown`:`${p}% de la foto de antes visible`,sideBySide:en?'Side by side':'Lado a lado',slider:en?'Slider view':'Vista deslizante'});
export function AppointmentBeforeAfter({requestId}:{requestId:string}){
 const {user,loading}=useAuth();if(loading||!user)return null;return <Session key={user.id+':'+requestId} accountId={user.id} requestId={requestId}/>;
}
function useBlob(href:string,accountId:string){
 const [url,setUrl]=useState<string|null>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let live=true,made:string|null=null;
  void(async()=>{try{const r=await fetch(href,{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok||r.headers.get('content-type')?.split(';')[0].trim()!=='image/jpeg')throw Error();
   const buffer=await r.arrayBuffer();if(!live)return;made=URL.createObjectURL(new Blob([buffer],{type:'image/jpeg'}));setUrl(made);setFailed(false);}catch{if(live)setFailed(true);}})();
  return()=>{live=false;if(made)URL.revokeObjectURL(made);};},[href,accountId,attempt]);
 return {url,failed,retry:()=>{setUrl(null);setFailed(false);setAttempt(n=>n+1);}};
}
function Card({item,requestId,accountId,en}:{item:ComparisonClient['items'][number];requestId:string;accountId:string;en:boolean}){
 const t=(es:string,english:string)=>en?english:es;
 const href=(side:'before'|'after')=>api+'?'+new URLSearchParams({requestId,comparisonId:item.id,side});
 const b=useBlob(href('before'),accountId),a=useBlob(href('after'),accountId),name=item.title||t('Antes y después','Before and after');
 return <article data-client-comparison={item.id} className="min-w-0 space-y-2 rounded-xl border border-[#e3eaf1] p-3">
  <h4 className="break-words font-semibold">{name}</h4>{item.caption&&<p className="break-words text-sm text-[#52627a]">{item.caption}</p>}
  {b.failed||a.failed?<div role="alert" className="space-y-2 text-sm"><p>{t('No se pudieron abrir las fotos.','Could not open the photos.')}</p><Button type="button" variant="secondary" onClick={()=>{b.retry();a.retry();}}>{t('Reintentar','Retry')}</Button></div>
   :b.url&&a.url?<BeforeAfterSlider beforeSrc={b.url} afterSrc={a.url} beforeAlt={t('Antes: ','Before: ')+name} afterAlt={t('Después: ','After: ')+name} labels={comparisonLabels(en)}/>
   :<p role="status" className="text-sm text-[#52627a]">{t('Cargando fotos…','Loading photos…')}</p>}
  <div className="flex flex-wrap gap-2">{(['before','after'] as const).map(s=><Button key={s} asChild variant="secondary"><a data-client-comparison-download={s} href={href(s)} download={item[s].name}>{s==='before'?t('Descargar antes','Download before'):t('Descargar después','Download after')} ({proFileSize(item[s].sizeBytes,en)})</a></Button>)}</div>
 </article>;
}
function Session({accountId,requestId}:{accountId:string;requestId:string}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [data,setData]=useState<ComparisonClient|null>(null),[error,setError]=useState(false),seq=useRef(0);
 const load=useCallback(async()=>{const n=++seq.current;try{const r=await fetch(api+'?'+new URLSearchParams({requestId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();const body=comparisonClientSchema.parse(await r.json());if(n===seq.current){setData(body);setError(false);}}catch{if(n===seq.current)setError(true);}},[accountId,requestId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 if(error)return <div role="alert" data-client-comparisons-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4"><p className="text-sm">{t('No se pudieron cargar las comparaciones de fotos.','Could not load the photo comparisons.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!data?.items.length)return null;
 return <section data-client-comparisons className="space-y-3 rounded-2xl border border-[#d7e1ea] p-4">
  <h3 className="flex items-center gap-2 font-bold"><ImageIcon aria-hidden className="h-5 w-5 text-[#008bb5]"/>{t('Antes y después','Before and after')}</h3>
  <div className="grid gap-3 lg:grid-cols-2">{data.items.map(item=><Card key={item.id+item.updatedAt} item={item} requestId={requestId} accountId={accountId} en={en}/>)}</div>
 </section>;
}
