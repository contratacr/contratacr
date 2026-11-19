import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {
  privateEstimateDestinationCopyInputSchema,privateEstimateDestinationCopyResultSchema,
  privateEstimateDestinationCopyReceiptSchema,privateEstimateDestinationCopyPreviewSchema,
  privateEstimateDestinationCopyContextSchema,privateEstimateDestinationCopyOptionsSchema,
  type PrivateEstimateDestinationCopyInput,type PrivateEstimateDestinationCopyResult,
} from '@/lib/pro/private-estimate-destination-copy';

const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const local=()=>process.env.NODE_ENV==='development'&&['http://127.0.0.1:54321','http://127.0.0.1:54321/'].includes(process.env.NEXT_PUBLIC_SUPABASE_URL??'');
const fail=(status:number,code:string,error:string)=>Response.json({code,error},{status,headers});
const id=z.string().uuid();
const textId=z.string().min(1).max(160);
const revision=z.coerce.number().int().positive().max(2147483647);
const fingerprint=z.string().regex(/^[a-f0-9]{32}$/);
const query=z.union([
  z.object({view:z.literal('action'),actionId:id}).strict(),
  z.object({view:z.literal('source'),kind:z.literal('draft'),estimateId:id,revision}).strict(),
  z.object({view:z.literal('source'),kind:z.literal('publication'),publicationId:id,version:revision,estimateRevision:revision,contentHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
  z.object({view:z.literal('context'),clientId:textId.optional(),sourceKind:z.enum(['manual','work']).optional(),sourceId:textId.optional()}).strict().refine(value=>(value.sourceKind===undefined)===(value.sourceId===undefined)&&!!(value.clientId||value.sourceKind)),
  z.object({view:z.literal('options'),kind:z.enum(['client','work','manual']),q:z.string().max(100).default(''),after:textId.optional(),atSnapshot:fingerprint.optional()}).strict().refine(value=>(value.after===undefined)===(value.atSnapshot===undefined)),
]);
function dbError(error:{code?:string}){
  if(['40001','23505','55P03'].includes(error.code??''))return fail(409,'conflict','La versión o el destino cambió. Revise antes de continuar.');
  if(error.code==='42501')return fail(403,'forbidden','No tiene acceso a esta operación.');
  if(error.code==='P0002')return fail(404,'not_found','No disponible.');
  if(error.code==='54000')return fail(429,'limit','Se alcanzó el límite de esta operación.');
  if(['22023','22007','22008','22021','23514','22P02'].includes(error.code??''))return fail(400,'invalid_input','Revise los datos.');
  return fail(503,'unavailable','No se pudo completar la operación.');
}
async function actor(req:Request,writing=false){
  const user=await safeGetUser(await createClient());
  if(!user)return{error:fail(401,'unauthenticated','Inicie sesión.')};
  const expected=req.headers.get('x-pro-expected-actor');
  if((writing||expected!==null)&&(!id.safeParse(expected).success||expected!==user.id))return{error:fail(403,'forbidden','La cuenta cambió.')};
  const db=createAdminClient(),profile=await db.from('profiles').select('is_disabled,role').eq('id',user.id).maybeSingle();
  if(profile.error)return{error:fail(503,'unavailable','No se pudo comprobar el acceso.')};
  if(!profile.data||profile.data.is_disabled||profile.data.role==='admin'&&!await getApiAdmin())return{error:fail(403,'forbidden','Sin acceso.')};
  return{user,db};
}
function validResult(input:PrivateEstimateDestinationCopyInput,result:PrivateEstimateDestinationCopyResult,owner:string){
  return result.estimate.ownerId===owner&&privateEstimateDestinationCopyReceiptSchema.safeParse({receipt:{input,result}}).success;
}
async function bounded(req:Request){
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error();
  const reader=req.body?.getReader();if(!reader)throw Error();let length=0;const chunks:Uint8Array[]=[];
  try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>16384){await reader.cancel();throw new RangeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function GET(req:Request){
  if(!local())return new Response(null,{status:404,headers});
  try{
    const a=await actor(req);if(a.error)return a.error;
    const raw:Record<string,string>={};
    for(const [key,value]of new URL(req.url).searchParams){if(key in raw)return fail(400,'invalid_input','Consulta inválida.');raw[key]=value;}
    const parsed=query.safeParse(raw);if(!parsed.success)return fail(400,'invalid_input','Consulta inválida.');
    const q=parsed.data;
    if(q.view==='action'){
      const r=await a.db.rpc('pro_private_estimate_destination_copy_read',{p_actor:a.user.id,p_action:q.actionId});
      if(r.error)return dbError(r.error);
      const data=privateEstimateDestinationCopyReceiptSchema.parse(r.data);
      if(data.receipt&&(data.receipt.input.actionId!==q.actionId||!validResult(data.receipt.input,data.receipt.result,a.user.id)))
        return fail(503,'unavailable','No se pudo comprobar el recibo.');
      return Response.json(data,{headers});
    }
    if(q.view==='context'){
      const r=await a.db.rpc('pro_private_estimate_destination_copy_context',{
        p_actor:a.user.id,p_client:q.clientId??null,p_kind:q.sourceKind??null,p_id:q.sourceId??null,
      });
      if(r.error)return dbError(r.error);
      const data=privateEstimateDestinationCopyContextSchema.parse(r.data);
      if(q.sourceKind?(data.source?.kind!==q.sourceKind||data.source.id!==q.sourceId):data.source!==null||data.client.id!==q.clientId)
        return fail(503,'unavailable','No se pudo comprobar el destino.');
      return Response.json(data,{headers});
    }
    if(q.view==='options'){
      const r=await a.db.rpc('pro_private_estimate_destination_copy_options',{
        p_actor:a.user.id,p_kind:q.kind,p_query:q.q,p_after:q.after??null,p_fingerprint:q.atSnapshot??null,
      });
      if(r.error)return dbError(r.error);
      return Response.json(privateEstimateDestinationCopyOptionsSchema.parse(r.data),{headers});
    }
    const source=q.kind==='draft'?{kind:q.kind,estimateId:q.estimateId,revision:q.revision}
      :{kind:q.kind,publicationId:q.publicationId,version:q.version,estimateRevision:q.estimateRevision,contentHash:q.contentHash};
    const r=await a.db.rpc('pro_private_estimate_destination_copy_source',{p_actor:a.user.id,p_source:source});
    if(r.error)return dbError(r.error);
    const data=privateEstimateDestinationCopyPreviewSchema.parse(r.data);
    if(data.estimate.ownerId!==a.user.id||data.source.kind!==source.kind
      ||source.kind==='draft'&&(data.source.estimateId!==source.estimateId||data.estimate.revision!==source.revision)
      ||source.kind==='publication'&&(data.source.kind!=='publication'||data.source.publicationId!==source.publicationId
        ||data.source.version!==source.version||data.source.estimateRevision!==source.estimateRevision||data.source.contentHash!==source.contentHash))
      return fail(503,'unavailable','No se pudo comprobar la versión de origen.');
    return Response.json(data,{headers});
  }catch{return fail(503,'unavailable','No se pudo comprobar la copia.');}
}

export async function POST(req:Request){
  if(!local())return new Response(null,{status:404,headers});
  const url=new URL(req.url);
  if(req.headers.get('origin')!==`${url.protocol}//${req.headers.get('host')||url.host}`)
    return fail(403,'forbidden','Origen no autorizado.');
  try{
    const a=await actor(req,true);if(a.error)return a.error;
    const limit=await enforceRateLimit(req,'private-estimate-destination-copy-'+a.user.id,30,60000);
    if(limit)return limit;
    let input:PrivateEstimateDestinationCopyInput;
    try{input=privateEstimateDestinationCopyInputSchema.parse(await bounded(req));}
    catch(error){return fail(error instanceof RangeError?413:400,'invalid_input','Revise la versión seleccionada.');}
    const result=await a.db.rpc('pro_private_estimate_destination_copy_mutate',{
      p_actor:a.user.id,p_input:input,
    });
    if(result.error)return dbError(result.error);
    const data=privateEstimateDestinationCopyResultSchema.parse(result.data);
    if(!validResult(input,data,a.user.id))
      return fail(503,'unavailable','No se pudo comprobar el resultado.');
    return Response.json(data,{headers});
  }catch{
    return fail(503,'unavailable','No se pudo comprobar el guardado. Consulte el resultado antes de reintentar.');
  }
}
