import {z} from 'zod';
import {DIRECTORY_LISTINGS_ENABLED} from '@/lib/directory/feature-flags';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proRouteHeaders,proSameOrigin} from '@/lib/pro/route-common';
import {LISTING_ERROR_HINTS,listingMutationSchema} from '@/lib/directory/listing-schemas';
import {inventoryPageSchema,listingAssignAgentSchema} from '@/lib/directory/listing-inventory';
import {proHasModule} from '@/lib/pro/api-access-module';

// LOCAL PRO ONLY (V2/R2, development only): Pro inventory of vehicle/property listings.
//  GET  ?vertical=vehiculos|inmuebles → InventoryPage (dir_listing_owner_list)
//  POST listingMutationSchema (create/update/status/renew → dir_listing_mutate) | listingAssignAgentSchema
//       (assign_agent → dir_listing_assign_agent). CAS by `revision` (40001 → 409 conflict);
//       idempotent by `actionId` (same input → same answer; other input → 22023 → 400).
// Errors answer {error, reason}; the UI translates `reason` with inventoryErrorText().
const fail=(status:number,reason:string,error:string)=>Response.json({error,reason},{status,headers:proRouteHeaders});

// Module gate (F4): vehicles → auto_inventory (edition autos), properties → property_inventory (bienes raíces).
// pro_has_module builds on pro_entitled, so expired or banned accounts are refused. Pro is free at launch
// (paywall off): any module of the chosen edition is on.
const proModuleAccess=(db:Parameters<typeof proHasModule>[0],actor:string,module:'auto_inventory'|'property_inventory')=>proHasModule(db,actor,module);

function dbError(error:{code?:string;hint?:string;message?:string}){
 const hint=error.hint as keyof typeof LISTING_ERROR_HINTS|undefined;
 if(hint&&hint in LISTING_ERROR_HINTS){const m=LISTING_ERROR_HINTS[hint];return fail(m.status,m.code,'No se pudo completar la operación.');}
 switch(error.code){
  case '40001':return fail(409,'conflict','El anuncio cambió. Recargue antes de guardar.');
  case 'P0002':return fail(404,'not_found','El anuncio no está disponible.');
  case '54000':return fail(409,'listing_limit_private','Alcanzó el límite de anuncios.');
  case '22023':case '23514':case '22P02':return fail(400,'invalid','Revise los datos del anuncio.');
  case '42501':return fail(403,'module_unavailable','Sin acceso.');
  default:return fail(503,'unavailable','No se pudo completar la operación.');
 }
}
const verticalSchema=z.enum(['vehiculos','inmuebles']);
const moduleOf=(v:'vehiculos'|'inmuebles')=>v==='vehiculos'?'auto_inventory' as const:'property_inventory' as const;

export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development'||!DIRECTORY_LISTINGS_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const q=new URL(req.url).searchParams;if([...q.keys()].length!==1)return fail(400,'invalid','Consulta inválida.');
  const vertical=verticalSchema.safeParse(q.get('vertical'));if(!vertical.success)return fail(400,'invalid','Consulta inválida.');
  if(!await proModuleAccess(a.db,a.user.id,moduleOf(vertical.data)))return fail(403,'module_unavailable','Sin acceso.');
  // Expiry: dir_listing_expire_due needs a staff actor; the owner reader reports published rows past expires_at as 'expired'.
  const result=await a.db.rpc('dir_listing_owner_list',{p_actor:a.user.id,p_vertical:vertical.data});
  if(result.error)return dbError(result.error);
  const page=inventoryPageSchema.safeParse(result.data);if(!page.success)return fail(503,'unavailable','Respuesta inválida.');
  return Response.json(page.data,{headers:proRouteHeaders});
 }catch{return fail(503,'unavailable','No se pudo cargar el inventario. Reintente.');}
}

export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development'||!DIRECTORY_LISTINGS_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 if(!proSameOrigin(req))return fail(403,'origin','Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'dir-listings-'+a.user.id,120,60000);if(limited)return limited;
  let raw:unknown;try{raw=await proBoundedJson(req,32768);}catch{return fail(400,'invalid','Revise los datos del anuncio.');}
  const assign=listingAssignAgentSchema.safeParse(raw);
  if(assign.success){
   if(!await proModuleAccess(a.db,a.user.id,'property_inventory'))return fail(403,'module_unavailable','Sin acceso.');
   const result=await a.db.rpc('dir_listing_assign_agent',{p_actor:a.user.id,p_input:assign.data});
   return result.error?dbError(result.error):Response.json(result.data,{headers:proRouteHeaders});
  }
  const parsed=listingMutationSchema.safeParse(raw);if(!parsed.success)return fail(400,'invalid','Revise los datos del anuncio.');
  const input=parsed.data;
  // Module by vertical: create carries it; other actions read it from the owner's listing (P0002 if not theirs).
  let vertical:'vehiculos'|'inmuebles';
  if(input.action==='create')vertical=input.listing.vertical;
  else{
   const own=await a.db.from('dir_listings').select('vertical,status,seller_profile_id').eq('id',input.listingId).maybeSingle();
   if(own.error)return dbError(own.error);
   if(!own.data||own.data.seller_profile_id!==a.user.id)return fail(404,'not_found','El anuncio no está disponible.');
   vertical=own.data.vertical as 'vehiculos'|'inmuebles';
   // The minimum of photos to publish is enforced by dir_listing_mutate (hint dir_listing_photos_missing → 422).
  }
  if(!await proModuleAccess(a.db,a.user.id,moduleOf(vertical)))return fail(403,'module_unavailable','Sin acceso.');
  // place_id must be a place this seller actively manages: dir_listing_mutate checks it (42501 dir_listing_place_not_managed).
  const result=await a.db.rpc('dir_listing_mutate',{p_actor:a.user.id,p_input:input});
  if(result.error)return dbError(result.error);
  return Response.json(result.data,{headers:proRouteHeaders});
 }catch{return fail(503,'unavailable','No se pudo comprobar el guardado. Reintente la misma operación.');}
}
