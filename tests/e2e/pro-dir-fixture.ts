import {expect,type BrowserContext,type Page} from 'playwright/test';
import {regressionAdminClient} from './seed';
import {origin} from './pro-round2-fixture';
import type {DirectoryVertical} from '@/lib/directory/types';

// Multivertical directory E2E helpers (LOCAL Pro, loopback only). Every spec creates its own synthetic places and
// listings with a unique label, so runs never depend on each other. Staff actions use a random actor id (the
// service role is the boundary for staff RPCs in the local SQL).
export type Db=ReturnType<typeof regressionAdminClient>;
export const dirDb=()=>regressionAdminClient();
export const uid=()=>crypto.randomUUID();
export const label=()=>crypto.randomUUID().slice(0,8);

async function rpc<T=Record<string,unknown>>(db:Db,fn:string,args:Record<string,unknown>):Promise<T>{
 const r=await db.rpc(fn,args);if(r.error)throw new Error(`${fn}: ${r.error.code} ${r.error.message} ${r.error.hint??''}`);return r.data as T;
}
// Places created by this worker's specs. hideSeededPlaces() (afterEach in every pro-dir-* spec) moves them to
// 'hidden', so a run never leaves synthetic places on the public pages next to the real (OSM) seed. Directory rows
// are append-only by design (no DELETE grant), so hiding is the cleanup, not deleting.
const seededPlaces=new Map<string,string>();
export const trackPlace=(placeId:string,staff:string)=>{seededPlaces.set(placeId,staff);};
export async function hideSeededPlaces(db:Db=dirDb()){
 const failures:string[]=[];
 for(const [placeId,staff] of [...seededPlaces]){
  const row=await db.from('dir_places').select('status,revision').eq('id',placeId).maybeSingle();
  if(row.error){failures.push(`${placeId}: ${row.error.message}`);continue;}
  if(row.data&&row.data.status!=='hidden'){
   const r=await db.rpc('dir_place_mutate',{p_actor:staff,p_input:{action:'status',actionId:uid(),placeId,revision:Number(row.data.revision),status:'hidden'}});
   if(r.error){failures.push(`${placeId}: ${r.error.code} ${r.error.message}`);continue;}
  }
  seededPlaces.delete(placeId);
 }
 if(failures.length)throw new Error('Could not hide E2E places: '+failures.join(' | '));
}
export type PlaceSeed={slug:string;vertical:DirectoryVertical;name:string;adminArea1?:string;adminArea2?:string;locality?:string;
 addressLine?:string;lat?:number;lng?:number;phone?:string;website?:string;email?:string;attributes?:Record<string,unknown>};
/** Creates a place (imported from an OSM-like source so its phone counts as independent), optional hours, publish, licence. */
export async function seedPlace(db:Db,place:PlaceSeed,{publish=true,license=false,verified=false,hours=[] as {weekday:number;opens:string;closes:string}[]}={}){
 const staff=uid(),placeId=uid();
 const m=(input:Record<string,unknown>)=>rpc<{revision:number}>(db,'dir_place_mutate',{p_actor:staff,p_input:{actionId:uid(),placeId,...input}});
 trackPlace(placeId,staff);
 let rev=(await m({action:'create',revision:0,source:{id:'osm',ref:'node/e2e-'+place.slug},verificationLevel:'imported',
  place:{adminArea1:'San José',adminArea2:'San José',locality:'San José',lat:9.933,lng:-84.08,...place}})).revision;
 if(hours.length)rev=(await m({action:'hours',revision:rev,hours})).revision;
 if(publish)rev=(await m({action:'status',revision:rev,status:'published'})).revision;
 if(license||verified)rev=(await m({action:'verify',revision:rev,verificationLevel:license?'license_verified':'verified'})).revision;
 return {placeId,staff,revision:rev};
}

type NationalCurrent={items:{item:{slug:string};current:null|{sourceKind:string;sourceRef:string|null;price:number;observedAt:string;validFrom:string;validTo:string|null}}[]};
/**
 * Records a SYNTHETIC national fuel set (short validity) for a test and returns restore(): the synthetic observations
 * are rejected (takedown, rows are append-only) and the official set that was current before — superseded by the
 * synthetic one — is recorded again with its own resolution, dates and prices. Synthetic prices never stay public.
 */
