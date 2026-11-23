import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proInternalFinanceAllowed,proWithoutInternalCost} from '@/lib/pro/route-common';
import {
  privateEstimateContextSchema,
  privateEstimateDetailSchema,
  privateEstimateMutationSchema,
  privateEstimatePageSchema,
  privateEstimateReceiptSchema,
  privateEstimateResultSchema,
  privateEstimateSalesPageSchema,
} from '@/lib/pro/private-estimates';
import {PRO_ENABLED} from '@/lib/pro/enabled';

const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const local=()=>PRO_ENABLED;
const fail=(status:number,code:string,error:string)=>Response.json({code,error},{status,headers});
function databaseError(error:{code?:string}){
  if(['40001','23505'].includes(error.code??''))return fail(409,'conflict','Los datos cambiaron. Revise antes de guardar.');
  if(error.code==='42501')return fail(403,'forbidden','Sin acceso.');
  if(error.code==='P0002')return fail(404,'not_found','Cotización no encontrada.');
  if(error.code==='54000')return fail(429,'limit','Se alcanzó el límite de esta operación.');
  if(['22023','22007','22008','22021','23514','22P02'].includes(error.code??''))return fail(400,'invalid_input','Revise los datos de la cotización.');
  return fail(503,'unavailable','No se pudo completar la operación.');
}
async function actor(req:Request,writing=false){
  const user=await safeGetUser(await createClient());
  if(!user)return{error:fail(401,'unauthenticated','Inicie sesión.')};
  const expected=req.headers.get('x-pro-expected-actor');
  if((writing||expected!==null)&&(!z.string().uuid().safeParse(expected).success||expected!==user.id))return{error:fail(403,'forbidden','La cuenta cambió.')};
  const db=createAdminClient();
  const profile=await db.from('profiles').select('is_disabled,role').eq('id',user.id).maybeSingle();
  if(profile.error)return{error:fail(503,'unavailable','No se pudo comprobar el acceso.')};
  if(!profile.data||profile.data.is_disabled||profile.data.role==='admin'&&!await getApiAdmin())return{error:fail(403,'forbidden','Sin acceso.')};
  return{user,db};
}
const uuid=z.string().uuid(),client=z.string().min(1).max(160);
const salesStatus=z.enum(['all','draft','sent','accepted','declined','withdrawn','archived']);
const cursorSchema=z.object({at:z.string().max(40),key:z.string().min(1).max(200)}).strict();
const querySchema=z.discriminatedUnion('view',[
  z.object({view:z.literal('sales'),status:salesStatus.default('all'),q:z.string().max(100).default(''),clientId:client.optional(),after:z.string().max(1000).optional()}).strict(),
  z.object({view:z.literal('list'),status:z.enum(['draft','archived','all']).default('draft'),q:z.string().max(100).default(''),clientId:client.optional(),currency:z.enum(['CRC','USD']).optional(),after:uuid.optional(),sourceKind:z.enum(['manual','work']).optional(),sourceId:client.optional()}).strict(),
  z.object({view:z.enum(['detail','history']),estimateId:uuid,after:uuid.optional()}).strict(),
  z.object({view:z.literal('action'),actionId:uuid}).strict(),
  z.object({view:z.literal('context'),clientId:client.optional(),sourceKind:z.enum(['manual','work']).optional(),sourceId:client.optional()}).strict(),
]);

