import {prefijoDeIdioma} from "@/lib/prefijo-de-idioma";
/** Round 9: server-side form of the job route (mirrors proRoutedPath in navigation.ts, which is client-only). */
export const JOB_SECTIONS=new Set(['summary','activity','contracts','estimates','allowances','selections','moodboards','takeoffs','bids','schedule','tasks','updates','files','subs','messages','costs','budget','time','orders','invoices','credits','changes','delivery','client','notes','details']);
export function validJobId(id:string){return !!id&&id.length<=160&&!/[\u0000-\u001f]/.test(id);}
/** Canonical address for /trabajo/<rawId>[/<section>]?query when it differs (an explicit «summary» or a section
 * passed as ?vistaTrabajo=), else null. Shared by the middleware (a real 307 before loading.tsx streams) and the page. */
export function proJobCanonicalPath(locale:string,rawId:string,section:string|undefined,query:URLSearchParams):string|null{
 let job:string;try{job=decodeURIComponent(rawId);}catch{return null;}
 if(!validJobId(job)||section&&!JOB_SECTIONS.has(section))return null;
 const search=new URLSearchParams();for(const [key,value] of query)if(!['tab','cita'].includes(key)&&query.getAll(key).length===1)search.set(key,value);
 const querySection=search.get('vistaTrabajo');
 if(section!=='summary'&&!(querySection&&JOB_SECTIONS.has(querySection)))return null;
 search.delete('vistaTrabajo');
 const target=querySection&&JOB_SECTIONS.has(querySection)&&querySection!=='summary'?querySection:section!=='summary'?section:undefined;
 return prefijoDeIdioma(locale)+'/dashboard/pro/trabajo/'+encodeURIComponent(job)+(target?'/'+target:'')+(search.size?'?'+search:'');
}
/** /[en/]dashboard/pro/trabajo/<id>[/<section>]?rest for a query that opens a job of the Pro space, else null. */
export function proJobRoutePath(locale:string,search:URLSearchParams):string|null{
 const id=search.get('cita');if(search.get('tab')!=='pro_agenda'||!id||!validJobId(id))return null;
 const rest=new URLSearchParams(search),section=rest.get('vistaTrabajo');rest.delete('tab');rest.delete('cita');
 const routed=!!section&&/^[a-z]{1,20}$/.test(section);if(routed||!section)rest.delete('vistaTrabajo');
 return prefijoDeIdioma(locale)+'/dashboard/pro/trabajo/'+encodeURIComponent(id)+(routed&&section!=='summary'?'/'+section:'')+(rest.size?'?'+rest:'');
}
