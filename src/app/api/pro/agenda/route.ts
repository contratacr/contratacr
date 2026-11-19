import {readClientRecord} from '@/lib/pro/catalog-records';
import { z } from 'zod';
import { proApiAccess,proDbFailure } from '@/lib/pro/api-access';
import { availabilitySlotSchema,businessSchema,emptyBusiness,saveAppointment } from '@/lib/pro/business';
import { validateQuoteLinks } from '@/lib/pro/quote-links-server';
import { agendaCursor,daySchema,monthSchema,decodeCursor,encodeCursor } from '@/lib/pro/panel-queries';
const headers={'Cache-Control':'no-store'};
export async function GET(req:Request){
 const a=await proApiAccess(req);if(a.error)return a.error;
 try{
 const q=new URL(req.url).searchParams;
 if(q.has('id')){const id=z.string().min(1).max(160).parse(q.get('id'));const item=await a.db.rpc('pro_agenda_item',{p_user:a.user.id,p_id:id});if(item.error)return proDbFailure(item.error);if(!item.data)return Response.json({error:'Cita no encontrada'},{status:404,headers});return Response.json({...item.data,userId:a.user.id},{headers});}
 const day=daySchema.parse(q.get('day')),month=monthSchema.parse(q.get('month')||day.slice(0,7));
 const page=await a.db.rpc('pro_agenda_page',{p_user:a.user.id,p_day:day,p_month:month,p_after:decodeCursor(q.get('after'),agendaCursor),p_mode:z.enum(['day','upcoming']).parse(q.get('mode')||'day'),p_search:z.string().max(160).parse(q.get('q')||'')});
 if(page.error)return proDbFailure(page.error);
 return Response.json({...page.data,nextCursor:encodeCursor(page.data.nextCursor),userId:a.user.id},{headers});
 }catch{return Response.json({error:'Consulta inválida'},{status:400,headers});}
}
const mutation=z.object({revision:z.number().int().nonnegative(),work:businessSchema.shape.work.element.optional(),add:availabilitySlotSchema.optional(),remove:z.string().datetime({offset:true}).optional()}).refine(v=>Number(!!v.work)+Number(!!v.add)+Number(!!v.remove)===1);
export async function PATCH(req:Request){
 const a=await proApiAccess(req);if(a.error)return a.error;
 try{
 const b=mutation.parse(await req.json());
 const stored=await a.db.from('pro_workspace_core').select('revision').eq('user_id',a.user.id).maybeSingle();if(stored.error)return proDbFailure(stored.error);
 if((stored.data?.revision??0)!==b.revision)return proDbFailure({code:'40001'});
 const previous=emptyBusiness();
 let row:unknown,section:string;
 if(b.work){
 const context=await a.db.rpc('pro_agenda_item',{p_user:a.user.id,p_id:b.work.id});if(context.error)return proDbFailure(context.error);
 const old=context.data?.work as typeof b.work|undefined;
 previous.work=old?[old]:[];
 if(b.work.quoteId){const quote=await a.db.rpc('pro_legacy_quote_record',{p_user:a.user.id,p_id:b.work.quoteId});if(quote.error)return proDbFailure(quote.error);previous.quotes=quote.data?[quote.data]:[];}
 if(b.work.externalQuoteId){const link=await a.db.from('pro_quote_links').select('quoteId,clientId').eq('user_id',a.user.id).eq('quoteId',b.work.externalQuoteId).maybeSingle();if(link.error)return proDbFailure(link.error);previous.quoteLinks=link.data?[link.data]:[];}
 if(old?.bookingClientId!==b.work.bookingClientId)throw Error('No se puede cambiar el cliente de una reserva.');
 const customer=await a.db.from('pro_clients').select('*').eq('user_id',a.user.id).eq('id',b.work.clientId).maybeSingle();if(customer.error)return proDbFailure(customer.error);
 if(!customer.data)throw Error('Cliente no disponible.');
 previous.clients=[readClientRecord(customer.data)];
 const next=saveAppointment(previous,b.work);
 const work=next.work.find(w=>w.id===b.work!.id)!;
 await validateQuoteLinks(a.db,a.user.id,{...emptyBusiness(),work:[work],quoteLinks:previous.quoteLinks.filter(l=>l.quoteId===work.externalQuoteId)});
 row=work;section='work';
 }else{
 section='availability';
 if(b.add){
 if(Date.parse(b.add.start)<Date.now()+15*60000)throw Error('Elija un horario futuro.');
 row=b.add;
 }else row={start:b.remove,remove:true};
 }
 const saved=await a.db.rpc('pro_patch_core',{p_user:a.user.id,p_section:section,p_row:row,p_revision:b.revision});if(saved.error){if(saved.error.code==='23514'&&saved.error.message==='Converted work identity is immutable')return Response.json({error:'Este trabajo conserva su cliente original.',code:'converted_work_identity'},{status:409,headers});if(saved.error.code==='23514'&&['Leave the configured time between visits','Respect the configured advance notice'].includes(saved.error.message))return Response.json({error:'Respete el tiempo entre visitas y la anticipación configurados en Agenda.'},{status:409,headers});if(saved.error.code==='23514'&&saved.error.message==='Use the appointment agreement workflow')return Response.json({error:'Esta cita tiene un horario acordado con el cliente. Para cambiarlo, cancele la cita desde Citas y acuerde una nueva solicitud.'},{status:409,headers});if(saved.error.code==='22023')return Response.json({error:'Revise el horario, cliente y cotización. Puede existir un solapamiento.'},{status:400,headers});return proDbFailure(saved.error);}
 return Response.json({revision:saved.data},{headers});
 }catch(e){return Response.json({error:e instanceof z.ZodError?'Datos inválidos':e instanceof Error?e.message:'Datos inválidos'},{status:400,headers});}
}
