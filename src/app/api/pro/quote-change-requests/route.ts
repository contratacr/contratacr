import {z} from 'zod';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {quoteChangeInput} from '@/lib/pro/quote-change-requests';
const headers={'Cache-Control':'no-store, private'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
function dbError(error:{code?:string}){return fail(error.code==='42501'?403:error.code==='P0002'?404:error.code==='40001'||error.code==='23514'?409:error.code==='22023'||error.code==='22P02'?400:503,'No se pudo completar. Revise la cotización y actualice antes de continuar.');}
async function actor(){const user=await safeGetUser(await createClient());if(!user)return {error:fail(401,'Inicie sesión.')};const db=createAdminClient(),p=await db.from('profiles').select('role,is_disabled').eq('id',user.id).maybeSingle();if(p.error)return {error:fail(503,'No se pudo verificar la cuenta.')};if(!p.data||p.data.is_disabled||p.data.role==='admin'&&!await getApiAdmin())return {error:fail(403,'Sin acceso.')};return {user,db};}
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{const access=await actor();if(access.error)return access.error;const params=new URL(req.url).searchParams;
 const quote=z.string().uuid().parse(params.get('quoteId')),after=params.get('after')?z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(params.get('after')):null;
 const r=await access.db.rpc('pro_quote_change_read',{p_actor:access.user.id,p_quote:quote,p_after:after});return r.error?dbError(r.error):r.data?Response.json(r.data,{headers}):fail(404,'Cotización no disponible.');
 }catch{return fail(400,'Consulta inválida.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 const expected=`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`;if(req.headers.get('origin')!==expected)return fail(403,'Origen no autorizado.');
 try{const access=await actor();if(access.error)return access.error;
 if(!req.headers.get('content-type')?.startsWith('application/json'))return fail(400,'Datos inválidos.');
 const reader=req.body?.getReader();if(!reader)return fail(400,'Datos inválidos.');const chunks:Uint8Array[]=[];let size=0;try{while(true){const n=await reader.read();if(n.done)break;size+=n.value.length;if(size>12000){await reader.cancel();return fail(413,'Demasiados datos.');}chunks.push(n.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}const parsed=quoteChangeInput.safeParse(JSON.parse(new TextDecoder().decode(bytes)));if(!parsed.success)return fail(400,'Escriba el cambio que necesita o su respuesta.');
 const r=await access.db.rpc('pro_quote_change_mutate',{p_actor:access.user.id,p_input:parsed.data});return r.error?dbError(r.error):Response.json(r.data,{headers});
 }catch{return fail(503,'No se pudo guardar. Reintente la misma acción sin duplicarla.');}
}
