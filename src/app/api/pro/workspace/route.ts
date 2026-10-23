import { validateQuoteLinks } from '@/lib/pro/quote-links-server';
import { validateWorkspaceTransition } from '@/lib/pro/validate-transition';
import { z } from 'zod';
import { businessSchema, emptyBusiness } from '@/lib/pro/business';
import { proApiAccess, proDbFailure } from '@/lib/pro/api-access';
export async function GET(req:Request) {
 const access=await proApiAccess(req);if(access.error)return access.error;
 const {data,error}=await access.db.from('pro_workspaces').select('document,revision').eq('user_id',access.user.id).maybeSingle();
 if(error)return proDbFailure(error);
 return Response.json({userId:access.user.id,document:businessSchema.parse({...data?.document,social:[],...(data?{}:emptyBusiness())}),revision:data?.revision??0},{headers:{'Cache-Control':'no-store'}});
}
export async function PUT(req:Request) {
 const access=await proApiAccess(req);if(access.error)return access.error;
 try {
 const body=z.object({document:businessSchema,revision:z.number().int().nonnegative()}).parse(await req.json());
 // Social decisions live in their own server-controlled table, not the editable document.
 const {data:previous,error:readError}=await access.db.from('pro_workspaces').select('document').eq('user_id',access.user.id).maybeSingle();
 if(readError)return proDbFailure(readError);
 const document=validateWorkspaceTransition(previous?businessSchema.parse(previous.document):emptyBusiness(),body.document);
 await validateQuoteLinks(access.db,access.user.id,document);
 const {data,error}=await access.db.rpc('pro_save_workspace',{p_user:access.user.id,p_document:document,p_revision:body.revision});
 if(error)return proDbFailure(error);
 return Response.json({revision:data});
 }catch{return Response.json({error:'Datos inválidos'}, {status:400});}
}
