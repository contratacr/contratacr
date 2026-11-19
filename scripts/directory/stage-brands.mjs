#!/usr/bin/env node
// LOCAL PRO ONLY (brand pages, owner approval 2026-11-17). Offline: reads LOCAL OSM dumps (Overpass JSON or GeoJSON) and
// writes ONE SQL file that groups imported places into brands through the staff/import functions of
// directory-brands-local.sql: dir_brand_import (OSM brand + brand:wikidata by source reference, in parts of ≤ 5000 rows)
// and then dir_brand_match_names (normalized names in the brand's section). Places not imported are skipped by the
// database; staff assignments are never overwritten. Action ids derive from the actor + file hash + RULES, so re-running
// the same file with the same rules is idempotent. Only the brand name and its Wikidata id are read from the tags.
// Generic words used as a «brand» (isGenericName: «Servicentro», «Farmacia»…) are skipped; staff can hide any other
// non-chain in the queue.
// 2026-11-17 (owner approval, chains without OSM brand tags: Fischel, Sucre, La Bomba, Mega Súper…): nameBrandRows()
// groups the remaining places by NAME, only inside one section (vertical of classifyTags): accents/case/punctuation
// folded, generic section words («Farmacia», «Supermercado», «Súper»…) stripped at both ends, spaces ignored («AM PM» =
// «ampm», «Mega Super» = «MegaSúper»); a branch qualifier after the chain name is allowed («Farmacia Fischel Nicoya»).
// A key is a chain only when ≥ 2 places carry exactly that name, ≥ MIN_NAME_BRANCHES places share it in the section,
// and the key is distinctive (not a stopword, generic word, saint/person title, CR province or canton, ≥ 4 letters).
// A one-letter typo of a much larger chain joins it («Fishel» → «Fischel»). The OSM operator is a fallback key; when
// tagged branches of the same key exist their OSM brand names the group. Name rows go with via:'name' and
// the section, so the database assigns them with source 'name' (never over 'osm' or 'staff', never across sections,
// never to a hidden brand).
// Usage: node scripts/directory/stage-brands.mjs --actor <staff-uuid> --out <file.sql> [--dry-run] <dump.json> [...]
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {isGenericName,verticalFromTags} from './stage-import.mjs';

export const RULES='names-v3';
/** Minimum places of one section sharing a name key confirmed by the OSM brand/operator of ≥ 1 branch (OSM-tagged
 *  brands themselves need no minimum: the tag says «chain»). 5 keeps coincidences («Farmacia Central» ×3) apart. */
export const MIN_NAME_BRANCHES=5;
/** Without any OSM brand/operator confirmation: ≥ 10 places, and only in sections where chains are the norm (in
 *  restaurants, bars, lodging, health, beauty or workshops the same name is usually a coincidence: «Soda María»). */
export const MIN_NAME_ONLY_BRANCHES=10;
const NAME_ONLY_SECTIONS=new Set(['pharmacy','grocery','convenience','fuel','banking','hardware']);
const MIN_EXACT=2;

