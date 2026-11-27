// «Vista de la calle» backfill (2026-11-27, owner-approved): for published places WITHOUT any active photo, find a Mapillary
// street-level image (CC BY-SA 4.0) that looks at the place and cache the choice in dir_place_street_view (migration 543).
// Selection rules: src/lib/directory/street-view.ts (unit-tested in street-view.test.mjs). Image files are never
// downloaded or stored; /api/vista-calle/<placeId> redirects to Mapillary's CDN.
//
// Dry run (default): looks the places up and prints what it would store; writes nothing. --apply: stores 'found' or 'none'
// per place right away, so an interrupted run resumes where it stopped (places checked in the last 90 days are skipped).
//
//   source ~/bin/pro-local-env.sh        # needs MAPILLARY_CLIENT_TOKEN (server-side secret, never printed)
//   node scripts/directory/mapillary-streetview.mjs [--apply] [--vertical restaurant,cafe_bar] [--all] [--limit N] [--slug s] [--force] [--concurrency 4]
// Default sections: restaurant, cafe_bar, lodging, beauty, auto_services. --all: every section.
// ≤ 5 requests per second in total, whatever the concurrency (the API answers in ~0.5–1 s, so 4 workers keep the rate busy). Safe by default: refuses a Supabase URL that is not local unless --remote-ok is passed (only with the owner's OK).
import {pathToFileURL} from 'node:url';
import {STREET_VIEW_FIELDS,STREET_VIEW_RADII_M,STREET_VIEW_REFRESH_DAYS,bboxAround,isMapillaryThumbUrl,selectStreetView} from '../../src/lib/directory/street-view.ts';

export const MIN_INTERVAL_MS=200; // ≤ 5 requests per second
export const PRIORITY_VERTICALS=['restaurant','cafe_bar','lodging','beauty','auto_services'];
const GRAPH='https://graph.mapillary.com/images';

