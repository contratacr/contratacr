#!/usr/bin/env node
// LOCAL PRO ONLY (multivertical F2). Offline: reads ONE local file and prints dir_import_stage payloads.
// Usage: node scripts/directory/stage-import.mjs <local-file> <source-id> [--no-phone] [--out <dir>] [--admin-areas <boundaries.json>]
//        [--only <vertical,...>] [--fuel-points <fuel.json>] [--review-out <file.json>]
// 2026-11-17 (owner approval, eleven new place sections): classifyTags() maps OSM tags to ONE vertical + its `kind`
// subtype (first rule wins, see PRIORITY below), with exclusions (pharmacies never in health, locksmiths, outdoor
// fitness stations, strip clubs/nightclubs and other adult venues, supermarkets never as corner stores, corner stores
// of fuel stations: fuel brand or ≤ 65 m from a fuel station of --fuel-points). Health and vet places whose name is
// clearly a person («Dr. Juan Pérez») are NOT imported; names that start with Dr./Dra./Lic. but also name an
// establishment are imported and listed for staff review (--review-out). Rows of the same vertical with the same
// normalized name within 50 m (node + building of one business, bank + its ATM) keep one row (dedupeNearby).
// --only restricts the payload to some verticals (e.g. stage only the new sections from a dump that also has
// restaurants). Rows carry `attributes` ({kind, …}) only with keys of dir_verticals.attribute_keys; the database
// checks them again (dir_attributes_ok).
// --admin-areas: LOCAL Overpass JSON of OSM administrative relations (`out geom`, admin_level 4 = provincia,
// 6 = cantón in CR). When a feature has no addr:province/addr:county, they are derived by point-in-polygon from those
// same OSM boundaries (still OSM data, same ODbL source and reference). Generic names that only repeat the category
// («Restaurante», «Farmacia», «Gasolinera»…) are skipped like unnamed features.
// Accepts OSM-style GeoJSON (FeatureCollection of Point/Polygon features with OSM tags in `properties`) or
// Overpass JSON ({elements:[{type,id,lat,lon|center,tags}]}). Keeps ONLY: name, vertical, address, coordinates and
// the business phone (dropped with --no-phone or when the source license does not allow it; the database checks
// dir_data_sources.allows_phone again). Raw tags, opening hours, e-mails and people's names are never copied.
// No network access, no database connection: apply the payload with the dir_import_stage RPC (service role).
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {basename,join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const PART_SIZE=5000;
const cut=(value,max)=>{const text=typeof value==='string'?value.replace(/\s+/g,' ').trim():'';return text?text.slice(0,max):undefined;};

const fold=t=>String(t??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const inList=(v,list)=>typeof v==='string'&&list.includes(v);
/** Adult venues are never listed (strip clubs, nightclubs: OSM cannot tell a disco from an adult venue, brothels, adult=yes). */
export const isAdultVenue=t=>inList(t.amenity,['stripclub','nightclub','brothel','swingerclub','love_hotel'])||t.adult==='yes'||inList(t.shop,['erotic','sex'])||t.tourism==='love_hotel';
// Salud cleanup (owner request 2026-11-17): «health» lists health ESTABLISHMENTS only. Never imported: OSM
// healthcare=alternative (unregulated alternative therapies; psychoactive «plant medicine» retreats such as ayahuasca
// ceremonies) and names that read as a retreat or ceremony. Applied to the existing seed by health-cleanup.mjs through
// the normal staff path (dir_place_mutate: status hidden / attributes update, with history).
const HEALTH_EXCLUDED_NAME=/\b(ayahuasca|kambo|temazcal|cham[aá]n|shaman|retiro|retreat|medicina alternativa|plant medicine|psicod[eé]lic|psychedelic|bufo)/i;
export const isExcludedHealth=t=>t.healthcare==='alternative'||HEALTH_EXCLUDED_NAME.test(String(t.name??''));
/** Health rows fixed by OSM reference after manual review (kept, subtype corrected). */
export const HEALTH_RECLASS=Object.freeze({
 // Banco Nacional de Sangre (CCSS): a real public health entity, tagged amenity=hospital in OSM → blood bank, public service.
 'way/395163574':Object.freeze({kind:'blood_bank',publicService:true}),
});
/** Health rows excluded by OSM reference after manual review (reason). Individual practitioners: establishments only. */
export const HEALTH_EXCLUDED_REFS=Object.freeze({'node/7285706099':'person'});
// Fuel-station shop brands (the corner store of a station belongs to the station page, not to «pulperías»).
const FUEL_SHOP_NAMES=new Set(['delta','tienda delta','delta tienda','uno','total','red total','totalenergies','mobil','mobil mart','texaco','puma','gulf','shell','enersol','castrol']);
export const isFuelShopName=(name,brand)=>[name,brand].some(v=>{const f=fold(v);return !!f&&(FUEL_SHOP_NAMES.has(f)||/^(servicentro|gasolinera|estacion de servicio)\b/.test(f));});
const CORNER_NAME=/\b(pulper|abastecedor|mini ?-?s[uú]per)/i;
const LODGING={hotel:'hotel',hostel:'hostel',guest_house:'guest_house',chalet:'cabins',apartment:'apartment',motel:'motel',camp_site:'camping',caravan_site:'camping'};
const HEALTH_AMENITY={clinic:'clinic',doctors:'doctors',dentist:'dentist',hospital:'hospital'};
const HEALTHCARE={laboratory:'laboratory',physiotherapist:'physiotherapy',psychotherapist:'psychology',counselling:'psychology',optometrist:'optician',
 rehabilitation:'physiotherapy',podiatrist:'other',alternative:'other',doctor:'doctors',dentist:'dentist',clinic:'clinic',hospital:'hospital',audiologist:'other',speech_therapist:'other',nutrition_counselling:'other'};
const AUTO={car_repair:'repair',motorcycle_repair:'motorcycle_repair',tyres:'tyres',car_parts:'parts',motorcycle_parts:'parts'};
const BEAUTY={hairdresser:'hairdresser',barber:'barber',beauty:'beauty',nail_salon:'nails',massage:'massage',tattoo:'tattoo'};
const FIT_SPORTS=/\b(fitness|yoga|crossfit|pilates|martial_arts|karate|taekwondo|judo|jiu_jitsu|boxing|kickboxing|dance|aerobics|weightlifting|gymnastics|bodybuilding|muay_thai|mma)\b/;
const FIT_NAME=/\b(gym|gimnasio|fitness|crossfit|yoga|pilates|dojo|box|muay|karate|taekwondo|jiu|academia de baile|dance|zumba)\b/i;
const TOURS={attraction:'attraction',museum:'museum',zoo:'zoo',theme_park:'theme_park',aquarium:'aquarium',gallery:'gallery'};
const CAFE={cafe:'cafe',bar:'bar',pub:'pub',biergarten:'bar',ice_cream:'ice_cream'};
const CAFE_SHOP={bakery:'bakery',pastry:'bakery',confectionery:'bakery',coffee:'coffee_shop',ice_cream:'ice_cream'};
const fitKind=t=>{const sp=String(t.sport??'');
 return /yoga/.test(sp)?'yoga':/crossfit/.test(sp)?'crossfit':/pilates/.test(sp)?'pilates':/dance/.test(sp)||t.leisure==='dance'||t.amenity==='dancing_school'?'dance'
  :/martial|karate|taekwondo|judo|jiu|boxing|muay|mma/.test(sp)||t.amenity==='dojo'?'martial_arts':t.leisure==='sports_centre'&&!/fitness/.test(sp)?'sports_centre':'gym';};

/**
 * OSM tags → {vertical, attributes} or null (skipped). PRIORITY (first match wins, one place = one vertical):
 * adult venue (skip) → pharmacy → fuel → lodging (a hotel with a restaurant stays lodging) → restaurant (restaurant/
 * fast food, also with bar or bakery tags) → cafe_bar (café, bar, pub, ice cream, bakery/pastry/coffee shop) → grocery
 * (supermarket, greengrocer, wholesale) → convenience (convenience/general/kiosk, or a pulpería/abastecedor/minisúper
 * name on a generic shop) → vehicle_dealer → auto_services → health → vet_pets → beauty → fitness → hardware → tours →
 * banking → real_estate. Exclusions: locksmiths, fitness stations, cosmetics/supply shops, viewpoints, blood donation,
 * alternative-therapy / retreat «health» entries (isExcludedHealth, 2026-11-17).
 */
export function classifyTags(tags={}){
 const t=tags,amenity=t.amenity,shop=t.shop,tourism=t.tourism,leisure=t.leisure,hc=t.healthcare;
 if(isAdultVenue(t))return null;
 if(amenity==='pharmacy'||hc==='pharmacy')return {vertical:'pharmacy'};
 if(amenity==='fuel')return {vertical:'fuel'};
 if(LODGING[tourism])return {vertical:'lodging',attributes:{kind:LODGING[tourism],...(t.swimming_pool==='yes'?{pool:true}:{}),...(['wlan','yes','free'].includes(t.internet_access)?{wifi:true}:{})}};
 if(['restaurant','fast_food','food_court'].includes(amenity))return {vertical:'restaurant'};
 if(CAFE[amenity])return {vertical:'cafe_bar',attributes:{kind:CAFE[amenity]}};
 if(CAFE_SHOP[shop])return {vertical:'cafe_bar',attributes:{kind:CAFE_SHOP[shop]}};
 if(['supermarket','greengrocer','wholesale'].includes(shop))return {vertical:'grocery'};
 if(['convenience','general','kiosk'].includes(shop)||(inList(shop,['yes','variety_store','grocery','food'])&&CORNER_NAME.test(t.name??''))){
  const kind=shop==='kiosk'?'kiosk':/mini ?-?s[uú]per/i.test(t.name??'')?'minisuper':'pulperia';
  return {vertical:'convenience',attributes:{kind}};
 }
 if(['car','motorcycle'].includes(shop))return {vertical:'vehicle_dealer'};
 if(AUTO[shop])return {vertical:'auto_services',attributes:{kind:AUTO[shop]}};
 if(amenity==='car_wash')return {vertical:'auto_services',attributes:{kind:'car_wash'}};
 if(amenity==='vehicle_inspection')return {vertical:'auto_services',attributes:{kind:'inspection'}};
 if(HEALTH_AMENITY[amenity]||HEALTHCARE[hc]||shop==='optician'){
  if(isExcludedHealth(t))return null;
  const kind=shop==='optician'?'optician':HEALTHCARE[hc]&&!['clinic','doctor','hospital','dentist'].includes(hc)?HEALTHCARE[hc]:HEALTH_AMENITY[amenity]??HEALTHCARE[hc];
  const pub=t['operator:type']==='public'||t['operator:type']==='government'||/\b(ccss|caja costarricense|ebais)\b/i.test(`${t.operator??''} ${t.name??''}`);
  return {vertical:'health',attributes:{kind,...(pub?{publicService:true}:{}),...(t.emergency==='yes'?{emergency:true}:{})}};
 }
 if(amenity==='veterinary')return {vertical:'vet_pets',attributes:{kind:'veterinary'}};
 if(shop==='pet')return {vertical:'vet_pets',attributes:{kind:'pet_shop'}};
 if(shop==='pet_grooming')return {vertical:'vet_pets',attributes:{kind:'grooming'}};
 if(amenity==='animal_boarding')return {vertical:'vet_pets',attributes:{kind:'boarding'}};
 if(BEAUTY[shop])return {vertical:'beauty',attributes:{kind:BEAUTY[shop]}};
 if(amenity==='spa'||leisure==='spa'||tourism==='spa_resort')return {vertical:'beauty',attributes:{kind:'spa'}};
 if(leisure==='fitness_centre'||leisure==='dance'||amenity==='dojo'||amenity==='dancing_school'
  ||(leisure==='sports_centre'&&(FIT_SPORTS.test(String(t.sport??''))||FIT_NAME.test(t.name??''))))return {vertical:'fitness',attributes:{kind:fitKind(t)}};
 if(shop==='hardware')return {vertical:'hardware',attributes:{kind:'hardware'}};
 if(shop==='paint')return {vertical:'hardware',attributes:{kind:'paint'}};
 if(shop==='doityourself')return {vertical:'hardware',attributes:{kind:'diy'}};
 if(shop==='building_materials')return {vertical:'hardware',attributes:{kind:'building_materials'}};
 if(shop==='electrical')return {vertical:'hardware',attributes:{kind:'electrical'}};
 if(shop==='bathroom_furnishing')return {vertical:'hardware',attributes:{kind:'bathroom'}};
 if(shop==='trade')return {vertical:'hardware',attributes:{kind:'trade'}};
 if(TOURS[tourism])return {vertical:'tours',attributes:{kind:TOURS[tourism]}};
 if(leisure==='water_park')return {vertical:'tours',attributes:{kind:'water_park'}};
 if(shop==='travel_agency'||t.office==='travel_agent')return {vertical:'tours',attributes:{kind:'travel_agency'}};
 if(t.office==='tour_operator'||t.office==='guide')return {vertical:'tours',attributes:{kind:'tour_operator'}};
 if(amenity==='bank')return {vertical:'banking',attributes:{kind:'bank',...(t.atm==='yes'?{atm:true}:{}),...(cut(t.operator,80)?{operator:cut(t.operator,80)}:{})}};
 if(amenity==='atm')return {vertical:'banking',attributes:{kind:'atm',...(cut(t.operator,80)?{operator:cut(t.operator,80)}:{})}};
 if(amenity==='bureau_de_change')return {vertical:'banking',attributes:{kind:'exchange'}};
 if(t.office==='estate_agent')return {vertical:'real_estate'};
 return null;
}
/** OSM tags → vertical id (dir_verticals). Unknown or excluded tags return null and the feature is skipped. */
export const verticalFromTags=(tags={})=>classifyTags(tags)?.vertical??null;

/** Health/vet names that start with a person title. 'person' = only a person's name (never imported);
 *  'review' = title + an establishment word (imported, listed for staff review). null otherwise. */
const PERSON_TITLE=/^(dr|dra|doctor|doctora|lic|licda|licenciado|licenciada|msc|mba)\.?\s/i;
const ESTABLISHMENT=/\b(cl[ií]nica|consultorio|centro|laboratorio|dental|odontol|[oó]ptica|hospital|veterinari|vet|cl[ií]nic|medical|m[eé]dic[oa]s|asociados|s\.?a\.?|grupo|especialidades|salud|fisioterapia|terapia|pet)\b/i;
export function personNameCheck(name){if(!PERSON_TITLE.test(name??''))return null;return ESTABLISHMENT.test(name)?'review':'person';}
/** Names that only repeat the category: not a business name, treated as unnamed. */
export const GENERIC_NAMES=new Set(['restaurante','restaurant','soda','cafe','cafeteria','coffee shop','comida rapida','fast food','food','farmacia','pharmacy','drogueria','botica',
 'supermercado','supermarket','super','minisuper','mini super','abastecedor','pulperia','gasolinera','bomba','estacion de servicio','gas station','fuel','servicentro','tienda','bar',
 // 2026-11-17 sections
 'hotel','hoteles','hostal','hostel','hospedaje','cabinas','cabina','motel','apartamentos','apartments','camping','camp site','guest house','posada','lodge',
 'ferreteria','hardware','hardware store','deposito','materiales','pinturas','paint',
 'clinica','clinic','consultorio','consultorio medico','consultorio dental','clinica dental','dentista','dentist','odontologia','ebais','hospital','laboratorio','laboratorio clinico','optica','optician','medico','doctor','fisioterapia',
 'veterinaria','veterinary','vet','clinica veterinaria','pet shop','tienda de mascotas','mascotas',
 'taller','taller mecanico','mecanico','car repair','lavacar','lava car','car wash','autolavado','llantera','tyres','repuestos','car parts','revision tecnica',
 'salon','salon de belleza','beauty salon','barberia','barber','barber shop','peluqueria','estetica','spa','unas','nails','masajes','massage','tattoo','tatuajes',
 'gimnasio','gym','fitness','yoga','crossfit','dojo','cancha','polideportivo',
 'panaderia','bakery','reposteria','pasteleria','heladeria','ice cream','cantina','pub','licorera','kiosko','kiosco','kiosk','pulperia y bazar',
 'museo','museum','atraccion','attraction','mirador','tour','tours','agencia de viajes','travel agency',
 'banco','bank','cajero','cajero automatico','cajeros','atm','casa de cambio']);
export const isGenericName=name=>!/[\p{L}]/u.test(name??'')||GENERIC_NAMES.has(fold(name));
const phoneOf=tags=>{const raw=cut(tags.phone??tags['contact:phone'],40);if(!raw)return undefined;const first=raw.split(/[;,]/)[0].trim();return /^\+?[0-9][0-9 ()-]{6,22}$/.test(first)?first:undefined;};
function centroid(geometry){
 if(!geometry)return null;
 if(geometry.type==='Point')return {lng:geometry.coordinates?.[0],lat:geometry.coordinates?.[1],precision:'exact'};
 const ring=geometry.type==='Polygon'?geometry.coordinates?.[0]:geometry.type==='MultiPolygon'?geometry.coordinates?.[0]?.[0]:null;
 if(!Array.isArray(ring)||!ring.length)return null;
 const pts=ring.filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]));if(!pts.length)return null;
 return {lng:pts.reduce((s,p)=>s+p[0],0)/pts.length,lat:pts.reduce((s,p)=>s+p[1],0)/pts.length,precision:'street'};
}
function row(ref,tags,point,allowPhone,opts={}){
 const cls=classifyTags(tags),vertical=cls?.vertical;if(!vertical||!ref)return null;
 if(opts.only&&!opts.only.has(vertical))return null;
 const street=[cut(tags['addr:street'],200),cut(tags['addr:housenumber'],20)].filter(Boolean).join(' ');
 let name=cut(tags['name:es']??tags.name,160)??'';
 // An ATM without its own name is named after its operator («Cajero automático BCR»): still OSM data (operator tag).
 if((!name||isGenericName(name))&&vertical==='banking'&&cls.attributes?.kind==='atm'&&cut(tags.operator,80))name=`Cajero automático ${cut(tags.operator,80)}`.slice(0,160);
 if(!name||isGenericName(name))return null;
 if(vertical==='convenience'&&(tags.shop==='supermarket'||isFuelShopName(name,tags.brand)))return null;
 if(vertical==='health'&&HEALTH_EXCLUDED_REFS[ref]){opts.review?.push({ref,vertical,name,decision:'skipped_'+HEALTH_EXCLUDED_REFS[ref]});return null;}
 if(vertical==='health'&&HEALTH_RECLASS[ref])cls.attributes={...cls.attributes,...HEALTH_RECLASS[ref]};
 if(vertical==='health'||vertical==='vet_pets'){const who=personNameCheck(name);if(who==='person'){opts.review?.push({ref,vertical,name,decision:'skipped_person'});return null;}
  if(who==='review')opts.review?.push({ref,vertical,name,decision:'imported_review'});}
 const out={ref,vertical,name,
  addressLine:cut(street||tags['addr:full'],300),locality:cut(tags['addr:city']??tags['addr:place'],80),
  adminArea1:cut(tags['addr:province']??tags['addr:state'],80),adminArea2:cut(tags['addr:county']??tags['addr:canton'],80),adminArea3:cut(tags['addr:district']??tags['addr:suburb'],80),
  lat:Number.isFinite(point?.lat)?Math.round(point.lat*1e6)/1e6:null,lng:Number.isFinite(point?.lng)?Math.round(point.lng*1e6)/1e6:null,locationPrecision:point?.precision??'exact',
  phone:allowPhone?phoneOf(tags):undefined,attributes:cls.attributes&&Object.keys(cls.attributes).length?cls.attributes:undefined};
 return Object.fromEntries(Object.entries(out).filter(([,v])=>v!==undefined));
}
const km=(a,b)=>{const r=Math.PI/180,dl=(b.lat-a.lat)*r,dg=(b.lng-a.lng)*r,x=Math.sin(dl/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dg/2)**2;return 2*6371.0088*Math.asin(Math.min(1,Math.sqrt(x)));};
/** Fuel-station points (Overpass JSON or GeoJSON of amenity=fuel) for the corner-store exclusion. */
export function loadFuelPoints(text){
 const d=JSON.parse(text),pts=[];
 for(const e of d?.elements??[]){if(e.tags?.amenity!=='fuel')continue;const p=e.type==='node'?{lat:e.lat,lng:e.lon}:e.center?{lat:e.center.lat,lng:e.center.lon}:null;if(p&&Number.isFinite(p.lat))pts.push(p);}
 for(const f of d?.features??[]){const c=centroid(f.geometry);if(c&&(f.properties?.amenity??f.properties?.tags?.amenity)==='fuel')pts.push(c);}
 return pts;
}
/** Drops corner stores within `meters` of a fuel station (station shops). Returns how many were dropped. */
export function dropNearFuel(rows,fuelPoints,meters=65){
 if(!fuelPoints?.length)return 0;const keep=[],lim=meters/1000;let n=0;
 for(const r of rows){if(r.vertical==='convenience'&&Number.isFinite(r.lat)&&fuelPoints.some(p=>Math.abs(p.lat-r.lat)<0.001&&Math.abs(p.lng-r.lng)<0.0012&&km(p,r)<=lim)){n++;continue;}keep.push(r);}
 rows.splice(0,rows.length,...keep);return n;
}
const KIND_RANK={bank:0,exchange:1,atm:2};
// The six original verticals keep the database rule alone (dir_import_stage: same name within 75 m, any vertical).
const LEGACY=new Set(['restaurant','fuel','pharmacy','grocery','vehicle_dealer','real_estate']);
/** Same vertical + same normalized name within `meters` (2026-11-17 sections): keep one row (a bank keeps an ATM's `atm:true`). */
export function dedupeNearby(rows,meters=50){
 const lim=meters/1000,kept=[],byKey=new Map();let n=0;
 const sorted=[...rows].sort((a,b)=>(KIND_RANK[a.attributes?.kind]??0)-(KIND_RANK[b.attributes?.kind]??0));
 for(const r of sorted){
  if(LEGACY.has(r.vertical)){kept.push(r);continue;}
  const key=`${r.vertical}|${fold(r.name)}`,list=byKey.get(key)??[];
  const twin=Number.isFinite(r.lat)?list.find(x=>Number.isFinite(x.lat)&&km(x,r)<=lim):null;
  if(twin){n++;if(r.attributes?.kind==='atm'&&twin.attributes?.kind==='bank')twin.attributes.atm=true;continue;}
  list.push(r);byKey.set(key,list);kept.push(r);
 }
 const order=new Map(rows.map((r,i)=>[r,i]));kept.sort((a,b)=>order.get(a)-order.get(b));
 rows.splice(0,rows.length,...kept);return n;
}
/** Admin areas from a local Overpass `out geom` dump of administrative relations: [{level,name,bounds,edges}]. */
export function loadAdminAreas(text){
 const data=JSON.parse(text),areas=[];
 for(const e of data?.elements??[]){
  if(e.type!=='relation'||!e.tags||!['4','6'].includes(e.tags.admin_level))continue;
  const edges=[];
  for(const m of e.members??[])if(m.type==='way'&&['outer','inner'].includes(m.role)&&Array.isArray(m.geometry))
   for(let i=1;i<m.geometry.length;i++){const a=m.geometry[i-1],b=m.geometry[i];if(a&&b)edges.push([a.lon,a.lat,b.lon,b.lat]);}
  if(!edges.length)continue;
  const name=cut(e.tags.name??e.tags['name:es'],80);if(!name)continue;// `name` is the official one (name:es may be «Ciudad de San José»)
  const b=e.bounds??{minlat:Math.min(...edges.map(x=>x[1])),maxlat:Math.max(...edges.map(x=>x[1])),minlon:Math.min(...edges.map(x=>x[0])),maxlon:Math.max(...edges.map(x=>x[0]))};
  areas.push({level:Number(e.tags.admin_level),name:name.replace(/^(Provincia|Cant[oó]n) de /i,''),bounds:b,edges});
 }
 return areas;
}
// Even-odd ray casting over all outer+inner member segments (no ring assembly needed: closed rings cross evenly).
const inside=(area,lng,lat)=>{
 const b=area.bounds;if(lat<b.minlat||lat>b.maxlat||lng<b.minlon||lng>b.maxlon)return false;
 let c=false;for(const [x1,y1,x2,y2] of area.edges)if((y1>lat)!==(y2>lat)&&lng<(x2-x1)*(lat-y1)/(y2-y1)+x1)c=!c;return c;
};
/** Sets adminArea1 (province) and adminArea2 (canton) from the boundary that contains the point, so free-text tags
 *  («San Jose», «Provincia de Guanacaste») never create a second spelling of the same province. A tagged value is kept
 *  only when no boundary contains the point. Returns how many rows changed. */
