import {test,expect} from 'playwright/test';
import type {LookupAddress} from 'node:dns';
import {clipperUrlSchema} from '../../src/lib/pro/integrations/clipper/parse';
import {RemoteClipper} from '../../src/lib/pro/integrations/clipper/adapters';
import {ClipperAddressError,clipperSafeFetch,guardedLookup,isPublicAddress,type ClipperResolver} from '../../src/lib/pro/integrations/clipper/safe-fetch';
import {tilopayConsultVerdict} from '../../src/lib/pro/integrations/payments/tilopay-consult';
import {ProBodyError,proBoundedForm,readBoundedBody,sniffAudio,sniffImage} from '../../src/lib/pro/bounded-body';
import {isOneClickBody,oneClickUnsubscribeUrl} from '../../src/lib/pro/integrations/marketing/unsubscribe-links';

// Security review 2026-11-13 (local, no network, no browser): SSRF guard of the product page reader.
// Every resolver here is a fake, so no DNS query or connection leaves the machine.
const resolverOf=(...addresses:string[]):ClipperResolver=>(_host,callback)=>callback(null,addresses.map(address=>({address,family:address.includes(':')?6:4}) as LookupAddress));
const lookupOnce=(resolver:ClipperResolver,all:boolean)=>new Promise<{error:Error|null;address:unknown}>(resolve=>{
 (guardedLookup(resolver) as unknown as (h:string,o:{all:boolean},cb:(e:Error|null,a:unknown)=>void)=>void)('shop.example',{all},(error,address)=>resolve({error,address}));
});

test.describe('Security review: product clipper SSRF guard',()=>{
 test('URL schema refuses trailing-dot names, non-443 ports and local names; keeps public https links',()=>{
  for(const url of ['https://localhost./x','https://metadata.google.internal./x','https://foo.local./x','https://shop.example:8443/x','https://shop.example:22/x','https://localhost/x','https://127.0.0.1/x','https://[::1]/x','http://shop.example/x','https://u:p@shop.example/x'])
   expect(clipperUrlSchema.safeParse(url).success,url).toBe(false);
  for(const url of ['https://shop.example/p','https://shop.example:443/p','https://www.ferreteria.example/porcelanato?sku=1'])expect(clipperUrlSchema.safeParse(url).success,url).toBe(true);
 });
 test('address classifier: private, loopback, link-local, CGNAT, metadata, mapped and reserved are not public',()=>{
  for(const address of ['127.0.0.1','10.1.2.3','172.16.0.1','172.31.255.255','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','255.255.255.255','198.18.0.1',
   '::1','::','fe80::1','fc00::1','fd12:3456::1','::ffff:127.0.0.1','::ffff:10.0.0.1','64:ff9b::a00:1','2002:7f00:1::1','2001:db8::1','ff02::1','not-an-ip'])expect(isPublicAddress(address),address).toBe(false);
  for(const address of ['8.8.8.8','93.184.215.14','172.32.0.1','2606:4700:4700::1111'])expect(isPublicAddress(address),address).toBe(true);
 });
 test('socket lookup refuses a name that resolves to a private address (wildcard DNS / rebinding), in both lookup forms',async()=>{
  for(const all of [false,true]){
   expect((await lookupOnce(resolverOf('127.0.0.1'),all)).error).toBeInstanceOf(ClipperAddressError);
   expect((await lookupOnce(resolverOf('93.184.215.14','10.0.0.5'),all)).error,'one private answer among public ones is enough to refuse').toBeInstanceOf(ClipperAddressError);
   expect((await lookupOnce(resolverOf(),all)).error).toBeInstanceOf(ClipperAddressError);
  }
  const single=await lookupOnce(resolverOf('93.184.215.14'),false),many=await lookupOnce(resolverOf('93.184.215.14','2606:4700:4700::1111'),true);
  expect(single.error).toBeNull();expect(single.address).toBe('93.184.215.14');
  expect(many.error).toBeNull();expect((many.address as LookupAddress[]).map(entry=>entry.address)).toEqual(['93.184.215.14','2606:4700:4700::1111']);
 });
 test('safe fetch never connects to a private destination; refuses ports, credentials, IP literals and trailing dots before any lookup',async()=>{
  let lookups=0;const counting:ClipperResolver=(host,callback)=>{lookups++;resolverOf('127.0.0.1')(host,callback);};
  await expect(clipperSafeFetch('https://127.0.0.1.nip.io/robots.txt',{},counting)).rejects.toBeInstanceOf(ClipperAddressError);
  expect(lookups).toBe(1);
  for(const url of ['https://shop.example:8443/','https://127.0.0.1/','https://[::1]/','https://localhost./','http://shop.example/','https://u:p@shop.example/','nonsense'])
   await expect(clipperSafeFetch(url,{},counting),url).rejects.toBeInstanceOf(ClipperAddressError);
  expect(lookups,'refused before resolving').toBe(1);
 });
 test('reader with the guarded fetcher: private resolution → network refusal; oversized body → too_large',async()=>{
  const guarded=new RemoteClipper((url,init)=>clipperSafeFetch(url,init,resolverOf('169.254.169.254')));
  expect(await guarded.read('https://tienda.example/p')).toEqual({ok:false,reason:'network'});
  const huge=new RemoteClipper(async()=>{throw new RangeError('too_large');});
  expect(await huge.read('https://tienda.example/p')).toEqual({ok:false,reason:'too_large'});
 });
});

