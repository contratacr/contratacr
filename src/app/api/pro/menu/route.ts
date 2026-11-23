import {createHash} from 'node:crypto';
import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import type {createAdminClient} from '@/lib/supabase/admin';
import {ProBodyError,proActor,proBoundedForm,proBoundedJson,proRouteHeaders,proSameOrigin,sniffImage} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {derivedId} from '@/lib/pro/integrations/ids';
import {MENU_ERROR_HINTS,menuImportReviewSchema,menuMutationSchema} from '@/lib/directory/menu-schemas';
import {MENU_IMPORT_MAX_BYTES,MockMenuExtractor,menuImportImageTypes,normalizeMenuExtraction} from '@/lib/directory/menu-import';
import {proHasModule} from '@/lib/pro/api-access-module';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// LOCAL PRO ONLY (P2, development only): Pro menu of a claimed restaurant, /api/pro/menu. The segment «menu» is
// already mapped by the F4 SQL: pro_role_route_capability → menu.write and pro_route_module → menu (team gate).
//  GET  ?placeId=<uuid>                     → EditorMenu (pro_menu_read)
//  POST application/json menuMutationSchema → pro_menu_mutate (CAS revision → 409; idempotent actionId)
//  POST application/json menuImportReviewSchema (decision apply|discard) → pro_menu_import_review (drafts only)
//  POST multipart {placeId, actionId, language, photo} → MOCK menu-from-photo → pro_menu_import_record (creates nothing)
// p_actor = effective account (owner's when a member works in the owner's company: the gate already checked the
// route capability); p_member = the member behind it (SQL re-checks menu.write and records it in the history).
// The SQL checks that p_actor actively manages the claimed restaurant. Errors answer {error, reason}.
const fail=(status:number,reason:string,error='No se pudo completar la operación.')=>Response.json({error,reason},{status,headers:proRouteHeaders});

// F4 module gate on the effective (owner) account: 'menu' = restaurantes/básico, 'menu_from_photo' = restaurantes/plus
// (with the paywall off every module of the chosen edition is on). Built on pro_entitled: banned/expired → refused.
const proModuleAccess=(db:Parameters<typeof proHasModule>[0],actor:string,module:'menu'|'menu_from_photo')=>proHasModule(db,actor,module);

function dbError(error:{code?:string;hint?:string;message?:string}){
 const h=error.hint as keyof typeof MENU_ERROR_HINTS|undefined;
 if(h&&h in MENU_ERROR_HINTS){const m=MENU_ERROR_HINTS[h];return fail(m.status,m.code);}
 switch(error.code){
  case '40001':return fail(409,'conflict','El menú cambió. Recargue antes de guardar.');
  case 'P0002':return fail(404,'not_found','Ese elemento no está disponible.');
  case '23505':return fail(409,'conflict');
  case '54000':return fail(409,'item_cap');
  case '42501':return fail(403,'not_manager','Sin acceso.');
  case '22023':case '23514':case '22P02':return fail(400,'invalid','Revise los datos del menú.');
  default:return fail(503,'unavailable');
 }
}
async function context(req:Request){
 const a=await proActor(req);if(a.error)return {error:a.error} as const;
 const member=await proWorkspaceMember();
 return {db:a.db,actor:a.user.id,member:member&&member.ownerId===a.user.id?member.memberId:null,error:null} as const;
}

export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const c=await context(req);if(c.error)return c.error;
  const q=new URL(req.url).searchParams;if([...q.keys()].length!==1)return fail(400,'invalid','Consulta inválida.');
  const placeId=z.string().uuid().safeParse(q.get('placeId'));if(!placeId.success)return fail(400,'invalid','Consulta inválida.');
  if(!await proModuleAccess(c.db,c.actor,'menu'))return fail(403,'module_unavailable');
  const result=await c.db.rpc('pro_menu_read',{p_actor:c.actor,p_member:c.member,p_place:placeId.data});
  return result.error?dbError(result.error):Response.json(result.data,{headers:proRouteHeaders});
 }catch{return fail(503,'unavailable','No se pudo cargar el menú. Reintente.');}
}

