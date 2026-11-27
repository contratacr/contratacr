// Real photos for imported directory places from FREELY LICENSED sources only: Wikimedia Commons, found through the OSM
// tags of each place (wikimedia_commons=File:…, image=<commons URL>, wikidata=Q… → Wikidata P18). Never Google Maps, Waze,
// TripAdvisor, Facebook or any photo without a free licence (see docs/directory-photos.md).
//
// Dry run (default): resolves files and licences against the Wikidata/Commons APIs and prints the report; downloads and
// writes nothing. --apply: downloads a 1600 px thumb, runs it through the same pipeline as uploads (three variants, no
// metadata), stores it in the private bucket dir-place-photos and inserts an active dir_place_media row (origin
// 'commons') with the attribution (author, licence, licence URL, source page). Idempotent: a place that already has a
// Commons photo (same file, or any Commons photo) is skipped, and the media id is derived from place + file.
//
//   source ~/bin/pro-local-env.sh
//   node scripts/directory/commons-photos.mjs [--apply] [--osm <osm-pois.json>] [--limit N] [--slug <slug>]
// Safe by default: refuses a Supabase URL that is not local unless --remote-ok is passed (only with the owner's OK).
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {homedir} from 'node:os';
import {join} from 'node:path';

export const USER_AGENT='ContrataCR-directory/1.0 (generic contact)';
export const MIN_INTERVAL_MS=500; // ≤ 2 requests per second, shared by every API and download call
// upload.wikimedia.org answers 429 (retry-after 600 s) to bursts of downloads: files are fetched slower than the API.
const DOWNLOAD_INTERVAL_MS=3000;
const COMMONS_API='https://commons.wikimedia.org/w/api.php';
const WIKIDATA_API='https://www.wikidata.org/w/api.php';
const CHUNK=40;

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────────────────────────────────────
/** «File:Foo_bar.jpg» / «Foo_bar.jpg» / «Foo bar.jpg» → «File:Foo bar.jpg» (null when it is not a file title). */
export function normalizeFileTitle(v){
 if(typeof v!=='string')return null;
 let s=v.trim();if(s.startsWith('File:')||s.startsWith('file:')||s.startsWith('Image:'))s=s.replace(/^[A-Za-z]+:/,'');
 else if(/^[A-Za-z]+:/.test(s)&&!/^[^:]+\.[A-Za-z0-9]{3,4}$/.test(s))return null; // Category:… and other namespaces
 s=s.replace(/_/g,' ').replace(/\s+/g,' ').trim();
 if(!/^[^|#<>[\]{}]+\.(jpe?g|png|webp)$/i.test(s)||s.length>240)return null;
 return 'File:'+s[0].toUpperCase()+s.slice(1);
}
/** File title from an OSM `image` value that points at Wikimedia Commons (null for any other host). */
export function commonsFileFromUrl(v){
 if(typeof v!=='string')return null;
 let u;try{u=new URL(v.trim());}catch{return null;}
 const host=u.hostname.toLowerCase();
 try{
  if(host==='commons.wikimedia.org'){
   const m=/^\/wiki\/(?:Special:FilePath\/|Special:Redirect\/file\/)?(.+)$/i.exec(u.pathname);if(m)return normalizeFileTitle(decodeURIComponent(m[1]));
   const t=u.searchParams.get('title');return t?normalizeFileTitle(decodeURIComponent(t)):null;
  }
  if(host==='upload.wikimedia.org'){
   const p=u.pathname.split('/').filter(Boolean); // wikipedia/commons/a/ab/Name.jpg or …/thumb/a/ab/Name.jpg/800px-Name.jpg
   if(p[0]!=='wikipedia'||p[1]!=='commons')return null;
   const name=p[2]==='thumb'?p[5]:p[4];return name?normalizeFileTitle(decodeURIComponent(name)):null;
  }
 }catch{return null;}
 return null;
}
/** What OSM tags say about a free photo: {file} (explicit Commons file) or {qid} (Wikidata item, P18 resolved later), else null. */
export function photoRefFromTags(tags){
 if(!tags||typeof tags!=='object')return null;
 const wc=typeof tags.wikimedia_commons==='string'?tags.wikimedia_commons.split(';')[0]:'';
 const file=normalizeFileTitle(wc)||commonsFileFromUrl(tags.image);
 const qid=typeof tags.wikidata==='string'&&/^Q[1-9][0-9]{0,11}$/.test(tags.wikidata.trim())?tags.wikidata.trim():null;
 if(file)return{file,qid};
 return qid?{qid}:null;
}
/** First P18 file of a Wikidata entity (preferred rank first, never deprecated). */
export function p18FromEntity(entity){
 const claims=(entity?.claims?.P18??[]).filter(c=>c.rank!=='deprecated'&&c.mainsnak?.snaktype==='value'&&typeof c.mainsnak.datavalue?.value==='string');
 const pick=claims.find(c=>c.rank==='preferred')??claims[0];
 return pick?normalizeFileTitle(pick.mainsnak.datavalue.value):null;
}
/** HTML from extmetadata → plain text (entities decoded, tags and links dropped, ≤ max chars). */
export function plainText(html,max=160){
 if(typeof html!=='string')return null;
 const t=html.replace(/<br\s*\/?>/gi,', ').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
  .replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/\s+/g,' ').trim();
 return t?t.slice(0,max):null;
}
/** Free licences only: CC0, public domain, CC BY, CC BY-SA (any version). NC/ND, GFDL-only, fair use… → null. */
export function freeLicense(meta){
 const short=plainText(meta?.LicenseShortName?.value,80);if(!short)return null;
 const restrictions=plainText(meta?.Restrictions?.value,200);
 if(restrictions&&/\b(nonfree|trademarked|personality|insignia|fair use)\b/i.test(restrictions))return null;
 if(/\b(NC|ND|non-?commercial|no derivatives?|fair use|all rights reserved)\b/i.test(short))return null;
 let kind=null;
 if(/^CC0\b|^CC-?0\b|^Public domain\b|^PD\b|^No restrictions\b/i.test(short))kind='free-pd';
 else if(/^CC[ -]BY(?:[ -]SA)?[ -]\d(?:\.\d)?(?:[ -][A-Za-z]{2,5})?$/i.test(short))kind='free-cc';
 return kind?{short,kind}:null;
}
/** Attribution record from a Commons imageinfo entry (null when the licence is not free or a required author is missing). */
export function attributionFromImageInfo(title,info){
 const meta=info?.extmetadata;if(!meta)return null;
 const lic=freeLicense(meta);if(!lic)return null;
 const author=plainText(meta.Artist?.value,120),credit=plainText(meta.Credit?.value,160);
 if(lic.kind==='free-cc'&&!author&&!credit)return null; // CC BY needs a name to credit
 const licenseUrl=typeof meta.LicenseUrl?.value==='string'&&/^https:\/\//.test(meta.LicenseUrl.value)?meta.LicenseUrl.value.slice(0,300):null;
 const sourceUrl=typeof info.descriptionurl==='string'&&/^https:\/\/commons\.wikimedia\.org\//.test(info.descriptionurl)?info.descriptionurl:null;
 if(!sourceUrl)return null;
 return{source:'wikimedia-commons',file:title,author:author??credit,credit,license:lic.short,licenseUrl,sourceUrl};
}

// ── Network ────────────────────────────────────────────────────────────────────────────────────────────────
let last=0;
export async function politeFetch(url,{binary=false,retries=4}={}){
 for(let attempt=0;;attempt++){
  const wait=last+(binary?DOWNLOAD_INTERVAL_MS:MIN_INTERVAL_MS)-Date.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));last=Date.now();
  let res;try{res=await fetch(url,{headers:{'User-Agent':USER_AGENT,Accept:binary?'image/*':'application/json'},signal:AbortSignal.timeout(30000)});}catch(e){if(attempt>=retries)throw e;await new Promise(r=>setTimeout(r,1000*2**attempt));continue;}
  if(res.status===429||res.status>=500){
   if(attempt>=retries)throw new Error(`HTTP ${res.status} ${url}`);
   const ra=Number(res.headers.get('retry-after'));await new Promise(r=>setTimeout(r,(Number.isFinite(ra)&&ra>0?ra:2**attempt*2)*1000));continue;
  }
  if(!res.ok)throw new Error(`HTTP ${res.status} ${url}`);
  return binary?new Uint8Array(await res.arrayBuffer()):res.json();
 }
}
const chunks=(a,n)=>Array.from({length:Math.ceil(a.length/n)},(_,i)=>a.slice(i*n,i*n+n));
/** {Q…: 'File:…'} for the items that have a P18 image. */
export async function resolveWikidataImages(qids){
 const out=new Map();
 for(const part of chunks([...new Set(qids)],CHUNK)){
  const q=new URLSearchParams({action:'wbgetentities',ids:part.join('|'),props:'claims',format:'json'});
  const j=await politeFetch(`${WIKIDATA_API}?${q}`);
  for(const [id,e] of Object.entries(j.entities??{})){const f=p18FromEntity(e);if(f)out.set(id,f);}
 }
 return out;
}
/** Map file title → {info, attribution|null, reason} from the Commons API (extmetadata + 1600 px thumb URL). */
export async function resolveCommonsFiles(titles){
 const out=new Map();
 for(const part of chunks([...new Set(titles)],CHUNK)){
  const q=new URLSearchParams({action:'query',titles:part.join('|'),prop:'imageinfo',iiprop:'url|extmetadata|size|mime',iiurlwidth:'1600',format:'json',formatversion:'2',redirects:'1'});
  const j=await politeFetch(`${COMMONS_API}?${q}`);
  const back=new Map(); // normalized/redirected title → asked titles
  for(const n of j.query?.normalized??[])back.set(n.to,n.from);
  const asked=new Map(part.map(t=>[t,t]));
  const ask=t=>{let x=t;for(const r of j.query?.redirects??[])if(r.to===t)x=r.from;return back.get(x)??x;};
  for(const p of j.query?.pages??[]){
   const title=asked.has(ask(p.title))?ask(p.title):p.title,info=p.imageinfo?.[0];
   if(p.missing||!info){out.set(title,{reason:'missing'});continue;}
   if(!['image/jpeg','image/png','image/webp'].includes(info.mime)){out.set(title,{reason:'mime'});continue;}
   const attribution=attributionFromImageInfo(title,info);
   out.set(title,attribution?{info,attribution}:{reason:'license',license:plainText(info.extmetadata?.LicenseShortName?.value,60)});
  }
 }
 return out;
}

