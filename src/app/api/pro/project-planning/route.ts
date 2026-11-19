import {z} from 'zod';
import {proApiAccess} from '@/lib/pro/api-access';
import {projectEstimateQuerySchema,projectEstimatesPageSchema} from '@/lib/pro/project-planning';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
/** Read-only: estimates of one project (job). Links are never inferred here. */
export async function GET(req:Request){
 const a=await proApiAccess(req);if(a.error)return a.error;
 const expected=req.headers.get('x-pro-expected-actor');
 if(expected!==null&&(!z.string().uuid().safeParse(expected).success||expected!==a.user.id))return fail(403,'La cuenta cambió.');
 const raw:Record<string,string>={};
 for(const [key,value] of new URL(req.url).searchParams){if(key in raw)return fail(400,'Consulta inválida.');raw[key]=value;}
 const query=projectEstimateQuerySchema.safeParse(raw);if(!query.success)return fail(400,'Consulta inválida.');
 try{
  const result=await a.db.rpc('pro_project_estimates_page',{p_actor:a.user.id,p_work:query.data.workId,p_scope:query.data.scope,p_after:query.data.after??null});
  if(result.error){const code=result.error.code;return fail(code==='42501'?403:code==='P0002'?404:code==='40001'?409:code==='22023'||code==='22P02'?400:503,code==='P0002'?'Proyecto no disponible.':code==='40001'?'Las cotizaciones cambiaron. Actualice la lista.':'No se pudieron cargar las cotizaciones del proyecto.');}
  return Response.json(projectEstimatesPageSchema.parse(result.data),{headers});
 }catch{return fail(503,'No se pudieron cargar las cotizaciones del proyecto. Reintente.');}
}
