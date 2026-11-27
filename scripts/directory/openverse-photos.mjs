// Phase 2 of free place photos (phase 1: commons-photos.mjs). For places that still have no photo, searches the Openverse
// API (no key) with "<name> <canton or province> Costa Rica", licences cc0 / pdm / by / by-sa only (never NC/ND), and keeps a
// candidate ONLY when its title or tags clearly contain the place name (accents/case ignored). These matches are uncertain, so
// nothing is published: the photo is stored as a PENDING dir_place_media row (origin 'openverse') with the full attribution
// and a reviewer note, and appears in the admin photo queue. At most 1 candidate per place.
//
//   source ~/bin/pro-local-env.sh
//   node scripts/directory/openverse-photos.mjs [--apply] [--section restaurant,lodging,…] [--limit N] [--max-queries 900]
// Dry run (default) searches and reports, stores nothing. ≤ 1 request per second; local DB only unless --remote-ok.
import {pathToFileURL} from 'node:url';
import {plainText} from './commons-photos.mjs';

export const USER_AGENT='ContrataCR-directory/1.0';
export const MIN_INTERVAL_MS=1000;
export const SECTIONS=['restaurant','cafe_bar','lodging','attraction','tours','beauty']; // where photos matter most, in this order
export const NOTE='Sugerida automáticamente (Openverse) — verificar que sea el lugar.';
const API='https://api.openverse.org/v1/images/';
const LICENSES={cc0:'CC0',pdm:'Public domain',by:'CC BY','by-sa':'CC BY-SA'};
const GENERIC=new Set(['soda','restaurante','restaurant','hotel','cafe','cafeteria','bar','pizzeria','panaderia','salon','spa','tour','tours','hostel','cabinas','cabina','apartamentos','casa','finca','parque','playa','mirador','bazar','pulperia','tienda','centro','plaza','mini','super','supermercado']);

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────────────────────────────────────
export const fold=v=>String(v??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
/** A name is distinctive enough to match when it has ≥ 2 words (not all generic) or a single non-generic word of ≥ 6 letters. */
export function distinctiveName(name){
 const t=fold(name).split(' ').filter(Boolean);if(!t.length)return false;
 const real=t.filter(w=>!GENERIC.has(w));
 return t.length>=2?real.length>=1&&real.join('').length>=5:t[0].length>=6&&!GENERIC.has(t[0]);
}
/** true when fold(text) contains fold(name) as whole words. */
export const containsName=(text,name)=>{const n=fold(name);return !!n&&` ${fold(text)} `.includes(` ${n} `);};
const mentionsCR=r=>/costa rica|costarica|\bcr\b/.test(fold([r.title,r.foreign_landing_url,...(r.tags??[]).map(t=>t.name)].join(' ')));
/** Best acceptable Openverse result for a place (null when none clearly names it). Prefers results that mention Costa Rica. */
export function pickCandidate(place,results){
 if(!distinctiveName(place.name))return null;
 const ok=(results??[]).filter(r=>r&&r.url&&r.id&&Object.hasOwn(LICENSES,r.license)&&/^https:\/\//.test(r.foreign_landing_url??'')&&/^https:\/\//.test(r.url)
  &&(containsName(r.title,place.name)||(r.tags??[]).some(t=>containsName(t.name,place.name)))&&!/(logo|screenshot|flyer|poster)/i.test(r.title??''));
 ok.sort((a,b)=>Number(mentionsCR(b))-Number(mentionsCR(a)));
 return ok[0]??null;
}
/** Attribution record (same shape as Commons plus provider, openverseId and the reviewer note). */
export function attributionFromResult(r){
 const lic=LICENSES[r.license]+(r.license==='cc0'||r.license==='pdm'?'':` ${r.license_version??''}`.trimEnd());
 return{source:'openverse',provider:/^wikimedia/i.test(r.source??'')?'Wikimedia Commons':plainText(r.source??r.provider??'Openverse',40)?.replace(/^./,c=>c.toUpperCase()),openverseId:r.id,file:plainText(r.title,160),author:plainText(r.creator,120),credit:null,
  license:lic,licenseUrl:/^https:\/\//.test(r.license_url??'')?r.license_url:null,sourceUrl:r.foreign_landing_url,note:NOTE};
}

// ── Network ────────────────────────────────────────────────────────────────────────────────────────────────
let last=0;
async function polite(url,{binary=false,retries=3}={}){
 for(let a=0;;a++){
  const wait=last+MIN_INTERVAL_MS-Date.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));last=Date.now();
  let res;try{res=await fetch(url,{headers:{'User-Agent':USER_AGENT,Accept:binary?'image/*':'application/json'},signal:AbortSignal.timeout(30000)});}catch(e){if(a>=retries)throw e;await new Promise(r=>setTimeout(r,1000*2**a));continue;}
  if(res.status===429||res.status>=500){if(a>=retries)throw new Error(`HTTP ${res.status}`);const ra=Number(res.headers.get('retry-after'));await new Promise(r=>setTimeout(r,(ra>0?ra:2**a*3)*1000));continue;}
  if(!res.ok)throw new Error(`HTTP ${res.status}`);
  return binary?new Uint8Array(await res.arrayBuffer()):res.json();
 }
}

