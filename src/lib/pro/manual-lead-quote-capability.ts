import {z} from 'zod';
import {prefijoDeIdioma} from '@/lib/prefijo-de-idioma';

export const manualLeadQuoteCapabilitySchema=z.union([
 z.object({issuerKind:z.literal('professional'),canCreateLegacy:z.literal(true),reason:z.null()}).strict(),
 z.object({issuerKind:z.null(),canCreateLegacy:z.literal(false),reason:z.literal('issuer_required')}).strict(),
]);
export type ManualLeadQuoteCapability=z.infer<typeof manualLeadQuoteCapabilitySchema>;

/** A return destination is a particular owned lead view, never an arbitrary URL. */
export function parseQuoteProfileReturn(path:unknown,account:unknown):{path:string;account:string}|null{
 const actor=z.string().uuid().safeParse(account);
 if(!actor.success||typeof path!=='string'||path.length>12000||!path.startsWith('/')||path.startsWith('//')||/[\u0000-\u001f\u007f\\]/u.test(path))return null;
 try{
  const url=new URL(path,'https://pro-return.invalid');
  if(url.origin!=='https://pro-return.invalid'||url.username||url.password||url.hash||!/^\/(?:es\/|en\/)?dashboard\/(?:pro|profesional)$/.test(url.pathname)||url.searchParams.getAll('tab').length!==1||url.searchParams.get('tab')!=='pro_leads'||url.searchParams.getAll('solicitudManual').length!==1||!z.string().uuid().safeParse(url.searchParams.get('solicitudManual')).success)return null;
  return{path:url.pathname+url.search,account:actor.data};
 }catch{return null;}
}
export function buildQuoteProfileSetupPath(locale:string,account:string,sourcePath:string):string|null{
 const target=parseQuoteProfileReturn(sourcePath,account);if(!target)return null;
 const prefix=locale==='es'?'/es':prefijoDeIdioma(locale);
 return prefix+'/registro/profesional?'+new URLSearchParams({quoteReturnTo:target.path,quoteReturnActor:target.account});
}
