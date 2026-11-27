// LOCAL PRO ONLY (2026-11-27, owner: «también deberían de salir los iconos de las redes sociales»): OSM social tags →
// attributes.social {network: https URL}. Same rules as src/lib/directory/place-social.ts (the page validates again):
// only the network's own host, https, a real path (no search/share/login pages), query strings dropped (except a
// numeric Facebook profile.php?id=), bare handles («@soda_tica») turned into the profile link. Several values separated
// by «;» keep the first. Anything else is dropped, never guessed. Never throws.
const NETWORKS=['facebook','instagram','tiktok','x','youtube','linkedin'];
/** OSM keys per network, preferred first (contact:* is the documented scheme; the bare keys are common in Costa Rica). */
export const OSM_SOCIAL_TAGS={facebook:['contact:facebook','facebook'],instagram:['contact:instagram','instagram'],tiktok:['contact:tiktok','tiktok'],
 x:['contact:x','contact:twitter','twitter'],youtube:['contact:youtube','youtube'],linkedin:['contact:linkedin','linkedin']};
const HOSTS={
 facebook:{canonical:'www.facebook.com',accept:['facebook.com','m.facebook.com','web.facebook.com','fb.com','fb.me']},
 instagram:{canonical:'www.instagram.com',accept:['instagram.com','instagr.am']},
 tiktok:{canonical:'www.tiktok.com',accept:['tiktok.com','vm.tiktok.com']},
 x:{canonical:'x.com',accept:['x.com','twitter.com','mobile.twitter.com']},
 youtube:{canonical:'www.youtube.com',accept:['youtube.com','m.youtube.com','youtu.be']},
 linkedin:{canonical:'www.linkedin.com',accept:['linkedin.com']},
};
const HANDLE=/^[A-Za-z0-9._-]{1,60}$/;
const handleUrl=(n,h)=>n==='tiktok'?`https://www.tiktok.com/@${h}`:n==='youtube'?`https://www.youtube.com/@${h}`:n==='linkedin'?`https://www.linkedin.com/company/${h}`:`https://${HOSTS[n].canonical}/${h}`;
const KEEP_HOST=new Set(['youtu.be','fb.me','vm.tiktok.com','instagr.am']);

export function normalizeSocial(network,raw){
 if(!NETWORKS.includes(network)||typeof raw!=='string')return null;
 let value=raw.trim();if(value.includes(';'))value=value.split(';')[0].trim();
 if(!value||value.length>300||/\s/.test(value))return null;
 const handle=value.replace(/^@/,'');
 if(!value.includes('/')&&!value.includes('.')&&HANDLE.test(handle))return handleUrl(network,handle);
 if(/^\w+:/.test(value)&&!/^https?:\/\//i.test(value))return null;
 if((value.match(/https?:\/\//gi)??[]).length>1)return null;
 let url;try{url=new URL(/^https?:\/\//i.test(value)?value:`https://${value}`);}catch{return null;}
 if(url.username||url.password||url.port)return null;
 const host=url.hostname.toLowerCase().replace(/^www\./,''),known=HOSTS[network];
 const same=known.accept.includes(host)||host===known.canonical.replace(/^www\./,'')||(network==='facebook'&&/^[a-z]{2}-[a-z]{2}\.facebook\.com$/.test(host));
 if(!same)return null;
 const path=url.pathname.replace(/\/+$/,'');
 if(!path||!/^[\p{L}\p{N}/@._~%-]+$/u.test(path))return null;
 if(/^\/(search|sharer|sharer\.php|share|login|home\.php|hashtag|explore|intent|results|watch)(\/|$)/i.test(path))return null;
 const id=network==='facebook'&&path==='/profile.php'?url.searchParams.get('id'):null;
 if(network==='facebook'&&path==='/profile.php'&&!(id&&/^\d{5,25}$/.test(id)))return null;
 return `https://${KEEP_HOST.has(host)?host:known.canonical}${path}${id?`?id=${id}`:''}`;
}

/** OSM tags → {network: url} with only the valid ones, or undefined when there is none. */
export function socialFromTags(tags){
 const out={};
 for(const network of NETWORKS)for(const key of OSM_SOCIAL_TAGS[network]){const url=normalizeSocial(network,tags?.[key]);if(url){out[network]=url;break;}}
 return Object.keys(out).length?out:undefined;
}