export async function syntheticFuelSet(db:Db,staff:string,ref:string,prices:{itemSlug:string;price:number}[]){
 const before=(await db.rpc('public_price_current',{p_place_slug:null,p_item_slug:null})).data as NationalCurrent|null;
 const previous=(before?.items??[]).map(i=>i.current?{slug:i.item.slug,...i.current}:null).filter(c=>c?.sourceKind==='official_aresep');
 const now=new Date(Date.now()-60_000).toISOString(),validTo=new Date(Date.now()+15*60_000).toISOString();
 const set=await db.rpc('price_official_set_record',{p_actor:staff,p_input:{actionId:uid(),sourceKind:'official_aresep',sourceRef:ref,observedAt:now,validFrom:now,validTo,prices}});
 if(set.error)throw new Error(`price_official_set_record: ${set.error.code} ${set.error.message}`);
 const ids=((set.data as {observations:{observationId:string}[]}).observations).map(o=>o.observationId);
 return async function restore(){
  for(const observationId of ids){
   const r=await db.rpc('price_observation_moderate',{p_actor:staff,p_input:{actionId:uid(),observationId,decision:'reject',note:'E2E synthetic fuel set'}});
   if(r.error&&r.error.code!=='40001')throw new Error(`price_observation_moderate: ${r.error.code} ${r.error.message}`);
  }
  const groups=new Map<string,typeof previous>();
  for(const c of previous){const k=`${c!.sourceRef}|${c!.validFrom}|${c!.validTo??''}`;groups.set(k,[...(groups.get(k)??[]),c]);}
  for(const group of groups.values()){
   const c=group[0]!;
   const r=await db.rpc('price_official_set_record',{p_actor:staff,p_input:{actionId:uid(),sourceKind:'official_aresep',sourceRef:c.sourceRef,observedAt:c.observedAt,validFrom:c.validFrom,
    ...(c.validTo?{validTo:c.validTo}:{}),prices:group.map(g=>({itemSlug:g!.slug,price:Number(g!.price)}))}});
   if(r.error)throw new Error(`restore official set: ${r.error.code} ${r.error.message}`);
  }
 };
}

const hex64=()=>(uid()+uid()).replace(/-/g,'');
const photo=()=>{const id=uid();return {id,sha256:hex64(),width:1600,height:1067,path1600:`dir-listings/${id}/1600.webp`,path800:`dir-listings/${id}/800.webp`,path320:`dir-listings/${id}/320.webp`,exifStripped:true};};
export async function vehicleModel(db:Db,make='toyota',model='hilux'){
 const r=await db.from('ref_vehicle_models').select('id,make_id,ref_vehicle_makes!inner(slug)').eq('slug',model).eq('ref_vehicle_makes.slug',make).single();
 if(r.error)throw r.error;return {makeId:Number(r.data.make_id),modelId:Number(r.data.id)};
}
/** Listing created by `seller`, with 4 (synthetic) photo rows, published; optional status after publish (reserved). */
export async function seedListing(db:Db,seller:string,input:{listing:Record<string,unknown>;vehicle?:Record<string,unknown>;property?:Record<string,unknown>},{status}:{status?:'reserved'}={}){
 const listingId=uid();
 const created=await rpc<{revision:number;code:string}>(db,'dir_listing_mutate',{p_actor:seller,p_input:{action:'create',actionId:uid(),listingId,revision:0,...input}});
 for(let i=0;i<4;i++)await rpc(db,'dir_listing_media_mutate',{p_actor:seller,p_input:{action:'add',actionId:uid(),listingId,media:photo()}});
 const rev=async()=>Number((await db.from('dir_listings').select('revision').eq('id',listingId).single()).data!.revision);
 await rpc(db,'dir_listing_mutate',{p_actor:seller,p_input:{action:'status',actionId:uid(),listingId,revision:await rev(),status:'published'}});
 if(status)await rpc(db,'dir_listing_mutate',{p_actor:seller,p_input:{action:'status',actionId:uid(),listingId,revision:await rev(),status}});
 return {listingId,code:created.code};
}

