import {createHash,createHmac,randomBytes} from 'node:crypto';
import {bidPortalCookieLink,bidPortalTokenSchema} from './bid-portal';
import {requiredServerSecret} from '@/lib/security/local-dev-secrets';

/**
 * Server-only helpers of the vendor portal (row 53). Every token is random (randomBytes(32)) and
 * never derived from stored data. Only a keyed hash reaches the database: HMAC-SHA256 with
 * PRO_BID_PORTAL_SECRET (its own secret, at least 32 bytes, base64/base64url/hex), never the
 * Supabase service key. Without it the portal fails closed (BidPortalConfigError -> 503).
 * Rotating the secret invalidates every link and vendor session.
 */
export class BidPortalConfigError extends Error{constructor(){super('PRO_BID_PORTAL_SECRET is missing or shorter than 32 bytes');this.name='BidPortalConfigError';}}
let cached:{raw:string;key:Buffer}|null=null;
function portalKey(){
 // Required in production (never random); deterministic marked local value in development only.
 const raw=requiredServerSecret('PRO_BID_PORTAL_SECRET',32)??'';
 if(cached&&cached.raw===raw)return cached.key;
 const key=/^[0-9a-fA-F]+$/.test(raw)&&raw.length%2===0?Buffer.from(raw,'hex'):/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)?Buffer.from(raw.replace(/-/g,'+').replace(/_/g,'/'),'base64'):Buffer.alloc(0);
 if(key.length<32)throw new BidPortalConfigError();
 cached={raw,key};return key;
}
/** True when the portal secret is configured (the owner UI explains it otherwise). */
export function bidPortalConfigured(){try{portalKey();return true;}catch{return false;}}
type Kind='link'|'session'|'device'|'po-link'|'po-session'|'po-device';
/** Keyed hash (hex) of a portal token; only this value reaches the database. */
export const bidPortalHash=(token:string,kind:Kind)=>createHmac('sha256',portalKey()).update(`ccr-bid-portal:${kind}:v2:${token}`,'utf8').digest('hex');
/** New random link or session token (base64url of 32 bytes). Checks the secret first. */
export function bidPortalNewToken(){portalKey();return randomBytes(32).toString('base64url');}
/** Unkeyed short digest used inside rate-limit bucket names (the limiter HMACs the whole key before storage). */
export const bidPortalBucket=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex').slice(0,32);

/** Every valid portal session cookie of the request, by link id (one cookie per invitation). */
export function bidPortalSessions(req:Request){
 const found=new Map<string,string>();
 for(const part of (req.headers.get('cookie')||'').split(';')){const [name,...rest]=part.trim().split('=');const link=bidPortalCookieLink(name??'');const value=rest.join('=');if(link&&bidPortalTokenSchema.safeParse(value).success)found.set(link,value);}
 return found;
}
/** The session for the named link; without a name, the only one the browser holds. */
export function bidPortalSession(req:Request,link:string|null|undefined){
 const all=bidPortalSessions(req);
 if(link)return all.get(link.toLowerCase())??null;
 return all.size===1?[...all.values()][0]!:null;
}
