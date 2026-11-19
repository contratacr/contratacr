// Local Pro tooling only. No browser, credentials, fixture writes or remote targets.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const ORIGIN='http://127.0.0.1:3185';
const ROUTES=['/','/registro','/login','/proyectos','/promociones','/empleos'];
const PRO_SHELLS=['/notificaciones','/en/notificaciones'];
const MAX_REDIRECTS=3,MAX_SCRIPTS=128;
const HTML_LIMIT=16*1024*1024,ASSET_LIMIT=64*1024*1024;
const HTML_PATHS=new Set([...ROUTES,'/notificaciones'].flatMap(path=>[path,...['es','en'].map(locale=>`/${locale}${path==='/'?'':path}`)]));

export function localWarmUrl(value,kind='asset'){
 let url;
 try{url=new URL(value,ORIGIN);}catch{throw Error('Invalid local preview URL.');}
 if(url.origin!==ORIGIN||url.username||url.password||url.hash)throw Error('Refusing a non-local or credential-bearing preview URL.');
 if(kind==='html'){
  if(!HTML_PATHS.has(url.pathname)||url.search)throw Error('Refusing a route outside the fixed warm-up list.');
 }else{
  let decoded;
  try{decoded=decodeURIComponent(url.pathname);}catch{throw Error('Invalid asset path encoding.');}
  if(!url.pathname.startsWith('/_next/static/')||!url.pathname.endsWith('.js')
   ||!decoded.startsWith('/_next/static/')||decoded.includes('\\')||decoded.includes('%')
   ||decoded.split('/').some(part=>part==='.'||part==='..')||/%(?:2e|2f|5c)/i.test(url.pathname)){
   throw Error('Refusing a script outside the Next static JavaScript directory.');
  }
 }
 return url;
}

function attributeValue(value){
 return value.replace(/&(?:amp|quot|apos|lt|gt);|&#(?:x[0-9a-f]+|[0-9]+);/gi,entity=>{
  const named={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'};
  if(named[entity.toLowerCase()])return named[entity.toLowerCase()];
  const code=entity[2].toLowerCase()==='x'?parseInt(entity.slice(3,-1),16):Number(entity.slice(2,-1));
  if(code<1||code>0x10ffff)throw Error('Invalid script attribute encoding.');
  return String.fromCodePoint(code);
 });
}

export function nextScripts(html){
 const scripts=new Set();
 for(const [tag] of html.matchAll(/<script\b[^>]*>/gi)){
  const match=/(?:\s)src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i.exec(tag);
  if(!match)continue;
  const value=attributeValue(match[1]??match[2]??match[3]);
  let candidate;
  try{candidate=new URL(value,ORIGIN);}catch{throw Error('Invalid script source.');}
  // Other providers are deliberately neither followed nor warmed.
  if(!candidate.pathname.startsWith('/_next/'))continue;
  const url=localWarmUrl(value);
  scripts.add(url.href);
  if(scripts.size>MAX_SCRIPTS)throw Error('Too many local Next scripts.');
 }
 return [...scripts];
}

async function body(response,limit,keepText){
 if(!response.body)throw Error('Local preview returned an empty body.');
 const reader=response.body.getReader(),decoder=keepText?new TextDecoder():null;
 let bytes=0,text='';
 try{
  while(true){
   const next=await reader.read();if(next.done)break;
   bytes+=next.value.byteLength;
   if(bytes>limit){await reader.cancel();throw Error('Local preview response exceeded its size limit.');}
   if(decoder)text+=decoder.decode(next.value,{stream:true});
  }
  if(decoder)text+=decoder.decode();
 }finally{reader.releaseLock();}
 if(bytes===0)throw Error('Local preview returned an empty body.');
 return {bytes,text};
}

