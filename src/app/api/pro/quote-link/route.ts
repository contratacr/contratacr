import { z } from 'zod';
import { proApiAccess,proDbFailure } from '@/lib/pro/api-access';
import { emptyBusiness } from '@/lib/pro/business';
import { validateQuoteLinks } from '@/lib/pro/quote-links-server';
export async function POST(req:Request){
 const a=await proApiAccess(req);if(a.error)return a.error;
 try{
 const {quoteId,clientId}=z.object({quoteId:z.string().uuid(),clientId:z.string().min(1).max(160)}).parse(await req.json());
 const core=await a.db.from('pro_workspace_core').select('revision').eq('user_id',a.user.id).maybeSingle();if(core.error)return proDbFailure(core.error);
 const client=await a.db.from('pro_clients').select('id,archived').eq('user_id',a.user.id).eq('id',clientId).maybeSingle();if(client.error)return proDbFailure(client.error);
 if(!client.data||client.data.archived)return Response.json({error:'Seleccione un cliente activo.'},{status:400});
 const linked=await a.db.from('pro_quote_links').select('quoteId,clientId').eq('user_id',a.user.id).eq('quoteId',quoteId).maybeSingle();if(linked.error)return proDbFailure(linked.error);const previous=linked.data;
 if(previous&&previous.clientId!==clientId)return Response.json({error:'La cotización ya tiene un cliente vinculado.'},{status:409});
 const link={quoteId,clientId};await validateQuoteLinks(a.db,a.user.id,{...emptyBusiness(),quoteLinks:[link]});
 if(previous)return Response.json({ok:true});
 const saved=await a.db.rpc('pro_patch_core',{p_user:a.user.id,p_section:'quoteLinks',p_row:link,p_revision:core.data?.revision??0});if(saved.error)return proDbFailure(saved.error);
 return Response.json({ok:true});
 }catch{return Response.json({error:'No se pudo vincular la cotización. Revise el cliente y reintente.'},{status:400});}
}
