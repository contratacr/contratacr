import {z} from 'zod';
import {CR_PROVINCES} from './listing-public';
import {normalizeIntentText} from './vertical-vocabulary';
import {crDay,money,perUnitLabel,sourceLine,type CompareVertical,type PriceComparison,type PriceSearchResult} from './price-compare';
import type {PlaceSearchItem} from './search-schemas';
import type {PublicPlace} from './types';

// LOCAL PRO ONLY (multivertical A1/A2): directory tools of the public assistant (/api/ai-assistant). Pure module: the
// backend (server functions, never the HTTP API) is injected, so the node tests run it with a mock backend and no
// model or network. Rules: neutral (no paid boosting: the backend order is kept as is and nothing commercial is read),
// never prescription medicines (filtered in SQL; refused here before any call), every answer cites source and date.
//
// DIRECTORY_TOOLS has a JSON-schema definition per tool so a tool-calling model can use the same executor later (A2).
// Today the route plans the call deterministically (planDirectoryCall); no model is asked to call tools.

export type ToolLocale='es'|'en';
// 2026-11-17: + the eleven new place sections. Limits: salud = establishments only, never medical advice or consultation
// prices (the answer says so and recalls 9-1-1); bancos = map points only (no rates, fees or products; a price question
// about a bank is answered with places and that limit, never with figures).
export const PLACE_TOOL_VERTICALS=['restaurantes','farmacias','supermercados','gasolineras',
 'cafes','pulperias','ferreterias','hospedaje','salud','veterinarias','talleres','belleza','gimnasios','tours','bancos'] as const;
export type PlaceToolVertical=typeof PLACE_TOOL_VERTICALS[number];

export const DIRECTORY_TOOLS=[
 {name:'directory_search_places',description:'Search published places of the ContrataCR directory by section, province and open-now. Neutral order (never payment).',
  input_schema:{type:'object',additionalProperties:false,required:['vertical'],properties:{
   vertical:{type:'string',enum:[...PLACE_TOOL_VERTICALS]},province:{type:'string',enum:[...CR_PROVINCES]},openNow:{type:'boolean'},
   q:{type:'string',maxLength:100},limit:{type:'integer',minimum:1,maximum:5}}}},
 {name:'directory_get_place',description:'Public details of one place (address, hours, phone, sources and last update).',
  input_schema:{type:'object',additionalProperties:false,required:['slug'],properties:{slug:{type:'string',pattern:'^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$'}}}},
 {name:'directory_compare_prices',description:'Compare prices of a supermarket product or an over-the-counter medicine across stores. Never prescription medicines.',
  input_schema:{type:'object',additionalProperties:false,required:['product'],properties:{
   product:{type:'string',minLength:2,maxLength:100},province:{type:'string',enum:[...CR_PROVINCES]},vertical:{type:'string',enum:['grocery','pharmacy']}}}},
] as const;
export type DirectoryToolName=typeof DIRECTORY_TOOLS[number]['name'];

const province=z.enum(CR_PROVINCES);
export const TOOL_INPUT={
 directory_search_places:z.object({vertical:z.enum(PLACE_TOOL_VERTICALS),province:province.optional(),openNow:z.boolean().optional(),q:z.string().trim().max(100).optional(),limit:z.number().int().min(1).max(5).optional()}).strict(),
 directory_get_place:z.object({slug:z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/)}).strict(),
 directory_compare_prices:z.object({product:z.string().trim().min(2).max(100),province:province.optional(),vertical:z.enum(['grocery','pharmacy']).optional()}).strict(),
} as const;

/** Server functions the tools call (implemented in assistant-tools-server.ts; mocked in tests). */
export type DirectoryToolBackend={
 searchPlaces(input:{vertical:PlaceToolVertical;province?:string;openNow?:boolean;q?:string;limit:number}):Promise<PlaceSearchItem[]|null>;
 getPlace(slug:string):Promise<PublicPlace|null>;
 searchPriceItems(q:string,vertical:CompareVertical|null):Promise<PriceSearchResult|null>;
 comparePrices(item:string,opts:{province:string|null;vertical:CompareVertical|null}):Promise<PriceComparison|null>;
};

export type DirectoryToolResult={
 tool:DirectoryToolName;answer:string;href:string|null;ctaLabel:string|null;
 /** The price catalogue had no matching product (the caller may prefer its own answer). */
 noMatch?:boolean;
 /** Every answer lists its sources with a date (also embedded in `answer`). */
 citations:{label:string;date:string}[];
};