async function warmGet(initial,kind,deadline){
 const started=performance.now();let url=localWarmUrl(initial,kind);
 for(let redirects=0;redirects<=MAX_REDIRECTS;redirects++){
  const response=await fetch(url,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',headers:{Accept:kind==='html'?'text/html':'application/javascript'},signal:AbortSignal.any([deadline,AbortSignal.timeout(60000)])});
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('location');await response.body?.cancel();
   if(!location||redirects===MAX_REDIRECTS)throw Error('Local preview redirect is missing or exceeds its limit.');
   let target;try{target=new URL(location,url);}catch{throw Error('Invalid local preview redirect.');}
   url=localWarmUrl(target.href,kind);continue;
  }
  if(response.status!==200){await response.body?.cancel();throw Error(`Local ${kind} request failed with HTTP ${response.status}.`);}
  const mime=(response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
  if(kind==='html'?mime!=='text/html':!['text/javascript','application/javascript','application/x-javascript'].includes(mime)){
   await response.body?.cancel();throw Error(`Unexpected local ${kind} content type.`);
  }
  const result=await body(response,kind==='html'?HTML_LIMIT:ASSET_LIMIT,kind==='html');
  console.log(`${kind} ${url.pathname} 200 ${result.bytes} bytes ${Math.round(performance.now()-started)} ms`);
  return result;
 }
 throw Error('Local preview redirect limit exceeded.');
}

export async function warmLocalPreview({pro=false}={}){
 const routes=pro?[...ROUTES,...PRO_SHELLS]:ROUTES;
 const deadline=AbortSignal.timeout(10*60*1000),scripts=new Set();
 // Compile the selected page shells without cookies, then their assets; this does not seed
 // browser caches and is not evidence that a cold first visit is fast or sound.
 for(const path of routes){
  const html=await warmGet(path,'html',deadline);
  const discovered=nextScripts(html.text);
  if(discovered.length===0)throw Error('Preview page has no Next scripts.');
  for(const script of discovered)scripts.add(script);
  if(scripts.size>MAX_SCRIPTS)throw Error('Too many local Next scripts.');
 }
 for(const script of scripts)await warmGet(script,'asset',deadline);
 console.log(`Local preview warmed: ${routes.length} unauthenticated page shells, ${scripts.size} Next scripts. Cold-start behaviour was not tested.`);
}

function verify(){
 for(const path of ['/_next/static/chunks/main-app.js','/_next/static/chunks/app/%5Blocale%5D/page.js?v=1'])assert.equal(localWarmUrl(path).origin,ORIGIN);
 for(const path of ['https://contratacr.com/_next/static/a.js','http://localhost:3185/_next/static/a.js','http://127.0.0.1:3186/_next/static/a.js','http://u:p@127.0.0.1:3185/_next/static/a.js','/_next/static/a.js#fragment','/_next/static/%2e%2e/api.js','/_next/static/%252e%252e/a.js','/_next/static/a%2fb.js','/api/private.js','/_next/image/a.js','/_next/static/a.css'])assert.throws(()=>localWarmUrl(path));
 for(const path of [...ROUTES,...PRO_SHELLS])assert.equal(localWarmUrl(path,'html').origin,ORIGIN);
 for(const path of ['/api/auth','/dashboard/profesional','/dashboard/profesional?tab=pro_agenda','/dashboard/admin','https://example.test/login','/login?token=secret'])assert.throws(()=>localWarmUrl(path,'html'));
 assert.deepEqual(nextScripts(`<script src="/_next/static/a.js?v=1&amp;x=2"></script><script src='/_next/static/a.js?v=1&amp;x=2'></script><script src="https://example.test/analytics.js"></script><script data-src="/_next/static/ignored.js"></script>`),[`${ORIGIN}/_next/static/a.js?v=1&x=2`]);
 assert.throws(()=>nextScripts('<script src="https://example.test/_next/static/a.js"></script>'));
 console.log('PASS local preview warm-up URL and script guards (offline; no requests).');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length===3&&process.argv[2]==='--verify')verify();
  else if(process.argv.length===2)await warmLocalPreview();
  else if(process.argv.length===3&&process.argv[2]==='--pro')await warmLocalPreview({pro:true});
  else throw Error('Usage: node scripts/pro/warm-local-preview.mjs [--verify | --pro]');
 }catch(error){console.error(error instanceof Error?error.message:'Local preview warm-up failed.');process.exitCode=1;}
}
