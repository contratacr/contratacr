import {test,expect} from 'playwright/test';
import {createHash} from 'node:crypto';
import {clipperUrlSchema,parseProductPage,robotsAllows} from '../../src/lib/pro/integrations/clipper/parse';
import {MockClipper,RemoteClipper} from '../../src/lib/pro/integrations/clipper/adapters';
import {BrevoCampaignSender} from '../../src/lib/pro/integrations/marketing/brevo';
import {NotActiveAdImporter,microsToCents} from '../../src/lib/pro/integrations/ads/stubs';
import {CloudflareCustomHostnames} from '../../src/lib/pro/integrations/domain/cloudflare';
import {integrationProviders,providerConfig,providerRegistry} from '../../src/lib/pro/integrations/registry';
import {extrudedFaces,floorPlanContentSchema,floorPlanPdf,floorPlanSvg,polygonArea,polygonPerimeter,summarize,type FloorPlanContent} from '../../src/lib/pro/floor-plan';
import {convexHull,parseScanJson,parseScanObj,parseScanUsdzSimulated,scanFormatOf} from '../../src/lib/pro/room-scan';
import {defaultSiteContent,siteConsentText,siteContentSchema,siteSlugSchema,siteSubmitSchema,slugify} from '../../src/lib/pro/site';
import {readUtm,trackingUrl} from '../../src/lib/pro/ads-tracking';
import {marketingMutationSchema,simulatedMetrics} from '../../src/lib/pro/marketing';

