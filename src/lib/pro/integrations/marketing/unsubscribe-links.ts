/**
 * Post-security fixes (2026-11-13): RFC 8058 one-click unsubscribe. The mailbox provider POSTs
 * `List-Unsubscribe=One-Click` to the HTTPS URI of the `List-Unsubscribe` header; a URL fragment never reaches the
 * server, so the header carries the token in the QUERY of a dedicated endpoint. The visible link in the email body
 * keeps the page `/baja-pro#t=…` (token in the fragment, confirmation button, safe against link prefetchers).
 * Pure helpers: no network, unit-tested.
 */
export const ONE_CLICK_PATH='/api/pro/marketing-unsubscribe/one-click';
/** `https://host/baja-pro#t=<64 hex>` (optionally /en/…) → `https://host/api/pro/marketing-unsubscribe/one-click?t=<64 hex>`. */
export function oneClickUnsubscribeUrl(pageUrl:string):string|null{
 let url:URL;try{url=new URL(pageUrl);}catch{return null;}
 const token=/^t=([a-f0-9]{64})$/.exec(url.hash.slice(1))?.[1];
 if(!token||!/^(\/en)?\/baja-pro$/.test(url.pathname)||!/^https?:$/.test(url.protocol))return null;
 return `${url.origin}${ONE_CLICK_PATH}?t=${token}`;
}
/** Exactly the RFC 8058 body: one field `List-Unsubscribe` whose value is `One-Click`. */
export const isOneClickBody=(form:FormData)=>[...form.keys()].length===1&&form.get('List-Unsubscribe')==='One-Click';
