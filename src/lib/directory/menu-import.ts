import {z} from 'zod';
import {parseMenuMoney} from './menu-price';
import {MENU_DIETARY_TAGS,MENU_MAX_ITEMS,MENU_MAX_SECTIONS,type MenuDietaryTag,type MenuExtractionShape,type MenuImportReview,type MenuItemFields} from './menu-schemas';

// LOCAL PRO ONLY (multivertical P2): «menu from photo» DRAFT CONTRACT. Same rule as the Pro AI assistant
// (src/lib/pro/ai/*): the result is a SUGGESTION stored apart (pro_menu_import_drafts, immutable); nothing is
// published. Flow: adapter (MOCK only for now) → normalizeMenuExtraction (zod, links removed, tags mapped, prices to
// céntimos) → pro_menu_import_record (stores draft, creates nothing) → review screen (owner edits every row) →
// pro_menu_import_review 'apply' creates DRAFT items → owner publishes with items_publish.
// No real provider call exists here; wiring a real one must go through pro_ai_begin (consent + monthly cap).

export const MENU_IMPORT_LABEL={es:'Leído con IA desde su foto · revise cada plato y precio antes de publicar',en:'Read by AI from your photo · check every dish and price before publishing'};
export const MENU_IMPORT_MOCK_MODEL='mock-menu-v1';
export const MENU_IMPORT_MAX_BYTES=5*1024*1024;
export const menuImportImageTypes=['image/jpeg','image/png','image/webp'] as const;

const stripLinks=(text:string)=>text.replace(/\b(?:https?:\/\/|www\.)\S+/gi,'').replace(/[<>]/g,'').replace(/[ \t]{2,}/g,' ').trim();
const TAG_SYNONYMS:Record<string,MenuDietaryTag>={
 vegetariano:'vegetariano',vegetarian:'vegetariano',veggie:'vegetariano',vegano:'vegano',vegan:'vegano',
 sin_gluten:'sin_gluten','sin gluten':'sin_gluten',gluten_free:'sin_gluten','gluten-free':'sin_gluten','gluten free':'sin_gluten',
 picante:'picante',spicy:'picante',hot:'picante',
};
export function mapDietary(values:readonly string[]):MenuDietaryTag[]{
 const set=new Set<MenuDietaryTag>();
 for(const v of values){const tag=TAG_SYNONYMS[v.trim().toLowerCase()];if(tag)set.add(tag);}
 if(set.has('vegano'))set.add('vegetariano');
 return MENU_DIETARY_TAGS.filter(t=>set.has(t));
}

/** Raw adapter answer (validated whatever the provider claims). Prices in MAJOR units as printed, or null if unreadable. */
export const menuExtractionRawSchema=z.object({
 language:z.enum(['es','en']),currency:z.enum(['CRC','USD']),
 pricesIncludeIva:z.boolean().nullable().optional(),pricesIncludeService:z.boolean().nullable().optional(),
 sections:z.array(z.object({name:z.string().trim().min(1).max(200),
  items:z.array(z.object({name:z.string().trim().min(1).max(300),description:z.string().max(2000).nullable().optional(),
   price:z.union([z.number().nonnegative().max(10_000_000),z.string().max(40),z.null()]).optional(),
   dietary:z.array(z.string().max(40)).max(10).optional(),confidence:z.enum(['low','medium','high']).default('medium')}).strict()).min(1).max(200)}).strict()).min(1).max(60),
 warnings:z.array(z.string().max(500)).max(20).optional(),
}).strict();
export type MenuExtractionRaw=z.input<typeof menuExtractionRawSchema>;

/** Validates and normalises an adapter answer into the shape pro_menu_extraction_ok accepts; null = discard. */
export function normalizeMenuExtraction(raw:unknown):MenuExtractionShape|null{
 const parsed=menuExtractionRawSchema.safeParse(raw);if(!parsed.success)return null;
 const r=parsed.data,warnings=(r.warnings??[]).map(w=>stripLinks(w).slice(0,300)).filter(Boolean).slice(0,10);
 let budget=MENU_MAX_ITEMS,cut=false;
 const sections:MenuExtractionShape['sections']=[];
 for(const s of r.sections.slice(0,MENU_MAX_SECTIONS)){
  const name=stripLinks(s.name).slice(0,80);if(!name||budget<=0){cut=true;continue;}
  const items:MenuExtractionShape['sections'][number]['items']=[];
  for(const i of s.items.slice(0,150)){
   if(budget<=0){cut=true;break;}
   const itemName=stripLinks(i.name).slice(0,120);if(!itemName)continue;
   const description=i.description?stripLinks(i.description).slice(0,500)||null:null;
   const priceMinor=typeof i.price==='number'?Math.round(i.price*100):typeof i.price==='string'?parseMenuMoney(i.price):null;
   const lowPrice=priceMinor==null;
   items.push({name:itemName,description,priceMinor:priceMinor!=null&&priceMinor<=1_000_000_000?priceMinor:null,dietary:mapDietary(i.dietary??[]),confidence:lowPrice?'low':i.confidence});
   budget--;
  }
  if(items.length)sections.push({name,items});
 }
 if(r.sections.length>MENU_MAX_SECTIONS)cut=true;
 if(!sections.length)return null;
 if(cut&&warnings.length<10)warnings.push('Se recortó el resultado a 40 secciones y 300 platos.');
 return {language:r.language,currency:r.currency,pricesIncludeIva:r.pricesIncludeIva??null,pricesIncludeService:r.pricesIncludeService??null,sections,warnings};
}