// ---------------------------------------------------------------- prescription guard
// Words that point to prescription medicines (Decreto 36868-S). A request that mixes a price question with one of
// these never reaches the backend; the catalogue itself never holds Rx prices.
const RX_TERMS=['receta','con receta','prescripcion','prescription','antibiotico','antibioticos','antibiotic','antibiotics','amoxicilina','amoxicillin',
 'azitromicina','azithromycin','clonazepam','alprazolam','diazepam','tramadol','morfina','morphine','oxicodona','oxycodone','insulina','insulin','sildenafil',
 'anticonceptivo','anticonceptivos','metformina','losartan','enalapril','atorvastatina','omeprazol 40','sertralina','fluoxetina'];
export function mentionsPrescription(text:string){const p=` ${normalizeIntentText(text)} `;return RX_TERMS.some(t=>p.includes(` ${t} `));}

// ---------------------------------------------------------------- deterministic planner
const SECTION_TERMS:Record<PlaceToolVertical,string[]>={
 farmacias:['farmacia','farmacias','botica','pharmacy','pharmacies','drugstore'],
 supermercados:['supermercado','supermercados','super mercado','minisuper','mini super','supermarket','supermarkets','grocery store','grocery stores'],
 gasolineras:['gasolinera','gasolineras','bomba de gasolina','estacion de servicio','estaciones de servicio','gas station','gas stations','fuel station','fuel stations'],
 restaurantes:['restaurante','restaurantes','soda','sodas','restaurant','restaurants'],
 // Trade words that also name a professional service («mecánico», «estilista», «veterinario» as a person, «doctor»)
 // stay with the professionals assistant; only place words route to the directory.
 cafes:['cafeteria','cafeterias','panaderia','panaderias','heladeria','heladerias','bar','bares','pub','coffee shop','cafe shop','bakery','bakeries'],
 pulperias:['pulperia','pulperias','abastecedor','abastecedores','corner store','corner stores'],
 ferreterias:['ferreteria','ferreterias','hardware store','hardware stores'],
 hospedaje:['hotel','hoteles','hostal','hostales','cabinas','hospedaje','hostel','hostels','hotels','lodging'],
 salud:['clinica','clinicas','consultorio','consultorios','ebais','hospital','hospitales','laboratorio clinico','optica','opticas','clinic','clinics','dental clinic'],
 veterinarias:['veterinaria','veterinarias','tienda de mascotas','tiendas de mascotas','pet shop','pet shops','vet clinic','veterinary clinic'],
 talleres:['taller mecanico','talleres mecanicos','talleres','lavacar','lava car','llantera','llanteras','car wash','car repair shop','tyre shop'],
 belleza:['salon de belleza','salones de belleza','barberia','barberias','peluqueria','peluquerias','beauty salon','barber shop','nail salon'],
 gimnasios:['gimnasio','gimnasios','gym','gyms'],
 tours:['tour','tours','atraccion','atracciones','museo','museos','attraction','attractions','museum','museums'],
 bancos:['banco','bancos','cajero','cajeros','cajero automatico','cajeros automaticos','atm','atms','bank','banks'],
};
/** Sections whose prices the compare tool may look up (products only; never consultations, rates or room prices). */
const PRICE_SECTIONS=new Set<PlaceToolVertical>(['farmacias','supermercados','pulperias','ferreterias','veterinarias']);
const PRICE_TERMS=['precio','precios','cuanto cuesta','cuanto vale','cuanto sale','mas barato','mas barata','donde esta mas barato','comparar precios','compare prices',
 'price','prices','how much','cheapest','cheaper'];
const OPEN_TERMS=['abierta','abierto','abiertas','abiertos','abierta ahora','abierto ahora','abren ahora','de turno','open now','open'];
const PRICE_FILLER=new Set(['precio','precios','cuanto','cuesta','vale','sale','el','la','los','las','de','del','un','una','en','mas','barato','barata','donde','esta',
 'comparar','compare','price','prices','of','the','a','an','how','much','is','cheapest','cheaper','where','in','at','para','por','y','and','farmacia','farmacias',
 'supermercado','supermercados','super','pharmacy','pharmacies','supermarket','supermarkets','hoy','today',
 'pulperia','pulperias','ferreteria','ferreterias','veterinaria','veterinarias','tienda','mascotas','hardware','store','shop','que','what','kilo','kg','me','sale','mejor','best','find','busco','buscar','quiero']);

const has=(padded:string,terms:string[])=>terms.some(t=>padded.includes(` ${t} `));
export function detectProvince(text:string):string|null{
 const p=` ${normalizeIntentText(text)} `;
 // Longest first so «San José» wins over a canton named José; only whole provinces (cantons are not guessed).
 return [...CR_PROVINCES].sort((a,b)=>b.length-a.length).find(pr=>p.includes(` ${normalizeIntentText(pr)} `))??null;
}

