import type {InstagramAdapter,InstagramErrorCode,InstagramMedia} from './types';

// No value import from ./types: node --test loads this file directly and cannot resolve extensionless relative imports.
const fail=(code:InstagramErrorCode)=>Object.assign(new Error(code),{code});

/**
 * Development-only Instagram stand-in (never selected in a production build, see adapter.ts). No network, no Meta account:
 *  - authorizeUrl → the local fake connect screen /integraciones/instagram/sandbox, whose «Permitir» button calls the real
 *    callback route with code=sandbox-ok (so state checking, token storage and disconnect run exactly as with Meta);
 *  - listMedia → 8 photos, 1 carousel and 1 video (the video must be left out by importablePhotos);
 *  - fetchMedia → a JPEG generated with sharp (loaded lazily: a module-level native import breaks the Worker).
 */
export const SANDBOX_CODE='sandbox-ok';
export const SANDBOX_TOKEN_PREFIX='sandbox-token-';
export const SANDBOX_USERNAME='negocio_de_muestra';
export const SANDBOX_IG_USER_ID='17841400000000001';

const SAMPLES:{id:string;type:InstagramMedia['type'];hue:number;title:string;w:number;h:number}[]=[
 {id:'sbx_1001',type:'IMAGE',hue:198,title:'Fachada',w:1080,h:1080},
 {id:'sbx_1002',type:'IMAGE',hue:24,title:'Mostrador',w:1080,h:1350},
 {id:'sbx_1003',type:'CAROUSEL_ALBUM',hue:140,title:'Terraza',w:1080,h:1080},
 {id:'sbx_1004',type:'VIDEO',hue:280,title:'Video',w:1080,h:1920},
 {id:'sbx_1005',type:'IMAGE',hue:350,title:'Plato del día',w:1080,h:1080},
 {id:'sbx_1006',type:'IMAGE',hue:52,title:'Equipo',w:1350,h:1080},
 {id:'sbx_1007',type:'IMAGE',hue:170,title:'Trabajo terminado',w:1080,h:1080},
 {id:'sbx_1008',type:'IMAGE',hue:220,title:'Entrada',w:1080,h:1350},
 {id:'sbx_1009',type:'IMAGE',hue:95,title:'Detalle',w:1080,h:1080},
];
const sample=(id:string)=>SAMPLES.find(s=>s.id===id);

function svg(s:typeof SAMPLES[number],n:number){
 const a=`hsl(${s.hue} 70% 46%)`,b=`hsl(${(s.hue+40)%360} 75% 30%)`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<circle cx="${s.w*0.78}" cy="${s.h*0.24}" r="${Math.min(s.w,s.h)*0.16}" fill="rgba(255,255,255,0.18)"/>
<rect x="${s.w*0.08}" y="${s.h*0.62}" width="${s.w*0.84}" height="${s.h*0.26}" rx="36" fill="rgba(0,0,0,0.28)"/>
<text x="${s.w*0.13}" y="${s.h*0.73}" font-family="Helvetica, Arial, sans-serif" font-size="64" font-weight="700" fill="#fff">${s.title}</text>
<text x="${s.w*0.13}" y="${s.h*0.82}" font-family="Helvetica, Arial, sans-serif" font-size="40" fill="#e6f4fb">Foto de muestra ${n}</text>
</svg>`;
}

export function createSandboxInstagramAdapter(opts:{connectPath?:string}={}):InstagramAdapter{
 const connectPath=opts.connectPath??'/integraciones/instagram/sandbox';
 const own=(token:string)=>{if(!token.startsWith(SANDBOX_TOKEN_PREFIX))throw fail('token');};
 return{
  provider:'sandbox',
  authorizeUrl(state){return `${connectPath}?state=${encodeURIComponent(state)}`;},
  async exchangeCode(code){
   if(code!==SANDBOX_CODE)throw fail('invalid_code');
   return{igUserId:SANDBOX_IG_USER_ID,username:SANDBOX_USERNAME,accessToken:SANDBOX_TOKEN_PREFIX+crypto.randomUUID(),expiresAt:new Date(Date.now()+60*86_400_000).toISOString()};
  },
  async listMedia(token){
   own(token);
   const now=Date.parse('2026-11-20T15:00:00Z');
   return SAMPLES.map((s,i)=>({id:s.id,type:s.type,mediaUrl:`sandbox://media/${s.id}`,permalink:`https://www.instagram.com/p/${s.id.replace('_','')}/`,timestamp:new Date(now-i*86_400_000).toISOString()}));
  },
  async fetchMedia(token,media){
   own(token);
   const s=sample(media.id);if(!s||s.type==='VIDEO'||media.mediaUrl!==`sandbox://media/${s.id}`)throw fail('media');
   const sharp=(await import('sharp')).default;
   const out=await sharp(Buffer.from(svg(s,SAMPLES.filter(x=>x.type!=='VIDEO').indexOf(s)+1))).jpeg({quality:86}).toBuffer();
   return{bytes:new Uint8Array(out.buffer,out.byteOffset,out.byteLength),contentType:'image/jpeg'};
  },
 };
}
