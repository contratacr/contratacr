import {InstagramError,type InstagramAdapter,type InstagramMedia,type InstagramMediaType} from './types';

/**
 * Real adapter: "Instagram API with Instagram Login" (Meta docs, read 2026-11-27):
 *  - authorize: https://www.instagram.com/oauth/authorize?client_id&redirect_uri&response_type=code&scope=instagram_business_basic&state
 *  - short-lived token: POST https://api.instagram.com/oauth/access_token (client_id, client_secret, grant_type=authorization_code,
 *    redirect_uri, code) → {access_token,user_id,permissions} (some responses wrap it in data[0])
 *  - long-lived token (≈60 days): GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret&access_token
 *  - media: GET https://graph.instagram.com/<version>/me/media?fields=id,media_type,media_url,permalink,timestamp
 *  - username: GET https://graph.instagram.com/<version>/me?fields=user_id,username
 * NOT exercised against Meta yet (no app exists): the sandbox covers the flow locally. Env: INSTAGRAM_APP_ID,
 * INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI (docs/instagram-import.md). Server only: the secret never leaves here.
 */
export const GRAPH_VERSION='v27.0';
const GRAPH='https://graph.instagram.com';
/** Image bytes are fetched only from Instagram/Facebook CDNs over https (media_url comes from the Graph API answer). */
export function isInstagramCdnUrl(raw:string):boolean{
 try{const u=new URL(raw);return u.protocol==='https:'&&(/(^|\.)cdninstagram\.com$/.test(u.hostname)||/(^|\.)fbcdn\.net$/.test(u.hostname));}catch{return false;}
}
const MEDIA_MAX_BYTES=8*1024*1024;
const TYPES:InstagramMediaType[]=['IMAGE','CAROUSEL_ALBUM','VIDEO'];

async function getJson(url:string,init?:RequestInit):Promise<Record<string,unknown>>{
 let r:Response;
 try{r=await fetch(url,{...init,signal:AbortSignal.timeout(15_000),cache:'no-store'});}catch{throw new InstagramError('unavailable');}
 const j=await r.json().catch(()=>({})) as Record<string,unknown>;
 if(!r.ok){
  const code=(j.error as {code?:number}|undefined)?.code??j.code;
  throw new InstagramError(code===190||r.status===401?'token':r.status===400?'invalid_code':'unavailable');
 }
 return j;
}

export function createMetaInstagramAdapter(env:{appId:string;appSecret:string;redirectUri:string}):InstagramAdapter{
 return{
  provider:'meta',
  authorizeUrl(state){
   const q=new URLSearchParams({client_id:env.appId,redirect_uri:env.redirectUri,response_type:'code',scope:'instagram_business_basic',state});
   return `https://www.instagram.com/oauth/authorize?${q}`;
  },
  async exchangeCode(rawCode){
   const code=rawCode.replace(/#_$/,'');
   const short=await getJson('https://api.instagram.com/oauth/access_token',{method:'POST',body:new URLSearchParams({client_id:env.appId,client_secret:env.appSecret,grant_type:'authorization_code',redirect_uri:env.redirectUri,code})});
   const first=(Array.isArray(short.data)?short.data[0]:short) as {access_token?:string;user_id?:string|number}|undefined;
   if(!first?.access_token)throw new InstagramError('invalid_code');
   const long=await getJson(`${GRAPH}/access_token?${new URLSearchParams({grant_type:'ig_exchange_token',client_secret:env.appSecret,access_token:first.access_token})}`);
   const token=typeof long.access_token==='string'?long.access_token:first.access_token;
   const expiresIn=typeof long.expires_in==='number'?long.expires_in:3600;
   let username:string|null=null,igUserId=String(first.user_id??'');
   try{const me=await getJson(`${GRAPH}/${GRAPH_VERSION}/me?${new URLSearchParams({fields:'user_id,username',access_token:token})}`);username=typeof me.username==='string'?me.username:null;if(!igUserId&&me.user_id)igUserId=String(me.user_id);}catch{}
   if(!igUserId)throw new InstagramError('invalid_code');
   return{igUserId,username,accessToken:token,expiresAt:new Date(Date.now()+expiresIn*1000).toISOString()};
  },
  async listMedia(accessToken){
   const j=await getJson(`${GRAPH}/${GRAPH_VERSION}/me/media?${new URLSearchParams({fields:'id,media_type,media_url,permalink,timestamp',limit:'50',access_token:accessToken})}`);
   const rows=Array.isArray(j.data)?j.data as Record<string,unknown>[]:[];
   return rows.flatMap((m):InstagramMedia[]=>{
    const id=String(m.id??''),type=m.media_type as InstagramMediaType;
    if(!/^[0-9_]{1,64}$/.test(id)||!TYPES.includes(type))return[];
    const mediaUrl=typeof m.media_url==='string'&&isInstagramCdnUrl(m.media_url)?m.media_url:null;
    const permalink=typeof m.permalink==='string'&&m.permalink.startsWith('https://')&&m.permalink.length<=400?m.permalink:null;
    return[{id,type,mediaUrl,permalink,timestamp:typeof m.timestamp==='string'?m.timestamp:null}];
   });
  },
  async fetchMedia(_accessToken,media){
   if(!media.mediaUrl||!isInstagramCdnUrl(media.mediaUrl))throw new InstagramError('media');
   let r:Response;
   try{r=await fetch(media.mediaUrl,{signal:AbortSignal.timeout(20_000),redirect:'error',cache:'no-store'});}catch{throw new InstagramError('unavailable');}
   if(!r.ok||!r.body)throw new InstagramError('media');
   const declared=Number(r.headers.get('content-length')??0);if(declared>MEDIA_MAX_BYTES)throw new InstagramError('too_large');
   const reader=r.body.getReader(),chunks:Uint8Array[]=[];let size=0;
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MEDIA_MAX_BYTES){await reader.cancel();throw new InstagramError('too_large');}chunks.push(value);}
   const bytes=new Uint8Array(size);let o=0;for(const c of chunks){bytes.set(c,o);o+=c.byteLength;}
   return{bytes,contentType:r.headers.get('content-type')??'application/octet-stream'};
  },
 };
}