export type DirectoryPlan=
 |{kind:'rx_refused'}
 |{kind:'tool';tool:'directory_search_places';input:z.infer<typeof TOOL_INPUT.directory_search_places>}
 |{kind:'tool';tool:'directory_compare_prices';input:z.infer<typeof TOOL_INPUT.directory_compare_prices>;explicit:boolean};

/** null = not a directory question (the professional-services assistant keeps it). */
export function planDirectoryCall(message:string):DirectoryPlan|null{
 const padded=` ${normalizeIntentText(message)} `;
 const section=(Object.keys(SECTION_TERMS) as PlaceToolVertical[]).find(v=>has(padded,SECTION_TERMS[v]))??null;
 const priceIntent=has(padded,PRICE_TERMS);
 if(priceIntent&&mentionsPrescription(message))return {kind:'rx_refused'};
 const prov=detectProvince(message)??undefined;
 if(priceIntent&&(section===null||PRICE_SECTIONS.has(section))){
  const words=normalizeIntentText(message).split(' ').filter(w=>w&&!PRICE_FILLER.has(w)&&!(prov&&normalizeIntentText(prov).split(' ').includes(w)));
  const product=words.join(' ').trim();
  if(product.length>=2)return {kind:'tool',tool:'directory_compare_prices',input:{product,...(prov?{province:prov as typeof CR_PROVINCES[number]}:{}),
   ...(section==='farmacias'?{vertical:'pharmacy' as const}:section==='supermercados'?{vertical:'grocery' as const}:{})},explicit:section!==null||has(padded,['comparar precios','compare prices'])};
 }
 if(!section)return null;
 if(section==='farmacias'&&mentionsPrescription(message)&&priceIntent)return {kind:'rx_refused'};
 return {kind:'tool',tool:'directory_search_places',input:{vertical:section,...(prov?{province:prov as typeof CR_PROVINCES[number]}:{}),...(has(padded,OPEN_TERMS)?{openNow:true}:{}),limit:3}};
}

// ---------------------------------------------------------------- executor
const SECTION_NAME:Record<PlaceToolVertical,[string,string]>={restaurantes:['restaurantes','restaurants'],farmacias:['farmacias','pharmacies'],supermercados:['supermercados','supermarkets'],gasolineras:['gasolineras','fuel stations'],
 cafes:['cafés, panaderías y bares','cafés, bakeries and bars'],pulperias:['pulperías y minisúper','corner stores'],ferreterias:['ferreterías','hardware stores'],
 hospedaje:['hospedajes','places to stay'],salud:['establecimientos de salud','health facilities'],veterinarias:['veterinarias y tiendas de mascotas','vets and pet shops'],
 talleres:['talleres y servicios para vehículos','car services'],belleza:['salones de belleza y barberías','beauty salons and barbers'],gimnasios:['gimnasios','gyms'],
 tours:['tours y atracciones','tours and attractions'],bancos:['bancos y cajeros','banks and ATMs']};
/** Fixed limit line per sensitive section (2026-11-17 policy, pending lawyer review). */
function sectionLimit(v:PlaceToolVertical,en:boolean):string{
 const t=(es:string,english:string)=>en?english:es;
 if(v==='salud')return t('Solo listo establecimientos; no doy consejo médico ni precios de consultas. En una emergencia llame al 9-1-1.','I only list facilities; I give no medical advice or consultation prices. In an emergency, call 9-1-1.');
 if(v==='veterinarias')return t('Solo listo establecimientos; no doy consejo veterinario ni precios de consultas.','I only list facilities; I give no veterinary advice or consultation prices.');
 if(v==='bancos')return t('Solo muestro ubicación y horario; no comparo tasas, comisiones ni productos financieros.','I only show location and hours; I do not compare rates, fees or financial products.');
 if(v==='hospedaje'||v==='tours')return t('ContrataCR no indica si tienen declaratoria turística del ICT; confírmelo con el negocio.','ContrataCR does not state whether they hold an ICT tourism declaration; please confirm with the business.');
 return '';
}
const cap=(s:string)=>s.charAt(0).toUpperCase()+s.slice(1);
const prefix=(l:ToolLocale)=>l==='en'?'/en':'';
const qs=(o:Record<string,string|undefined>)=>{const s=new URLSearchParams(Object.entries(o).filter(([,v])=>v) as [string,string][]).toString();return s?`?${s}`:'';};

