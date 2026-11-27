import {z} from 'zod';

/**
 * Social links of a place (owner 2026-11-27: «también deberían de salir los iconos de las redes sociales»).
 * Stored in dir_places.attributes.social as {network: https URL} (OSM contact:* tags at import, scripts/directory/
 * osm-social.mjs, or the team/owner). Only real data: a value is shown only when it is an https link to the network's
 * own host (or a bare handle, turned into that link). Anything else is dropped, never guessed.
 */
export const PLACE_SOCIAL_NETWORKS=['facebook','instagram','tiktok','x','youtube','linkedin'] as const;
export type PlaceSocialNetwork=typeof PLACE_SOCIAL_NETWORKS[number];
export const PLACE_SOCIAL_LABELS:Record<PlaceSocialNetwork,string>={facebook:'Facebook',instagram:'Instagram',tiktok:'TikTok',x:'X',youtube:'YouTube',linkedin:'LinkedIn'};

/** Canonical host of each network and the hosts accepted as the same network. */
const HOSTS:Record<PlaceSocialNetwork,{canonical:string;accept:string[]}>={
 facebook:{canonical:'www.facebook.com',accept:['facebook.com','m.facebook.com','web.facebook.com','fb.com','fb.me']},
 instagram:{canonical:'www.instagram.com',accept:['instagram.com','instagr.am']},
 tiktok:{canonical:'www.tiktok.com',accept:['tiktok.com','vm.tiktok.com']},
 x:{canonical:'x.com',accept:['x.com','twitter.com','mobile.twitter.com']},
 youtube:{canonical:'www.youtube.com',accept:['youtube.com','m.youtube.com','youtu.be']},
 linkedin:{canonical:'www.linkedin.com',accept:['linkedin.com']},
};
const HANDLE=/^[A-Za-z0-9._-]{1,60}$/;
const handleUrl=(n:PlaceSocialNetwork,h:string)=>n==='tiktok'?`https://www.tiktok.com/@${h}`:n==='youtube'?`https://www.youtube.com/@${h}`:n==='linkedin'?`https://www.linkedin.com/company/${h}`:`https://${HOSTS[n].canonical}/${h}`;

/** A stored or typed value → the https link of that network, or null (unknown host, not https, no path, odd characters). */
export function placeSocialUrl(network:PlaceSocialNetwork,raw:unknown):string|null{
 if(typeof raw!=='string')return null;
 const value=raw.trim();if(!value||value.length>300)return null;
 const handle=value.replace(/^@/,'');
 if(!value.includes('/')&&!value.includes('.')&&HANDLE.test(handle))return handleUrl(network,handle);
 if(/^\w+:/.test(value)&&!/^https?:\/\//i.test(value))return null;// javascript:, mailto:…
 let url:URL;try{url=new URL(/^https?:\/\//i.test(value)?value:`https://${value}`);}catch{return null;}
 if(url.username||url.password||url.port)return null;
 const host=url.hostname.toLowerCase().replace(/^www\./,'');
 const known=HOSTS[network];
 // Facebook language subdomains (es-la.facebook.com, es-es.facebook.com) are the same page.
 const sameNetwork=known.accept.includes(host)||host===known.canonical.replace(/^www\./,'')||(network==='facebook'&&/^[a-z]{2}-[a-z]{2}\.facebook\.com$/.test(host));
 if(!sameNetwork)return null;
 const path=url.pathname.replace(/\/+$/,'');
 if(!path||path==='/'||!/^[\p{L}\p{N}/@._~%-]+$/u.test(path))return null;
 // Search, share and login pages are not the place's page.
 if(/^\/(search|sharer|sharer\.php|share|login|home\.php|hashtag|explore|intent|results|watch)(\/|$)/i.test(path))return null;
 // Facebook pages without a vanity name keep their numeric id (profile.php?id=…); other query strings are tracking.
 const id=network==='facebook'&&path==='/profile.php'?url.searchParams.get('id'):null;
 if(network==='facebook'&&path==='/profile.php'&&!(id&&/^\d{5,25}$/.test(id)))return null;
 const keepHost=host==='youtu.be'||host==='fb.me'||host==='vm.tiktok.com'||host==='instagr.am'?host:known.canonical;
 return `https://${keepHost}${path}${id?`?id=${id}`:''}`;
}

/** A full http(s) link that points to one of the networks (e.g. a «website» that is really a Facebook page), or null. */
export function socialOfUrl(raw:string|null|undefined):{network:PlaceSocialNetwork;url:string}|null{
 if(!raw||!/^https?:\/\//i.test(raw.trim()))return null;
 for(const network of PLACE_SOCIAL_NETWORKS){const url=placeSocialUrl(network,raw);if(url)return {network,url};}
 return null;
}

export type PlaceSocialLink={network:PlaceSocialNetwork;url:string;label:string};
/** The links to show, in a fixed order, only the valid ones: attributes.social, plus the place's website when that
 *  «website» is in fact one of its social pages (many OSM places list their Facebook page as website). */
export function placeSocialLinks(attributes:Record<string,unknown>|null|undefined,website?:string|null):PlaceSocialLink[]{
 const social=attributes?.social,stored=social&&typeof social==='object'&&!Array.isArray(social)?social as Record<string,unknown>:{};
 const fromSite=socialOfUrl(website);
 return PLACE_SOCIAL_NETWORKS.flatMap(network=>{const url=placeSocialUrl(network,stored[network])??(fromSite?.network===network?fromSite.url:null);
  return url?[{network,url,label:PLACE_SOCIAL_LABELS[network]}]:[];});
}

/** attributes.social as accepted when the team or the owner saves it: only known networks, each a valid link. */
const socialValue=(n:PlaceSocialNetwork)=>z.string().max(300).refine(v=>placeSocialUrl(n,v)!==null,'Enlace de red social inválido.').optional();
export const placeSocialSchema=z.object({facebook:socialValue('facebook'),instagram:socialValue('instagram'),tiktok:socialValue('tiktok'),
 x:socialValue('x'),youtube:socialValue('youtube'),linkedin:socialValue('linkedin')}).strict().optional();
