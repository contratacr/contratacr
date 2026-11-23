import {test,expect} from 'playwright/test';
import {CLIPPER_MAX_REDIRECTS,RemoteClipper} from '../../src/lib/pro/integrations/clipper/adapters';
import {ClipperAddressError,clipperSafeFetch,guardedLookup,isPublicAddress,type ClipperResolver} from '../../src/lib/pro/integrations/clipper/safe-fetch';
import {bookmarkletHref,CLIP_READER_SOURCE,decodeClipData,encodeClipData} from '../../src/lib/pro/integrations/clipper/browser-capture';
import {clipperUrlSchema,parseProductPage,robotsAllows} from '../../src/lib/pro/integrations/clipper/parse';

// Row 60: unit checks of the product clipper (no browser, no server, NO NETWORK): redirect following with the same SSRF
// guard on every hop, the guard itself (private answers, mixed answers, mapped/6to4, ports, literals, trailing dot),
// robots.txt and the browser-capture payload (bookmarklet / extension hash).
const page='<html><head><meta property="og:title" content="Pintura 4 L"><meta property="product:price:amount" content="19900"><meta property="product:price:currency" content="CRC"></head></html>';
const html=(body=page)=>new Response(body,{headers:{'content-type':'text/html'}});
const redirect=(to:string,status=301)=>new Response(null,{status,headers:{location:to}});
function fake(routes:Record<string,Response|(()=>Response)>){const calls:string[]=[];const fetcher=async(url:string)=>{calls.push(url);const r=routes[url];if(!r)return new Response('',{status:404});return typeof r==='function'?r():r.clone();};return {fetcher,calls};}

