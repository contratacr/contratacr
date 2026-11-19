import {z} from 'zod';

/**
 * Round 6D (row 60): pure readers of a PUBLIC product page. Only Open Graph meta tags and schema.org Product
 * JSON-LD are read (never prices behind a login, never scripts, never the rest of the page). The result is a
 * suggestion the owner reviews before saving anything to the catalog.
 */
export const clipMetadataSchema=z.object({
 name:z.string().max(160),description:z.string().max(600),price:z.number().nonnegative().max(1e10).nullable(),
 currency:z.enum(['CRC','USD','EUR','OTHER']).nullable(),image:z.string().max(1000).nullable(),sku:z.string().max(80),brand:z.string().max(120),
 source:z.enum(['og','schema','mixed','none']),simulated:z.boolean(),
}).strict();
export type ClipMetadata=z.infer<typeof clipMetadataSchema>;
const PRIVATE_HOST=/^(localhost|.*\.local|.*\.internal|.*\.localhost|\d{1,3}(\.\d{1,3}){3}|\[.*\])$/i;
/** https only (port 443), no credentials, no IP literals / local names, no trailing-dot names (`localhost.` used to
 * pass). Names that RESOLVE to private addresses are refused at connect time by safe-fetch.ts (security review 2026-11-13). */
export const clipperUrlSchema=z.string().trim().max(2000).transform((value,context)=>{
 let url:URL;try{url=new URL(value);}catch{context.addIssue({code:'custom',message:'url'});return z.NEVER;}
 if(url.protocol!=='https:'||url.port!==''||url.username||url.password||url.hostname.endsWith('.')||PRIVATE_HOST.test(url.hostname)||!url.hostname.includes('.')){context.addIssue({code:'custom',message:'url'});return z.NEVER;}
 url.hash='';return url.toString();
});
const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
export function decodeEntities(text:string){return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(all,code:string)=>{if(code[0]==='#'){const n=code[1]==='x'||code[1]==='X'?parseInt(code.slice(2),16):parseInt(code.slice(1),10);return Number.isFinite(n)&&n>0&&n<0x110000?String.fromCodePoint(n):'';}return entities[code.toLowerCase()]??all;});}
const clean=(value:unknown,max:number)=>typeof value==='string'?decodeEntities(value).replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
function metaTags(html:string){
 const out=new Map<string,string>();
 for(const tag of html.match(/<meta\b[^>]*>/gi)??[]){
  const attr=(name:string)=>new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`,'i').exec(tag);
  const key=(attr('property')??attr('name')??attr('itemprop'));const content=attr('content');
  if(key&&content){const k=(key[2]??key[3]??'').toLowerCase();if(!out.has(k))out.set(k,content[2]??content[3]??'');}
 }
 return out;
}
type Json=Record<string,unknown>;
function products(node:unknown,found:Json[]=[],depth=0):Json[]{
 if(depth>6||!node)return found;
 if(Array.isArray(node)){for(const item of node.slice(0,50))products(item,found,depth+1);return found;}
 if(typeof node==='object'){const o=node as Json,type=o['@type'];if(type==='Product'||Array.isArray(type)&&type.includes('Product'))found.push(o);if(o['@graph'])products(o['@graph'],found,depth+1);}
 return found;
}
const price=(value:unknown)=>{const n=typeof value==='number'?value:typeof value==='string'?Number(value.replace(/[^\d.,]/g,'').replace(/,(?=\d{3}(\D|$))/g,'').replace(',','.')):NaN;return Number.isFinite(n)&&n>=0&&n<=1e10?Math.round(n*100)/100:null;};
const currency=(value:unknown)=>{const c=typeof value==='string'?value.trim().toUpperCase():'';return c==='CRC'||c==='USD'||c==='EUR'?c:c?'OTHER' as const:null;};
const httpsImage=(value:unknown,base:string)=>{const raw=Array.isArray(value)?value[0]:value&&typeof value==='object'?(value as Json).url:value;if(typeof raw!=='string')return null;try{const url=new URL(decodeEntities(raw),base);return url.protocol==='https:'?url.toString().slice(0,1000):null;}catch{return null;}};
/** Product metadata from Open Graph + schema.org JSON-LD of one HTML document. */
export function parseProductPage(html:string,url:string,simulated=false):ClipMetadata{
 const head=html.slice(0,600000),meta=metaTags(head);
 let schema:Json|null=null;
 for(const block of head.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{const found=products(JSON.parse(block[1]!.trim()));if(found[0]){schema=found[0];break;}}catch{/* invalid JSON-LD is ignored */}
 }
 const offers=schema?(Array.isArray(schema.offers)?schema.offers[0]:schema.offers) as Json|undefined:undefined;
 const brand=schema?.brand;
 const og={name:clean(meta.get('og:title'),160),description:clean(meta.get('og:description')??meta.get('description'),600),image:httpsImage(meta.get('og:image'),url),price:price(meta.get('product:price:amount')??meta.get('og:price:amount')),currency:currency(meta.get('product:price:currency')??meta.get('og:price:currency'))};
 const fromSchema={name:clean(schema?.name,160),description:clean(schema?.description,600),image:schema?httpsImage(schema.image,url):null,price:price(offers?.price??(offers as Json|undefined)?.lowPrice),currency:currency(offers?.priceCurrency),sku:clean(schema?.sku??schema?.mpn,80),brand:clean(typeof brand==='object'&&brand?(brand as Json).name:brand,120)};
 const usedSchema=!!(fromSchema.name||fromSchema.price!==null),usedOg=!!(og.name||og.price!==null||og.image);
 return clipMetadataSchema.parse({name:fromSchema.name||og.name,description:fromSchema.description||og.description,price:fromSchema.price??og.price,currency:fromSchema.currency??og.currency,image:fromSchema.image??og.image,sku:fromSchema.sku,brand:fromSchema.brand,
  source:usedSchema&&usedOg?'mixed':usedSchema?'schema':usedOg?'og':'none',simulated});
}
/** robots.txt (RFC 9309): longest matching rule wins, Allow wins a tie; «*» and «$» supported; our agent or «*». */
export function robotsAllows(robots:string,agent:string,path:string){
 const groups:{agents:string[];rules:{allow:boolean;pattern:string}[]}[]=[];let current:typeof groups[number]|null=null,lastWasAgent=false;
 for(const raw of robots.split(/\r?\n/)){
  const line=raw.replace(/#.*/,'').trim();const match=/^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);if(!match)continue;
  const key=match[1]!.toLowerCase(),value=match[2]!.trim();
  if(key==='user-agent'){if(!current||!lastWasAgent){current={agents:[],rules:[]};groups.push(current);}current.agents.push(value.toLowerCase());lastWasAgent=true;continue;}
  lastWasAgent=false;if(!current)continue;
  if(key==='allow'||key==='disallow'){if(key==='disallow'&&!value)continue;current.rules.push({allow:key==='allow',pattern:value});}
 }
 const name=agent.toLowerCase().split('/')[0]!;
 const mine=groups.filter(g=>g.agents.some(a=>a!=='*'&&name.startsWith(a)));const chosen=mine.length?mine:groups.filter(g=>g.agents.includes('*'));
 let best:{allow:boolean;length:number}|null=null;
 for(const rule of chosen.flatMap(g=>g.rules)){
  const anchored=rule.pattern.endsWith('$'),body=anchored?rule.pattern.slice(0,-1):rule.pattern;
  const regex=new RegExp('^'+body.split('*').map(part=>part.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*')+(anchored?'$':''));
  if(!regex.test(path))continue;
  if(!best||rule.pattern.length>best.length||rule.pattern.length===best.length&&rule.allow)best={allow:rule.allow,length:rule.pattern.length};
 }
 return best?best.allow:true;
}
