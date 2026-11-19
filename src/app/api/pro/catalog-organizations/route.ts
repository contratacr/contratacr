import {z} from 'zod';
import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
import {organizationKindSchema,organizationMutationSchema} from '@/lib/pro/catalog-organizations';
const headers={'Cache-Control':'no-store'};
const query=z.object({kind:organizationKindSchema,filter:z.enum(['active','archived']).default('active'),source:z.literal('existing').optional(),q:z.string().max(160).default(''),after:z.string().max(160).default('')});
export async function GET(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 const input=query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
 if(!input.success)return Response.json({error:'Consulta inválida.'},{status:400,headers});
 const p=input.data;
 if(!p.source&&p.after&&!/^\d{1,18}$/.test(p.after))return Response.json({error:'Cursor inválido.'},{status:400,headers});
 const result=await access.db.rpc('pro_catalog_organization_page',{p_user:access.user.id,p_kind:p.kind,p_archived:p.filter==='archived',p_search:p.q,p_after:p.after,p_existing:!!p.source});
 if(result.error)return proDbFailure(result.error);
 return Response.json(result.data,{headers});
}
export async function POST(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 let body;try{body=organizationMutationSchema.parse(await req.json());}catch{return Response.json({error:'Revise el nombre y la operación.'},{status:400,headers});}
 const result=await access.db.rpc('pro_mutate_catalog_organization',{p_user:access.user.id,p_kind:body.kind,p_action:body.action,p_id:body.id,p_name:body.name??'',p_revision:body.revision});
 if(result.error){if(result.error.code==='23505')return Response.json({error:'Ese nombre ya pertenece a un grupo o categoría, incluso archivado.'},{status:400,headers});if(['22023','23514','P0002'].includes(result.error.code??''))return Response.json({error:'Revise el registro y recargue la lista.'},{status:400,headers});return proDbFailure(result.error);}
 return Response.json({revision:result.data},{headers});
}
