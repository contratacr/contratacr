/**
 * "Importar desde Instagram" (owner request 2026-11-27, docs/instagram-import.md).
 * Every external integration goes through an adapter with a sandbox (project rule). Two implementations:
 *  - `meta`: Instagram API with Instagram Login (scope instagram_business_basic; Business or Creator accounts), real calls.
 *  - `sandbox`: development only; a fake connect screen and generated sample photos, so the whole flow runs locally.
 * Relative imports only: scripts/integrations/instagram.test.mjs loads these files with `node --test`.
 */
export type InstagramMediaType='IMAGE'|'CAROUSEL_ALBUM'|'VIDEO';
export type InstagramMedia={id:string;type:InstagramMediaType;mediaUrl:string|null;permalink:string|null;timestamp:string|null};
export type InstagramToken={igUserId:string;username:string|null;accessToken:string;expiresAt:string|null};
export type InstagramFetched={bytes:Uint8Array;contentType:string};
export type InstagramProvider='meta'|'sandbox';

export interface InstagramAdapter{
 readonly provider:InstagramProvider;
 /** Where the browser goes to authorize. `state` is the CSRF value the callback must get back. */
 authorizeUrl(state:string):string;
 /** One-time `code` of the callback → long-lived token (never sent to the browser). */
 exchangeCode(code:string):Promise<InstagramToken>;
 /** The account's recent media, newest first (all types; callers keep only photos with importablePhotos). */
 listMedia(accessToken:string):Promise<InstagramMedia[]>;
 /** Bytes of one image (`media` comes from listMedia of the same token, never from the browser). */
 fetchMedia(accessToken:string,media:InstagramMedia):Promise<InstagramFetched>;
}

export type InstagramErrorCode='denied'|'invalid_code'|'token'|'unavailable'|'media'|'too_large';
export class InstagramError extends Error{
 readonly code:InstagramErrorCode;
 constructor(code:InstagramErrorCode,message?:string){super(message??code);this.code=code;}
}
/** The adapter error code of `e` (InstagramError, or the plain {code} errors of the sandbox), else 'unavailable'. */
export function instagramErrorCode(e:unknown):InstagramErrorCode{
 const c=(e as {code?:unknown})?.code;
 return c==='denied'||c==='invalid_code'||c==='token'||c==='media'||c==='too_large'?c:'unavailable';
}

/** Photos only: IMAGE and CAROUSEL_ALBUM (its cover image). Videos, and items without a media_url, are left out. */
export function importablePhotos(list:InstagramMedia[]):InstagramMedia[]{
 return list.filter(m=>(m.type==='IMAGE'||m.type==='CAROUSEL_ALBUM')&&!!m.mediaUrl);
}

/** Most photos one import may add (owner copy: "Elija hasta 10 fotos"); a success case caps it lower (its free slots). */
export const INSTAGRAM_IMPORT_MAX=10;
export const MEDIA_ID_RE=/^[A-Za-z0-9_-]{1,64}$/;

export type ImportPlan={toImport:InstagramMedia[];skipped:string[];unknown:string[]};
/**
 * Which of the requested media ids get imported: ids not in the account's list are refused (`unknown`), ids already
 * imported to the same target whose photo still exists are `skipped`, repeated ids count once, and at most `max` remain.
 */
export function planImport(requested:string[],available:InstagramMedia[],alreadyImported:ReadonlySet<string>,max=INSTAGRAM_IMPORT_MAX):ImportPlan{
 const byId=new Map(importablePhotos(available).map(m=>[m.id,m])),seen=new Set<string>();
 const plan:ImportPlan={toImport:[],skipped:[],unknown:[]};
 for(const id of requested){
  if(seen.has(id))continue;seen.add(id);
  const m=MEDIA_ID_RE.test(id)?byId.get(id):undefined;
  if(!m){plan.unknown.push(id);continue;}
  if(alreadyImported.has(id)){plan.skipped.push(id);continue;}
  if(plan.toImport.length<max)plan.toImport.push(m);
 }
 return plan;
}

/** Relative in-app path only (no scheme, no //host, no backslash): where the callback sends the person back. */
export function safeReturnPath(raw:string|null|undefined,fallback='/'):string{
 if(!raw||raw.length>300||!raw.startsWith('/')||raw.startsWith('//')||raw.includes('\\')||/[\u0000-\u001f]/.test(raw))return fallback;
 return raw;
}
