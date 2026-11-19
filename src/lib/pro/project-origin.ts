/** Same-site public project return; never trust an arbitrary redirect from the URL. */
export function projectOriginPath(value:unknown):string|null{
 if(typeof value!=='string'||value.length>12000||!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return null;
 try{const url=new URL(value,'https://local.invalid');if(url.origin!=='https://local.invalid'||!/^\/(?:es\/|en\/)?proyectos(?:\/[a-zA-Z0-9-]+)?$/.test(url.pathname))return null;return url.pathname+url.search;}catch{return null;}
}
