import {readClientRecord} from '@/lib/pro/catalog-records';
import { z } from 'zod';
import { proApiAccess,proDbFailure } from '@/lib/pro/api-access';
import { emptyBusiness,quoteSchema,saveQuote } from '@/lib/pro/business';
import { quoteCursor,decodeCursor,encodeCursor } from '@/lib/pro/panel-queries';
import { getProfessionalDisplayName } from '@/lib/display-name';
const headers={'Cache-Control':'no-store'};
export async function GET(req:Request){
 const a=await proApiAccess(req);if(a.error)return a.error;
 try{
 const q=new URL(req.url).searchParams;
 const input=z.object({id:z.string().min(1).max(160).optional(),legacy:z.enum(['1']).optional(),q:z.string().max(160).default(''),status:z.enum(['all','draft','sent','accepted','declined','withdrawn']).default('all'),clientId:z.string().max(160).default('')}).parse(Object.fromEntries(q));
 if(input.id){
 const core=await a.db.from('pro_workspace_core').select('revision').eq('user_id',a.user.id).maybeSingle();if(core.error)return proDbFailure(core.error);
 if(!input.legacy&&z.string().uuid().safeParse(input.id).success){
 const owner=await a.db.from('professionals').select('id').eq('profile_id',a.user.id).maybeSingle();if(owner.error)return proDbFailure(owner.error);
 const quote=await a.db.from('quotes').select('*').eq('id',input.id).is('deleted_at',null).maybeSingle();if(quote.error)return proDbFailure(quote.error);
 if(quote.data&&(quote.data.professional_id===owner.data?.id||quote.data.client_id===a.user.id)){
 const provider=await a.db.from('professionals').select('business_name,profiles(full_name)').eq('id',quote.data.professional_id).maybeSingle();if(provider.error)return proDbFailure(provider.error);
 const link=await a.db.from('pro_quote_links').select('quoteId,clientId').eq('user_id',a.user.id).eq('quoteId',input.id).maybeSingle();if(link.error)return proDbFailure(link.error);
 const profile=provider.data?.profiles as unknown as {full_name?:string};
 return Response.json({owned:quote.data.professional_id===owner.data?.id,quote:{...quote.data,professional_name:getProfessionalDisplayName(profile?.full_name||'',provider.data?.business_name||undefined).primaryDesktop,professional_full_name:provider.data?.business_name||profile?.full_name},link:link.data||null,revision:core.data?.revision??0},{headers});
 }
 }
 const record=await a.db.rpc('pro_legacy_quote_record',{p_user:a.user.id,p_id:input.id});if(record.error)return proDbFailure(record.error);const old=record.data?quoteSchema.parse(record.data):null;if(!old)return Response.json({error:'Cotización no encontrada'},{status:404,headers});
 const client=await a.db.from('pro_clients').select('*').eq('user_id',a.user.id).eq('id',old.clientId).maybeSingle();if(client.error)return proDbFailure(client.error);
 return Response.json({document:{...emptyBusiness(),quotes:[old],clients:client.data?[readClientRecord(client.data)]:[]},revision:core.data?.revision??0,userId:a.user.id},{headers});
 }
 const page=await a.db.rpc('pro_quotes_page',{p_user:a.user.id,p_search:input.q,p_status:input.status,p_client:input.clientId,p_after:decodeCursor(q.get('after'),quoteCursor)});if(page.error)return proDbFailure(page.error);
 return Response.json({...page.data,nextCursor:encodeCursor(page.data.nextCursor)},{headers});
 }catch{return Response.json({error:'Consulta inválida'},{status:400,headers});}
}
export async function PATCH(req:Request){
 const a=await proApiAccess(req);if(a.error)return a.error;
 try{
 const input=z.object({quote:quoteSchema,revision:z.number().int().nonnegative()}).parse(await req.json());
 const core=await a.db.from('pro_workspace_core').select('revision').eq('user_id',a.user.id).maybeSingle();if(core.error)return proDbFailure(core.error);
 if((core.data?.revision??0)!==input.revision)return proDbFailure({code:'40001'});
 const record=await a.db.rpc('pro_legacy_quote_record',{p_user:a.user.id,p_id:input.quote.id});if(record.error)return proDbFailure(record.error);const old=record.data;if(!old)return Response.json({error:'Cotización no encontrada'},{status:404,headers});
 const client=await a.db.from('pro_clients').select('*').eq('user_id',a.user.id).eq('id',input.quote.clientId).maybeSingle();if(client.error)return proDbFailure(client.error);if(!client.data)throw Error('Cliente no disponible.');
 saveQuote({...emptyBusiness(),quotes:[quoteSchema.parse(old)],clients:[readClientRecord(client.data)]},input.quote);
 const saved=await a.db.rpc('pro_patch_core',{p_user:a.user.id,p_section:'quotes',p_row:input.quote,p_revision:input.revision});if(saved.error)return proDbFailure(saved.error);
 return Response.json({revision:saved.data},{headers});
 }catch(e){return Response.json({error:e instanceof z.ZodError?'Datos inválidos':e instanceof Error?e.message:'Datos inválidos'},{status:400,headers});}
}
