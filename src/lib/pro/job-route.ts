import {prefijoDeIdioma} from "@/lib/prefijo-de-idioma";
/** Round 9: server-side form of the job route (mirrors proRoutedPath in navigation.ts, which is client-only). */
export const JOB_SECTIONS=new Set(['summary','activity','contracts','estimates','allowances','selections','moodboards','takeoffs','bids','schedule','tasks','updates','files','subs','messages','costs','budget','time','orders','credits','changes','delivery','client','notes','details']);
export function validJobId(id:string){return !!id&&id.length<=160&&!/[\u0000-\u001f]/.test(id);}
/** /[en/]dashboard/pro/trabajo/<id>[/<section>]?rest for a query that opens a job of the Pro space, else null. */
export function proJobRoutePath(locale:string,search:URLSearchParams):string|null{
 const id=search.get('cita');if(search.get('tab')!=='pro_agenda'||!id||!validJobId(id))return null;
 const rest=new URLSearchParams(search),section=rest.get('vistaTrabajo');rest.delete('tab');rest.delete('cita');
 const routed=!!section&&/^[a-z]{1,20}$/.test(section);if(routed||!section)rest.delete('vistaTrabajo');
 return prefijoDeIdioma(locale)+'/dashboard/pro/trabajo/'+encodeURIComponent(id)+(routed&&section!=='summary'?'/'+section:'')+(rest.size?'?'+rest:'');
}