// Round 6D — unit-level checks (no browser, no server, NO NETWORK: real adapters get a fake fetch): product page
// reader (Open Graph + schema.org, robots.txt RFC 9309, URL safety), Brevo request shape with one-click
// unsubscribe, ad / domain stubs, floor plan geometry + SVG/PDF/3D, room-scan parsers, site content and UTM links.
test('Round 6D: product page reader takes only OG / schema.org data and sanitizes it',()=>{
 const html=`<html><head><meta property="og:title" content="Tubo PVC &amp; codo"><meta property="og:image" content="http://insecure.example/a.jpg">
 <meta property="product:price:amount" content="1 250,50"><meta property="product:price:currency" content="crc">
 <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"X"},{"@type":"Product","name":"<b>Tubo PVC 1/2</b>","sku":"PVC-12","brand":{"name":"Demo"},"image":["https://cdn.example/pvc.jpg"],"offers":{"price":"1250.50","priceCurrency":"CRC"}}]}</script>
 <script>window.price=1</script></head><body>Precio secreto 1</body></html>`;
 const m=parseProductPage(html,'https://tienda.example/p/1');
 expect(m).toMatchObject({name:'Tubo PVC 1/2',sku:'PVC-12',brand:'Demo',price:1250.5,currency:'CRC',image:'https://cdn.example/pvc.jpg',source:'mixed',simulated:false});
 const og=parseProductPage('<meta property="og:title" content="Solo OG"><meta property="og:image" content="/img/x.jpg">','https://tienda.example/p/2');
 expect(og).toMatchObject({name:'Solo OG',image:'https://tienda.example/img/x.jpg',source:'og',price:null});
 expect(parseProductPage('<p>nada</p>','https://x.example').source).toBe('none');
 expect(parseProductPage('<script type="application/ld+json">{bad json</script>','https://x.example').source).toBe('none');
});
test('Round 6D: robots.txt rules (longest match, Allow wins ties, wildcards, $) and URL safety',()=>{
 const robots='User-agent: *\nDisallow: /privado/\nAllow: /privado/publico\nDisallow: /*.pdf$\n\nUser-agent: ContrataCR-Clipper\nDisallow: /carrito';
 const ua='ContrataCR-Clipper/1.0';
 expect(robotsAllows(robots,'OtroBot','/privado/x')).toBe(false);expect(robotsAllows(robots,'OtroBot','/privado/publico/1')).toBe(true);
 expect(robotsAllows(robots,'OtroBot','/manual.pdf')).toBe(false);expect(robotsAllows(robots,'OtroBot','/manual.pdf?x=1')).toBe(true);
 expect(robotsAllows(robots,ua,'/privado/x')).toBe(true);expect(robotsAllows(robots,ua,'/carrito/1')).toBe(false);// own group replaces «*»
 expect(robotsAllows('User-agent: *\nDisallow: /p\nAllow: /p','x','/p')).toBe(true);expect(robotsAllows('','x','/a')).toBe(true);
 for(const bad of ['http://tienda.example/p','https://localhost/p','https://127.0.0.1/p','https://user:pw@tienda.example/p','https://intranet/p','https://x.local/p','javascript:alert(1)'])expect(clipperUrlSchema.safeParse(bad).success,bad).toBe(false);
 expect(clipperUrlSchema.parse('https://tienda.example/p/1#frag')).toBe('https://tienda.example/p/1');
});
test('Round 6D: mock clipper fixtures and the real reader with a fake fetch (robots first, html only)',async()=>{
 const mock=new MockClipper();
 const cement=await mock.read('https://tienda.example/producto/cemento');expect(cement.ok&&cement.metadata).toMatchObject({name:'Cemento gris 50 kg',price:7450,currency:'CRC',simulated:true});
 expect(await mock.read('https://bloqueado.example/p/1')).toEqual({ok:false,reason:'robots'});
 expect(await mock.read('https://sin-datos.example/p/1')).toEqual({ok:false,reason:'no_data'});
 expect(await mock.read('https://tienda.example/carrito/1')).toEqual({ok:false,reason:'robots'});
 const calls:string[]=[];
 const fake=(routes:Record<string,Response>)=>async(url:string)=>{calls.push(url);return routes[url]?.clone()??new Response('',{status:404});};
 const page='<meta property="og:title" content="Real"><meta property="product:price:amount" content="10">';
 let reader=new RemoteClipper(fake({'https://shop.example/robots.txt':new Response('User-agent: *\nDisallow: /'),'https://shop.example/p':new Response(page,{headers:{'content-type':'text/html'}})}));
 expect(await reader.read('https://shop.example/p')).toEqual({ok:false,reason:'robots'});expect(calls).toEqual(['https://shop.example/robots.txt']);// page never fetched
 calls.length=0;reader=new RemoteClipper(fake({'https://shop.example/robots.txt':new Response('',{status:503})}));expect((await reader.read('https://shop.example/p')).ok).toBe(false);expect(calls).toHaveLength(1);
 reader=new RemoteClipper(fake({'https://shop.example/p':new Response('{}',{headers:{'content-type':'application/json'}})}));expect(await reader.read('https://shop.example/p')).toEqual({ok:false,reason:'not_html'});
 reader=new RemoteClipper(fake({'https://shop.example/p':new Response(page,{headers:{'content-type':'text/html; charset=utf-8'}})}));
 const ok=await reader.read('https://shop.example/p');expect(ok.ok&&ok.metadata).toMatchObject({name:'Real',price:10,simulated:false});
});
test('Round 6D: Brevo request carries one-click unsubscribe; ad and domain adapters are inactive stubs',async()=>{
 let seen:{url:string;init:RequestInit}|null=null;
 const sender=new BrevoCampaignSender('xkeysib-test-not-real',async(url,init)=>{seen={url,init};return new Response('{"messageId":"<1@x>"}',{status:201});});
 expect(await sender.send({to:'a@example.test',subject:'Hola',text:'Texto',unsubscribeUrl:'https://contratacr.com/baja-pro#t='+'ab'.repeat(32),sender:{name:'Obras',email:'obras@example.test'},tags:['campaign']})).toEqual({ok:true,providerId:'<1@x>'});
 const captured=seen as unknown as {url:string;init:RequestInit};
 expect(captured.url).toBe('https://api.brevo.com/v3/smtp/email');expect((captured.init.headers as Record<string,string>)['api-key']).toBe('xkeysib-test-not-real');
 const body=JSON.parse(String(captured.init.body));expect(body.headers).toEqual({'List-Unsubscribe':'<https://contratacr.com/api/pro/marketing-unsubscribe/one-click?t='+'ab'.repeat(32)+'>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'});expect(body.to).toEqual([{email:'a@example.test'}]);
 expect(await new BrevoCampaignSender('k',async()=>new Response('',{status:429})).send({to:'a@x.co',subject:'s',text:'t',unsubscribeUrl:'u',sender:{name:'n',email:'e@x.co'},tags:[]})).toEqual({ok:false,status:429,retryable:true});
 expect(microsToCents(1_000_000)).toBe(100);await expect(new NotActiveAdImporter('meta_ads').dailySpend()).rejects.toThrow(/not active/);
 const cf=new CloudflareCustomHostnames('zone 1','tok').createRequest('www.obras.cr');expect(cf.url).toBe('https://api.cloudflare.com/client/v4/zones/zone%201/custom_hostnames');expect(JSON.parse(String(cf.init.body))).toEqual({hostname:'www.obras.cr',ssl:{method:'http',type:'dv'}});
 expect(integrationProviders).toEqual(['hacienda','tilopay','esign','google','microsoft','quickbooks','ai','transcription','marketing_email','meta_ads','google_ads','product_clipper','site_domain']);
 expect(providerRegistry.marketing_email.env.production).toEqual(['PRO_MARKETING_BREVO_API_KEY']);expect(providerRegistry.product_clipper.env.sandbox).toEqual(['PRO_CLIPPER_ENABLE_FETCH']);
 expect(providerConfig('marketing_email',{apiKey:'x',maxPerCampaign:50})).toEqual({senderName:'',senderEmail:'',maxPerCampaign:50});expect(providerConfig('meta_ads',{accountId:'act_12345'})).toEqual({accountId:'act_12345'});
 expect(providerRegistry.google_ads.config.safeParse({accountId:'1234567890'}).success).toBe(false);
});
const room=(w:number,h:number):FloorPlanContent=>({walls:[{id:'w1',a:[0,0],b:[w,0],thickness:0.15},{id:'w2',a:[w,0],b:[w,h],thickness:0.15},{id:'w3',a:[w,h],b:[0,h],thickness:0.15},{id:'w4',a:[0,h],b:[0,0],thickness:0.15}],
 openings:[{id:'d1',wallId:'w1',kind:'door',offset:1,width:0.9},{id:'v1',wallId:'w2',kind:'window',offset:0.5,width:1.2}],rooms:[{id:'r1',name:'Cocina',points:[[0,0],[w,0],[w,h],[0,h]]}],dimensions:[{id:'m1',a:[0,-0.5],b:[w,-0.5]}],wallHeight:2.4});