export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 if(!proSameOrigin(req))return fail(403,'origin','Origen no autorizado.');
 try{
  const c=await context(req);if(c.error)return c.error;
  const limited=await enforceRateLimit(req,'dir-menu-'+c.actor,120,60000);if(limited)return limited;
  const type=req.headers.get('content-type')?.toLowerCase()??'';
  if(type.startsWith('multipart/form-data'))return importPhoto(req,c);
  let raw:unknown;try{raw=await proBoundedJson(req,262144);}catch{return fail(400,'invalid','Revise los datos del menú.');}
  if(raw&&typeof raw==='object'&&'decision' in raw){
   const review=menuImportReviewSchema.safeParse(raw);if(!review.success)return fail(400,'invalid','Revise la importación.');
   if(!await proModuleAccess(c.db,c.actor,'menu_from_photo'))return fail(403,'module_unavailable');
   const result=await c.db.rpc('pro_menu_import_review',{p_actor:c.actor,p_member:c.member,p_input:review.data});
   return result.error?dbError(result.error):Response.json(result.data,{headers:proRouteHeaders});
  }
  const parsed=menuMutationSchema.safeParse(raw);if(!parsed.success)return fail(400,'invalid','Revise los datos del menú.');
  if(!await proModuleAccess(c.db,c.actor,'menu'))return fail(403,'module_unavailable');
  const result=await c.db.rpc('pro_menu_mutate',{p_actor:c.actor,p_member:c.member,p_input:parsed.data});
  return result.error?dbError(result.error):Response.json(result.data,{headers:proRouteHeaders});
 }catch{return fail(503,'unavailable','No se pudo comprobar el guardado. Reintente la misma operación.');}
}

async function importPhoto(req:Request,c:{db:ReturnType<typeof createAdminClient>;actor:string;member:string|null}){
 let form:FormData;
 try{form=await proBoundedForm(req,{maxBytes:MENU_IMPORT_MAX_BYTES+65536,maxFiles:1,maxFileBytes:MENU_IMPORT_MAX_BYTES,fields:['placeId','actionId','language','photo']});}
 catch(error){return fail(error instanceof ProBodyError&&error.status===413?413:400,'unsupported_file');}
 const placeId=z.string().uuid().safeParse(form.get('placeId')),actionId=z.string().uuid().safeParse(form.get('actionId'));
 const language=form.get('language')==='en'?'en':'es',file=form.get('photo');
 if(!placeId.success||!actionId.success||!(file instanceof Blob))return fail(400,'invalid','Revise el archivo.');
 if(!await proModuleAccess(c.db,c.actor,'menu_from_photo'))return fail(403,'module_unavailable');
 // Same consent as every Pro AI feature (Company › Integrations), even while the adapter is the mock.
 const settings=await c.db.rpc('pro_ai_settings_read',{p_actor:c.actor});
 if(settings.error)return dbError(settings.error);
 if(!(settings.data as {consent?:boolean}|null)?.consent)return fail(403,'consent_required');
 const bytes=file.size>=1&&file.size<=MENU_IMPORT_MAX_BYTES?new Uint8Array(await file.arrayBuffer()):null;
 const mime=bytes?sniffImage(bytes):null;
 if(!bytes||!mime||!(menuImportImageTypes as readonly string[]).includes(file.type.split(';')[0]!.trim().toLowerCase()))return fail(400,'unsupported_file');
 // MOCK ONLY: no provider call exists. A real adapter must go through pro_ai_begin/pro_ai_finish (cap + receipts).
 const extractor=new MockMenuExtractor(),answer=await extractor.extract({bytes,mime,language});
 const extraction=answer.ok?normalizeMenuExtraction(answer.output):null;
 const result=await c.db.rpc('pro_menu_import_record',{p_actor:c.actor,p_member:c.member,p_input:{
  actionId:actionId.data,draftId:derivedId(actionId.data,'menu-import'),placeId:placeId.data,mode:'mock',model:extractor.model,
  source:{sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,mime},
  ok:!!extraction,extraction,error:extraction?null:answer.ok?'invalid_output':answer.reason}});
 return result.error?dbError(result.error):Response.json(result.data,{headers:proRouteHeaders});
}
