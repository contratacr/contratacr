import {poPortalCookieLink,poPortalTokenSchema} from './po-portal';

/** Server-only cookie helpers of the purchase order vendor link (hashing lives in bid-portal-server.ts, kinds 'po-*'). */
export function poPortalSessions(req:Request){
 const found=new Map<string,string>();
 for(const part of (req.headers.get('cookie')||'').split(';')){const [name,...rest]=part.trim().split('=');const link=poPortalCookieLink(name??'');const value=rest.join('=');if(link&&poPortalTokenSchema.safeParse(value).success)found.set(link,value);}
 return found;
}
/** The session for the named link; without a name, the only one the browser holds. */
export function poPortalSession(req:Request,link:string|null|undefined){
 const all=poPortalSessions(req);
 if(link)return all.get(link.toLowerCase())??null;
 return all.size===1?[...all.values()][0]!:null;
}
