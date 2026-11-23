import {clipMetadataSchema,decodeEntities,type ClipMetadata} from './parse';

/**
 * Row 60: capture from the owner's own browser. The bookmarklet (or the extension) reads the Open Graph / schema.org data
 * that the page already shows, packs it in the URL HASH (`#clipdata=<base64url JSON>`, never sent to any server) and only
 * OPENS the app. It never posts from the third-party page. The app decodes and validates the hash, the owner reviews every
 * value and the clip is stored through the same-origin endpoint with source 'bookmarklet'/'extension' and mode 'browser'.
 */
export const CLIP_HASH_KEY='clipdata=';
export const CLIP_HASH_MAX_BYTES=8192;
const wire=clipMetadataSchema.omit({source:true,simulated:true});
const b64=(text:string)=>{const bytes=new TextEncoder().encode(text);let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const unb64=(value:string)=>{const s=atob(value.replace(/-/g,'+').replace(/_/g,'/'));const bytes=new Uint8Array(s.length);for(let i=0;i<s.length;i++)bytes[i]=s.charCodeAt(i);return new TextDecoder('utf-8',{fatal:true}).decode(bytes);};
export function encodeClipData(data:Omit<ClipMetadata,'source'|'simulated'>):string|null{
 const text=JSON.stringify(wire.parse(data));return text.length>CLIP_HASH_MAX_BYTES?null:CLIP_HASH_KEY+b64(text);
}
const clean=(value:string)=>decodeEntities(value).replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim();
/** Decodes + validates `#clipdata=...`. Anything malformed, oversized or with a non-https image is refused (null) or sanitized. */
export function decodeClipData(hash:string):ClipMetadata|null{
 const raw=hash.replace(/^#/,'');if(!raw.startsWith(CLIP_HASH_KEY))return null;
 const payload=raw.slice(CLIP_HASH_KEY.length);if(!payload||payload.length>Math.ceil(CLIP_HASH_MAX_BYTES*4/3)+4||!/^[A-Za-z0-9_-]+$/.test(payload))return null;
 try{
  const parsed=wire.safeParse(JSON.parse(unb64(payload)));if(!parsed.success)return null;const v=parsed.data;
  const image=v.image&&/^https:\/\//i.test(v.image)?v.image:null;
  const name=clean(v.name).slice(0,160);if(!name&&v.price===null)return null;
  return {...v,name,description:clean(v.description).slice(0,600),sku:clean(v.sku).slice(0,80),brand:clean(v.brand).slice(0,120),image,source:'mixed',simulated:false};
 }catch{return null;}
}
/**
 * Browser-side reader (plain ES5, self-contained: it is stringified into the bookmarklet and mirrored in the extension).
 * Reads og:/product: meta tags and the first schema.org Product of the page the user is looking at.
 */
export const CLIP_READER_SOURCE=`function(){
var d=document,m=function(k){var e=d.querySelector('meta[property="'+k+'"],meta[name="'+k+'"],meta[itemprop="'+k+'"]');return e?(e.getAttribute('content')||''):''};
var p=null;function f(n,t){if(!n||t>6||p)return;if(Array.isArray(n)){for(var i=0;i<n.length&&i<50;i++)f(n[i],t+1);return}if(typeof n!=='object')return;var y=n['@type'];if(y==='Product'||(Array.isArray(y)&&y.indexOf('Product')>-1)){p=n;return}if(n['@graph'])f(n['@graph'],t+1)}
var s=d.querySelectorAll('script[type="application/ld+json"]');for(var i=0;i<s.length&&!p;i++){try{f(JSON.parse(s[i].textContent||''),0)}catch(e){}}
var o=p&&p.offers?(Array.isArray(p.offers)?p.offers[0]:p.offers):null,b=p&&p.brand?(typeof p.brand==='object'?p.brand.name:p.brand):'';
var im=p&&p.image?(Array.isArray(p.image)?p.image[0]:(typeof p.image==='object'?p.image.url:p.image)):m('og:image');
var pr=(o&&(o.price||o.lowPrice))||m('product:price:amount')||m('og:price:amount');var n=Number(String(pr).replace(/[^0-9.,]/g,'').replace(/,(?=[0-9]{3}([^0-9]|$))/g,'').replace(',','.'));
var c=String((o&&o.priceCurrency)||m('product:price:currency')||m('og:price:currency')||'').toUpperCase();
try{im=new URL(im,location.href).href}catch(e){im=''}
return {name:String((p&&p.name)||m('og:title')||d.title||'').slice(0,160),description:String((p&&p.description)||m('og:description')||m('description')||'').slice(0,600),price:isFinite(n)&&pr!==''&&n>=0?Math.round(n*100)/100:null,currency:c==='CRC'||c==='USD'||c==='EUR'?c:(c?'OTHER':null),image:/^https:/.test(im)?im.slice(0,1000):null,sku:String((p&&(p.sku||p.mpn))||'').slice(0,80),brand:String(b||'').slice(0,120)}
}`;
/** javascript: URL for the draggable bookmarklet. It only opens the app (window.open); it never posts anything from the page. */
export function bookmarkletHref(origin:string,locale:'es'|'en',httpsMessage:string){
 const base=`${origin}/${locale}/dashboard/pro?tab=pro_company&empresa=articulos&clip=`;
 const code=`(function(){if(location.protocol!=='https:'){alert(${JSON.stringify(httpsMessage)});return}
var r=(${CLIP_READER_SOURCE})(),j=JSON.stringify(r),h='';if(j.length<=${CLIP_HASH_MAX_BYTES}){var u=unescape(encodeURIComponent(j));h='#${CLIP_HASH_KEY}'+btoa(u).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'')}
window.open(${JSON.stringify(base)}+encodeURIComponent(location.href.split('#')[0].slice(0,2000))+h,'_blank')})();`;
 return 'javascript:'+encodeURIComponent(code.replace(/\n/g,''));
}