let nextSlot=0;
/** Shared rate limit for every concurrent worker: each request takes the next 200 ms slot. */
async function takeSlot(){const at=Math.max(Date.now(),nextSlot);nextSlot=at+MIN_INTERVAL_MS;const wait=at-Date.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));}
/** GET a Graph API URL with the token in the Authorization header. Errors carry the status only, never the URL or token. */
async function graphGet(url,token,{retries=4}={}){
 for(let attempt=0;;attempt++){
  await takeSlot();
  let res;
  try{res=await fetch(url,{headers:{Authorization:`OAuth ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(30000)});}
  catch(e){if(attempt>=retries)throw new Error(`red: ${e?.name??'error'}`);await new Promise(r=>setTimeout(r,1000*2**attempt));continue;}
  if(res.status===429||res.status>=500){
   if(attempt>=retries)throw new Error(`HTTP ${res.status}`);
   const ra=Number(res.headers.get('retry-after'));await new Promise(r=>setTimeout(r,(Number.isFinite(ra)&&ra>0?ra:2**attempt*3)*1000));continue;
  }
  if(res.status===401||res.status===403)throw Object.assign(new Error(`HTTP ${res.status}: token de Mapillary rechazado`),{fatal:true});
  if(!res.ok)throw new Error(`HTTP ${res.status}`);
  return res.json();
 }
}
/** Images around a point (bbox ±radius). */
export function imagesUrl(p,radiusM,limit){
 const u=new URL(GRAPH);u.searchParams.set('fields',STREET_VIEW_FIELDS);u.searchParams.set('bbox',bboxAround(p,radiusM).join(','));u.searchParams.set('limit',String(limit));
 return u.toString();
}
/** Best image for a place: 40 m first, then 80 m. */
export async function lookUp(place,token,now=new Date()){
 for(const r of STREET_VIEW_RADII_M){
  const j=await graphGet(imagesUrl(place,r,r<=40?100:200),token);
  const pick=selectStreetView(j?.data??[],place,{now,maxDistanceM:r});
  if(pick)return pick;
 }
 return null;
}
const chunks=(a,n)=>Array.from({length:Math.ceil(a.length/n)},(_,i)=>a.slice(i*n,i*n+n));

async function main(){
 const args=process.argv.slice(2),flag=n=>args.includes(n),val=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:null;};
 const apply=flag('--apply'),force=flag('--force'),limit=Number(val('--limit')??0)||Infinity,only=val('--slug');
 const verticals=flag('--all')?null:(val('--vertical')?.split(',').map(s=>s.trim()).filter(Boolean)??PRIORITY_VERTICALS);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY??process.env.SERVICE_ROLE_KEY,token=process.env.MAPILLARY_CLIENT_TOKEN?.trim();
 if(!url||!key){console.error('Falta NEXT_PUBLIC_SUPABASE_URL / SERVICE_ROLE_KEY (source ~/bin/pro-local-env.sh).');process.exit(2);}
 if(!token||!/^MLY\|/.test(token)){console.error('Falta MAPILLARY_CLIENT_TOKEN (o no tiene la forma MLY|…). En ~/dl/secrets/mapillary.env el valor debe ir entre comillas simples.');process.exit(2);}
 const host=new URL(url).hostname;
 if(!['127.0.0.1','localhost'].includes(host)&&!flag('--remote-ok')){console.error(`Base de datos no local (${host}): use --remote-ok solo con autorización del dueño.`);process.exit(2);}
 const {createClient}=await import('@supabase/supabase-js');
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});

 // 1. Published places with a usable location.
 let places=[];
 for(let from=0;;from+=1000){
  let q=db.from('dir_places').select('id,slug,vertical_id,lat,lng,location_precision').eq('status','published').not('lat','is',null).in('location_precision',['exact','street']).order('id').range(from,from+999);
  if(verticals)q=q.in('vertical_id',verticals);if(only)q=q.eq('slug',only);
  const r=await q;if(r.error)throw r.error;places.push(...r.data);if(r.data.length<1000)break;
 }
 // 2. Without any active photo (any origin but the old seed rows), and not checked in the last 90 days.
 const withPhoto=new Set(),fresh=new Set(),since=new Date(Date.now()-STREET_VIEW_REFRESH_DAYS*864e5).toISOString();
 for(const part of chunks(places.map(p=>p.id),200)){
  const [m,s]=await Promise.all([
   db.from('dir_place_media').select('place_id').eq('kind','photo').eq('status','active').neq('origin','seed').in('place_id',part),
   db.from('dir_place_street_view').select('place_id').gte('checked_at',since).in('place_id',part)]);
  if(m.error)throw m.error;if(s.error)throw s.error;
  for(const x of m.data)withPhoto.add(x.place_id);for(const x of s.data)fresh.add(x.place_id);
 }
 const todo=places.filter(p=>!withPhoto.has(p.id)&&(force||!fresh.has(p.id))).slice(0,limit);
 console.log(`Lugares publicados con ubicación: ${places.length} · con foto propia: ${withPhoto.size} · revisados hace <${STREET_VIEW_REFRESH_DAYS} días: ${fresh.size} · por revisar: ${todo.length}`);
 console.log(`Tiempo estimado: ${Math.ceil(todo.length*1.6*MIN_INTERVAL_MS/60000)} min o más (≤ 5 consultas por segundo).`);

 const stats={};const bump=(v,k)=>{(stats[v]??={revisados:0,con_vista:0,sin_vista:0,fallidos:0,exact:0,street:0,frente:0});stats[v][k]++;};
 const examples=[];let done=0,failedInRow=0;
 const concurrency=Math.min(8,Math.max(1,Number(val('--concurrency')??4)||4));let cursor=0;
 async function handle(p){
  const place={lat:Number(p.lat),lng:Number(p.lng)};
  try{
   const pick=await lookUp(place,token);
   bump(p.vertical_id,'revisados');
   const now=new Date().toISOString();
   const row=pick?{place_id:p.id,status:'found',image_id:pick.image.id,creator:String(pick.image.creator.username).slice(0,120),captured_at:pick.capturedAt.toISOString(),
     compass_angle:typeof pick.image.compass_angle==='number'?pick.image.compass_angle:null,distance_m:Math.round(pick.distanceM*10)/10,facing:pick.facing,
     thumb_1024_url:isMapillaryThumbUrl(pick.image.thumb_1024_url)?pick.image.thumb_1024_url:null,thumb_2048_url:isMapillaryThumbUrl(pick.image.thumb_2048_url)?pick.image.thumb_2048_url:null,
     thumb_fetched_at:now,checked_at:now}
    :{place_id:p.id,status:'none',image_id:null,creator:null,captured_at:null,compass_angle:null,distance_m:null,facing:null,thumb_1024_url:null,thumb_2048_url:null,thumb_fetched_at:null,checked_at:now};
   if(pick){bump(p.vertical_id,'con_vista');bump(p.vertical_id,p.location_precision);if(pick.facing)bump(p.vertical_id,'frente');if(examples.length<12)examples.push(`${p.slug} (${pick.image.creator.username}, ${Math.round(pick.distanceM)} m, nivel ${pick.tier})`);}
   else bump(p.vertical_id,'sin_vista');
   if(apply){const w=await db.from('dir_place_street_view').upsert(row,{onConflict:'place_id'});if(w.error)throw new Error(`base de datos: ${w.error.message}`);}
  }catch(e){
   if(e?.fatal){console.error(e.message);process.exit(3);}
   bump(p.vertical_id,'fallidos');console.log(`  ! ${p.slug}: ${e?.message??e}`);
   if(++failedInRow>=20){console.error('20 fallos seguidos: se detiene (vuelva a correrlo, retoma donde quedó).');process.exit(3);}
   return;
  }
  failedInRow=0;
  if(++done%200===0)console.log(`  … ${done}/${todo.length}`,JSON.stringify(stats));
 }
 await Promise.all(Array.from({length:concurrency},async()=>{while(cursor<todo.length)await handle(todo[cursor++]);}));
 console.log(apply?'Guardado.':'Dry run: no se escribió nada. Use --apply.');
 console.log('Por sección:');for(const [v,s] of Object.entries(stats))console.log(`  ${v}: ${JSON.stringify(s)}`);
 console.log('Ejemplos:');for(const x of examples)console.log('  /negocios/'+x);
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await main();
