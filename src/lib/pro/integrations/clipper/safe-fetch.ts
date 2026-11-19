import {lookup as dnsLookup,type LookupAddress} from 'node:dns';
import {request} from 'node:https';
import {BlockList,isIP,type LookupFunction} from 'node:net';

/**
 * Security review 2026-11-13: SSRF guard of the REAL product page reader (RemoteClipper). The URL schema only
 * sees names; a public name can still resolve to a private address (wildcard DNS such as 127.0.0.1.nip.io, or a
 * rebinding record). This fetcher resolves the host itself and connects ONLY to the vetted address: the check
 * runs inside the socket's lookup, so the address that is checked is the address that is used (no second DNS
 * answer). Also: https on port 443 only, no redirects (a 3xx is returned as is), bounded body. No dependencies.
 */
// Two lists: node's BlockList also matches IPv4 addresses against IPv6 rules (as ::ffff:a.b.c.d), so one shared list
// with ::ffff:0:0/96 would refuse every IPv4 address.
const blocked4=new BlockList(),blocked6=new BlockList();
for(const [net,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],
 ['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)blocked4.addSubnet(net,prefix,'ipv4');
// IPv4-mapped/translated (::ffff:0:0/96, 64:ff9b::/96), 6to4 and Teredo can embed private IPv4 addresses: refused as a whole.
for(const [net,prefix] of [['::',128],['::1',128],['::ffff:0:0',96],['64:ff9b::',96],['64:ff9b:1::',48],['100::',64],['2001::',23],['2001:db8::',32],['2002::',16],
 ['fc00::',7],['fe80::',10],['fec0::',10],['ff00::',8]] as const)blocked6.addSubnet(net,prefix,'ipv6');
/** True only for a globally routable unicast address. */
export function isPublicAddress(address:string){const family=isIP(address);return family===4?!blocked4.check(address,'ipv4'):family===6?!blocked6.check(address,'ipv6'):false;}
export class ClipperAddressError extends Error{constructor(){super('Destination address is not public');this.name='ClipperAddressError';}}
export type ClipperResolver=(hostname:string,callback:(error:NodeJS.ErrnoException|null,addresses:LookupAddress[])=>void)=>void;
const systemResolver:ClipperResolver=(hostname,callback)=>dnsLookup(hostname,{all:true,verbatim:true},callback);
/** Socket lookup that refuses the connection when ANY resolved address is not public. */
export function guardedLookup(resolver:ClipperResolver=systemResolver):LookupFunction{
 return ((hostname:string,options:{all?:boolean},callback:(error:NodeJS.ErrnoException|null,address:string|LookupAddress[],family?:number)=>void)=>{
  resolver(hostname,(error,addresses)=>{
   if(error)return callback(error,'');
   if(!addresses.length||addresses.some(entry=>!isPublicAddress(entry.address)))return callback(new ClipperAddressError(),'');
   if(options?.all)return callback(null,addresses);
   callback(null,addresses[0]!.address,addresses[0]!.family);
  });
 }) as LookupFunction;
}
export const CLIPPER_MAX_BYTES=1_500_000;
/** Same shape as fetch (GET only) for RemoteClipper. Rejects with ClipperAddressError / RangeError (body too large). */
export function clipperSafeFetch(url:string,init:RequestInit={},resolver?:ClipperResolver,maxBytes=CLIPPER_MAX_BYTES):Promise<Response>{
 let target:URL;try{target=new URL(url);}catch{return Promise.reject(new ClipperAddressError());}
 const host=target.hostname;
 if(target.protocol!=='https:'||target.port!==''&&target.port!=='443'||target.username||target.password||!host||host.endsWith('.')||isIP(host.replace(/^\[|\]$/g,''))!==0)return Promise.reject(new ClipperAddressError());
 return new Promise<Response>((resolve,reject)=>{
  const headers:Record<string,string>={};new Headers(init.headers).forEach((value,key)=>{headers[key]=value;});
  const req=request({protocol:'https:',hostname:host,port:443,path:target.pathname+target.search,method:'GET',headers,lookup:guardedLookup(resolver),signal:init.signal??undefined},res=>{
   const chunks:Buffer[]=[];let size=0;
   res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>maxBytes){res.destroy();req.destroy();reject(new RangeError('too_large'));return;}chunks.push(chunk);});
   res.on('error',reject);
   res.on('end',()=>{
    const out=new Headers();for(const [key,value] of Object.entries(res.headers)){if(value===undefined)continue;for(const item of Array.isArray(value)?value:[value])out.append(key,item);}
    const status=res.statusCode??502;
    resolve(new Response([204,205,304].includes(status)?null:new Uint8Array(Buffer.concat(chunks)),{status:status>=200&&status<=599?status:502,headers:out}));
   });
  });
  req.on('error',reject);req.end();
 });
}