export async function GET(req:Request){
  if(!local())return new Response(null,{status:404,headers});
  try{
    const a=await actor(req);if(a.error)return a.error;
    // Closing round (security review M2): Member and Read-only never receive the internal unit cost of a line.
    const hide=!await proInternalFinanceAllowed(),reply=(body:unknown)=>Response.json(hide?proWithoutInternalCost(body,{remove:['unitCostCents']}):body,{headers});
    const raw:Record<string,string>={};
    for(const[key,value]of new URL(req.url).searchParams){if(key in raw)return fail(400,'invalid_input','Consulta inválida.');raw[key]=value;}
    const parsed=querySchema.safeParse(raw);
    if(!parsed.success)return fail(400,'invalid_input','Consulta inválida.');
    const q=parsed.data;
    if(q.view==='context'){
      if(!!q.sourceKind!==!!q.sourceId||!q.sourceKind&&!q.clientId)return fail(400,'invalid_input','Indique el cliente o el origen.');
      const result=await a.db.rpc('pro_private_estimate_context',{p_actor:a.user.id,p_client:q.clientId??null,p_kind:q.sourceKind??null,p_id:q.sourceId??null});
      if(result.error)return databaseError(result.error);
      const data=privateEstimateContextSchema.parse(result.data);
      if(q.clientId&&data.client.id!==q.clientId||q.sourceKind&&(data.source?.kind!==q.sourceKind||data.source?.id!==q.sourceId))return fail(503,'unavailable','No se pudo comprobar el origen.');
      return reply(data);
    }
    if(q.view==='action'){
      const result=await a.db.rpc('pro_private_estimate_action_read',{p_actor:a.user.id,p_action:q.actionId});
      if(result.error)return databaseError(result.error);
      const data=privateEstimateReceiptSchema.parse(result.data);
      if(data.receipt&&(data.receipt.input.actionId!==q.actionId||data.receipt.result.estimate.ownerId!==a.user.id))return fail(503,'unavailable','No se pudo comprobar el recibo.');
      return reply(data);
    }
    if(q.view==='sales'){
      let after:z.infer<typeof cursorSchema>|null=null;
      if(q.after){try{after=cursorSchema.parse(JSON.parse(q.after));}catch{return fail(400,'invalid_input','Cursor inválido.');}}
      const result=await a.db.rpc('pro_private_estimate_sales_page',{p_actor:a.user.id,p_status:q.status,p_query:q.q,p_client:q.clientId??null,p_after:after});
      if(result.error)return databaseError(result.error);
      return reply(privateEstimateSalesPageSchema.parse(result.data));
    }
    if(q.view==='list'&&!!q.sourceKind!==!!q.sourceId)return fail(400,'invalid_input','Origen inválido.');
    const result=await a.db.rpc('pro_private_estimate_read',{
      p_actor:a.user.id,p_estimate:q.view==='detail'||q.view==='history'?q.estimateId:null,
      p_status:q.view==='list'?q.status:'draft',p_query:q.view==='list'?q.q:'',
      p_client:q.view==='list'?q.clientId??null:null,p_currency:q.view==='list'?q.currency??null:null,p_after:q.after??null,
      p_kind:q.view==='list'?q.sourceKind??null:null,p_source:q.view==='list'?q.sourceId??null:null,
    });
    if(result.error)return databaseError(result.error);
    if(q.view==='detail'||q.view==='history'){
      if(!result.data)return fail(404,'not_found','Cotización no encontrada.');
      const data=privateEstimateDetailSchema.parse(result.data);
      if(data.estimate.id!==q.estimateId||data.estimate.ownerId!==a.user.id||data.history.some(event=>event.after.id!==q.estimateId||event.after.ownerId!==a.user.id||event.before&&(event.before.ownerId!==a.user.id||event.action!=='duplicate'&&event.before.id!==q.estimateId)))return fail(503,'unavailable','No se pudo comprobar la cotización.');
      return reply(data);
    }
    const data=privateEstimatePageSchema.parse(result.data);
    if(data.items.some(item=>item.ownerId!==a.user.id))return fail(503,'unavailable','No se pudo comprobar la lista.');
    return reply(data);
  }catch{return fail(503,'unavailable','No se pudieron cargar las cotizaciones.');}
}

async function boundedBody(req:Request){
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new Error('JSON required');
  const reader=req.body?.getReader();if(!reader)throw new Error('Body required');
  const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>1024*1024){await reader.cancel();throw new RangeError('Body too large');}chunks.push(chunk.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;
  for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function POST(req:Request){
  if(!local())return new Response(null,{status:404,headers});
  if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'forbidden','Origen no autorizado.');
  try{
    const a=await actor(req,true);if(a.error)return a.error;
    const limited=await enforceRateLimit(req,'private-estimates-'+a.user.id,60,60000);if(limited)return limited;
    let input:z.infer<typeof privateEstimateMutationSchema>;
    try{input=privateEstimateMutationSchema.parse(await boundedBody(req));}catch(error){return fail(error instanceof RangeError?413:400,'invalid_input','Revise los datos de la cotización.');}
    // Round F1-C: Member and Read-only never see the internal unit cost, so they must not erase or set it either.
    // Their save keeps the cost already saved for each line (same line id) and ignores any cost they send.
    const hide=!await proInternalFinanceAllowed();
    if(hide&&input.action==='save'){
      const known=new Map<string,number>();
      if(input.revision>0){
        const current=await a.db.rpc('pro_private_estimate_read',{p_actor:a.user.id,p_estimate:input.estimateId,p_status:'draft',p_query:'',p_client:null,p_currency:null,p_after:null,p_kind:null,p_source:null});
        if(current.error)return databaseError(current.error);
        if(current.data){const detail=privateEstimateDetailSchema.parse(current.data);if(detail.estimate.id!==input.estimateId||detail.estimate.ownerId!==a.user.id)return fail(503,'unavailable','No se pudo comprobar la cotización.');for(const line of detail.estimate.lines)if(line.unitCostCents!==undefined)known.set(line.id,line.unitCostCents);}
      }
      input={...input,lines:input.lines.map(sent=>{const line={...sent};delete line.unitCostCents;return known.has(line.id)?{...line,unitCostCents:known.get(line.id)!}:line;})};
    }
    const result=await a.db.rpc('pro_private_estimate_mutate',{p_actor:a.user.id,p_input:input});
    if(result.error)return databaseError(result.error);
    const data=privateEstimateResultSchema.parse(result.data);
    if(data.action!==input.action||data.estimate.ownerId!==a.user.id||data.estimate.id!==(input.action==='duplicate'?input.targetEstimateId:input.estimateId))return fail(503,'unavailable','No se pudo comprobar el guardado.');
    return Response.json(hide?proWithoutInternalCost(data,{remove:['unitCostCents']}):data,{headers});
  }catch{return fail(503,'unavailable','No se pudo comprobar el guardado. Consulte el resultado antes de reintentar.');}
}