const refOf=e=>e.type&&e.id!=null?`${e.type}/${e.id}`:typeof e.properties?.['@id']==='string'?e.properties['@id']:null;
const clean=v=>typeof v==='string'?v.replace(/\s+/g,' ').trim().slice(0,120):'';
const fold=t=>String(t??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const validBrand=t=>{const b=clean(t?.brand);return b.length>=2&&!isGenericName(b)?b:null;};
/** OSM elements → [{ref, brand, wikidata?}] (one per reference; brand name 2..120 chars; Wikidata Q-id only). */
export function brandRows(elements){
 const out=new Map();
 for(const e of elements){
  const t=e.tags??e.properties??{},ref=refOf(e),brand=validBrand(t),wd=/^Q\d{1,12}$/.test(String(t['brand:wikidata']??''))?t['brand:wikidata']:undefined;
  // Generic words used as «brand» (e.g. «Servicentro», «Farmacia») are not chains.
  if(!ref||out.has(ref)||!brand)continue;
  out.set(ref,{ref,brand,...(wd?{wikidata:wd}:{})});
 }
 return [...out.values()].sort((a,b)=>a.ref.localeCompare(b.ref));
}

// ---------------------------------------------------------------- name keys
/** Section words stripped at the start or end of a name («Farmacia Fischel», «Don Gerardo Farmacia»). «Súper» alone is
 *  NOT one: it is part of many chain names and stripping it leaves a product word («Súper Baterías» → «baterías»). */
const GENERIC_PHRASES=['mini super','super mercado','estacion de servicio'].map(p=>p.split(' '));
const GENERIC_TOKENS=new Set(['farmacia','farmacias','pharmacy','drogueria','droguerias','botica','supermercado','supermercados','supermarket',
 'minisuper','minisupers','abastecedor','abastecedora','pulperia','tienda','gasolinera','servicentro','bomba','autoservicio',
 'restaurante','restaurant','soda','cafeteria','cafe','panaderia','ferreteria','deposito','banco','bank','hotel','clinica','optica','opticas',
 'veterinaria','gimnasio','gym','taller','salon','barberia','sucursal','licorera','macrobiotica','minimarket','laboratorio','laboratorios']);
/** Only these are also stripped at the END («Don Gerardo Farmacia»); «Mega Súper», «Fresh Market» keep their last word. */
const GENERIC_END=new Set(['farmacia','farmacias','pharmacy','drogueria','supermercado','supermercados','minisuper','sucursal']);
/** Legal/company words of an OSM operator («MegaSuper S.A», «Inversiones AM PM»). */
const LEGAL_TOKENS=new Set(['s','a','sa','srl','ltda','limitada','inversiones','corporacion','corp','compania','cia','inc','grupo']);
const JOINERS=new Set(['de','del','y','e','and','of']);
const STOPWORDS=new Set(['el','la','los','las','de','del','y','e','en','the','of','and','mi','tu','su','un','una']);
/** First words that make a key a saint/person name, never a chain by name alone. */
const DENY_FIRST=new Set(['san','santa','santo','sta','don','dona','dr','dra','doctor','doctora','lic','licda','nuestra','senora']);
/** Words or phrases too common to identify a chain on their own. */
const DENY_KEYS=new Set(['central','popular','nacional','express','plaza','centro','la paz','el pueblo','pueblo','americana','internacional',
 'familiar','la familia','economica','la economia','universal','moderna','nueva','nuevo','principal','municipal','comunal','popular',
 'el ahorro','ahorro','buen precio','la esquina','esquina','la amistad','amistad','total','plus','mas','express','24 horas','el centro',
 'la central','costa rica','tica','ticas','tico','la tica','el valle','la union','el carmen','el alto','la sabana','los angeles','el cruce',
 'delicias','las delicias','servicio','canton','economico','feria','feria del agricultor','mini market','la esperanza','la estrella','la plaza']);
/** CR provinces and cantons (OSM admin_level 4/6, folded): a place name, not a chain. */
const TOPONYMS=new Set(('abangares,acosta,alajuela,alajuelita,alvarado,aserri,atenas,bagaces,barva,belen,buenos aires,canas,carrillo,cartago,'
 +'corredores,coto brus,curridabat,desamparados,dota,el guarco,escazu,esparza,flores,garabito,goicoechea,golfito,grecia,guacimo,guanacaste,'
 +'guatuso,heredia,hojancha,jimenez,la cruz,la union,leon cortes castro,leon cortes,liberia,limon,los chiles,matina,montes de oca,montes de oro,'
 +'monteverde,mora,moravia,nandayure,naranjo,nicoya,oreamuno,orotina,osa,palmares,paraiso,parrita,perez zeledon,poas,pococi,puerto jimenez,'
 +'puntarenas,puriscal,quepos,rio cuarto,san carlos,san isidro,san jose,san mateo,san pablo,san rafael,san ramon,santa ana,santa barbara,'
 +'santa cruz,santo domingo,sarapiqui,sarchi,siquirres,talamanca,tarrazu,tibas,tilaran,turrialba,turrubares,upala,vazquez de coronado,'
 +'coronado,zarcero,guapiles,jaco,tamarindo,zapote,pavas,rohrmoser,lindora,guadalupe,tres rios,sabanilla,san pedro').split(','));

const compact=tokens=>tokens.join('');
function stripPhrase(tokens,atEnd){
 for(const p of GENERIC_PHRASES){
  const seg=atEnd?tokens.slice(-p.length):tokens.slice(0,p.length);
  if(tokens.length>p.length&&seg.join(' ')===p.join(' '))return atEnd?tokens.slice(0,-p.length):tokens.slice(p.length);
 }
 return null;
}
/** Folded name → tokens without the section words at both ends («Farmacias Fischel» → [fischel]). A section word
 *  followed by «de/del/y» is part of the name and stays («Banco de Costa Rica», «Mini Súper y Licorera …»). */
export function coreTokens(name,extra=null){
 let t=fold(name).split(' ').filter(Boolean),changed=true;
 const keep=rest=>rest.length>0&&!JOINERS.has(rest[0]);
 while(changed&&t.length>1){
  changed=false;const s=stripPhrase(t,false)??stripPhrase(t,true);if(s&&keep(s)){t=s;changed=true;continue;}
  if((GENERIC_TOKENS.has(t[0])||extra?.has(t[0]))&&keep(t.slice(1))){t=t.slice(1);changed=true;}
  else if(GENERIC_END.has(t.at(-1))||extra?.has(t.at(-1))){t=t.slice(0,-1);changed=true;}
 }
 return t;
}
/** A key can name a chain on its own (see header). */
export function distinctiveKey(tokens){
 if(!tokens.length)return false;
 const phrase=tokens.join(' '),key=compact(tokens);
 if(DENY_FIRST.has(tokens[0])||DENY_KEYS.has(phrase)||TOPONYMS.has(phrase)||isGenericName(phrase)||GENERIC_TOKENS.has(key))return false;
 if(tokens.every(w=>STOPWORDS.has(w)||/^\d+$/.test(w))||(GENERIC_TOKENS.has(tokens[0])&&tokens.length===1))return false;
 // «Súper/Mega/Mini» + a generic word («Súper Servicio», «Super Salón», «Súper Económico») is a description, not a chain.
 const rest=tokens.slice(1).join(' ');
 if(['super','mega','mini'].includes(tokens[0])&&rest&&rest!=='super'&&(DENY_KEYS.has(rest)||GENERIC_TOKENS.has(rest)||isGenericName(rest)))return false;
 // «La Paz», «El Pueblo»: article + one common word is checked by DENY_KEYS; one-word keys need ≥ 4 letters.
 return /[a-z]/.test(key)&&key.replace(/[^a-z]/g,'').length>=4;
}
const oneEdit=(a,b)=>{
 if(a===b||Math.abs(a.length-b.length)>1)return a===b;
 let i=0,j=0,d=0;
 while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++d>1)return false;if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++;}}
 return d+(a.length-i)+(b.length-j)<=1;
};
const top=counts=>[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0];
const bump=(m,k,v=1)=>m.set(k,(m.get(k)??0)+v);

