#!/usr/bin/env node
// LOCAL PRO ONLY (2026-11-27, owner «aplica tus recomendaciones», research ~/dl/research/filtros-negocios.md). Fills the
// place attributes the section filters of migration 546 read, from the OSM extract the import already used plus the
// place name:
//   restaurant  attributes.cuisines  (OSM cuisine → Spanish slugs, CUISINE_MAP; coffee shops and juice bars dropped)
//               attributes.soda      (name has the word «soda»)
//   banking     attributes.brand     (canonical bank from OSM brand / operator / name, BANK_RULES)
//   fuel        attributes.brand     (FUEL_RULES; «Servicentro» and other generic words are never a brand)
//   grocery     attributes.chain     (GROCERY_RULES; the OSM operator «Walmart Centroamérica» runs Palí too: not used)
//   health      attributes.publicService (CCSS / EBAIS / operator:type public, same rule as stage-import.mjs)
//   education   attributes.publicService (operator MEP / Ministerio de Educación Pública only; UCR, UNA, INA are not MEP)
//   lodging     attributes.kind = cabins for places named «Cabina(s) …» that the import typed hotel/hostel/guest house/
//               vacation rental (OSM has no «cabinas» tag). Names that also say hotel/hostal/hostel/motel keep their kind,
//               motels and campings keep theirs.
// Only unclaimed places without an active manager and without staff/owner attribute edits are touched. New keys are
// filled only when EMPTY; the cabinas kind is the only overwrite. Every write goes through dir_place_mutate ('update':
// revision check, history, provenance 'osm' + ref, or 'contratacr' for team places without an OSM ref) with deterministic
// action ids, so a re-run changes nothing. Dry run by default (counts per filter value); --apply writes.
//   source ~/bin/pro-local-env.sh
//   node scripts/directory/osm-filter-attributes.mjs [--pois ~/dl/osm-data/out-v2/osm-pois.json] [--apply]
// Refuses any database host other than 127.0.0.1/localhost unless PRO_LOCAL_DB_OK is set (test/prod only with the owner's OK).
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const RULES='filters-v1';
const ACTOR='c0a7f0e5-0000-4000-8000-000000000536';// the system actor the importer already uses
export const fold=t=>String(t??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

/** OSM cuisine value → our slug (labels in src/lib/directory/section-filters.ts). Unmapped values are dropped. */
export const CUISINE_MAP={
 pizza:'pizza',italian_pizza:'pizza',chicken:'pollo',wings:'pollo',fried_chicken:'pollo',burger:'hamburguesas',
 regional:'comida-tipica',local:'comida-tipica',traditional:'comida-tipica',costa_rican:'comida-tipica',
 chinese:'china',seafood:'mariscos',fish:'mariscos',fish_and_chips:'mariscos',ceviche:'mariscos',sandwich:'sandwiches',
 italian:'italiana',pasta:'italiana',mexican:'mexicana','tex-mex':'mexicana',tex_mex:'mexicana',tacos:'mexicana',burrito:'mexicana',
 asian:'asiatica',thai:'asiatica',korean:'asiatica',vietnamese:'asiatica',japanese:'japonesa',sushi:'japonesa',ramen:'japonesa',
 steak_house:'carnes',barbecue:'carnes',grill:'carnes',bbq:'carnes',international:'internacional',american:'americana',diner:'americana',
 caribbean:'caribena',peruvian:'peruana',argentinian:'argentina',mediterranean:'mediterranea',greek:'mediterranea',french:'francesa',
 spanish:'espanola',fast_food:'comida-rapida',hot_dog:'comida-rapida',friture:'comida-rapida',breakfast:'desayunos',
 dessert:'postres',donut:'postres',ice_cream:'postres',cake:'postres',vegetarian:'vegetariana',vegan:'vegetariana',indian:'india',
 arab:'arabe',lebanese:'arabe',middle_eastern:'arabe',colombian:'colombiana',venezuelan:'venezolana',
};
export function cuisinesFromTag(v){
 if(typeof v!=='string')return [];
 const out=[];for(const x of v.split(/[;,]/)){const s=CUISINE_MAP[x.trim().toLowerCase().replace(/\s+/g,'_')];if(s&&!out.includes(s))out.push(s);}
 return out;
}
// [label, regex over folded text]. First rule that matches wins; the order matters (Maxi Palí before Palí).
export const BANK_RULES=[
 ['Banco Nacional',/\bbanco nacio|\bbncr\b|\bb n c r\b|\bbn\b/],['BCR',/\bbcr\b|\bb c r\b|banco de costa rica/],
 ['Banco Popular',/\bbanco popular\b|\bpopular\b/],['BAC',/\bbac\b|credomatic/],['Davivienda',/davivienda/],['Davibank',/davibank/],
 ['Scotiabank',/scotia/],['Promerica',/promerica/],['Grupo Mutual',/grupo mutual|mutual alajuela/],['Mucap',/\bmucap\b/],
 ['Coopealianza',/coopealianza/],['Coocique',/coocique/],['Coopenae',/coopenae/],['Coope Ande',/coope ?ande\b/],
 ['Coopeservidores',/coopeservidores/],['Coopemep',/coopemep/],['Banco Lafise',/lafise/],['Banco BCT',/\bbct\b/],
 ['Banco Cathay',/cathay/],['Banco Improsa',/improsa/],['Banco General',/banco general/],['Desyfin',/desyfin/],['ATH',/\bath\b/],
];
export const FUEL_RULES=[['Delta',/\bdelta\b/],['Uno',/\buno\b/],['JSM',/\bjsm\b/],['Enersol',/enersol/],['Total',/\btotal(energies)?\b/],
 ['Mobil',/\bmobil\b/],['Texaco',/texaco/],['Trova',/\btrova\b/],['Puma',/\bpuma\b/],['Gulf',/\bgulf\b/]];
export const GROCERY_RULES=[['Maxi Palí',/\bmaxi ?pali\b/],['Palí',/\bpali\b/],['Más x Menos',/\bmas ?x ?menos\b/],['Walmart',/\bwal ?mart\b/],
 ['Auto Mercado',/\bauto ?mercado\b/],['MegaSuper',/\bmega ?sup(er)?\b/],['Super Compro',/\bsuper ?compro\b/],['Perimercados',/\bperi\b|perimercado/],
 ['PriceSmart',/\bprice ?smart\b/],['Mayca',/\bmayca\b/],['Supermercados BM',/^(supermercados? |super )?bm\b/],['Fresh Market',/\bfresh market\b/],
 ['Pequeño Mundo',/pequeno mundo/]];
const match=(rules,...texts)=>{for(const t of texts){const f=fold(t);if(!f)continue;for(const [label,re] of rules)if(re.test(f))return label;}return null;};

const CABIN_NAME=/\bcabinas?\b/,CABIN_KEEP=/\b(hotel|hostal|hostel|motel)\b/,CABIN_FROM=new Set(['hotel','hostel','guest_house','vacation_rental']);
export const isPublicHealth=t=>t['operator:type']==='public'||t['operator:type']==='government'||/\b(ccss|caja costarricense|ebais)\b/i.test(`${t.operator??''} ${t.name??''}`);
export const isMep=t=>/^(mep|ministerio de educacion( publica)?)$/.test(fold(t.operator));

/** Pure: one place (+ its OSM tags or {}) → the attribute keys to set (empty object when nothing changes). */
export function filterPatch(place,tags={}){
 const a=place.attributes??{},name=place.name??'',out={};
 const fill=(k,v)=>{if(v!=null&&!(k in a))out[k]=v;};
 switch(place.vertical_id){
  case 'restaurant':{const c=cuisinesFromTag(tags.cuisine);if(c.length)fill('cuisines',c);if(/\bsoda\b/.test(fold(name)))fill('soda',true);break;}
  case 'banking':fill('brand',match(BANK_RULES,tags.brand,tags.operator,name));break;
  case 'fuel':fill('brand',match(FUEL_RULES,tags.brand,tags.operator,name));break;
  case 'grocery':fill('chain',match(GROCERY_RULES,tags.brand,name));break;
  case 'health':if(isPublicHealth({...tags,name}))fill('publicService',true);break;
  case 'education':if(isMep(tags))fill('publicService',true);break;
  case 'lodging':{const f=fold(name);if(CABIN_NAME.test(f)&&!CABIN_KEEP.test(f)&&CABIN_FROM.has(a.kind))out.kind='cabins';break;}
 }
 return out;
}

function psql(sql){
 const host=process.env.PGHOST||new URL(process.env.SUPABASE_DB_URL||'postgresql://x@localhost/x').hostname;
 if(!['127.0.0.1','localhost',''].includes(host)&&!process.env.PRO_LOCAL_DB_OK){console.error(`Rechazado: la base ${host} no es local. / Refused: not a local database.`);process.exit(2);}
 const r=spawnSync('psql',['-X','-At','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',maxBuffer:1<<28});
 if(r.status!==0){console.error(r.stderr);process.exit(1);}
 return r.stdout;
}
const uuidOf=s=>{const h=createHash('sha256').update(s).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
const VERTICALS=['restaurant','banking','fuel','grocery','health','education','lodging'];

async function main(){
 const args=process.argv.slice(2),apply=args.includes('--apply');
 const poisPath=args.includes('--pois')?args[args.indexOf('--pois')+1]:join(homedir(),'dl/osm-data/out-v2/osm-pois.json');
 const tagsByRef=new Map();
 for(const e of JSON.parse(readFileSync(poisPath,'utf8')).elements)if(e.tags)tagsByRef.set(`${e.type}/${e.id}`,e.tags);
 // Places that may change: published, unclaimed, no active manager, no staff/owner attribute edit. ref = OSM name provenance.
 const places=JSON.parse(psql(`select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'vertical_id',p.vertical_id,'attributes',p.attributes,'revision',p.revision,
  'ref',(select f.source_ref from dir_field_provenance f where f.place_id=p.id and f.source_id='osm' and f.field='name' order by f.id limit 1))),'[]')
  from dir_places p where p.status='published' and p.claim_status='unclaimed' and p.vertical_id in(${VERTICALS.map(v=>`'${v}'`).join(',')})
   and not exists(select 1 from dir_place_managers m where m.place_id=p.id and m.status='active')
   and not exists(select 1 from dir_field_provenance f where f.place_id=p.id and f.field='attributes' and f.source_id<>'osm');`));
 const todo=[],counts={};
 const bump=(k,v)=>{counts[k]??={};counts[k][v]=(counts[k][v]??0)+1;};
 for(const p of places){
  const patch=filterPatch(p,p.ref?tagsByRef.get(p.ref)??{}:{});
  if(!Object.keys(patch).length)continue;
  for(const [k,v] of Object.entries(patch))for(const x of Array.isArray(v)?v:[v])bump(`${p.vertical_id}.${k}`,String(x));
  todo.push({pid:p.id,revision:p.revision,ref:p.ref,attrs:{...p.attributes,...patch},aid:uuidOf(`${RULES}:${p.id}:${JSON.stringify(patch)}`)});
 }
 console.log(`Lugares revisados / checked: ${places.length} · por cambiar / to change: ${todo.length}`);
 for(const [k,o] of Object.entries(counts).sort())console.log(k.padEnd(28),Object.entries(o).sort((a,b)=>b[1]-a[1]).map(([v,n])=>`${v} ${n}`).join(' · '));
 if(!apply){console.log('Simulación: no se escribió nada. Use --apply. / Dry run: nothing written.');return;}
 const payload=JSON.stringify(todo);if(payload.includes('$j$'))throw new Error('payload');
 const out=psql(`begin; select count(dir_place_mutate('${ACTOR}'::uuid,jsonb_build_object('action','update','actionId',aid,'placeId',pid,'revision',revision,
  'place',jsonb_build_object('attributes',attrs),'source',case when ref is null then jsonb_build_object('id','contratacr') else jsonb_build_object('id','osm','ref',ref,'observedAt',now()) end)))
  from jsonb_to_recordset($j$${payload}$j$::jsonb) as x(pid uuid,revision integer,ref text,attrs jsonb,aid uuid); commit;`);
 console.log(`Aplicado / applied: ${out.trim().split('\n').filter(Boolean).slice(-2,-1)[0]??out.trim()} lugares`);
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await main();