async function main(){
 const args=process.argv.slice(2),flag=n=>args.includes(n),val=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:null;};
 const apply=flag('--apply'),limit=Number(val('--limit')??0)||Infinity,maxQ=Number(val('--max-queries')??900);
 const sections=(val('--section')?.split(',')??SECTIONS);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY??process.env.SERVICE_ROLE_KEY;
 if(!url||!key){console.error('Falta NEXT_PUBLIC_SUPABASE_URL / SERVICE_ROLE_KEY (source ~/bin/pro-local-env.sh).');process.exit(2);}
 const host=new URL(url).hostname;
 if(!['127.0.0.1','localhost'].includes(host)&&!flag('--remote-ok')){console.error(`Base de datos no local (${host}): use --remote-ok solo con autorización del dueño.`);process.exit(2);}
 const {createClient}=await import('@supabase/supabase-js');
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const used=new Set();
 for(let from=0;;from+=1000){const r=await db.from('dir_place_media').select('place_id,attribution').eq('kind','photo').in('status',['active','pending']).range(from,from+999);
  if(r.error)throw r.error;for(const x of r.data){used.add(x.place_id);if(x.attribution?.openverseId)used.add('ov:'+x.attribution.openverseId);}if(r.data.length<1000)break;}
 let pipeline=null;
 if(apply){const P=await import('../../src/lib/directory/photo-pipeline.ts'),C=await import('../../src/lib/directory/photo-codec-sharp.ts');pipeline={...P,codec:await C.createSharpPhotoCodec()};}
 const bucket=db.storage.from('dir-place-photos'),base='https://contratacr.com/api/fotos-lugar/';
 const stat={consultas:0,sinResultado:0,sinCoincidencia:0,candidatas:0,guardadas:0,fallidas:0},bySection={},examples=[];let queries=0;
 outer:for(const v of sections){
  const places=[];
  for(let from=0;;from+=1000){const r=await db.from('dir_places').select('id,slug,name,vertical_id,admin_area_1,admin_area_2').eq('status','published').eq('vertical_id',v).order('slug').range(from,from+999);
   if(r.error)throw r.error;places.push(...r.data);if(r.data.length<1000)break;}
  const todo=places.filter(p=>!used.has(p.id)&&distinctiveName(p.name));
  console.log(`[${v}] sin foto y con nombre distintivo: ${todo.length} de ${places.length}`);
  for(const p of todo){
   if(queries>=maxQ||stat.candidatas>=limit){console.log('Tope alcanzado (consultas o límite).');break outer;}
   queries++;stat.consultas++;
   const q=new URLSearchParams({q:`${p.name} ${p.admin_area_2??p.admin_area_1??''} Costa Rica`.replace(/\s+/g,' ').trim(),license:'cc0,pdm,by,by-sa',page_size:'10'});
   let j;try{j=await polite(`${API}?${q}`);}catch(e){console.log('  ! consulta falló:',e.message);stat.fallidas++;if(/429/.test(e.message))break outer;continue;}
   if(!j.results?.length){stat.sinResultado++;continue;}
   const c=pickCandidate(p,j.results);if(!c||used.has('ov:'+c.id)){stat.sinCoincidencia++;continue;}
   stat.candidatas++;bySection[v]=(bySection[v]??0)+1;const attribution=attributionFromResult(c);
   if(!apply){if(examples.length<8)console.log(`  ~ ${p.slug} ← "${c.title}" · ${attribution.license} · ${attribution.provider}`);continue;}
   const created=[];
   try{
    const mediaId=await pipeline.derivedUuid('dir-place-openverse',p.id,c.id);
    const bytes=await polite(c.url,{binary:true});
    const res=await pipeline.processListingPhoto(bytes,{photoId:mediaId,codec:pipeline.codec});
    if(!res.ok){stat.fallidas++;console.log(`  ! ${p.slug}: foto rechazada (${res.reason})`);continue;}
    const paths={};
    for(const size of pipeline.PHOTO_VARIANTS){const x=res.photo.variants[size],path=x.path.replace(/^dir-listings\//,'dir-places/');
     const up=await bucket.upload(path,x.bytes,{contentType:x.contentType,upsert:false,cacheControl:'31536000'});if(up.error&&String(up.error.statusCode)!=='409')throw up.error;created.push(path);paths[size]=path;}
    const ins=await db.from('dir_place_media').insert({id:mediaId,place_id:p.id,kind:'photo',url:base+mediaId,source_id:'osm',sort:20,status:'pending',origin:'openverse',
     sha256:res.photo.sha256,width:res.photo.width,height:res.photo.height,path_1600:paths[1600],path_800:paths[800],path_320:paths[320],photo_store:'supabase',attribution});
    if(ins.error){if(ins.error.code==='23505'){await bucket.remove(created).catch(()=>{});continue;}throw ins.error;}
    used.add(p.id);used.add('ov:'+c.id);stat.guardadas++;if(examples.length<8)examples.push(p.slug);console.log(`  + ${p.slug} ← "${c.title}" · ${attribution.license} (pendiente)`);
   }catch(e){stat.fallidas++;console.log(`  ! ${p.slug}: ${e?.message??e}`);if(created.length)await bucket.remove(created).catch(()=>{});}
  }
 }
 console.log(apply?'Aplicado (todo queda PENDIENTE de moderación):':'Dry run (nada guardado):',JSON.stringify(stat));console.log('  candidatas por sección:',JSON.stringify(bySection));
 if(apply)console.log('  ejemplos:',examples.map(s=>`/negocios/${s}`).join(' '));
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await main();