/** OSM elements → [{ref, brand, via:'name', vertical}] for places WITHOUT a usable OSM brand tag whose name
 *  (or operator) matches a chain key of their section. Returns {rows, groups:[{vertical,key,brand,branches}]}. */
export function nameBrandRows(elements,{min=MIN_NAME_BRANCHES,minNameOnly=MIN_NAME_ONLY_BRANCHES}={}){
 const items=[],seen=new Set();
 for(const e of elements){
  const t=e.tags??e.properties??{},ref=refOf(e),name=clean(t.name);
  if(!ref||seen.has(ref)||!name||isGenericName(name))continue;
  const vertical=verticalFromTags(t);if(!vertical)continue;
  seen.add(ref);
  const core=coreTokens(name),opCore=t.operator?coreTokens(t.operator,LEGAL_TOKENS):[];
  const tagBrand=validBrand(t);
  items.push({ref,vertical,name,core,opCore,tagBrand,tagKey:tagBrand?compact(coreTokens(tagBrand)):null});
 }
 // 1. Candidate keys per section: exact names (after stripping) seen at least MIN_EXACT times, distinctive.
 const exact=new Map();// vertical -> key -> {n, tokens}
 for(const it of items){
  const key=compact(it.core);if(!key)continue;
  const m=exact.get(it.vertical)??new Map();exact.set(it.vertical,m);
  const x=m.get(key)??{n:0,tokens:it.core};x.n++;m.set(key,x);
 }
 const cand=new Map();// vertical -> Map(key -> tokens)
 for(const [v,m] of exact){const c=new Map();for(const [k,x] of m)if(x.n>=MIN_EXACT&&distinctiveKey(x.tokens))c.set(k,x.tokens);cand.set(v,c);}
 // 2. Assign each place to the LONGEST candidate key that is a token prefix of its name (then of its operator).
 const keyOf=it=>{
  const c=cand.get(it.vertical);if(!c?.size)return null;
  for(const toks of [it.core,it.opCore]){for(let j=toks.length;j>=1;j--){const k=compact(toks.slice(0,j));if(c.has(k))return k;}}
  return null;
 };
 const groups=new Map();// vertical|key -> items
 for(const it of items){const k=keyOf(it);if(!k)continue;const g=`${it.vertical}|${k}`;(groups.get(g)??groups.set(g,[]).get(g)).push(it);}
 // 3. A one-letter typo of a ≥ 3× larger key of the same section joins it (keys of ≥ 6 letters only).
 const sized=[...groups.entries()].sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]));
 for(const [g,list] of sized){
  if(!groups.has(g))continue;const [v,k]=g.split('|');if(k.length<6)continue;
  for(const [g2,list2] of sized){
   const [v2,k2]=g2.split('|');
   if(g2!==g&&v2===v&&groups.has(g2)&&k2.length>=6&&list2.length*3<=list.length&&oneEdit(k,k2)){list.push(...list2);groups.delete(g2);}
  }
 }
 // 4. Evidence: a key confirmed by the OSM brand/operator of at least one branch needs `min` places; a key known only
 //    by name needs `minNameOnly` places and a chain-prone retail section. One key → one section (the largest).
 const corroborated=(list,key)=>list.some(it=>it.tagKey===key||compact(it.opCore)===key);
 const best=new Map();
 for(const [g,list] of groups){
  const [v,k]=g.split('|');
  if(list.length<min||(!corroborated(list,k)&&(list.length<minNameOnly||!NAME_ONLY_SECTIONS.has(v))))continue;
  const cur=best.get(k);if(!cur||list.length>cur.list.length||(list.length===cur.list.length&&g<cur.g))best.set(k,{g,list});
 }
 const rows=[],out=[];
 for(const [key,{g,list}] of [...best.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
  const vertical=g.split('|')[0];
  // Name: the OSM brand of tagged branches with the same key; else the OSM brand of at least half of the group (so the
  // rows join that brand: «Banco de Costa Rica» branches → «BCR»); else the most common exact name.
  const names=new Map(),tags=new Map();
  for(const it of list)if(it.tagBrand){bump(tags,it.tagBrand);if(it.tagKey===key)bump(names,it.tagBrand);}
  if(!names.size){const t=top(tags);if(t&&tags.get(t)*2>=list.length)names.set(t,1);}
  if(!names.size)for(const it of list)if(compact(it.core)===key)bump(names,it.name);
  // Name rows carry no Wikidata id: name evidence never asserts an identity (OSM tags sometimes put another chain's
  // id on a brand, e.g. «Maxi Palí» with Bodega Aurrera's); the database joins the brand by its normalized name.
  const brand=top(names);
  if(!brand||isGenericName(brand))continue;
  let n=0;
  for(const it of list){if(it.tagBrand)continue;rows.push({ref:it.ref,brand,via:'name',vertical});n++;}
  out.push({vertical,key,brand,branches:list.length,nameRows:n,corroborated:corroborated(list,key)});
 }
 return {rows:rows.sort((a,b)=>a.ref.localeCompare(b.ref)),groups:out};
}