// Post-security fixes (2026-11-13): pure helpers, no network, no browser.
test.describe('Post-security fixes: SINPE consult, streamed body limits, one-click unsubscribe',()=>{
 test('Tilopay consult: approved only for OUR order number with the same amount and currency (fail closed)',()=>{
  const expected={orderNumber:'ccr_sinpe_abc',amountCents:2500000,currency:'CRC'};
  expect(tilopayConsultVerdict({response:[{code:'1',orderNumber:'ccr_sinpe_abc',amount:'25000.00',currency:'CRC'}]},expected)).toEqual({ok:true});
  expect(tilopayConsultVerdict({response:[{code:1,amount:25000,currency:'crc'}]},expected)).toEqual({ok:true});
  expect(tilopayConsultVerdict({response:[{code:'1',amount:'2500.00',currency:'CRC'}]},expected)).toEqual({ok:false,failureCode:'amount_mismatch'});
  expect(tilopayConsultVerdict({response:[{code:'1',amount:'25000.00',currency:'USD'}]},expected)).toEqual({ok:false,failureCode:'amount_mismatch'});
  expect(tilopayConsultVerdict({response:[{code:'1'}]},expected),'missing amount/currency never matches').toEqual({ok:false,failureCode:'amount_mismatch'});
  expect(tilopayConsultVerdict({response:[{code:'1',orderNumber:'attacker-chosen',amount:'25000.00',currency:'CRC'}]},expected)).toEqual({ok:false,failureCode:'sinpe_not_found'});
  expect(tilopayConsultVerdict({response:[{code:'0',amount:'25000.00',currency:'CRC'}]},expected)).toEqual({ok:false,failureCode:'sinpe_not_found'});
  expect(tilopayConsultVerdict({response:[]},expected,'not_approved')).toEqual({ok:false,failureCode:'not_approved'});
  expect(tilopayConsultVerdict(null,expected)).toEqual({ok:false,failureCode:'sinpe_not_found'});
  expect(tilopayConsultVerdict({response:[{code:'1',amount:'25000.00',currency:'CRC'},{code:'1',amount:'1.00',currency:'CRC'}]},expected),'ambiguous answer').toEqual({ok:false,failureCode:'sinpe_not_found'});
 });
 const streamed=(chunks:Uint8Array[],type:string,length?:string)=>new Request('http://127.0.0.1/x',{method:'POST',headers:{'content-type':type,...(length?{'content-length':length}:{})},body:new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(chunk);controller.close();}}),duplex:'half'} as RequestInit);
 test('streamed byte cap: a body without (or with a false) Content-Length is refused as soon as it passes the limit',async()=>{
  const big=Array.from({length:8},()=>new Uint8Array(1024));
  await expect(readBoundedBody(streamed(big,'application/octet-stream'),4096)).rejects.toBeInstanceOf(RangeError);
  await expect(readBoundedBody(streamed(Array.from({length:8},()=>new Uint8Array(1024)),'application/octet-stream','10'),4096),'declared 10 bytes, sends 8 KB').rejects.toBeInstanceOf(RangeError);
  await expect(readBoundedBody(streamed([new Uint8Array(10)],'application/octet-stream','999999'),4096),'declared too large').rejects.toBeInstanceOf(RangeError);
  expect((await readBoundedBody(streamed([new Uint8Array(1000),new Uint8Array(1000)],'application/octet-stream'),4096)).byteLength).toBe(2000);
 });
 test('bounded form: field allow-list, single occurrence, file count, per-file size and content type',async()=>{
  // Encoded first, like a body arriving from the network (undici's own FormData stream misbehaves when cancelled).
  const multipart=async(form:FormData)=>{const encoded=new Response(form);return new Request('http://127.0.0.1/x',{method:'POST',headers:{'content-type':encoded.headers.get('content-type')!},body:await encoded.arrayBuffer()});};
  const webm=new Uint8Array([0x1a,0x45,0xdf,0xa3,1,2,3]);
  const ok=new FormData();ok.append('id','1');ok.append('file',new Blob([webm],{type:'audio/webm'}),'a.webm');
  const form=await proBoundedForm(await multipart(ok),{maxBytes:4096,maxFiles:1,fields:['id','file']});expect(form.get('id')).toBe('1');
  const two=new FormData();two.append('file',new Blob([webm]),'a');two.append('file2',new Blob([webm]),'b');
  await expect(proBoundedForm(await multipart(two),{maxBytes:4096,maxFiles:1,fields:['file','file2']})).rejects.toMatchObject({reason:'too_many_files'});
  const dup=new FormData();dup.append('id','1');dup.append('id','2');
  await expect(proBoundedForm(await multipart(dup),{maxBytes:4096,maxFiles:0,fields:['id']})).rejects.toMatchObject({reason:'unexpected_field'});
  const extra=new FormData();extra.append('id','1');extra.append('other','x');
  await expect(proBoundedForm(await multipart(extra),{maxBytes:4096,maxFiles:0,fields:['id']})).rejects.toMatchObject({reason:'unexpected_field'});
  const large=new FormData();large.append('file',new Blob([new Uint8Array(3000)]),'a');
  await expect(proBoundedForm(await multipart(large),{maxBytes:4096,maxFiles:1,maxFileBytes:2000,fields:['file']})).rejects.toMatchObject({status:413,reason:'too_large'});
  await expect(proBoundedForm(await multipart(large),{maxBytes:1024,maxFiles:1,fields:['file']})).rejects.toMatchObject({status:413});
  await expect(proBoundedForm(new Request('http://127.0.0.1/x',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),{maxBytes:1024,maxFiles:0,fields:[]})).rejects.toBeInstanceOf(ProBodyError);
  const urlencoded=await proBoundedForm(new Request('http://127.0.0.1/x',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'t=abc&action=sign'}),{maxBytes:1024,maxFiles:0,fields:['t','action'],types:['application/x-www-form-urlencoded']});
  expect(urlencoded.get('action')).toBe('sign');
  expect(sniffImage(new Uint8Array([0xff,0xd8,0xff,0xe0]))).toBe('image/jpeg');expect(sniffImage(new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))).toBe('image/png');
  expect(sniffImage(new TextEncoder().encode('RIFF....WEBPVP8 '))).toBe('image/webp');expect(sniffImage(new TextEncoder().encode('<svg onload=x>'))).toBeNull();
  expect(sniffAudio(webm)).toBe('audio/webm');expect(sniffAudio(new TextEncoder().encode('OggS'))).toBe('audio/ogg');expect(sniffAudio(new TextEncoder().encode('....ftypM4A '))).toBe('audio/mp4');
  expect(sniffAudio(new TextEncoder().encode('RIFF....WAVEfmt '))).toBe('audio/wav');expect(sniffAudio(new TextEncoder().encode('ID3'))).toBe('audio/mpeg');
  expect(sniffAudio(new Uint8Array([0xff,0xfb,0x90]))).toBe('audio/mpeg');expect(sniffAudio(new Uint8Array([0xff,0xf1,0x50]))).toBe('audio/aac');
  expect(sniffAudio(new Uint8Array(100).fill(3))).toBeNull();expect(sniffAudio(new TextEncoder().encode('hola'))).toBeNull();
 });
 test('RFC 8058: header URI = POST endpoint with the token in the query; only the exact one-click body counts',()=>{
  const token='ab'.repeat(32);
  expect(oneClickUnsubscribeUrl('https://contratacr.com/baja-pro#t='+token)).toBe('https://contratacr.com/api/pro/marketing-unsubscribe/one-click?t='+token);
  expect(oneClickUnsubscribeUrl('http://127.0.0.1:3185/en/baja-pro#t='+token)).toBe('http://127.0.0.1:3185/api/pro/marketing-unsubscribe/one-click?t='+token);
  for(const bad of ['https://contratacr.com/baja-pro#t=abc','https://contratacr.com/otra#t='+token,'javascript:alert(1)#t='+token,'nonsense'])expect(oneClickUnsubscribeUrl(bad),bad).toBeNull();
  const form=(entries:[string,string][])=>{const f=new FormData();for(const [k,v] of entries)f.append(k,v);return f;};
  expect(isOneClickBody(form([['List-Unsubscribe','One-Click']]))).toBe(true);
  expect(isOneClickBody(form([['List-Unsubscribe','one-click']]))).toBe(false);
  expect(isOneClickBody(form([['List-Unsubscribe','One-Click'],['x','1']]))).toBe(false);
  expect(isOneClickBody(form([]))).toBe(false);
 });
});