export function rxRefusal(locale:ToolLocale):DirectoryToolResult{
 const en=locale==='en';
 return {tool:'directory_compare_prices',href:`${prefix(locale)}/farmacias`,ctaLabel:en?'See pharmacies':'Ver farmacias',citations:[{label:'Decreto 36868-S',date:''}],
  answer:en?'ContrataCR does not show prices of prescription medicines (Costa Rican rule, Decreto 36868-S). Please ask a licensed pharmacy directly. I can show you pharmacies near you or prices of over-the-counter products.'
   :'ContrataCR no muestra precios de medicamentos que requieren receta (Decreto 36868-S). Consulte directamente en una farmacia autorizada. Puedo mostrarle farmacias cercanas o precios de productos de venta libre.'};
}

/** Runs one tool with validated input. Returns null when the input is invalid or the backend is unavailable. */
export async function runDirectoryTool(tool:DirectoryToolName,rawInput:unknown,backend:DirectoryToolBackend,locale:ToolLocale,now=new Date()):Promise<DirectoryToolResult|null>{
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,today=crDay(now.toISOString(),en);
 if(tool==='directory_search_places'){
  const p=TOOL_INPUT.directory_search_places.safeParse(rawInput);if(!p.success)return null;
  const input=p.data,items=await backend.searchPlaces({...input,limit:input.limit??3});if(!items)return null;
  const name=SECTION_NAME[input.vertical][en?1:0],where=input.province??'Costa Rica';
  const href=`${prefix(locale)}/${input.vertical}${qs({province:input.province,openNow:input.openNow?'1':undefined})}`;
  const citation={label:t('Directorio ContrataCR (datos públicos de OpenStreetMap y de los negocios)','ContrataCR directory (OpenStreetMap public data and business data)'),date:today};
  if(!items.length)return {tool,href,ctaLabel:t(`Ver ${name}`,`See ${name}`),citations:[citation],
   answer:t(`No encontré ${name} en ${where}${input.openNow?' con horario abierto ahora':''}.`,`I did not find ${name}${input.openNow?' open now':''} in ${where}.`)+`\n${t('Fuente','Source')}: ${citation.label} · ${t('consultado el','checked on')} ${today}.`};
  // Backend order kept as is (neutral SQL order); nothing commercial is read or added.
  const lines=items.slice(0,input.limit??3).map((it,i)=>{
   const area=[it.address.locality??it.address.adminArea2,it.address.adminArea1].filter(Boolean).join(', ');
   const open=it.openNow===true?t('abierto ahora','open now'):it.openNow===false?t('cerrado ahora','closed now'):t('horario sin confirmar','hours not confirmed');
   const data=it.verificationLevel==='imported'||it.verificationLevel==='unverified'?t('datos públicos sin verificar','unverified public data'):t('datos confirmados por el negocio o ContrataCR','data confirmed by the business or ContrataCR');
   // Every pharmacy is listed since 2026-11-17: say whether ContrataCR verified its operating permit (neutral wording).
   const permit=it.vertical.id==='pharmacy'?` · ${it.verificationLevel==='license_verified'?t('permiso de funcionamiento verificado','operating license verified'):t('permiso sin verificar por ContrataCR','license not verified by ContrataCR')}`
    :it.vertical.id==='health'||it.vertical.id==='vet_pets'?` · ${it.verificationLevel==='license_verified'?t('habilitación verificada por ContrataCR','health permit verified by ContrataCR'):t('habilitación sin verificar por ContrataCR','permit not verified by ContrataCR')}`:'';
   return `${i+1}. ${it.name} — ${area||where} · ${open} · ${data}${permit}`;
  });
  const limit=sectionLimit(input.vertical,en);
  return {tool,href,ctaLabel:t(`Ver ${name}`,`See all ${name}`),citations:[citation],
   answer:`${t(`${cap(name)} en ${where}${input.openNow?' con horario abierto ahora':''}:`,`${cap(name)}${input.openNow?' open now':''} in ${where}:`)}\n${lines.join('\n')}\n`+
    (limit?`${limit}\n`:'')+
    `${t('Orden neutral: nadie paga por aparecer primero.','Neutral order: no one pays to appear first.')}\n${t('Fuente','Source')}: ${citation.label} · ${t('consultado el','checked on')} ${today}.`};
 }
 if(tool==='directory_get_place'){
  const p=TOOL_INPUT.directory_get_place.safeParse(rawInput);if(!p.success)return null;
  const place=await backend.getPlace(p.data.slug);if(!place)return null;
  const a=place.address,addr=[a.line,a.locality,a.adminArea2,a.adminArea1].filter(Boolean).join(', ');
  const src=place.sources.length?place.sources.map(s=>`${s.name} (${s.license})`).join('; '):t('Información del negocio','Business information');
  const citation={label:src,date:crDay(place.updatedAt,en)};
  return {tool,href:`${prefix(locale)}/lugar/${place.slug}`,ctaLabel:t('Ver ficha','View details'),citations:[citation],
   answer:`${place.name}${addr?` — ${addr}`:''}${place.phone?`\n${t('Teléfono','Phone')}: ${place.phone}`:''}\n${t('Fuente','Source')}: ${src} · ${t('actualizado el','updated on')} ${citation.date}.`};
 }
 const p=TOOL_INPUT.directory_compare_prices.safeParse(rawInput);if(!p.success)return null;
 const input=p.data;
 if(mentionsPrescription(input.product))return rxRefusal(locale);
 const found=await backend.searchPriceItems(input.product,input.vertical??null);if(!found)return null;
 const item=found.items[0];
 const listHref=`${prefix(locale)}/precios${qs({q:input.product,provincia:input.province,tipo:input.vertical==='pharmacy'?'farmacias':input.vertical==='grocery'?'supermercados':undefined})}`;
 if(!item)return {tool,href:listHref,ctaLabel:t('Buscar precios','Search prices'),citations:[],noMatch:true,
  answer:t(`Todavía no tengo precios de «${input.product}». Puede buscarlo por nombre o código de barras en Comparar precios.`,`I do not have prices for “${input.product}” yet. You can search by name or barcode in Compare prices.`)};
 const cmp=await backend.comparePrices(item.slug,{province:input.province??null,vertical:input.vertical??null});if(!cmp)return null;
 const href=`${prefix(locale)}/precios${qs({producto:item.slug,provincia:input.province,tipo:input.vertical==='pharmacy'?'farmacias':input.vertical==='grocery'?'supermercados':undefined})}`;
 const current=cmp.offers.filter(o=>!o.observation.stale).slice(0,3);
 const label=`${cmp.item.name}${cmp.item.presentation?` (${cmp.item.presentation})`:''}`;
 const where=input.province??'Costa Rica';
 if(!current.length){
  const last=cmp.offers[0];
  return {tool,href,ctaLabel:t('Ver precios','See prices'),citations:last?[{label:sourceLine(last.observation,en),date:crDay(last.observation.observedAt,en)}]:[],
   answer:last?t(`No tengo precios vigentes de ${label} en ${where}. El último dato (${last.place.name}: ${money(last.observation.price,last.observation.currency,en)}) está desactualizado.\nFuente: ${sourceLine(last.observation,en)}.`,
    `I have no current prices for ${label} in ${where}. The last figure (${last.place.name}: ${money(last.observation.price,last.observation.currency,en)}) is out of date.\nSource: ${sourceLine(last.observation,en)}.`)
    :t(`Todavía no hay precios de ${label} en ${where}.`,`There are no prices for ${label} in ${where} yet.`)};
 }
 const lines=current.map((o,i)=>`${i+1}. ${o.place.name}: ${money(o.observation.price,o.observation.currency,en)} (${money(o.unitPrice,o.observation.currency,en)} ${perUnitLabel(cmp.item.normalizedUnit,en)}) — ${sourceLine(o.observation,en)}`);
 return {tool,href,ctaLabel:t('Ver todos los precios','See all prices'),
  citations:current.map(o=>({label:sourceLine(o.observation,en),date:crDay(o.observation.observedAt,en)})),
  answer:`${t(`Precios vigentes de ${label} en ${where}, del menor al mayor por unidad de medida:`,`Current prices for ${label} in ${where}, lowest unit price first:`)}\n${lines.join('\n')}\n`+
   t('Ningún comercio paga por aparecer primero. Confirme con el comercio antes de comprar.','No store pays to appear first. Please confirm with the store before buying.')};
}

/** Plan + run. null → not a directory question or the directory could not answer (the caller keeps its own flow). */
export async function directoryAnswer(message:string,backend:DirectoryToolBackend,locale:ToolLocale,now=new Date()):Promise<DirectoryToolResult|null>{
 const plan=planDirectoryCall(message);
 if(!plan)return null;
 if(plan.kind==='rx_refused')return rxRefusal(locale);
 const result=await runDirectoryTool(plan.tool,plan.input,backend,locale,now);
 // «¿Cuánto cuesta ContrataCR Pro?» is not a product of the catalogue: without an explicit store/price context, an
 // unknown product goes back to the regular assistant instead of a «no prices» answer.
 if(result?.noMatch&&plan.tool==='directory_compare_prices'&&!plan.explicit)return null;
 return result;
}