test('Row 60: redirects are followed up to 3 hops and each hop goes through the fetcher',async()=>{
 expect(CLIPPER_MAX_REDIRECTS).toBe(3);
 const {fetcher,calls}=fake({'https://shop.example/robots.txt':new Response('User-agent: *\nAllow: /'),'https://shop.example/a':redirect('/b'),'https://shop.example/b':redirect('https://shop.example/c',302),'https://shop.example/c':html()});
 const result=await new RemoteClipper(fetcher).read('https://shop.example/a');
 expect(result.ok&&result.metadata.name).toBe('Pintura 4 L');
 expect(calls).toEqual(['https://shop.example/robots.txt','https://shop.example/a','https://shop.example/b','https://shop.example/c']);
});
test('Row 60: a fourth redirect, a downgrade to http and a redirect loop are refused',async()=>{
 const robots=new Response('');
 let {fetcher}=fake({'https://shop.example/robots.txt':robots,'https://shop.example/1':redirect('/2'),'https://shop.example/2':redirect('/3'),'https://shop.example/3':redirect('/4'),'https://shop.example/4':redirect('/5'),'https://shop.example/5':html()});
 expect(await new RemoteClipper(fetcher).read('https://shop.example/1')).toEqual({ok:false,reason:'network'});
 ({fetcher}=fake({'https://shop.example/robots.txt':robots,'https://shop.example/x':redirect('http://shop.example/x')}));
 expect(await new RemoteClipper(fetcher).read('https://shop.example/x')).toEqual({ok:false,reason:'network'});
 ({fetcher}=fake({'https://shop.example/robots.txt':robots,'https://shop.example/l':redirect('/l')}));
 expect(await new RemoteClipper(fetcher).read('https://shop.example/l')).toEqual({ok:false,reason:'network'});
});
test('Row 60: a redirect to another origin is checked against the robots.txt of that origin',async()=>{
 const {fetcher,calls}=fake({'https://shop.example/robots.txt':new Response(''),'https://shop.example/p':redirect('https://cdn.example/p'),'https://cdn.example/robots.txt':new Response('User-agent: *\nDisallow: /p'),'https://cdn.example/p':html()});
 expect(await new RemoteClipper(fetcher).read('https://shop.example/p')).toEqual({ok:false,reason:'robots'});
 expect(calls).toContain('https://cdn.example/robots.txt');
 const open=fake({'https://shop.example/robots.txt':new Response(''),'https://shop.example/p':redirect('https://cdn.example/p'),'https://cdn.example/robots.txt':new Response('',{status:404}),'https://cdn.example/p':html()});
 expect((await new RemoteClipper(open.fetcher).read('https://shop.example/p')).ok).toBe(true);
});
test('Row 60: a redirect toward a private address dies in the real guarded fetcher',async()=>{
 const resolverOf=(host:Record<string,string[]>):ClipperResolver=>(name,cb)=>{const list=host[name];if(!list)return cb(Object.assign(new Error('nx'),{code:'ENOTFOUND'}),[]);cb(null,list.map(address=>({address,family:address.includes(':')?6:4})));};
 // First hop is public, the redirect target resolves to the metadata address: ClipperAddressError, never a request.
 let hops=0;const resolver=resolverOf({'shop.example':['93.184.215.14'],'evil.example':['169.254.169.254']});
 const fetcher=async(url:string,init:RequestInit)=>{hops++;if(url==='https://shop.example/robots.txt')return new Response('');if(url==='https://shop.example/p')return redirect('https://evil.example/x');return clipperSafeFetch(url,init,resolver);};
 expect(await new RemoteClipper(fetcher).read('https://shop.example/p')).toEqual({ok:false,reason:'network'});
 expect(hops).toBe(3);
});
test('Row 60: SSRF guard refuses private, mixed, mapped, 6to4, non-443, literal and trailing-dot targets',async()=>{
 const answer=(addresses:string[]):ClipperResolver=>(_n,cb)=>cb(null,addresses.map(address=>({address,family:address.includes(':')?6:4})));
 const run=(addresses:string[])=>new Promise<Error|null>(resolve=>(guardedLookup(answer(addresses)) as unknown as (h:string,o:{all:boolean},cb:(e:Error|null)=>void)=>void)('x.example',{all:true},e=>resolve(e)));
 for(const set of [['127.0.0.1'],['10.1.2.3'],['93.184.215.14','10.0.0.5'],['::ffff:127.0.0.1'],['2002:7f00:1::1'],['64:ff9b::a00:1'],['fd00::1'],[]])expect(await run(set),set.join()).toBeInstanceOf(ClipperAddressError);
 expect(await run(['93.184.215.14'])).toBeNull();expect(await run(['2606:4700:4700::1111'])).toBeNull();
 expect(isPublicAddress('100.64.0.1')).toBe(false);
 for(const url of ['https://shop.example:8443/p','https://93.184.215.14/p','https://[2606:4700:4700::1111]/p','https://shop.example./p','https://user:pw@shop.example/p','http://shop.example/p'])await expect(clipperSafeFetch(url,{},answer(['93.184.215.14'])),url).rejects.toBeInstanceOf(ClipperAddressError);
 for(const bad of ['https://localhost/p','https://localhost./p','https://127.0.0.1/p','https://shop.example:444/p','http://shop.example/p','https://a.local/p','https://u:p@shop.example/p'])expect(clipperUrlSchema.safeParse(bad).success,bad).toBe(false);
});
test('Row 60: robots.txt and parser edge cases',()=>{
 expect(robotsAllows('User-agent: *\nDisallow: /p\nAllow: /p/ok','ContrataCR-Clipper/1.0','/p/ok')).toBe(true);
 expect(robotsAllows('User-agent: *\nDisallow: /p','ContrataCR-Clipper/1.0','/p/x')).toBe(false);
 expect(robotsAllows('User-agent: contratacr-clipper\nDisallow: /\nUser-agent: *\nAllow: /','ContrataCR-Clipper/1.0','/x')).toBe(false);
 expect(robotsAllows('','ContrataCR-Clipper/1.0','/x')).toBe(true);
 expect(parseProductPage('<html>nada</html>','https://shop.example/p').source).toBe('none');
 expect(parseProductPage(page,'https://shop.example/p')).toMatchObject({name:'Pintura 4 L',price:19900,currency:'CRC',source:'og'});
});
test('Row 60: browser capture hash round-trips, stays under 8 KB and rejects tampering',()=>{
 const data={name:'Lámpara colgante ñandú',description:'Luz cálida',price:39.9,currency:'USD' as const,image:'https://cdn.example/l.jpg',sku:'LMP-24',brand:'Luz'};
 const hash=encodeClipData(data)!;expect(hash.startsWith('clipdata=')).toBe(true);
 expect(decodeClipData('#'+hash)).toMatchObject({...data,source:'mixed',simulated:false});
 expect(encodeClipData({...data,description:'x'.repeat(600),name:'y'.repeat(160)})).not.toBeNull();
 expect(decodeClipData('#clipdata=!!!')).toBeNull();expect(decodeClipData('#other=1')).toBeNull();expect(decodeClipData('#clipdata='+'A'.repeat(20000))).toBeNull();
 const b64=(o:unknown)=>'#clipdata='+Buffer.from(JSON.stringify(o)).toString('base64url');
 expect(decodeClipData(b64({...data,extra:1}))).toBeNull();
 expect(decodeClipData(b64({...data,image:'http://x.example/a.jpg'}))?.image).toBeNull();
 expect(decodeClipData(b64({...data,name:'<b>Tubo</b>'}))?.name).toBe('Tubo');
 expect(decodeClipData(b64({...data,name:'',price:null}))).toBeNull();
});
test('Row 60: the browser reader runs in a fake DOM and the bookmarklet only opens the app',()=>{
 const metas:Record<string,string>={'og:title':'Cemento 50 kg','product:price:amount':'7.450,00','product:price:currency':'crc','og:image':'/img/c.jpg'};
 const doc={title:'t',querySelector:(q:string)=>{const m=/"([^"]+)"/.exec(q);const key=m?.[1];return key&&metas[key]!==undefined?{getAttribute:()=>metas[key]}:null;},querySelectorAll:()=>[{textContent:JSON.stringify({'@type':'Product',name:'Cemento gris',sku:'CEM-50',brand:{name:'Demo'},offers:{price:'7450',priceCurrency:'CRC'}})}]};
 const read=new Function('document','location','URL',`return (${CLIP_READER_SOURCE})()`);
 const out=read(doc,{href:'https://tienda.example/p/1'},URL);
 expect(out).toMatchObject({name:'Cemento gris',sku:'CEM-50',brand:'Demo',price:7450,currency:'CRC',image:'https://tienda.example/img/c.jpg'});
 const href=decodeURIComponent(bookmarkletHref('https://contratacr.com','es','Abra una página'));
 expect(href.startsWith('javascript:')).toBe(true);expect(href).toContain('window.open(');expect(href).toContain('/es/dashboard/pro?tab=pro_company&empresa=articulos&clip=');
 for(const forbidden of ['fetch(','XMLHttpRequest','sendBeacon','.submit(','document.cookie'])expect(href).not.toContain(forbidden);
 expect(decodeURIComponent(bookmarkletHref('https://contratacr.com','en','Open a page'))).toContain('/en/dashboard/pro');
});
