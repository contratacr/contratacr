import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {proWorkspaceMember,safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {readBoundedBody} from './bounded-body';
import {enforceRateLimitKey} from '@/lib/rate-limit';

/**
 * Shared helpers for the local Pro routes of the schedule, punch list and time modules.
 * Same contract as client-dashboard/selections: development only, no-store, expected
 * actor header, bounded JSON body, same-origin writes and SQL error mapping.
 */
export const proRouteHeaders={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
export const proFail=(status:number,error:string)=>Response.json({error},{status,headers:proRouteHeaders});
export function proDbError(error:{code?:string;hint?:string},conflict:string){
 const code=error.code||'';
 // Own hints raised by the credits guard / invoice payments (22023): a clear reason the UI translates.
 if(error.hint==='pro_credit_notes_balance')return Response.json({error:'El total no puede quedar por debajo de los pagos y las notas de crédito aplicados. Revierta primero la aplicación que desea corregir.',reason:'credit_notes'},{status:400,headers:proRouteHeaders});
 if(error.hint==='pro_credit_refunded')return Response.json({error:'Ese abono ya se devolvió mediante un crédito; no puede aplicarse.',reason:'credit_refunded'},{status:400,headers:proRouteHeaders});
 // Bid portal (uninvite): the vendor sent offers from the portal; the immutable record is kept.
 if(error.hint==='pro_bid_portal_submissions')return Response.json({error:'Este proveedor envió ofertas desde el portal; no se puede quitar. Anule su enlace en su lugar.',reason:'portal_submissions'},{status:400,headers:proRouteHeaders});
 return proFail(code==='40001'||code==='23505'?409:code==='42501'?403:code==='54000'?429:['22023','22008','22007','23514','22P02','P0002','23503'].includes(code)?400:503,code==='40001'||code==='23505'?conflict:'No se pudo completar la operación.');
}
export async function proActor(req:Request){
 const user=await safeGetUser(await createClient());if(!user)return{error:proFail(401,'Inicie sesión.')} as const;
 const expected=req.headers.get('x-pro-expected-actor');if(expected!==null&&(!z.string().uuid().safeParse(expected).success||expected!==user.id))return{error:proFail(403,'La cuenta cambió.')} as const;
 const db=createAdminClient(),profile=await db.from('profiles').select('is_disabled,role').eq('id',user.id).maybeSingle();
 if(profile.error)return{error:proFail(503,'No se pudo comprobar el acceso.')} as const;
 if(!profile.data||profile.data.is_disabled||profile.data.role==='admin'&&!await getApiAdmin())return{error:proFail(403,'Sin acceso.')} as const;
 return{user,db,error:null} as const;
}
export async function proBoundedJson(req:Request,limit=16384){
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error();
 if(!req.body)throw Error();
 return JSON.parse(new TextDecoder().decode(await readBoundedBody(req,limit)));
}
export {ProBodyError,proBoundedForm,sniffAudio,sniffImage} from './bounded-body';
/** Browser-facing origin (Next may rewrite req.url to its internal host; Host keeps the real one). */
export const proRequestOrigin=(req:Request)=>`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`;
export const proSameOrigin=(req:Request)=>req.headers.get('origin')===`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`;
/** Single-valued query parameters only; repeated keys are rejected. */
export function proQuery(req:Request){const raw:Record<string,string>={};for(const[key,value]of new URL(req.url).searchParams){if(key in raw)return null;raw[key]=value;}return raw;}
/**
 * Round 4A (real customer preview). A customer reader (`?requestId=`) runs as the linked customer of
 * that request. When the caller is instead the OWNER of the request's job (Pro tools enabled), the
 * same reader runs as that customer so the owner sees exactly what the customer sees. Only GET
 * readers use this; every customer write keeps `p_actor = caller` and is refused for the owner.
 * Returns the actor id to pass to the reader (the caller when nothing applies, so the reader's own
 * checks decide as before).
 */
export async function proCustomerReader(db:ReturnType<typeof createAdminClient>,actor:string,requestId:string|null|undefined):Promise<string>{
 if(!requestId)return actor;
 const result=await db.rpc('pro_client_preview_actor',{p_actor:actor,p_request:requestId});
 if(result.error)throw Error('preview actor');
 return typeof result.data==='string'&&z.string().uuid().safeParse(result.data).success?result.data:actor;
}

/**
 * Fix 13 (security review #4): internal costs and margins, finance reports and the customer export are for
 * the owner and the company roles Administrator and Manager. A Member or Read-only person working in the
 * owner's company gets 403 (documented in docs/pro/team-roles-local.md).
 */
export async function proInternalFinanceAllowed(){const member=await proWorkspaceMember();return !member||member.role==='admin'||member.role==='manager';}
/** Closing round (security review B4): a per-account limit keyed by the signed identity of the role gate
 * (owner, plus the member when one works in the owner's company), never by a client-supplied IP header. */
export async function proAccountRateLimit(bucket:string,accountId:string,limit:number,windowMs:number){const member=await proWorkspaceMember();return await enforceRateLimitKey(`${bucket}:${accountId}:${member?.memberId??'owner'}`,limit,windowMs);}
/** Closing round (security review M2): a copy of a JSON answer without internal cost fields, for Member and
 * Read-only. `remove` drops optional keys (e.g. unitCostCents of a quote line); `nullify` keeps nullable ones as null. */
export function proWithoutInternalCost<T>(value:T,{remove=[],nullify=[]}:{remove?:string[];nullify?:string[]}):T{
 const walk=(v:unknown):unknown=>Array.isArray(v)?v.map(walk):v&&typeof v==='object'?Object.fromEntries(Object.entries(v as Record<string,unknown>).filter(([k])=>!remove.includes(k)).map(([k,x])=>[k,nullify.includes(k)?null:walk(x)])):v;
 return walk(value) as T;
}
export async function proInternalFinanceDenied(){return await proInternalFinanceAllowed()?null:Response.json({error:'Su rol en esta empresa no permite ver costos, márgenes ni reportes financieros.',code:'pro_role',capability:'finance.read'},{status:403,headers:proRouteHeaders});}
