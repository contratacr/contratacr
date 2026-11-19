import {parseProductPage,robotsAllows,type ClipMetadata} from './parse';

/**
 * Round 6D: product page readers. MockClipper never touches the network: it returns a fixture HTML page per
 * link and runs it through the same parser the real adapter uses (so the parsing is exercised). RemoteClipper
 * (inactive: needs PRO_CLIPPER_ENABLE_FETCH and an explicit sandbox/production mode) first reads robots.txt,
 * stops if the path is disallowed, then reads at most 1.5 MB of a text/html page and only its OG/schema.org data.
 */
export type ClipResult={ok:true;metadata:ClipMetadata}|{ok:false;reason:'robots'|'not_html'|'too_large'|'http'|'network'|'no_data'};
export interface ProductClipper{read(url:string):Promise<ClipResult>}
export const CLIPPER_USER_AGENT='ContrataCR-Clipper/1.0 (+https://contratacr.com/ayuda)';
const fixture=(name:string,price:number,currency:string,sku:string,brand:string,image:string,description:string)=>`<!doctype html><html><head>
<meta property="og:title" content="${name}"><meta property="og:image" content="${image}"><meta property="og:description" content="${description}">
<meta property="product:price:amount" content="${price}"><meta property="product:price:currency" content="${currency}">
<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'Product',name,sku,brand:{'@type':'Brand',name:brand},image,description,offers:{'@type':'Offer',price:String(price),priceCurrency:currency}})}</script></head><body>…</body></html>`;
/** Deterministic fixtures (labelled «simulado» in the UI). Hosts with special behaviour for tests and demos. */
export function mockPage(url:string):{robots:string;html:string|null}{
 const host=new URL(url).hostname;
 if(host==='bloqueado.example')return {robots:'User-agent: *\nDisallow: /',html:null};
 if(host==='sin-datos.example')return {robots:'',html:'<!doctype html><html><head><title>Página</title></head><body>Hola</body></html>'};
 if(/porcelanato|piso|tile/i.test(url))return {robots:'User-agent: *\nAllow: /',html:fixture('Porcelanato gris mate 60×60 cm (caja 1,44 m²)',18900,'CRC','POR-6060-GR','Cerámica Demo','https://images.example/porcelanato.jpg','Porcelanato rectificado para interiores, tráfico medio.')};
 if(/usd|lamp|lampara|lámpara/i.test(url))return {robots:'User-agent: *\nAllow: /',html:fixture('Lámpara colgante LED 24 W',39.9,'USD','LMP-24W','Luz Demo','https://images.example/lampara.jpg','Luz cálida 3000 K, incluye driver.')};
 return {robots:'User-agent: *\nDisallow: /carrito',html:fixture('Cemento gris 50 kg',7450,'CRC','CEM-50','Cementos Demo','https://images.example/cemento.jpg','Saco de cemento de uso general.')};
}
export class MockClipper implements ProductClipper{
 async read(url:string):Promise<ClipResult>{
  const page=mockPage(url),path=new URL(url).pathname+new URL(url).search;
  if(!robotsAllows(page.robots,CLIPPER_USER_AGENT,path)||!page.html)return {ok:false,reason:'robots'};
  const metadata=parseProductPage(page.html,url,true);
  return metadata.source==='none'?{ok:false,reason:'no_data'}:{ok:true,metadata};
 }
}
type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
export class RemoteClipper implements ProductClipper{
 constructor(private fetcher:Fetcher,private timeoutMs=8000,private agent=CLIPPER_USER_AGENT){}
 private async get(url:string,accept:string){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);
  try{return await this.fetcher(url,{headers:{'user-agent':this.agent,accept},redirect:'error',signal:controller.signal,cache:'no-store'});}finally{clearTimeout(timer);}
 }
 async read(url:string):Promise<ClipResult>{
  const target=new URL(url);
  try{
   const robots=await this.get(target.origin+'/robots.txt','text/plain');
   // 4xx robots = no restrictions (RFC 9309 §2.3.1.3); 5xx/unreachable = assume complete disallow.
   const text=robots.ok?(await robots.text()).slice(0,500000):robots.status>=500?'User-agent: *\nDisallow: /':'';
   if(!robotsAllows(text,this.agent,target.pathname+target.search))return {ok:false,reason:'robots'};
   const page=await this.get(url,'text/html');
   if(!page.ok)return {ok:false,reason:'http'};
   if(!(page.headers.get('content-type')??'').includes('text/html'))return {ok:false,reason:'not_html'};
   if(Number(page.headers.get('content-length')??0)>1_500_000)return {ok:false,reason:'too_large'};
   const html=(await page.text()).slice(0,1_500_000),metadata=parseProductPage(html,url,false);
   return metadata.source==='none'?{ok:false,reason:'no_data'}:{ok:true,metadata};
  }catch(error){return {ok:false,reason:error instanceof RangeError?'too_large':'network'};}
 }
}