// ── Main ───────────────────────────────────────────────────────────────────────────────────────────────────
async function main(){
 const args=process.argv.slice(2),flag=n=>args.includes(n),val=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:null;};
 const apply=flag('--apply'),limit=Number(val('--limit')??0)||Infinity,only=val('--slug');
 const osmFile=val('--osm')??join(homedir(),'dl/osm-data/out-v2/osm-pois.json');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY??process.env.SERVICE_ROLE_KEY;
 if(!url||!key){console.error('Falta NEXT_PUBLIC_SUPABASE_URL / SERVICE_ROLE_KEY (source ~/bin/pro-local-env.sh).');process.exit(2);}
 const host=new URL(url).hostname;
 if(!['127.0.0.1','localhost'].includes(host)&&!flag('--remote-ok')){console.error(`Base de datos no local (${host}): use --remote-ok solo con autorización del dueño.`);process.exit(2);}
 const {createClient}=await import('@supabase/supabase-js');
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});

 // 1. OSM ref → place (accepted import rows), published places only.
 const refs=new Map();
 for(let from=0;;from+=1000){
  const r=await db.from('dir_import_rows').select('source_ref,place_id').eq('status','accepted').order('batch_id').order('row_no').range(from,from+999);
  if(r.error)throw r.error;for(const x of r.data)refs.set(x.source_ref,x.place_id);if(r.data.length<1000)break;
 }
 const places=new Map();
 for(const part of chunks([...new Set(refs.values())],200)){
  const r=await db.from('dir_places').select('id,slug,vertical_id,status').in('id',part).eq('status','published');
  if(r.error)throw r.error;for(const p of r.data)places.set(p.id,p);
 }
 // 2. OSM tags → candidates.
 const osm=JSON.parse(await readFile(osmFile,'utf8')).elements??[];
 let cands=[];
 for(const e of osm){
  const place=places.get(refs.get(`${e.type}/${e.id}`));if(!place||(only&&place.slug!==only))continue;
  const ref=photoRefFromTags(e.tags);if(ref)cands.push({place,ref});
 }
 const byV=(rows,f=x=>x.place.vertical_id)=>rows.reduce((m,x)=>(m[f(x)]=(m[f(x)]??0)+1,m),{});
 console.log(`Lugares importados publicados: ${places.size} · con etiquetas de foto libre: ${cands.length}`);
 console.log('  por sección:',JSON.stringify(byV(cands)));
 console.log(`  wikimedia_commons/image: ${cands.filter(c=>c.ref.file).length} · solo wikidata: ${cands.filter(c=>!c.ref.file).length}`);
 // 3. Already attached? (idempotent)
 const have=new Set();
 for(const part of chunks(cands.map(c=>c.place.id),200)){
  const r=await db.from('dir_place_media').select('place_id').eq('origin','commons').in('place_id',part);if(r.error)throw r.error;for(const x of r.data)have.add(x.place_id);
 }
 cands=cands.filter(c=>!have.has(c.place.id));
 console.log(`  ya con foto de Commons (se omiten): ${have.size} · por procesar: ${cands.length}`);
 cands=cands.slice(0,limit);
 // 4. Wikidata P18 → file titles.
 const wd=await resolveWikidataImages(cands.filter(c=>!c.ref.file&&c.ref.qid).map(c=>c.ref.qid));
 for(const c of cands){c.file=c.ref.file??wd.get(c.ref.qid)??null;if(!c.file&&c.ref.qid&&c.ref.file==null)c.skip='sin P18';}
 // 5. Commons metadata + licence filter.
 const meta=await resolveCommonsFiles(cands.filter(c=>c.file).map(c=>c.file));
 const stats={sinImagen:0,missing:0,mime:0,licencia:0,libres:0,aplicadas:0,fallidas:0},byLic={},freeBySection={},appliedBySection={},examples=[];
 const ready=[];
 for(const c of cands){
  if(!c.file){stats.sinImagen++;continue;}
  const m=meta.get(c.file);
  if(!m||m.reason==='missing'){stats.missing++;continue;}
  if(m.reason==='mime'){stats.mime++;continue;}
  if(m.reason==='license'){stats.licencia++;byLic[m.license??'?']=(byLic[m.license??'?']??0)+1;continue;}
  c.info=m.info;c.attribution=m.attribution;stats.libres++;ready.push(c);
  byLic[m.attribution.license]=(byLic[m.attribution.license]??0)+1;freeBySection[c.place.vertical_id]=(freeBySection[c.place.vertical_id]??0)+1;
 }
 console.log('Resolución:',JSON.stringify(stats));console.log('  licencias:',JSON.stringify(byLic));console.log('  libres por sección:',JSON.stringify(freeBySection));
 if(!apply){console.log('Dry run: no se descargó ni se escribió nada. Use --apply.');for(const c of ready.slice(0,5))console.log(` ${c.place.slug} ← ${c.file} · ${c.attribution.author??'-'} · ${c.attribution.license}`);return;}

 // 6. Download, process, store, record.
 const {processListingPhoto,derivedUuid,PHOTO_VARIANTS}=await import('../../src/lib/directory/photo-pipeline.ts');
 const {createSharpPhotoCodec}=await import('../../src/lib/directory/photo-codec-sharp.ts');
 const codec=await createSharpPhotoCodec(),bucket=db.storage.from('dir-place-photos'),base='https://contratacr.com/api/fotos-lugar/';
 for(const c of ready){
  const label=`${c.place.slug} ← ${c.file}`,created=[];
  try{
   const mediaId=await derivedUuid('dir-place-commons',c.place.id,c.file);
   const row=await db.from('dir_place_media').select('id').eq('id',mediaId).maybeSingle();if(row.error)throw row.error;if(row.data){console.log('  = ya existe',label);continue;}
   if(process.env.DEBUG_PHOTOS)console.log('  … descargando',label,c.info.thumburl||c.info.url);
   const bytes=await politeFetch(c.info.thumburl||c.info.url,{binary:true});
   const res=await processListingPhoto(bytes,{photoId:mediaId,codec});
   if(!res.ok){stats.fallidas++;console.log(`  ! ${label}: foto rechazada (${res.reason})`);continue;}
   const paths={};
   for(const size of PHOTO_VARIANTS){
    const v=res.photo.variants[size],path=v.path.replace(/^dir-listings\//,'dir-places/');
    const up=await bucket.upload(path,v.bytes,{contentType:v.contentType,upsert:false,cacheControl:'31536000'});
    if(up.error&&String(up.error.statusCode)!=='409')throw up.error;created.push(path);paths[size]=path;
   }
   const alt=`Foto de ${c.place.slug.replace(/-[0-9a-f]{6}$/,'').replace(/-/g,' ')} (Wikimedia Commons)`.slice(0,200);void alt;
   const ins=await db.from('dir_place_media').insert({id:mediaId,place_id:c.place.id,kind:'photo',url:base+mediaId,source_id:'osm',sort:5,status:'active',origin:'commons',
    sha256:res.photo.sha256,width:res.photo.width,height:res.photo.height,path_1600:paths[1600],path_800:paths[800],path_320:paths[320],photo_store:'supabase',attribution:c.attribution});
   if(ins.error){if(ins.error.code==='23505'){console.log('  = duplicado',label);continue;}throw ins.error;}
   stats.aplicadas++;appliedBySection[c.place.vertical_id]=(appliedBySection[c.place.vertical_id]??0)+1;if(examples.length<8)examples.push(c.place.slug);
   console.log('  + ',label,'·',c.attribution.license);
  }catch(e){
   stats.fallidas++;console.log(`  ! ${label}: ${e?.message??e}`);
   if(created.length)await bucket.remove(created).catch(()=>{});
  }
 }
 console.log('Aplicadas:',stats.aplicadas,'· fallidas:',stats.fallidas);console.log('  por sección:',JSON.stringify(appliedBySection));console.log('  ejemplos:',examples.map(s=>`/lugar/${s}`).join(' '));
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await main();
