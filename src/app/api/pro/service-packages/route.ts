import {z} from 'zod';
import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
import {servicePackageMutationSchema} from '@/lib/pro/service-packages';
const headers={'Cache-Control':'private, no-store'};
const query=z.object({filter:z.enum(['active','archived']).default('active'),q:z.string().max(160).default(''),after:z.string().regex(/^(?:\d{1,18})?$/).default(''),id:z.string().uuid().optional()});
export async function GET(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 const parsed=query.safeParse(Object.fromEntries(new URL(req.url).searchParams));if(!parsed.success)return Response.json({error:'Consulta inválida.'},{status:400,headers});
 const input=parsed.data,result=await access.db.rpc('pro_service_package_page',{p_user:access.user.id,p_archived:input.filter==='archived',p_search:input.q,p_after:input.after,p_id:input.id??null});
 if(result.error)return proDbFailure(result.error);
 if(input.id&&!result.data?.items?.length)return Response.json({error:'Plantilla no encontrada.'},{status:404,headers});
 return Response.json(result.data,{headers});
}
export async function POST(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 let input;try{input=servicePackageMutationSchema.parse(await req.json());}catch{return Response.json({error:'Revise el nombre, las líneas, cantidades y precios de la plantilla.'},{status:400,headers});}
 const result=await access.db.rpc('pro_mutate_service_package',{p_user:access.user.id,p_input:input});
 if(result.error){
  if(result.error.code==='23505')return Response.json({error:'El nombre ya existe, incluso entre las plantillas archivadas.'},{status:400,headers});
  if(['22023','23514','P0002'].includes(result.error.code??''))return Response.json({error:'Revise la plantilla y actualice antes de guardar.'},{status:400,headers});
  return proDbFailure(result.error);
 }
 return Response.json(result.data,{headers});
}