test('Round 6D: floor plan geometry, SVG, vector PDF and 3D faces',()=>{
 expect(polygonArea([[0,0],[4,0],[4,3],[0,3]])).toBe(12);expect(polygonPerimeter([[0,0],[4,0],[4,3],[0,3]])).toBe(14);
 expect(polygonArea([[0,0],[4,0],[4,2],[2,2],[2,4],[0,4]])).toBe(12);// L shape
 const content=room(4,3);expect(floorPlanContentSchema.safeParse(content).success).toBe(true);
 expect(summarize(content)).toEqual({rooms:[{id:'r1',name:'Cocina',area:12,perimeter:14}],totalArea:12,wallLength:14,doors:1,windows:1});
 expect(floorPlanContentSchema.safeParse({...content,openings:[{id:'x',wallId:'nope',kind:'door',offset:0,width:1}]}).success).toBe(false);
 const svg=floorPlanSvg({name:'Planta <baja>',unit:'m',content},false);expect(svg).toContain('Planta &lt;baja&gt;');expect(svg).toContain('12 m²');expect(svg.match(/<line /g)!.length).toBeGreaterThanOrEqual(7);
 const pdf=Buffer.from(floorPlanPdf({name:'Planta baja',unit:'m',content},false,'Trabajo'));const text=pdf.toString('latin1');
 expect(text.startsWith('%PDF-1.4')).toBe(true);expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
 const xref=Number(/startxref\n(\d+)/.exec(text)![1]);expect(text.slice(xref,xref+4)).toBe('xref');
 for(const [index,offset] of [...text.slice(xref).matchAll(/(\d{10}) 00000 n/g)].map(m=>Number(m[1])).entries())expect(text.slice(offset,offset+`${index+1} 0 obj`.length)).toBe(`${index+1} 0 obj`);
 expect(text).toContain('(Cocina)');expect(text).toContain('rea total');
 const faces=extrudedFaces(content,0.6,0.9,{w:600,h:400});expect(faces).toHaveLength(4*5+1);expect(faces[0]!.kind).toBe('floor');
 for(const face of faces)for(const [x,y] of face.points){expect(Number.isFinite(x)&&Number.isFinite(y)).toBe(true);}
});
test('Round 6D: room scan parsers (own JSON, RoomPlan JSON, OBJ hull, USDZ simulated)',()=>{
 expect(parseScanJson(JSON.stringify(room(3,3)),false)).toMatchObject({ok:true,parser:'local'});
 // RoomPlan CapturedRoom-like export: four walls 4 m × 3 m around the origin, one door on the first wall.
 const wall=(len:number,cx:number,cz:number,dx:number,dz:number)=>({dimensions:[len,2.5,0.1],transform:[dx,0,dz,0,0,1,0,0,-dz,0,dx,0,cx,0,cz,1]});
 const roomplan={walls:[wall(4,0,-1.5,1,0),wall(3,2,0,0,1),wall(4,0,1.5,-1,0),wall(3,-2,0,0,-1)],doors:[wall(0.9,0.5,-1.5,1,0)],windows:[]};
 const parsed=parseScanJson(JSON.stringify(roomplan),true);expect(parsed.ok).toBe(true);
 if(parsed.ok){const s=summarize(parsed.content);expect(s.totalArea).toBeCloseTo(12,3);expect(s.wallLength).toBeCloseTo(14,3);expect(parsed.content.openings).toHaveLength(1);expect(parsed.content.openings[0]!.wallId).toBe('w1');expect(parsed.content.wallHeight).toBe(2.5);}
 const obj=['# cube 5 x 4 x 2.6','v 0 0 0','v 5 0 0','v 5 0 4','v 0 0 4','v 0 2.6 0','v 5 2.6 0','v 5 2.6 4','v 0 2.6 4','v 2.5 1 2','f 1 2 3 4'].join('\n');
 const fromObj=parseScanObj(obj,false);expect(fromObj.ok).toBe(true);if(fromObj.ok){expect(summarize(fromObj.content).totalArea).toBe(20);expect(fromObj.content.wallHeight).toBe(2.6);expect(fromObj.content.walls).toHaveLength(4);}
 expect(convexHull([[0,0],[1,1],[2,0],[1,0.2],[2,2],[0,2]])).toHaveLength(4);
 const zip=new Uint8Array([0x50,0x4b,0x03,0x04,1,2,3]),sha=createHash('sha256').update(zip).digest('hex');
 const usdz=parseScanUsdzSimulated(zip,sha,false);expect(usdz).toMatchObject({ok:true,parser:'simulado'});if(usdz.ok)expect(usdz.notes[0]).toMatch(/^SIMULADO/);
 expect(parseScanUsdzSimulated(new Uint8Array([1,2,3,4]),sha,false)).toEqual({ok:false,reason:'format'});
 expect(parseScanJson('{"walls":[]}',false)).toEqual({ok:false,reason:'empty'});expect(parseScanJson('not json',false)).toEqual({ok:false,reason:'invalid'});
 expect(scanFormatOf('Cocina.USDZ')).toBe('usdz');expect(scanFormatOf('x.ply')).toBeNull();
});
test('Round 6D: site content from profile data, slug, consent text, submit schema and UTM links',()=>{
 const profile={businessName:'Remodelaciones Ñandú',profileSlug:'rem-1',bio:'',services:[{name:'Baños',description:'Obra completa'}],photos:['https://res.cloudinary.com/demo/a.jpg'],area:{provincia:'Alajuela',canton:'Atenas'},rating:{average:4.5,count:2}};
 const content=defaultSiteContent(profile,false);expect(siteContentSchema.safeParse(content).success).toBe(true);
 expect(content.sections.map(s=>[s.type,s.enabled])).toEqual([['hero',true],['services',true],['portfolio',true],['reviews',true],['area',true],['contact',true]]);
 expect(content.title.length).toBeLessThanOrEqual(70);expect(content.description.length).toBeLessThanOrEqual(170);
 expect(defaultSiteContent({...profile,services:[],photos:[],rating:{average:null,count:0},area:{provincia:null,canton:null}},true).sections.filter(s=>s.enabled).map(s=>s.type)).toEqual(['hero','contact']);
 expect(slugify('Remodelaciones Ñandú & Hijos')).toBe('remodelaciones-nandu-hijos');expect(siteSlugSchema.safeParse('admin').success).toBe(false);expect(siteSlugSchema.safeParse('-x').success).toBe(false);
 expect(siteConsentText('Obras',false)).toMatch(/^Acepto recibir novedades y ofertas de Obras por correo/);
 expect(siteSubmitSchema.safeParse({submissionId:crypto.randomUUID(),name:'Ana',email:'A@B.co',phone:'8888-1111',message:'Hola mundo',service:'',area:'',marketingConsent:false,language:'es',code:null,utm:{},website:'bot'}).success).toBe(false);// honeypot
 const url=trackingUrl('http://127.0.0.1:3185',{landing:'site',code:'ab12cd34',utm:{source:'facebook',medium:'cpc',campaign:'promo-nov'}},{slug:'obras'},null)!;
 expect(url).toBe('http://127.0.0.1:3185/sitio/obras?utm_source=facebook&utm_medium=cpc&utm_campaign=promo-nov&cc=ab12cd34');
 expect(readUtm(new URL(url).searchParams)).toEqual({utm:{source:'facebook',medium:'cpc',campaign:'promo-nov'},code:'ab12cd34'});
 expect(readUtm(new URLSearchParams('cc=BAD!')).code).toBeNull();expect(trackingUrl('x',{landing:'site',code:'ab12cd34',utm:{source:'a',medium:'b',campaign:'c'}},null,null)).toBeNull();
 expect(simulatedMetrics(10)).toEqual({simulated:true,delivered:10,opened:4,clicked:1,unsubscribed:0});
 expect(marketingMutationSchema.safeParse({action:'contact_consent',actionId:crypto.randomUUID(),email:'x@y.co',name:'',clientId:null,consentText:'corto',evidence:'verbal',note:''}).success).toBe(false);
});