/** Pro owner chooses an edition (Pro is free at launch: every module of that edition is on). */
export async function chooseEdition(db:Db,owner:string,edition:'servicios'|'autos'|'restaurantes'|'bienes_raices'|'comercio'){
 const current=await db.from('pro_workspace_editions').select('revision').eq('owner_id',owner).maybeSingle();
 return rpc(db,'pro_workspace_edition_mutate',{p_actor:owner,p_input:{action:'choose_edition',actionId:uid(),edition,ownerId:owner,revision:Number(current.data?.revision??0)}});
}

/** Same-origin JSON POST from the page's context (cookies of the signed-in user, if any). */
export async function postJson(context:BrowserContext|Page,path:string,data:unknown,headers:Record<string,string>={}){
 const request='request' in context?context.request:context;
 const r=await request.post(origin+path,{headers:{Origin:origin,'content-type':'application/json',...headers},data,timeout:45000});
 return {status:r.status(),body:await r.json().catch(()=>null) as Record<string,unknown>|null};
}

/** Latest code the MOCK e-mail sender recorded for a claim (local test mailbox route; only the claimant can read it). */
export async function readClaimMailbox(context:BrowserContext,claimId:string){
 const r=await context.request.get(`${origin}/api/reclamos/${claimId}/buzon-prueba`,{timeout:45000});
 const body=await r.json().catch(()=>null) as {code?:string;to?:string;subject?:string;text?:string}|null;
 expect(r.status(),JSON.stringify(body)).toBe(200);expect(String(body?.code)).toMatch(/^\d{6}$/);
 return body!;
}
/**
 * Claims a published place with email_listed through the real routes (since 2026-11-17 claims go by e-mail; SMS is
 * off). When the place has no e-mail, staff puts a synthetic, non-deliverable one on it first (staff changes are
 * trusted). The code is read from the mock outbox through the local test mailbox route.
 */
export async function claimByEmail(context:BrowserContext,slug:string,db:Db=dirDb()){
 const place=(await db.from('dir_places').select('id,revision,email').eq('slug',slug).single()).data as {id:string;revision:number;email:string|null};
 if(!place.email)await rpc(db,'dir_place_mutate',{p_actor:uid(),p_input:{action:'update',actionId:uid(),placeId:place.id,revision:Number(place.revision),place:{email:`duena-${label()}@negocio-e2e.test`}}});
 // Own rate-limit bucket, so a helper claim never eats the per-IP allowance of the spec that calls it.
 const claimId=uid(),ip={'x-forwarded-for':`10.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}`};
 const open=await postJson(context,`/api/lugar/${slug}/reclamo`,{actionId:uid(),claimId,method:'email_listed'},ip);expect(open.status,JSON.stringify(open.body)).toBe(200);
 const sent=await postJson(context,`/api/reclamos/${claimId}/codigo`,{actionId:uid()},ip);expect(sent.status,JSON.stringify(sent.body)).toBe(200);
 expect(sent.body?.channel).toBe('email');expect(sent.body?.devCode).toBeUndefined();
 const {code}=await readClaimMailbox(context,claimId);
 const ok=await postJson(context,`/api/reclamos/${claimId}/verificar`,{actionId:uid(),code},ip);expect(ok.status).toBe(200);expect(ok.body?.verified).toBe(true);
 return claimId;
}

/** HTML of the current page without scripts, for "never shown" checks. */
export const visibleHtml=(page:Page)=>page.evaluate(()=>document.body.innerText);

/** Opens a tab of the place page («info», «offer», «reviews», «photos», «questions»). The tab bar is hydrated by then. */
export async function openPlaceTab(page:Page,id:'info'|'offer'|'reviews'|'photos'|'questions'){
 const tab=page.locator(`[data-place-tab="${id}"]`);
 await expect(async()=>{
  await tab.click({timeout:2000});
  await expect(tab).toHaveAttribute('aria-selected','true',{timeout:1000});
 }).toPass({timeout:30000});
}