// ---------------------------------------------------------------- adapter (mock only)
export type MenuExtractResult={ok:true;output:unknown}|{ok:false;reason:'provider_failed'|'unsupported_file'};
export interface MenuExtractor{readonly name:'mock';readonly model:string;extract(input:{bytes:Uint8Array;mime:string;language:'es'|'en'}):Promise<MenuExtractResult>}
/** Deterministic, offline. Never sends the photo anywhere. Output depends only on the bytes length (stable in tests). */
export class MockMenuExtractor implements MenuExtractor{
 readonly name='mock' as const;readonly model=MENU_IMPORT_MOCK_MODEL;
 private readonly fixture:unknown;
 constructor(fixture?:unknown){this.fixture=fixture;}
 async extract(input:{bytes:Uint8Array;mime:string;language:'es'|'en'}):Promise<MenuExtractResult>{
  if(!(menuImportImageTypes as readonly string[]).includes(input.mime)||input.bytes.length===0||input.bytes.length>MENU_IMPORT_MAX_BYTES)return {ok:false,reason:'unsupported_file'};
  if(this.fixture!==undefined)return {ok:true,output:this.fixture};
  const n=input.bytes.length%3;
  return {ok:true,output:{language:input.language,currency:'CRC',pricesIncludeIva:true,pricesIncludeService:null,
   sections:[{name:input.language==='en'?'Breakfast':'Desayunos',items:[
     {name:'Gallo pinto con huevo',description:'Con natilla y plátano maduro',price:3500,dietary:['vegetarian'],confidence:'high'},
     {name:'Pinto vegano',description:null,price:'₡3 800',dietary:['vegan'],confidence:'medium'}]},
    {name:input.language==='en'?'Mains':'Platos fuertes',items:[
     {name:'Casado con pollo',description:'Arroz, frijoles, ensalada y picadillo',price:5200+n*100,dietary:[],confidence:'high'},
     {name:'Chifrijo',description:'Ver www.ejemplo.cr',price:null,dietary:['spicy'],confidence:'low'}]}],
   warnings:['El precio del chifrijo no se pudo leer.']}};
 }
}

// ---------------------------------------------------------------- review screen
export type MenuReviewRow={key:string;include:boolean;item:MenuItemFields&{priceMinor:number};needsPrice:boolean;confidence:'low'|'medium'|'high'};
export type MenuReviewSection={key:string;include:boolean;nameEs:string;nameEn:string|null;rows:MenuReviewRow[]};
/** Editable copy for the owner. Unreadable prices become 0 + needsPrice (apply is blocked until edited). */
export function extractionToReview(extraction:MenuExtractionShape,newKey:()=>string):MenuReviewSection[]{
 const en=extraction.language==='en';
 return extraction.sections.map(s=>({key:newKey(),include:true,nameEs:s.name,nameEn:en?s.name:null,rows:s.items.map(i=>({key:newKey(),include:true,
  needsPrice:i.priceMinor==null,confidence:i.confidence,
  item:{nameEs:i.name,nameEn:en?i.name:null,descriptionEs:i.description,descriptionEn:en?i.description:null,priceMinor:i.priceMinor??0,dietary:i.dietary,availability:'available',status:'draft'}}))}));
}
/** Builds the 'apply' body from the reviewed copy. Keys become the new section/item ids (uuids from the UI). */
export function reviewToApply(input:{actionId:string;placeId:string;draftId:string;sections:MenuReviewSection[]}):MenuImportReview|{error:'needs_price'|'empty'}{
 const sections=input.sections.filter(s=>s.include).map(s=>({sectionId:s.key,section:{nameEs:s.nameEs,nameEn:s.nameEn},
  items:s.rows.filter(r=>r.include).map(r=>({itemId:r.key,item:{...r.item,status:'draft' as const}}))})).filter(s=>s.items.length>0);
 if(!sections.length)return {error:'empty'};
 if(input.sections.some(s=>s.include&&s.rows.some(r=>r.include&&r.needsPrice)))return {error:'needs_price'};
 return {actionId:input.actionId,placeId:input.placeId,draftId:input.draftId,decision:'apply',sections} as MenuImportReview;
}