const lit=v=>"'"+String(v).replace(/'/g,"''")+"'";
export function brandSql(rows,actor,seed){
 if(!/^[0-9a-f-]{36}$/i.test(actor))throw new Error('--actor must be a uuid');
 const parts=[];for(let i=0;i<rows.length;i+=5000)parts.push(rows.slice(i,i+5000));
 const call=(fn,label,input)=>`select public.${fn}(${lit(actor)}::uuid,jsonb_build_object('actionId',public.dir_derived_uuid(${lit(actor)}::uuid,${lit(label)}))||${lit(JSON.stringify(input))}::jsonb);`;
 return ['-- Generated by scripts/directory/stage-brands.mjs (brand pages 2026-11-17). Idempotent.','begin;',
  ...parts.map((p,i)=>call('dir_brand_import',`brands:${seed}:${i}`,{sourceId:'osm',rows:p})),
  call('dir_brand_match_names',`brands-names:${seed}`,{}),'commit;',''].join('\n');
}
async function main(argv){
 const args=[...argv],files=[];let actor=null,out=null,dry=false;
 while(args.length){const a=args.shift();if(a==='--actor')actor=args.shift();else if(a==='--out')out=args.shift();else if(a==='--dry-run')dry=true;else files.push(a);}
 if(!actor||(!out&&!dry)||!files.length){console.error('Usage: stage-brands.mjs --actor <uuid> --out <file.sql> [--dry-run] <dump.json>...');process.exit(2);}
 const elements=[],hash=createHash('sha256');hash.update(RULES);
 for(const f of files){const text=await readFile(f,'utf8');hash.update(text);const d=JSON.parse(text);elements.push(...(d.elements??d.features??[]));}
 const rows=brandRows(elements),named=nameBrandRows(elements);
 // OSM-tagged rows first (they create the tagged brands), then name rows (they join them or create name brands).
 const all=[...rows,...named.rows];
 if(out&&!dry)await writeFile(out,brandSql(all,actor,hash.digest('hex').slice(0,16)));
 const brands=new Map();for(const r of rows){const k=r.wikidata??r.brand.toLowerCase();brands.set(k,(brands.get(k)??0)+1);}
 console.log(JSON.stringify({files:files.length,elements:elements.length,rows:rows.length,brands:brands.size,nameRows:named.rows.length,nameGroups:named.groups,dryRun:dry}));
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await main(process.argv.slice(2));