export function fillAdminAreas(rows,areas){
 let n=0;
 for(const r of rows){
  if(!Number.isFinite(r.lat)||!Number.isFinite(r.lng))continue;
  const before=`${r.adminArea1}|${r.adminArea2}`;
  const p=areas.find(x=>x.level===4&&inside(x,r.lng,r.lat)),c=areas.find(x=>x.level===6&&inside(x,r.lng,r.lat));
  if(p)r.adminArea1=p.name;if(c)r.adminArea2=c.name;
  if(`${r.adminArea1}|${r.adminArea2}`!==before)n++;
 }
 return n;
}
/** Parses the file text into stage rows (pure; used by the PGlite verification too). */
export function parseImport(text,{allowPhone=true,only=null,review=null}={}){
 const data=JSON.parse(text),rows=[],opts={only:only?new Set(only):null,review};let skipped=0;
 if(data?.type==='FeatureCollection'&&Array.isArray(data.features)){
  for(const f of data.features){const p=f?.properties??{},tags=p.tags&&typeof p.tags==='object'?p.tags:p;
   const id=p['@id']??f.id??(p.osm_type&&p.osm_id?`${p.osm_type}/${p.osm_id}`:null);
   const r=row(typeof id==='string'||typeof id==='number'?String(id):null,tags,centroid(f?.geometry),allowPhone,opts);if(r)rows.push(r);else skipped++;}
 }else if(Array.isArray(data?.elements)){
  for(const e of data.elements){const point=e.type==='node'?{lat:e.lat,lng:e.lon,precision:'exact'}:e.center?{lat:e.center.lat,lng:e.center.lon,precision:'street'}:null;
   const r=row(e.type&&e.id!=null?`${e.type}/${e.id}`:null,e.tags??{},point,allowPhone,opts);if(r)rows.push(r);else skipped++;}
 }else throw new Error('Formato no reconocido: use GeoJSON FeatureCollection o JSON de Overpass. / Unknown format.');
 return {rows,skipped};
}
/** Splits rows into dir_import_stage payloads of at most PART_SIZE rows (one batch per part). */
export function buildPayloads(text,sourceId,fileName,opts={}){
 if(!/^[a-z][a-z0-9_-]{1,40}$/.test(sourceId))throw new Error('source-id inválido / invalid source-id');
 const {rows,skipped}=parseImport(text,opts);if(opts.adminAreas)opts.derivedAdmin=fillAdminAreas(rows,opts.adminAreas);
 opts.nearFuel=dropNearFuel(rows,opts.fuelPoints);opts.deduped=dedupeNearby(rows,50);const sha=createHash('sha256').update(text).digest('hex'),payloads=[];
 for(let i=0;i<rows.length;i+=PART_SIZE)payloads.push({actionId:randomUUID(),batchId:randomUUID(),sourceId,fileName:fileName.slice(0,200),fileSha256:sha,part:payloads.length+1,rows:rows.slice(i,i+PART_SIZE)});
 return {payloads,skipped,total:rows.length,nearFuel:opts.nearFuel,deduped:opts.deduped};
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
 const args=process.argv.slice(2),flags=new Set(args.filter(a=>a.startsWith('--'))),outIdx=args.indexOf('--out'),out=outIdx>=0?args[outIdx+1]:null;
 const admIdx=args.indexOf('--admin-areas'),admFile=admIdx>=0?args[admIdx+1]:null;
 const valIdx=new Set(['--out','--admin-areas','--only','--fuel-points','--review-out'].map(n=>args.indexOf(n)).filter(i=>i>=0).map(i=>i+1));
 const flagVal=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:null;};
 const [file,sourceId]=args.filter((a,i)=>!a.startsWith('--')&&!valIdx.has(i));
 const fuelFile=flagVal('--fuel-points'),reviewOut=flagVal('--review-out'),only=flagVal('--only')?.split(',').map(x=>x.trim()).filter(Boolean)??null;
 for(const f of [fuelFile,reviewOut])if(f&&/^[a-z]+:\/\//i.test(f)){console.error('Solo archivos locales / local files only');process.exit(2);}
 if(!file||!sourceId){console.error('Uso / usage: node scripts/directory/stage-import.mjs <archivo-local> <source-id> [--no-phone] [--out <dir>]');process.exit(2);}
 if(/^[a-z]+:\/\//i.test(file)){console.error('Solo archivos locales / local files only');process.exit(2);}
 if(admFile&&/^[a-z]+:\/\//i.test(admFile)){console.error('Solo archivos locales / local files only');process.exit(2);}
 const review=[];
 const opts={allowPhone:!flags.has('--no-phone'),adminAreas:admFile?loadAdminAreas(await readFile(admFile,'utf8')):null,only,review,
  fuelPoints:fuelFile?loadFuelPoints(await readFile(fuelFile,'utf8')):null};
 const text=await readFile(file,'utf8'),{payloads,skipped,total,nearFuel,deduped}=buildPayloads(text,sourceId,basename(file),opts);
 if(reviewOut)await writeFile(reviewOut,JSON.stringify(review,null,1));
 console.error(`Junto a gasolinera / at fuel station: ${nearFuel} · duplicados cercanos (50 m) / nearby duplicates: ${deduped} · nombres de persona omitidos / person names skipped: ${review.filter(x=>x.decision==='skipped_person').length} · a revisar / for review: ${review.filter(x=>x.decision==='imported_review').length}`);
 if(opts.adminAreas)console.error(`Provincia/cantón derivados de límites OSM / admin areas derived: ${opts.derivedAdmin} (${opts.adminAreas.length} límites)`);
 if(out){await mkdir(out,{recursive:true});for(const p of payloads)await writeFile(join(out,`stage-${p.part}.json`),JSON.stringify(p));}
 else process.stdout.write(JSON.stringify(payloads)+'\n');
 console.error(`Filas preparadas / staged rows: ${total} · omitidas (sin categoría o referencia) / skipped: ${skipped} · lotes / batches: ${payloads.length}`);
}
